import * as THREE from 'three';
import {moodId, setMood, onMood} from './faces.js?v=15';
import {HOME_MOTIONS, Q1_MOTIONS, Q1_REST_POSE} from './q1_motion_data.js?v=2';
import {STREET_DANCE, STREET_DANCE_REST_POSE} from './street_dance_data.js?v=2';

const MOTION_BY_ID = Object.fromEntries([
  ...HOME_MOTIONS.map((motion) => [motion.id, motion]),
  [STREET_DANCE.id, STREET_DANCE],
]);

// MuJoCo 自然站姿下的关节世界轴，已经从 (x前, y左, z上) 转到
// GLB 的 (x左, y上, z前)。运行时再转换到对应骨骼的局部坐标。
const RETARGET = {
  waist_roll_joint: {bone: 'body1', worldAxis: [0, 0, 1]},
  waist_yaw_joint: {bone: 'body1', worldAxis: [0, 1, 0]},
  left_shoulder_pitch_joint: {bone: 'Bone.005', worldAxis: [0.99619473, 0.08715539, 0]},
  left_shoulder_roll_joint: {bone: 'Bone.006', worldAxis: [0, 0, 1]},
  left_shoulder_yaw_joint: {bone: 'Bone.007', worldAxis: [-0.21822962, 0.97589745, 0]},
  left_elbow_joint: {bone: 'Bone.008', worldAxis: [0.97589745, 0.21822962, 0]},
  right_shoulder_pitch_joint: {bone: 'Bone.009', worldAxis: [0.99619473, -0.08715539, 0]},
  right_shoulder_roll_joint: {bone: 'Bone.010', worldAxis: [0, 0, 1]},
  right_shoulder_yaw_joint: {bone: 'Bone.011', worldAxis: [0.21822962, 0.97589745, 0]},
  right_elbow_joint: {bone: 'Bone.012', worldAxis: [0.97589745, -0.21822962, 0]},
};

const DANCE_RETARGET = {
  ...RETARGET,
  left_hip_pitch_joint: {bone: 'Bone.030', worldAxis: [1, 0, 0]},
  left_hip_roll_joint: {bone: 'Bone.032', worldAxis: [0, 0, 1]},
  left_hip_yaw_joint: {bone: 'Bone.033', worldAxis: [0, 1, 0]},
  left_knee_joint: {bone: 'Bone.035', worldAxis: [1, 0, 0]},
  left_ankle_pitch_joint: {bone: 'Bone.037', worldAxis: [1, 0, 0]},
  left_ankle_roll_joint: {bone: 'Bone.038', worldAxis: [0, 0, 1]},
  right_hip_pitch_joint: {bone: 'Bone.031', worldAxis: [1, 0, 0]},
  right_hip_roll_joint: {bone: 'Bone.034', worldAxis: [0, 0, 1]},
  right_hip_yaw_joint: {bone: 'Bone.036', worldAxis: [0, 1, 0]},
  right_knee_joint: {bone: 'Bone.039', worldAxis: [1, 0, 0]},
  right_ankle_pitch_joint: {bone: 'Bone.040', worldAxis: [1, 0, 0]},
  right_ankle_roll_joint: {bone: 'Bone.041', worldAxis: [0, 0, 1]},
};

function smoothstep(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export function samplePose(id, progress) {
  const motion = Q1_MOTIONS[id];
  const time = progress * motion.duration;
  const blend = Math.min(smoothstep(progress / 0.16), smoothstep((1 - progress) / 0.18));
  const pose = {};

  Object.entries(Q1_REST_POSE).forEach(([joint, rest]) => {
    let target = motion.pose[joint] ?? rest;
    const [amplitude = 0, omega = 0, phase = 0] = motion.oscillation?.[joint] ?? [];
    target += amplitude * Math.sin(omega * time + phase);
    if (id === 'hug' && joint.endsWith('shoulder_roll_joint')) {
      const sign = joint.startsWith('left') ? 1 : -1;
      target = sign * (1.0 - 0.58 * smoothstep((progress - 0.25) / 0.35));
    }
    pose[joint] = rest + (target - rest) * blend;
  });
  return pose;
}

function sampleTrack(points, beat) {
  if (!points || !points.length) return 0;
  if (beat <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (beat >= last[0]) return last[1];
  for (let index = 1; index < points.length; index += 1) {
    const [endBeat, endValue] = points[index];
    if (beat > endBeat) continue;
    const [startBeat, startValue] = points[index - 1];
    const progress = smoothstep((beat - startBeat) / (endBeat - startBeat || 1));
    return startValue + (endValue - startValue) * progress;
  }
  return last[1];
}

function sampleDancePose(time, transform) {
  const beat = time * transform.bpm / 60;
  const pose = {...STREET_DANCE_REST_POSE};
  Object.entries(transform.tracks).forEach(([joint, points]) => {
    pose[joint] = sampleTrack(points, beat);
  });
  return pose;
}

function sampleDanceRoot(time) {
  const beat = time * STREET_DANCE.bpm / 60;
  return {
    side: sampleTrack(STREET_DANCE.root.side, beat),
    yaw: sampleTrack(STREET_DANCE.root.yaw, beat),
  };
}

function findBone(model, name) {
  return model.getObjectByName(name)
    || model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
}

function createBindings(model, retarget = RETARGET) {
  const bindings = {};
  const groups = new Map();

  model.updateMatrixWorld(true);
  Object.entries(retarget).forEach(([joint, spec]) => {
    const bone = findBone(model, spec.bone);
    if (!bone) return;
    const world = bone.getWorldQuaternion(new THREE.Quaternion());
    const axis = new THREE.Vector3(...spec.worldAxis)
      .applyQuaternion(world.invert())
      .normalize();
    const binding = {joint, bone, axis};
    bindings[joint] = binding;
    if (!groups.has(bone.uuid)) groups.set(bone.uuid, {bone, rest: bone.quaternion.clone(), bindings: []});
    groups.get(bone.uuid).bindings.push(binding);
  });

  const missing = Object.keys(retarget).filter((joint) => !bindings[joint]);
  if (missing.length) throw new Error(`主页模型缺少动作骨骼：${missing.join(', ')}`);
  return [...groups.values()];
}

/* 把「关节 → 骨骼 / 局部轴 / 绑定四元数」摊平出来，给机械臂这类临时姿态用：
   调用方按绝对关节角给值，这里负责减去自然站姿再乘到绑定姿势上 */
export function createJointBindings(model) {
  const map = {};
  createBindings(model).forEach((group) => {
    group.bindings.forEach(({joint, axis}) => {
      map[joint] = {bone: group.bone, axis, rest: group.rest};
    });
  });
  return map;
}

function buildClip(motion, groups) {
  const steps = Math.ceil(motion.duration * 30);
  const times = Array.from({length: steps + 1}, (_, index) => motion.duration * index / steps);
  const tracks = groups.map((group) => {
    const values = [];
    times.forEach((time) => {
      const pose = samplePose(motion.id, time / motion.duration);
      const result = group.rest.clone();
      group.bindings.forEach(({joint, axis}) => {
        const angle = pose[joint] - Q1_REST_POSE[joint];
        result.multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
      });
      values.push(result.x, result.y, result.z, result.w);
    });
    return new THREE.QuaternionKeyframeTrack(`${group.bone.name}.quaternion`, times, values);
  });
  return new THREE.AnimationClip(`q1_${motion.id}`, motion.duration, tracks);
}

function buildDanceClip(motion, groups) {
  const steps = Math.ceil(motion.duration * 30);
  const times = Array.from({length: steps + 1}, (_, index) => motion.duration * index / steps);
  const tracks = groups.map((group) => {
    const values = [];
    times.forEach((time) => {
      const pose = sampleDancePose(time, motion);
      const result = group.rest.clone();
      group.bindings.forEach(({joint, axis}) => {
        const angle = pose[joint] - STREET_DANCE_REST_POSE[joint];
        result.multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
      });
      values.push(result.x, result.y, result.z, result.w);
    });
    return new THREE.QuaternionKeyframeTrack(`${group.bone.name}.quaternion`, times, values);
  });
  return new THREE.AnimationClip(`q1_${motion.id}`, motion.duration, tracks);
}

export function createHomeMotionController(model, mixer, idleAction, onState, ensurePlayback, options = {}) {
  const groups = createBindings(model);
  const danceGroups = createBindings(model, DANCE_RETARGET);
  const clips = {
    ...Object.fromEntries(HOME_MOTIONS.map((motion) => [motion.id, buildClip(motion, groups)])),
    [STREET_DANCE.id]: buildDanceClip(STREET_DANCE, danceGroups),
  };
  const motionRoot = options.motionRoot || null;
  const footMeshes = [];
  const footBox = new THREE.Box3();
  model.traverse((object) => {
    if (object.isMesh && /^foot_(left|right)/i.test(object.name)) footMeshes.push(object);
  });
  let savedMood = null;
  let ownsMood = false;
  onMood((_id, source) => { if (source !== 'motion') ownsMood = false; });
  function restoreMood() {
    if (ownsMood && savedMood) setMood(savedMood, {source:'motion', persist:false});
    savedMood = null; ownsMood = false;
  }
  function applyMood(motion) {
    if (!motion.mood) return;
    savedMood = moodId(); ownsMood = true;
    setMood(motion.mood, {source:'motion', persist:false});
  }
  let active = null;
  let action = null;

  function resetRoot() {
    if (!motionRoot) return;
    motionRoot.position.set(0, 0, 0);
    motionRoot.rotation.set(0, 0, 0);
    motionRoot.updateMatrixWorld(true);
  }

  function lowestFootY() {
    let lowest = Infinity;
    model.updateMatrixWorld(true);
    footMeshes.forEach((mesh) => {
      footBox.setFromObject(mesh);
      if (Number.isFinite(footBox.min.y)) lowest = Math.min(lowest, footBox.min.y);
    });
    return lowest;
  }

  mixer.addEventListener('finished', (event) => {
    if (!action || event.action !== action) return;
    restoreMood();
    action = null;
    active = null;
    resetRoot();
    if (idleAction) idleAction.reset().fadeIn(0.2).play();
    onState(null);
  });

  function stop() {
    if (action) action.stop();
    restoreMood();
    action = null;
    active = null;
    resetRoot();
    if (idleAction) idleAction.reset().play();
    onState(null);
    ensurePlayback();
  }

  return {
    play(id) {
      const motion = MOTION_BY_ID[id];
      if (!motion) return false;
      if (action) action.stop();
      restoreMood();
      applyMood(motion);
      resetRoot();
      if (idleAction) idleAction.fadeOut(0.15);
      active = motion;
      action = mixer.clipAction(clips[id]);
      action.reset().setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = false;
      action.fadeIn(0.15).play();
      onState(id);
      ensurePlayback();
      return true;
    },
    stop,
    update() {
      if (!motionRoot || !action || !active || active.id !== STREET_DANCE.id) return;
      const root = sampleDanceRoot(Math.min(action.time, STREET_DANCE.duration));
      motionRoot.position.set(root.side, 0, 0);
      motionRoot.rotation.set(0, THREE.MathUtils.degToRad(root.yaw), 0);
      motionRoot.updateMatrixWorld(true);
      for (let pass = 0; pass < 3; pass += 1) {
        const lowest = lowestFootY();
        if (!Number.isFinite(lowest) || Math.abs(lowest) < 1e-4) break;
        motionRoot.position.y -= lowest;
        motionRoot.updateMatrixWorld(true);
      }
    },
    getInfo(id) {
      const motion = MOTION_BY_ID[id];
      return motion ? {
        id: motion.id,
        label: motion.label,
        description: motion.description || motion.label,
        aliases: motion.aliases || [motion.label],
        duration: motion.duration,
        mood: motion.mood || null,
        category: motion.category || 'gesture',
        bpm: motion.bpm || null,
        loop: !!motion.loop,
        returnToRest: motion.returnToRest !== false,
      } : null;
    },
    getCatalog() {
      return Object.keys(MOTION_BY_ID).map((id) => this.getInfo(id));
    },
    get activeId() { return active?.id ?? null; },
  };
}

/* 所有手势类动作都统一收进右栏，使用文字卡面，动作名称直接可读。 */
const RAIL_MOTIONS = HOME_MOTIONS;

export function mountHomeMotionControls(play) {
  /* 兼容旧页面：左侧 Action 里若还留着动作入口，在绑定时直接移走。 */
  document.querySelectorAll('.sc-group--action [data-motion], .sc-group--action [data-action-motion]')
    .forEach((card) => card.remove());

  const grid = document.querySelector('[data-rail-grid="gestures"]');
  if (grid) {
    while (grid.children.length < HOME_MOTIONS.length + 1) {
      const card = document.createElement('div');
      card.className = 'rail__card';
      grid.appendChild(card);
    }
  }
  const cards = grid ? Array.from(grid.children) : [];

  RAIL_MOTIONS.forEach((motion, index) => {
    const card = cards[index];
    if (!card) return;
    card.classList.add('is-motion');
    card.dataset.motion = motion.id;
    card.innerHTML = `<span class="motion__label">${motion.label}</span>`;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `播放${motion.label}动作`);
    card.setAttribute('aria-pressed', 'false');
    card.removeAttribute('aria-hidden');
    const activate = () => play(motion.id);
    card.addEventListener('click', activate);
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      activate();
    });
  });

  /* 街舞也是手势合集的一部分：放在手势页最后一格，不再单独占左栏动作卡。 */
  const danceCard = cards[HOME_MOTIONS.length];
  if (danceCard) {
    danceCard.classList.add('is-motion');
    danceCard.dataset.motion = STREET_DANCE.id;
    danceCard.innerHTML = `<span class="motion__label">${STREET_DANCE.label}</span>`;
    danceCard.setAttribute('role', 'button');
    danceCard.setAttribute('tabindex', '0');
    danceCard.setAttribute('aria-label', '播放街舞动作');
    danceCard.setAttribute('aria-pressed', 'false');
    danceCard.removeAttribute('aria-hidden');
    const activateDance = () => play(STREET_DANCE.id);
    danceCard.addEventListener('click', activateDance);
    danceCard.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      activateDance();
    });
  }

  return (activeId) => {
    cards.forEach((card) => {
      const active = card.dataset.motion === activeId;
      card.classList.toggle('is-on', active);
      if (card.dataset.motion) card.setAttribute('aria-pressed', String(active));
    });
  };
}
