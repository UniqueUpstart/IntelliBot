import * as THREE from 'three';
import {HOME_MOTIONS, Q1_MOTIONS, Q1_REST_POSE} from './q1_motion_data.js';

const MOTION_BY_ID = Object.fromEntries(HOME_MOTIONS.map((motion) => [motion.id, motion]));

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

function smoothstep(value) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function samplePose(id, progress) {
  const motion = Q1_MOTIONS[id];
  const time = progress * motion.duration;
  const blend = Math.min(smoothstep(progress / 0.16), smoothstep((1 - progress) / 0.18));
  const pose = {};

  Object.entries(Q1_REST_POSE).forEach(([joint, rest]) => {
    let target = motion.pose[joint] ?? rest;
    const [amplitude = 0, omega = 0, phase = 0] = motion.oscillation?.[joint] ?? [];
    target += amplitude * Math.sin(omega * time + phase);
    pose[joint] = rest + (target - rest) * blend;
  });
  return pose;
}

function findBone(model, name) {
  return model.getObjectByName(name)
    || model.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
}

function createBindings(model) {
  const bindings = {};
  const groups = new Map();

  model.updateMatrixWorld(true);
  Object.entries(RETARGET).forEach(([joint, spec]) => {
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

  const missing = Object.keys(RETARGET).filter((joint) => !bindings[joint]);
  if (missing.length) throw new Error(`主页模型缺少动作骨骼：${missing.join(', ')}`);
  return [...groups.values()];
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

export function createHomeMotionController(model, mixer, idleAction, onState, ensurePlayback) {
  const groups = createBindings(model);
  const clips = Object.fromEntries(HOME_MOTIONS.map((motion) => [motion.id, buildClip(motion, groups)]));
  let active = null;
  let action = null;

  mixer.addEventListener('finished', (event) => {
    if (!action || event.action !== action) return;
    action = null;
    active = null;
    if (idleAction) idleAction.reset().fadeIn(0.2).play();
    onState(null);
  });

  function stop() {
    if (action) action.stop();
    action = null;
    active = null;
    if (idleAction) idleAction.reset().play();
    onState(null);
    ensurePlayback();
  }

  return {
    play(id) {
      const motion = MOTION_BY_ID[id];
      if (!motion) return false;
      if (action) action.stop();
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
    get activeId() { return active?.id ?? null; },
  };
}

export function mountHomeMotionControls(play) {
  const grid = document.querySelector('[data-rail-grid="gestures"]');
  if (!grid) return () => {};
  const cards = Array.from(grid.children);

  HOME_MOTIONS.forEach((motion, index) => {
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

  return (activeId) => {
    cards.forEach((card) => {
      const active = card.dataset.motion === activeId;
      card.classList.toggle('is-on', active);
      if (card.dataset.motion) card.setAttribute('aria-pressed', String(active));
    });
  };
}
