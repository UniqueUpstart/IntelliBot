import * as THREE from 'three';
import {moodId, setMood, onMood} from './faces.js?v=15';
import {HOME_MOTIONS, Q1_MOTIONS, Q1_REST_POSE} from './q1_motion_data.js?v=3';
import {STREET_DANCE, STREET_DANCE_REST_POSE} from './street_dance_data.js?v=3';
import {BELLY_LAUGH, BELLY_LAUGH_REST_POSE} from './belly_laugh_data.js?v=3';
import {MECHANICAL_DANCE, MECHANICAL_DANCE_REST_POSE} from './mechanical_dance_data.js?v=3';
import {DISCO_DANCE, DISCO_DANCE_REST_POSE} from './disco_dance_data.js?v=3';

import {COMPANION_MOTIONS, COMPANION_REST} from './companion_motion_data.js?v=2';

const TIMELINE_MOTIONS = [
  STREET_DANCE, BELLY_LAUGH, MECHANICAL_DANCE, DISCO_DANCE, ...COMPANION_MOTIONS,
];
const TIMELINE_BY_ID = Object.fromEntries(TIMELINE_MOTIONS.map((motion) => [motion.id, motion]));
const TIMELINE_REST_POSES = new Map([
  ...COMPANION_MOTIONS.map(motion => [motion.id, COMPANION_REST]),
  [STREET_DANCE.id, STREET_DANCE_REST_POSE],
  [BELLY_LAUGH.id, BELLY_LAUGH_REST_POSE],
  [MECHANICAL_DANCE.id, MECHANICAL_DANCE_REST_POSE],
  [DISCO_DANCE.id, DISCO_DANCE_REST_POSE],
]);
const MOTION_BY_ID = Object.fromEntries([
  ...HOME_MOTIONS.map((motion) => [motion.id, motion]),
  ...TIMELINE_MOTIONS.map((motion) => [motion.id, motion]),
]);

// Q1 自然站姿下的关节世界轴，已经从 (x前, y左, z上) 转到
// GLB 的 (x左, y上, z前)。运行时再转换到对应骨骼的局部坐标。
const RETARGET = {
  waist_pitch_joint: {bone: 'body1', worldAxis: [1, 0, 0]},
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

function sampleTrack(points, beat, easing = 'smooth') {
  if (!points || !points.length) return 0;
  if (beat <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (beat >= last[0]) return last[1];
  for (let index = 1; index < points.length; index += 1) {
    const [endBeat, endValue] = points[index];
    if (beat > endBeat) continue;
    const [startBeat, startValue] = points[index - 1];
    const raw = (beat - startBeat) / (endBeat - startBeat || 1);
    const progress = smoothstep(easing === 'snap' ? Math.min(1, raw / 0.18) : raw);
    return startValue + (endValue - startValue) * progress;
  }
  return last[1];
}

function timelineRest(motion) {
  return TIMELINE_REST_POSES.get(motion.id) || Q1_REST_POSE;
}

function sampleTimelinePose(time, transform) {
  const beat = time * transform.bpm / 60;
  const pose = {...timelineRest(transform)};
  Object.entries(transform.tracks).forEach(([joint, points]) => {
    pose[joint] = sampleTrack(points, beat, transform.easing);
  });
  return pose;
}

function sampleTimelineRoot(time, transform) {
  if (!transform.root) return {side: 0, yaw: 0};
  const beat = time * transform.bpm / 60;
  const easing = transform.root.easing || transform.easing || 'smooth';
  return {
    side: sampleTrack(transform.root.side, beat, easing),
    yaw: sampleTrack(transform.root.yaw, beat, easing),
  };
}

/* 动作库有两种写法：前十个是「一串关节角 + 振荡」，街舞与捧腹大笑是
   带 BPM 的时间轴轨道。要把某个动作定格成一帧（右栏卡片的缩略图就走这里），
   外面不该各判一次类型 —— 这个入口按 id 收口，连它自己的自然站姿一起给，
   因为两种写法的基线姿势并不相同（时间轴那份带不带腿的关节）。
   返回 null 表示这个 id 不在动作库里 */
export function sampleMotionFrame(id, progress) {
  const timeline = TIMELINE_BY_ID[id];
  if (timeline) {
    const time = THREE.MathUtils.clamp(progress, 0, 1) * timeline.duration;
    return {pose: sampleTimelinePose(time, timeline), rest: timelineRest(timeline)};
  }
  if (!Q1_MOTIONS[id]) return null;
  return {pose: samplePose(id, THREE.MathUtils.clamp(progress, 0, 1)), rest: Q1_REST_POSE};
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
        const baseline = Q1_REST_POSE[joint] ?? 0;
        const angle = (pose[joint] ?? baseline) - baseline;
        result.multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
      });
      values.push(result.x, result.y, result.z, result.w);
    });
    return new THREE.QuaternionKeyframeTrack(`${group.bone.name}.quaternion`, times, values);
  });
  for (const track of tracks) {
    if (!track.values.every(Number.isFinite)) {
      throw new Error(`动作 ${motion.id} 包含无效关节旋转：${track.name}`);
    }
  }
  return new THREE.AnimationClip(`q1_${motion.id}`, motion.duration, tracks);
}

function buildTimelineClip(motion, groups) {
  const steps = Math.ceil(motion.duration * 30);
  const times = Array.from({length: steps + 1}, (_, index) => motion.duration * index / steps);
  const rest = timelineRest(motion);
  const tracks = groups.map((group) => {
    const values = [];
    times.forEach((time) => {
      const pose = sampleTimelinePose(time, motion);
      const result = group.rest.clone();
      group.bindings.forEach(({joint, axis}) => {
        const baseline = rest[joint] ?? 0;
        const angle = (pose[joint] ?? baseline) - baseline;
        result.multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
      });
      values.push(result.x, result.y, result.z, result.w);
    });
    return new THREE.QuaternionKeyframeTrack(`${group.bone.name}.quaternion`, times, values);
  });
  for (const track of tracks) {
    if (!track.values.every(Number.isFinite)) {
      throw new Error(`动作 ${motion.id} 包含无效关节旋转：${track.name}`);
    }
  }
  return new THREE.AnimationClip(`q1_${motion.id}`, motion.duration, tracks);
}

export function createHomeMotionController(model, mixer, idleAction, onState, ensurePlayback, options = {}) {
  const groups = createBindings(model);
  const danceGroups = createBindings(model, DANCE_RETARGET);
  const clips = {
    ...Object.fromEntries(HOME_MOTIONS.map((motion) => [motion.id, buildClip(motion, groups)])),
    ...Object.fromEntries(TIMELINE_MOTIONS.map((motion) => [
      motion.id,
      buildTimelineClip(motion, danceGroups),
    ])),
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
      const timeline = active && TIMELINE_BY_ID[active.id];
      if (!motionRoot || !action || !timeline) return;
      const root = sampleTimelineRoot(Math.min(action.time, timeline.duration), timeline);
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
        easing: motion.easing || 'smooth',
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

/* 左栏 Action 已展示的舞蹈不在右栏重复出现；其余手势进入右栏，
   卡面是机器人做这个动作的缩略图，图没就绪时先显示名字 */
const RAIL_EXCLUDE = new Set([
  'dance', 'cha_cha', 'street_dance',
  MECHANICAL_DANCE.id, DISCO_DANCE.id,
]);
const ACTION_SHORTCUTS = [
  {motion: MECHANICAL_DANCE, brief: '定格机械舞'},
  {motion: DISCO_DANCE, brief: '复古迪斯科'},
];
const RAIL_MOTIONS = [...HOME_MOTIONS, ...TIMELINE_MOTIONS]
  .filter((motion) => !RAIL_EXCLUDE.has(motion.id));
const PLAY_GLYPH =
  '<span class="sc__go" aria-hidden="true"><svg viewBox="0 0 32 32">' +
  '<path d="M23.78,16.54c.3-.3.3-.79,0-1.09l-4.35-4.35c-.3-.3-.79-.79-1.09-1.09l-4.35-4.35' +
  'c-.3-.3-.89-.54-1.31-.54h-3.9c-.42,0-.77.35-.77.77v3.9c0,.42.24,1.01.54,1.31l4.35,4.35' +
  'c.3,.3,.3,.79,0,1.09l-4.35,4.35c-.3,.3-.54,.89-.54,1.31v3.9c0,.42,.35,.77,.77,.77h3.9' +
  'c.42,0,1.01-.24,1.31-.54l4.35-4.35c.3-.3,.79-.79,1.09-1.09l4.35-4.35Z"/></svg></span>';

export function mountHomeMotionControls(play) {
  const actionGroup = document.querySelector('.sc-group--action');
  const placeholderCards = actionGroup
    ? Array.from(actionGroup.querySelectorAll('.sc:not([data-motion]):not([data-action-motion])'))
    : [];
  const actionCards = placeholderCards.slice(0, ACTION_SHORTCUTS.length);
  placeholderCards.slice(ACTION_SHORTCUTS.length).forEach((card) => card.remove());
  actionCards.forEach((card, index) => {
    const {motion, brief} = ACTION_SHORTCUTS[index];
    if (!motion) return;
    card.dataset.actionMotion = motion.id;
    /* 三行分开写：名字、简介、时长。时长单独一行压在简介下面，
       不再和简介拼成「定格机械舞 · 12s」那种一条 —— 扫卡片时这两件事
       不是一回事，字号与墨色也各归各的（见 css/cards.css 的 .sc__intro / .sc__time） */
    card.innerHTML =
      '<span class="sc__id">' + String(index + 1).padStart(2, '0') + '</span>' +
      '<span class="sc__brief">' + motion.label + '</span>' +
      '<span class="sc__intro">' + brief + '</span>' +
      '<span class="sc__time">' + motion.duration + 's</span>' +
      PLAY_GLYPH;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', '播放' + motion.label + '动作');
    card.setAttribute('aria-pressed', 'false');
    const activate = () => play(motion.id);
    card.addEventListener('click', activate);
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      activate();
    });
  });
  if (actionGroup) {
    Array.from(actionGroup.querySelectorAll('.sc')).forEach((card, index) => {
      const number = card.querySelector('.sc__id');
      if (number) number.textContent = String(index + 1).padStart(2, '0');
    });
  }

  const grid = document.querySelector('[data-rail-grid="gestures"]');
  if (grid) {
    while (grid.children.length < RAIL_MOTIONS.length) {
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
    card.innerHTML = `<span class="motion__label">${motion.label}</span>`
      + '<img class="motion__thumb" alt="" decoding="async" draggable="false" hidden>';
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

  /* 缩略图归三维那侧拍：robot3d.js 的 motionThumb 拿离屏 target 渲一张，
     之后走缓存。模型 6.4MB，比这段脚本晚就绪：先留名字，robot-ready 再补一次。
     图到了也不撤名字 —— 卡面留两层，静止露名称、指针停上去才换成图（见 rail.css） */
  function fillThumbs() {
    const api = window.robot3d;
    if (!api || typeof api.motionThumb !== 'function') return false;
    let filled = false;
    RAIL_MOTIONS.forEach((motion, index) => {
      const card = cards[index];
      if (!card) return;
      const img = card.querySelector('.motion__thumb');
      if (!img || img.getAttribute('src')) return;
      const url = api.motionThumb(motion.id);
      if (!url) return;
      img.src = url;
      img.hidden = false;
      card.classList.add('is-thumb');
      filled = true;
    });
    return filled;
  }

  if (!fillThumbs()) window.addEventListener('robot-ready', fillThumbs, { once: true });

  return (activeId) => {
    [...cards, ...actionCards].forEach((card) => {
      const active = card.dataset.motion === activeId;
      const shortcutActive = card.dataset.actionMotion === activeId;
      card.classList.toggle('is-on', active || shortcutActive);
      if (card.dataset.motion) card.setAttribute('aria-pressed', String(active));
      if (card.dataset.actionMotion) card.setAttribute('aria-pressed', String(shortcutActive));
    });
  };
}
