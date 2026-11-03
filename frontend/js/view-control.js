import * as THREE from 'three';

const VIEWS = {
  east:   { azimuth: 90,   elevation: 0,  label: '东', hint: '右视' },
  south:  { azimuth: 0,    elevation: 0,  label: '南', hint: '正视' },
  west:   { azimuth: -90,  elevation: 0,  label: '西', hint: '左视' },
  north:  { azimuth: 180,  elevation: 0,  label: '北', hint: '后视' },
  top:    { azimuth: 0,    elevation: 90, label: '上', hint: '俯视' },
  bottom: { azimuth: 0,    elevation: -90,label: '下', hint: '仰视' },
};

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

let robo = null;
let wrap = null;
let camera = null;
let panel = null;
let viewButton = null;
let marker = null;
let markerBone = null;
let ready = false;

const raycaster = new THREE.Raycaster();
const jointAxisParents = new Map();
const view = { azimuth: 0, elevation: 0, distance: 1 };
const pointer = { x: 0, y: 0 };
let drag = null;
let activeView = null;
let lastCamY = 0;
let lastCamD = 1;
let hoverTimer = 0;
let hoverPoint = null;

const tempVec = new THREE.Vector3();
const tempScale = new THREE.Vector3();

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function normalizeAngle(value) {
  return THREE.MathUtils.euclideanModulo(value + 180, 360) - 180;
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
  buildPanel();
  bindInteractions();
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

function buildPanel() {
  viewButton = document.querySelector('.view-adjust-trigger');
  panel = document.createElement('section');
  panel.className = 'viewtool';
  panel.id = 'robot-view-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', '视角调整');
  panel.hidden = true;

  const heading = document.createElement('div');
  heading.className = 'vt-heading';
  heading.innerHTML = '<span>视角调整</span><button class="vt-close" type="button" aria-label="关闭视角调整面板">×</button>';
  panel.appendChild(heading);

  const directions = document.createElement('div');
  directions.className = 'vt-directions';
  ['east', 'south', 'west', 'north', 'top', 'bottom'].forEach((key) => {
    const preset = VIEWS[key];
    const button = document.createElement('button');
    button.className = 'vt-dir';
    button.type = 'button';
    button.dataset.view = key;
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = '<span>' + preset.label + '</span><small>' + preset.hint + '</small>';
    button.addEventListener('click', () => setPreset(key));
    directions.appendChild(button);
  });
  panel.appendChild(directions);

  const actions = document.createElement('div');
  actions.className = 'vt-actions';
  actions.appendChild(actionButton('zoom-out', '缩小', '−', () => zoom(1 / 1.12)));
  actions.appendChild(actionButton('zoom-in', '放大', '+', () => zoom(1.12)));
  const resetViewButton = actionButton('reset-view', '复位视角', '视角复位', resetView);
  resetViewButton.classList.add('vt-action-wide');
  actions.appendChild(resetViewButton);
  panel.appendChild(actions);

  document.body.appendChild(panel);
  refreshViewButtons();

  panel.querySelector('.vt-close').addEventListener('click', closePanel);
  window.addEventListener('resize', placePanel);

  if (viewButton) {
    viewButton.setAttribute('aria-controls', panel.id);
    viewButton.setAttribute('aria-expanded', 'false');
    viewButton.setAttribute('aria-haspopup', 'dialog');
    viewButton.addEventListener('click', togglePanel);
  }
  const poseResetButton = document.querySelector('.pose-reset-trigger');
  if (poseResetButton) poseResetButton.addEventListener('click', resetPose);

  document.addEventListener('pointerdown', (event) => {
    if (panel.hidden) return;
    if (panel.contains(event.target) || (viewButton && viewButton.contains(event.target))) return;
    closePanel();
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) closePanel();
  });
}

function actionButton(name, label, text, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'vt-action';
  button.dataset.action = name;
  button.setAttribute('aria-label', label);
  button.textContent = text;
  button.addEventListener('click', handler);
  return button;
}

function placePanel() {
  if (!panel || panel.hidden) return;
  const rect = viewButton ? viewButton.getBoundingClientRect() : {left: 16, bottom: 88};
  const width = panel.offsetWidth || 300;
  panel.style.left = Math.round(clamp(rect.left, 8, Math.max(8, window.innerWidth - width - 8))) + 'px';
  panel.style.top = Math.round(rect.bottom + 10) + 'px';
}

function openPanel() {
  if (!panel) return;
  panel.hidden = false;
  if (viewButton) {
    viewButton.classList.add('is-active');
    viewButton.setAttribute('aria-pressed', 'true');
    viewButton.setAttribute('aria-expanded', 'true');
  }
  placePanel();
}

function closePanel() {
  if (!panel) return;
  panel.hidden = true;
  if (viewButton) {
    viewButton.classList.remove('is-active');
    viewButton.setAttribute('aria-pressed', 'false');
    viewButton.setAttribute('aria-expanded', 'false');
  }
}

function togglePanel() {
  if (panel.hidden) openPanel();
  else closePanel();
}

function refreshViewButtons() {
  if (!panel) return;
  panel.querySelectorAll('[data-view]').forEach((button) => {
    const active = button.dataset.view === activeView;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function setPreset(key) {
  const preset = VIEWS[key];
  if (!preset || !ready) return;
  view.azimuth = preset.azimuth;
  view.elevation = preset.elevation;
  view.distance = 1;
  activeView = key;
  robo.setPointerAimPaused(true);
  refreshViewButtons();
  step(lastCamY, lastCamD);
}

function resetView() {
  setPreset('south');
}

function resetPose() {
  if (!ready || !robo.resetPose) return;
  robo.resetPose();
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
}

/* 中键（button 1）直接在模型上拖拽环绕；左键留给关节。
   视野调整不再走顶栏按钮 + 面板那套预设，按下就转，松开即停。 */
function onPointerDown(event) {
  if (!ready) return;

  if (event.button === 1) {
    event.preventDefault();
    activeView = null;
    refreshViewButtons();
    drag = {
      kind: 'camera',
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    robo.setPointerAimPaused(true);
    wrap.classList.add('vc-camera');
    capturePointer(event.pointerId);
    return;
  }

  if (event.button !== 0) return;
  event.preventDefault();

  const joint = findJointAt(event.clientX, event.clientY);
  if (!joint) return;

  pointer.x = event.clientX;
  pointer.y = event.clientY;
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

  queueHover(event.clientX, event.clientY);
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
  wrap.classList.remove('vc-camera', 'vc-dragging-joint', 'vc-joint');

  if (wasJoint || wasCamera) robo.setPointerAimPaused(false);
  if (!wasJoint) queueHover(pointer.x, pointer.y);
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

function queueHover(clientX, clientY) {
  hoverPoint = { x: clientX, y: clientY };
  if (hoverTimer) return;
  hoverTimer = window.setTimeout(() => {
    hoverTimer = 0;
    if (drag || !hoverPoint) return;
    const joint = findJointAt(hoverPoint.x, hoverPoint.y);
    if (joint) {
      showMarker(joint.bone, false);
      wrap.classList.add('vc-hover-joint');
    } else {
      hideMarker();
      wrap.classList.remove('vc-hover-joint');
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
  get preset() { return activeView; },
  get dragging() { return drag ? drag.kind : null; },
  openPanel,
  closePanel,
  setPreset,
  resetView,
  resetPose,
};

if (robo && robo.ready) boot();
else window.addEventListener('robot-ready', boot, { once: true });
