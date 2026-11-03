import * as THREE from 'three';

const JOINT_CONFIGS = {
  'body1':    { axis: 'yaw', axes: ['yaw', 'pitch'], range: [-1.571, 1.571] },
  'head':     { axis: 'yaw',   range: [-1.2, 1.2] },
  'Bone.005': { axis: 'pitch', range: [-3.142, 1.571] },
  'Bone.006': { axis: 'roll', input: 'vertical', sign: -1, range: [-0.087, 2.792] },
  'Bone.007': { axis: 'yaw', input: 'horizontal', sign: 1, range: [-1.571, 1.571] },
  'Bone.008': { axis: 'pitch', range: [-0.873, 1.658] },
  'Bone.009': { axis: 'pitch', range: [-3.142, 1.571] },
  'Bone.010': { axis: 'roll', input: 'vertical', sign: 1, range: [-2.792, 0.087] },
  'Bone.011': { axis: 'yaw', input: 'horizontal', sign: -1, range: [-1.571, 1.571] },
  'Bone.012': { axis: 'pitch', range: [-0.873, 1.658] },
  'Bone.030': { axis: 'pitch', range: [-3.054, 1.571] },
  'Bone.032': { axis: 'roll',  range: [-0.698, 1.571] },
  'Bone.033': { axis: 'yaw',   range: [-1.571, 1.571] },
  'Bone.035': { axis: 'pitch', range: [0, 2.443] },
  'Bone.037': { axis: 'pitch', range: [-0.785, 0.436] },
  'Bone.038': { axis: 'roll',  range: [-0.349, 0.349] },
  'Bone.031': { axis: 'pitch', range: [-3.054, 1.571] },
  'Bone.034': { axis: 'roll',  range: [-1.571, 0.698] },
  'Bone.036': { axis: 'yaw',   range: [-1.571, 1.571] },
  'Bone.039': { axis: 'pitch', range: [0, 2.443] },
  'Bone.040': { axis: 'pitch', range: [-0.785, 0.436] },
  'Bone.041': { axis: 'roll',  range: [-0.349, 0.349] },
};

const WAIST_YAW_CONFIG = { axis: 'yaw', input: 'horizontal', sign: 1, range: [-1.571, 1.571] };
const WAIST_PITCH_CONFIG = { axis: 'pitch', input: 'vertical', sign: -1, range: [-0.35, 0.35] };

const JOINT_AXES = {
  pitch: new THREE.Vector3(1, 0, 0),
  roll: new THREE.Vector3(0, 0, 1),
  yaw: new THREE.Vector3(0, 1, 0),
};

const ROOT_JOINTS = new Set(['Bone.001', 'Bone.002']);
const SHOULDER_PITCH_ROOTS = {
  'Bone.006': 'Bone.005',
  'Bone.010': 'Bone.009',
};

const DRAG_START_PX = 3;
const JOINT_PIXEL_TO_RAD = 0.009;
const ORBIT_PIXEL_TO_DEG = 0.35;
const TILT_PIXEL_TO_DEG = 0.3;
const WHEEL_ZOOM_K = 0.0012;
const DISTANCE_MIN = 0.5;
const DISTANCE_MAX = 3.2;
const ELEVATION_LIMIT = 89;
const HOVER_DELAY_MS = 60;
const WAIST_TRIGGER_Y = 0.045;
const SHOULDER_PITCH_RADIUS = 0.045;
const DEFAULT_VIEW_KEY = 'intellibot.default-view';
const FRONT_VIEW = Object.freeze({ azimuth: 0, elevation: 0, distance: 1, mode: 'front' });

let robo = null;
let wrap = null;
let camera = null;
let marker = null;
let markerBone = null;
let ready = false;

const raycaster = new THREE.Raycaster();
const jointAxisParents = new Map();
let defaultView = loadDefaultView();
const view = {
  azimuth: defaultView.azimuth,
  elevation: defaultView.elevation,
  distance: defaultView.distance,
};
const pointer = { x: 0, y: 0 };
let drag = null;
let lastCamY = 0;
let lastCamD = 1;
let hoverTimer = 0;
let hoverPoint = null;
let hoverCanPose = false;

const tempVec = new THREE.Vector3();
const tempScale = new THREE.Vector3();

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function normalizeAngle(value) {
  return THREE.MathUtils.euclideanModulo(value + 180, 360) - 180;
}

function loadDefaultView() {
  try {
    const saved = JSON.parse(localStorage.getItem(DEFAULT_VIEW_KEY) || 'null');
    if (!saved || !Number.isFinite(saved.azimuth) || !Number.isFinite(saved.elevation)) {
      return {...FRONT_VIEW};
    }
    return {
      azimuth: normalizeAngle(saved.azimuth),
      elevation: clamp(saved.elevation, -ELEVATION_LIMIT, ELEVATION_LIMIT),
      distance: Number.isFinite(saved.distance)
        ? clamp(saved.distance, DISTANCE_MIN, DISTANCE_MAX)
        : 1,
      mode: saved.mode === 'custom' ? 'custom' : 'front',
    };
  } catch (error) {
    return {...FRONT_VIEW};
  }
}

function saveDefaultView(next) {
  defaultView = {...next};
  try {
    localStorage.setItem(DEFAULT_VIEW_KEY, JSON.stringify(defaultView));
  } catch (error) {
    /* Private browsing may reject storage; the default still works this session. */
  }
  refreshDefaultViewButtons();
}

function canonicalJointName(name) {
  return /^Bone\d+$/.test(name) ? name.replace(/^Bone(\d+)$/, 'Bone.$1') : name;
}

function jointConfigForName(name) {
  return JOINT_CONFIGS[name] || JOINT_CONFIGS[canonicalJointName(name)] || null;
}

function cacheJointAxes() {
  const parentQuaternion = new THREE.Quaternion();
  robo.model.traverse((bone) => {
    const config = jointConfigForName(bone.name);
    if (!bone.isBone || !config || !bone.parent) return;
    bone.parent.getWorldQuaternion(parentQuaternion);
    parentQuaternion.invert();
    const axisNames = config.axes || [config.axis];
    axisNames.forEach((axisName) => {
      const axis = JOINT_AXES[axisName].clone().applyQuaternion(parentQuaternion).normalize();
      jointAxisParents.set(bone.uuid + ':' + axisName, axis);
    });
  });
}

function cachedJointAxis(bone, axisName) {
  return (jointAxisParents.get(bone.uuid + ':' + axisName) || JOINT_AXES[axisName]).clone();
}

function boot() {
  robo = window.robot3d;
  if (!robo || !robo.ready || !robo.model) return;
  wrap = document.querySelector('.robofx');
  if (!wrap) return;

  camera = robo.camera;
  ready = true;
  robo.model.updateMatrixWorld(true);
  cacheJointAxes();

  createMarker();
  bindInteractions();
  bindResetAndDefaultControls();
  wrap.classList.add('vc-enabled');
  window.__robotView = { step };
  step(0, 1);
}

function step(camY, camD) {
  if (!ready) return;
  lastCamY = camY;
  lastCamD = camD;
  const heading = robo.viewHeading || 0;
  const azimuth = heading + THREE.MathUtils.degToRad(view.azimuth);
  const elevation = THREE.MathUtils.degToRad(view.elevation);
  const distance = camD * view.distance;
  const horizontal = Math.cos(elevation) * distance;

  camera.position.set(
    Math.sin(azimuth) * horizontal,
    camY + Math.sin(elevation) * distance,
    Math.cos(azimuth) * horizontal
  );

  if (view.elevation >= 89.99) {
    camera.up.set(-Math.sin(heading), 0, -Math.cos(heading));
  } else if (view.elevation <= -89.99) {
    camera.up.set(Math.sin(heading), 0, Math.cos(heading));
  } else {
    camera.up.set(0, 1, 0);
  }
  camera.lookAt(0, camY, 0);
  camera.updateMatrixWorld(true);

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    robo.renderer.render(robo.scene, camera);
  }
}

function createMarker() {
  const geometry = new THREE.SphereGeometry(1, 16, 12);
  const material = new THREE.MeshBasicMaterial({
    color: 0x91d2c3,
    transparent: true,
    opacity: 0.78,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  marker = new THREE.Mesh(geometry, material);
  marker.name = '__robot_joint_marker';
  marker.userData.viewMarker = true;
  marker.renderOrder = 999;
  marker.visible = false;
}

function showMarker(bone, active) {
  if (!marker || !bone) return;
  if (markerBone !== bone) {
    if (marker.parent) marker.parent.remove(marker);
    bone.add(marker);
    marker.position.set(0, 0, 0);
    markerBone = bone;
  }
  bone.getWorldScale(tempScale);
  const largestScale = Math.max(Math.abs(tempScale.x), Math.abs(tempScale.y), Math.abs(tempScale.z), 0.0001);
  marker.scale.setScalar(0.024 / largestScale);
  marker.material.opacity = active ? 0.95 : 0.7;
  marker.visible = true;
}

function hideMarker() {
  if (!marker) return;
  marker.visible = false;
  if (marker.parent) marker.parent.remove(marker);
  markerBone = null;
}

function bindResetAndDefaultControls() {
  const poseResetButton = document.querySelector('.pose-reset-trigger');
  if (poseResetButton) poseResetButton.addEventListener('click', resetAll);

  document.querySelectorAll('[data-view-default]').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.viewDefault === 'current') {
        saveDefaultView({
          azimuth: view.azimuth,
          elevation: view.elevation,
          distance: view.distance,
          mode: 'custom',
        });
        return;
      }
      saveDefaultView({...FRONT_VIEW});
      resetView();
    });
  });
  refreshDefaultViewButtons();
  window.addEventListener('langchange', refreshDefaultViewButtons);
}

function refreshDefaultViewButtons() {
  document.querySelectorAll('[data-view-default]').forEach((button) => {
    const mode = button.dataset.viewDefault === 'current' ? 'custom' : 'front';
    const active = mode === defaultView.mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function resetView() {
  if (!ready) return;
  view.azimuth = defaultView.azimuth;
  view.elevation = defaultView.elevation;
  view.distance = defaultView.distance;
  robo.setPointerAimPaused(false);
  step(lastCamY, lastCamD);
}

function resetAll() {
  if (!ready || !robo.resetPose) return;
  if (robo.stopGesture) robo.stopGesture();
  if (robo.setMood) robo.setMood('calm');
  robo.resetPose();
  if (robo.playClip) robo.playClip('idle', true);
  resetView();
  hideMarker();
}

function zoom(factor) {
  view.distance = clamp(view.distance * factor, DISTANCE_MIN, DISTANCE_MAX);
  step(lastCamY, lastCamD);
}

function bindInteractions() {
  wrap.addEventListener('pointerdown', onPointerDown);
  wrap.addEventListener('pointermove', onPointerMove);
  wrap.addEventListener('pointerup', onPointerUp);
  wrap.addEventListener('pointercancel', onPointerUp);
  wrap.addEventListener('pointerleave', () => {
    if (!drag) hideMarker();
    hoverPoint = null;
    hoverCanPose = false;
    wrap.classList.remove('vc-can-pose', 'vc-hover-joint');
  });
  wrap.addEventListener('wheel', onWheel, { passive: false });
  wrap.addEventListener('contextmenu', (event) => event.preventDefault());
  /* 中键在部分浏览器会触发「自动滚动」圆盘与 auxclick，
     mousedown 这一层先按一次，pointerdown 与 auxclick 再各兜一层 */
  wrap.addEventListener('mousedown', (event) => {
    if (event.button === 1) event.preventDefault();
  });
  wrap.addEventListener('auxclick', (event) => {
    if (event.button === 1) event.preventDefault();
  });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Alt' && !drag) queueHover(pointer.x, pointer.y, true);
  });
  window.addEventListener('keyup', (event) => {
    if (event.key === 'Alt' && !drag) queueHover(pointer.x, pointer.y, false);
  });
}

/* 左键拖动在任何位置都环绕视角；Alt/Option + 左键才进入关节编辑。
   两套手势因此不会争同一次按下，普通浏览也不会误扭到肢体。 */
function onPointerDown(event) {
  if (!ready) return;

  if (event.button !== 0 && event.button !== 1) return;
  event.preventDefault();
  pointer.x = event.clientX;
  pointer.y = event.clientY;

  const joint = event.button === 0 && event.altKey
    ? findJointAt(event.clientX, event.clientY)
    : null;
  if (joint) {
    drag = {
      kind: 'joint-pending',
      pointerId: event.pointerId,
      bone: joint.bone,
      config: joint.config,
      hit: joint.point.clone(),
      startX: event.clientX,
      startY: event.clientY,
    };
    showMarker(joint.bone, false);
    wrap.classList.add('vc-joint');
    capturePointer(event.pointerId);
    return;
  }

  drag = {
    kind: 'camera',
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
  };
  robo.setPointerAimPaused(true);
  wrap.classList.remove('vc-hover-joint', 'vc-can-pose');
  wrap.classList.add('vc-camera');
  capturePointer(event.pointerId);
}

function onPointerMove(event) {
  if (!ready) return;
  pointer.x = event.clientX;
  pointer.y = event.clientY;

  if (drag) {
    const dx = event.clientX - (drag.x ?? drag.startX ?? event.clientX);
    const dy = event.clientY - (drag.y ?? drag.startY ?? event.clientY);

    if (drag.kind === 'joint-pending') {
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_START_PX) return;
      startJointDrag(event);
    }

    if (drag.kind === 'camera') {
      view.azimuth = normalizeAngle(view.azimuth - dx * ORBIT_PIXEL_TO_DEG);
      view.elevation = clamp(view.elevation - dy * TILT_PIXEL_TO_DEG, -ELEVATION_LIMIT, ELEVATION_LIMIT);
      drag.x = event.clientX;
      drag.y = event.clientY;
      step(lastCamY, lastCamD);
      return;
    }

    if (drag.kind === 'joint') {
      drag.x = event.clientX;
      drag.y = event.clientY;
      updateJoint(dx, dy);
      return;
    }
  }

  queueHover(event.clientX, event.clientY, event.altKey);
}

function startJointDrag(event) {
  if (drag.kind !== 'joint-pending') return;
  robo.freezePose();
  robo.setPointerAimPaused(true);

  const bone = drag.bone;
  const parentQuaternion = new THREE.Quaternion();
  bone.parent.getWorldQuaternion(parentQuaternion);

  bone.getWorldPosition(tempVec);
  const axisParent = cachedJointAxis(bone, drag.config.axis);
  const axisWorld = axisParent.clone().applyQuaternion(parentQuaternion).normalize();
  let screenTangent;
  if (drag.config.input === 'vertical') {
    screenTangent = {x: 0, y: drag.config.sign || -1};
  } else if (drag.config.input === 'horizontal') {
    screenTangent = {x: drag.config.sign || 1, y: 0};
  } else {
    screenTangent = screenDragDirection(axisWorld, tempVec, drag.hit);
  }

  drag = {
    kind: 'joint',
    pointerId: drag.pointerId,
    bone,
    config: drag.config,
    axisParent,
    angle: 0,
    screenTangent,
    x: event.clientX,
    y: event.clientY,
  };
  wrap.classList.remove('vc-joint');
  wrap.classList.add('vc-dragging-joint');
  showMarker(bone, true);
}

function updateJoint(dx, dy) {
  const delta = (dx * drag.screenTangent.x + dy * drag.screenTangent.y) * JOINT_PIXEL_TO_RAD;
  const next = clamp(drag.angle + delta, drag.config.range[0], drag.config.range[1]);
  const movement = next - drag.angle;
  drag.angle = next;
  const rotation = new THREE.Quaternion().setFromAxisAngle(drag.axisParent, movement);
  drag.bone.quaternion.premultiply(rotation);
}

function onPointerUp(event) {
  if (!drag) return;
  if (event && drag.pointerId !== undefined && event.pointerId !== drag.pointerId) return;
  const wasJoint = drag.kind === 'joint' || drag.kind === 'joint-pending';
  const wasCamera = drag.kind === 'camera';

  if (wrap && drag.pointerId !== undefined && wrap.hasPointerCapture(drag.pointerId)) {
    wrap.releasePointerCapture(drag.pointerId);
  }
  drag = null;
  wrap.classList.remove('vc-camera', 'vc-dragging-joint', 'vc-joint', 'vc-can-pose');

  if (wasJoint || wasCamera) robo.setPointerAimPaused(false);
  if (!wasJoint) queueHover(pointer.x, pointer.y, false);
}

function onWheel(event) {
  if (!ready) return;
  event.preventDefault();
  /* 滚轮上滚（deltaY < 0）推近、下滚拉远，与仿真视角同一套方向：
     view.distance 是相机距离，值越小画面上的机器人越大 */
  zoom(Math.exp(event.deltaY * WHEEL_ZOOM_K));
}

function capturePointer(pointerId) {
  try {
    wrap.setPointerCapture(pointerId);
  } catch (error) {
    /* The window-level pointerup still ends the gesture if capture is unavailable. */
  }
}

function queueHover(clientX, clientY, canPose = false) {
  hoverPoint = { x: clientX, y: clientY };
  hoverCanPose = canPose;
  if (hoverTimer) return;
  hoverTimer = window.setTimeout(() => {
    hoverTimer = 0;
    if (drag || !hoverPoint) return;
    const joint = hoverCanPose ? findJointAt(hoverPoint.x, hoverPoint.y) : null;
    if (joint) {
      showMarker(joint.bone, false);
      wrap.classList.add('vc-hover-joint');
      wrap.classList.add('vc-can-pose');
    } else {
      hideMarker();
      wrap.classList.remove('vc-hover-joint', 'vc-can-pose');
    }
  }, HOVER_DELAY_MS);
}

function findJointAt(clientX, clientY) {
  if (!robo.model) return null;
  const rect = wrap.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const ndc = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(robo.model.children, true);
  const hit = hits.find((entry) => entry.object.isMesh && !entry.object.userData.viewMarker);
  if (!hit) return null;

  const owner = findJointOwner(hit.object);
  if (!owner) return null;
  const bone = resolveJointTrigger(owner, hit.point);
  if (!bone) return null;
  let config = jointConfigForName(bone.name);
  if (!config) return null;
  if (canonicalJointName(bone.name) === 'body1') {
    const waist = bone.getWorldPosition(tempVec);
    config = hit.point.y >= waist.y ? WAIST_YAW_CONFIG : WAIST_PITCH_CONFIG;
  }
  return {bone, config, point: hit.point.clone()};
}

function findJointOwner(object) {
  let node = object;
  while (node && node !== robo.model) {
    if (node.isBone && jointConfigForName(node.name) && !ROOT_JOINTS.has(canonicalJointName(node.name))) {
      return node;
    }
    node = node.parent;
  }
  return null;
}

function resolveJointTrigger(bone, hitPoint) {
  const name = canonicalJointName(bone.name);
  if (name === 'body1') {
    const waist = bone.getWorldPosition(new THREE.Vector3());
    return Math.abs(hitPoint.y - waist.y) <= WAIST_TRIGGER_Y ? bone : null;
  }

  const pitchRootName = SHOULDER_PITCH_ROOTS[name];
  if (!pitchRootName) return bone;
  let root = bone;
  while (root && root !== robo.model) {
    if (root.isBone && canonicalJointName(root.name) === pitchRootName) {
      const shoulder = root.getWorldPosition(new THREE.Vector3());
      return hitPoint.distanceTo(shoulder) <= SHOULDER_PITCH_RADIUS ? root : bone;
    }
    root = root.parent;
  }
  return bone;
}

function screenDragDirection(worldAxis, pivot, hit) {
  const axisStart = projectWorld(pivot);
  const axisEnd = projectWorld(pivot.clone().addScaledVector(worldAxis, 0.08));
  const axisX = axisEnd.x - axisStart.x;
  const axisY = axisEnd.y - axisStart.y;
  const axisLength = Math.hypot(axisX, axisY);

  const tangent = new THREE.Vector3().crossVectors(worldAxis, hit.clone().sub(pivot));
  let tangentX = 0;
  let tangentY = 0;
  if (tangent.lengthSq() > 1e-10) {
    tangent.normalize();
    const tangentEnd = projectWorld(hit.clone().addScaledVector(tangent, 0.08));
    const hitScreen = projectWorld(hit);
    tangentX = tangentEnd.x - hitScreen.x;
    tangentY = tangentEnd.y - hitScreen.y;
  }

  const tangentLength = Math.hypot(tangentX, tangentY);
  if (tangentLength > 1.5) return {x: tangentX / tangentLength, y: tangentY / tangentLength};
  if (axisLength > 0.5) {
    let x = -axisY / axisLength;
    let y = axisX / axisLength;
    if (x * tangentX + y * tangentY < 0) {
      x = -x;
      y = -y;
    }
    return {x, y};
  }
  return {x: 1, y: 0};
}

function projectWorld(point) {
  const projected = point.clone().project(camera);
  const rect = wrap.getBoundingClientRect();
  return {
    x: rect.left + (projected.x * 0.5 + 0.5) * rect.width,
    y: rect.top + (-projected.y * 0.5 + 0.5) * rect.height,
  };
}

window.viewControl = {
  get view() {
    return {azimuth: view.azimuth, elevation: view.elevation, distance: view.distance};
  },
  get defaultView() { return {...defaultView}; },
  get dragging() { return drag ? drag.kind : null; },
  resetView,
  resetAll,
  saveDefaultView,
};

if (robo && robo.ready) boot();
else window.addEventListener('robot-ready', boot, { once: true });
