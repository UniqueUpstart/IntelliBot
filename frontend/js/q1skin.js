/* 主页皮肤。
   下拉里的「原模型」是 q1_ff.glb，自己播片段。
   「示意人形」和导入的 Mixamo / glTF 跟主页 Gestures 的同一套关节角走。
   导入的文件存在这台浏览器的 IndexedDB 里，刷新后还在列表中。 */
import * as THREE from 'three';
import { HOME_MOTIONS, Q1_MOTIONS, Q1_REST_POSE } from './q1_motion_data.js';
import { bindRetarget, loadCharacter, mountImported } from './skinpose.js?v=6';

const skinStyle = document.createElement('style');
skinStyle.textContent = [
  '.robofx.is-skinned{visibility:hidden}',
  '.skinfx{position:absolute;inset:0;z-index:2;pointer-events:none}',
  '.skinfx canvas{display:block;width:100%;height:100%}',
  '.skinbar{position:fixed;top:calc(var(--top-h) + 28px);left:var(--edge);z-index:30;',
  'display:flex;flex-direction:column;align-items:stretch;gap:2px;width:max-content;max-width:132px;',
  'padding:4px;border-radius:16px;background:rgba(255,255,255,.92);box-shadow:0 8px 28px rgba(20,24,28,.1);',
  'pointer-events:auto;font:13px/1 "Segoe UI",sans-serif;color:#1c1e22}',
  '.skinbar button,.skinbar select,.skinbar__file{border:0;background:transparent;border-radius:12px;',
  'padding:7px 10px;cursor:pointer;color:inherit;font:inherit;text-align:left}',
  '.skinbar select{width:100%;max-width:124px}',
  '.skinbar button:hover,.skinbar__file:hover{background:rgba(0,0,0,.05)}',
  '.skinbar__note{color:#5c6570;padding:4px 8px;white-space:normal}',
].join('');
document.head.appendChild(skinStyle);

const SKIN_KEY = 'intellibot.skin';
const HIP_Z = 0.50;
const TPOSE = {
  left_shoulder_roll_joint: 1.45,
  right_shoulder_roll_joint: -1.45,
};

const HINGES = [
  ['left_hip_pitch_joint', 'lHipPitch', 'y'],
  ['left_hip_roll_joint', 'lHipRoll', 'x'],
  ['left_hip_yaw_joint', 'lHipYaw', 'z'],
  ['left_knee_joint', 'lKnee', 'y'],
  ['left_ankle_pitch_joint', 'lAnklePitch', 'y'],
  ['left_ankle_roll_joint', 'lAnkleRoll', 'x'],
  ['right_hip_pitch_joint', 'rHipPitch', 'y'],
  ['right_hip_roll_joint', 'rHipRoll', 'x'],
  ['right_hip_yaw_joint', 'rHipYaw', 'z'],
  ['right_knee_joint', 'rKnee', 'y'],
  ['right_ankle_pitch_joint', 'rAnklePitch', 'y'],
  ['right_ankle_roll_joint', 'rAnkleRoll', 'x'],
  ['waist_roll_joint', 'waistRoll', 'x'],
  ['waist_yaw_joint', 'waistYaw', 'z'],
  ['left_shoulder_pitch_joint', 'lShPitch', 'y'],
  ['left_shoulder_roll_joint', 'lShRoll', 'x'],
  ['left_shoulder_yaw_joint', 'lShYaw', 'z'],
  ['left_elbow_joint', 'lElbow', 'y'],
  ['right_shoulder_pitch_joint', 'rShPitch', 'y'],
  ['right_shoulder_roll_joint', 'rShRoll', 'x'],
  ['right_shoulder_yaw_joint', 'rShYaw', 'z'],
  ['right_elbow_joint', 'rElbow', 'y'],
];

const stage = document.querySelector('.stage');
if (stage) init();

function init() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const wrap = document.createElement('div');
  wrap.className = 'skinfx';
  wrap.appendChild(renderer.domElement);
  stage.appendChild(wrap);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.72));
  const key = new THREE.DirectionalLight(0xffffff, 1.25);
  key.position.set(1.6, -2.2, 2.6);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.35);
  fill.position.set(-2, 1.2, 1.4);
  scene.add(key, fill);

  const camera = new THREE.PerspectiveCamera(24, 1, 0.05, 40);
  camera.up.set(0, 0, 1);

  const mats = {
    skin: new THREE.MeshLambertMaterial({ color: 0xe4b08e }),
    shirt: new THREE.MeshLambertMaterial({ color: 0x3d6f8c }),
    pants: new THREE.MeshLambertMaterial({ color: 0x2c3344 }),
    sole: new THREE.MeshLambertMaterial({ color: 0x2a211c }),
    hair: new THREE.MeshLambertMaterial({ color: 0x2a2420 }),
  };
  const { root, bones } = buildFigure(mats);
  scene.add(root);
  const proc = captureReference(root, bones);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.22, 32),
    new THREE.MeshBasicMaterial({ color: 0x1a1c1e, transparent: true, opacity: 0.12 })
  );
  shadow.position.z = 0.002;
  scene.add(shadow);

  const bar = buildBar();
  const pick = bar.querySelector('[data-skin-pick]');
  const note = bar.querySelector('[data-skin-note]');
  const removeBtn = bar.querySelector('[data-skin-delete]');
  const fileInput = bar.querySelector('[data-skin-file]');
  const loaded = new Map();
  let current = 'builtin:q1';
  let shown = false;
  let active = null;

  function setNote(text) {
    note.hidden = !text;
    note.textContent = text || '';
  }

  /* 与 homepage_motions.js 里的 samplePose 同一套计算，关节角来自动作库，这里不再改扭转。 */
  function sampleHomePose(id, progress) {
    const motion = Q1_MOTIONS[id];
    if (!motion) return Q1_REST_POSE;
    const time = progress * motion.duration;
    const blendIn = Math.min(progress / 0.16, 1);
    const blendOut = Math.min((1 - progress) / 0.18, 1);
    const sIn = blendIn * blendIn * (3 - 2 * blendIn);
    const sOut = blendOut * blendOut * (3 - 2 * blendOut);
    const blend = Math.min(sIn, sOut);
    const pose = {};
    Object.entries(Q1_REST_POSE).forEach(([joint, rest]) => {
      let target = motion.pose[joint] ?? rest;
      const [amplitude = 0, omega = 0, phase = 0] = motion.oscillation?.[joint] ?? [];
      target += amplitude * Math.sin(omega * time + phase);
      pose[joint] = rest + (target - rest) * blend;
    });
    return pose;
  }

  function poseNow() {
    const gesture = window.__homeGesture;
    if (!gesture || !gesture.id) return Q1_REST_POSE;
    const progress = (performance.now() - gesture.startedAt) / (gesture.duration * 1000);
    if (progress >= 1) return Q1_REST_POSE;
    return sampleHomePose(gesture.id, progress);
  }

  function watchGestures() {
    const grid = document.querySelector('[data-rail-grid="gestures"]');
    if (!grid) {
      requestAnimationFrame(watchGestures);
      return;
    }
    const sync = () => {
      const card = grid.querySelector('.is-on[data-motion]');
      const id = card && card.dataset.motion;
      if (!id) {
        window.__homeGesture = null;
        return;
      }
      if (window.__homeGesture && window.__homeGesture.id === id) return;
      const motion = HOME_MOTIONS.find((item) => item.id === id);
      window.__homeGesture = motion
        ? { id, startedAt: performance.now(), duration: motion.duration }
        : null;
    };
    new MutationObserver(sync).observe(grid, { attributes: true, subtree: true, attributeFilter: ['class'] });
  }
  watchGestures();

  /* 和原模型同一套取景：身高 1、脚在地面、正面朝镜头，腰和头落在同一块画面里。 */
  function resize() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const host = document.querySelector('.robofx') || wrap;
    const style = getComputedStyle(host);
    const topInset = parseFloat(style.getPropertyValue('--robofx-top')) || 88;
    const bottomInset = parseFloat(style.getPropertyValue('--robofx-bottom')) || 208;
    const avail = Math.max(240, h - topInset - bottomInset);
    const tanV = Math.tan((camera.fov * Math.PI) / 180 / 2);
    const distV = h / (avail * 2 * tanV);
    const distH = 0.5 / (2 * tanV * camera.aspect);
    const dist = Math.max(distV, distH) / 0.9;
    const contentCenter = (topInset + h - bottomInset) / 2;
    const eye = 0.5 + (contentCenter - h / 2) * (2 * dist * tanV) / h;
    camera.position.set(dist, 0, eye);
    camera.lookAt(0, 0, eye);
  }
  resize();
  window.addEventListener('resize', resize);

  function originalNode() {
    return document.querySelector('.robofx');
  }

  function setFigureVisible(on) {
    root.traverse((node) => {
      if (node.isMesh) node.visible = on;
    });
  }

  function showStage(on) {
    shown = on;
    wrap.hidden = !on;
    const rob = originalNode();
    if (rob) rob.classList.toggle('is-skinned', on);
    if (on) {
      applyPose(poseNow());
      renderer.setAnimationLoop(draw);
    } else {
      renderer.setAnimationLoop(null);
    }
  }

  function draw() {
    applyPose(poseNow());
    const follow = active ? active.object : root;
    shadow.position.x = follow.position.x;
    shadow.position.y = follow.position.y;
    renderer.render(scene, camera);
  }

  function applyJoints(angles) {
    for (const [name, id, axis] of HINGES) {
      const node = bones[id];
      const value = angles && typeof angles[name] === 'number' ? angles[name] : 0;
      node.rotation.set(0, 0, 0);
      node.rotation[axis] = value;
    }
  }

  function applyPose(angles) {
    applyJoints(angles);
    root.updateMatrixWorld(true);
    if (active && active.apply) active.apply();
  }

  function addOption(id, label) {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = label;
    pick.appendChild(option);
  }

  async function useImport(id) {
    if (!loaded.has(id)) {
      const row = await dbGet(id);
      if (!row) throw new Error('找不到已导入的文件');
      const model = await loadCharacter(row.data, row.name);
      const mounted = mountImported(model);
      const bound = bindRetarget(mounted, proc);
      bound.name = row.name;
      loaded.set(id, bound);
      scene.add(bound.object);
      bound.object.visible = false;
    }
    return loaded.get(id);
  }

  async function selectSkin(id) {
    current = id;
    try { localStorage.setItem(SKIN_KEY, id); } catch (err) { /* 隐私模式可能拒绝写入 */ }
    if (active) active.object.visible = false;
    active = null;
    removeBtn.hidden = !id.startsWith('file:');
    if (id === 'builtin:q1') {
      setFigureVisible(false);
      showStage(false);
      setNote('');
      return;
    }
    showStage(true);
    if (id === 'builtin:figure') {
      setFigureVisible(true);
      setNote('');
      return;
    }
    setFigureVisible(false);
    setNote('正在处理…');
    try {
      active = await useImport(id);
      active.object.visible = true;
      const n = active.links.length;
      setNote(n >= 8 ? '' : '没认出完整人体骨架，模型保持导入姿势');
    } catch (err) {
      setFigureVisible(true);
      setNote(err.message);
    }
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    setNote('正在处理 ' + file.name);
    try {
      const data = await file.arrayBuffer();
      const model = await loadCharacter(data.slice(0), file.name);
      const mounted = mountImported(model);
      const bound = bindRetarget(mounted, proc);
      if (!mounted.bones.hips && !mounted.bones.leftArm && !mounted.bones.leftUpLeg) {
        throw new Error('文件里没有 Hips / Arm / UpLeg 这类骨头');
      }
      const id = await dbPut({ name: file.name, data });
      bound.name = file.name;
      loaded.set(id, bound);
      scene.add(bound.object);
      bound.object.visible = false;
      addOption(id, file.name.replace(/\.[^.]+$/, ''));
      pick.value = id;
      await selectSkin(id);
    } catch (err) {
      setNote(err.message);
    }
  });

  pick.addEventListener('change', () => { selectSkin(pick.value); });
  removeBtn.addEventListener('click', async () => {
    if (!current.startsWith('file:')) return;
    const label = pick.selectedOptions[0] ? pick.selectedOptions[0].textContent : '这个皮肤';
    if (!confirm('从列表里去掉「' + label + '」？')) return;
    const id = current;
    await dbDelete(id);
    const entry = loaded.get(id);
    if (entry) {
      scene.remove(entry.object);
      loaded.delete(id);
    }
    pick.querySelector('option[value="' + id + '"]').remove();
    pick.value = 'builtin:q1';
    await selectSkin('builtin:q1');
  });

  dbList().then(async (rows) => {
    rows.forEach((row) => addOption(row.id, row.name.replace(/\.[^.]+$/, '')));
    let saved = 'builtin:q1';
    try { saved = localStorage.getItem(SKIN_KEY) || saved; } catch (err) { /* 沿用原模型 */ }
    if (![...pick.options].some((option) => option.value === saved)) saved = 'builtin:q1';
    pick.value = saved;
    await selectSkin(saved);
  }).catch((err) => {
    setNote(err.message);
    selectSkin('builtin:q1');
  });
}

function captureReference(root, bones) {
  const nodes = {
    hips: root,
    chest: bones.waistYaw,
    leftArm: bones.lShYaw,
    leftForeArm: bones.lElbow,
    rightArm: bones.rShYaw,
    rightForeArm: bones.rElbow,
    leftUpLeg: bones.lHipYaw,
    leftLeg: bones.lKnee,
    leftFoot: bones.lAnkleRoll,
    rightUpLeg: bones.rHipYaw,
    rightLeg: bones.rKnee,
    rightFoot: bones.rAnkleRoll,
  };
  for (const [name, id, axis] of HINGES) {
    const node = bones[id];
    node.rotation.set(0, 0, 0);
    if (name in TPOSE) node.rotation[axis] = TPOSE[name];
  }
  root.updateMatrixWorld(true);
  const rest = new Map();
  for (const [role, node] of Object.entries(nodes)) {
    rest.set(role, node.getWorldQuaternion(new THREE.Quaternion()));
  }
  for (const [, id] of HINGES) bones[id].rotation.set(0, 0, 0);
  const segments = {
    leftArm: [bones.lShRoll, bones.lElbow],
    leftForeArm: [bones.lElbow, bones.lHand],
    rightArm: [bones.rShRoll, bones.rElbow],
    rightForeArm: [bones.rElbow, bones.rHand],
    leftUpLeg: [bones.lHipRoll, bones.lKnee],
    leftLeg: [bones.lKnee, bones.lAnkleRoll],
    leftFoot: [bones.lAnkleRoll, bones.lToe],
    rightUpLeg: [bones.rHipRoll, bones.rKnee],
    rightLeg: [bones.rKnee, bones.rAnkleRoll],
    rightFoot: [bones.rAnkleRoll, bones.rToe],
  };
  const hinges = {
    leftForeArm: bones.lElbow,
    rightForeArm: bones.rElbow,
    leftLeg: bones.lKnee,
    rightLeg: bones.rKnee,
  };
  return { nodes, rest, segments, hinges };
}

function pivot(parent, axis) {
  const node = new THREE.Group();
  node.userData.axis = axis;
  parent.add(node);
  return node;
}

function rod(length, radius, material, dir) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 0.9, length, 12),
    material
  );
  if (dir === '-z') {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.z = -length / 2;
  } else if (dir === '+x') {
    mesh.rotation.z = -Math.PI / 2;
    mesh.position.x = length / 2;
  } else {
    mesh.rotation.x = Math.PI / 2;
    mesh.position.z = length / 2;
  }
  return mesh;
}

function ball(parent, radius, material) {
  parent.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), material));
}

function limb(side, bones, material, sole) {
  const sign = side === 'left' ? 1 : -1;
  const prefix = side === 'left' ? 'l' : 'r';
  const hip = new THREE.Group();
  hip.position.set(0, sign * 0.08, 0);
  const hipPitch = pivot(hip, 'y');
  const hipRoll = pivot(hipPitch, 'x');
  const hipYaw = pivot(hipRoll, 'z');
  hipYaw.add(rod(0.24, 0.045, material, '-z'));
  const knee = pivot(hipYaw, 'y');
  knee.position.z = -0.24;
  ball(knee, 0.05, material);
  knee.add(rod(0.24, 0.038, material, '-z'));
  const anklePitch = pivot(knee, 'y');
  anklePitch.position.z = -0.24;
  const ankleRoll = pivot(anklePitch, 'x');
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.04), sole);
  foot.position.set(0.04, 0, -0.02);
  ankleRoll.add(foot);
  bones[prefix + 'Toe'] = foot;
  bones[prefix + 'HipPitch'] = hipPitch;
  bones[prefix + 'HipRoll'] = hipRoll;
  bones[prefix + 'HipYaw'] = hipYaw;
  bones[prefix + 'Knee'] = knee;
  bones[prefix + 'AnklePitch'] = anklePitch;
  bones[prefix + 'AnkleRoll'] = ankleRoll;
  return hip;
}

function arm(side, bones, skinMat) {
  const sign = side === 'left' ? 1 : -1;
  const prefix = side === 'left' ? 'l' : 'r';
  const shoulder = new THREE.Group();
  shoulder.position.set(0, sign * 0.18, 0.30);
  const pitch = pivot(shoulder, 'y');
  const roll = pivot(pitch, 'x');
  const yaw = pivot(roll, 'z');
  ball(yaw, 0.048, skinMat);
  yaw.add(rod(0.18, 0.034, skinMat, '-z'));
  const elbow = pivot(yaw, 'y');
  elbow.position.z = -0.18;
  ball(elbow, 0.04, skinMat);
  elbow.add(rod(0.16, 0.028, skinMat, '+x'));
  const hand = new THREE.Group();
  hand.position.x = 0.16;
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.015), skinMat);
  hand.add(palm);
  for (let i = -1; i <= 1; i++) {
    const finger = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.012), skinMat);
    finger.position.set(0.032, i * 0.016, 0);
    hand.add(finger);
  }
  elbow.add(hand);
  bones[prefix + 'Hand'] = hand;
  bones[prefix + 'ShPitch'] = pitch;
  bones[prefix + 'ShRoll'] = roll;
  bones[prefix + 'ShYaw'] = yaw;
  bones[prefix + 'Elbow'] = elbow;
  return shoulder;
}

function buildFigure(mat) {
  const bones = {};
  const root = new THREE.Group();
  root.position.z = HIP_Z;
  root.add(rod(0.1, 0.07, mat.pants, '+z'));
  root.add(limb('left', bones, mat.pants, mat.sole));
  root.add(limb('right', bones, mat.pants, mat.sole));
  const waistRoll = pivot(root, 'x');
  waistRoll.position.z = 0.08;
  const waistYaw = pivot(waistRoll, 'z');
  waistYaw.add(rod(0.28, 0.09, mat.shirt, '+z'));
  bones.waistRoll = waistRoll;
  bones.waistYaw = waistYaw;
  const head = new THREE.Group();
  head.position.z = 0.40;
  head.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 16), mat.skin));
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.092, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    mat.hair
  );
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.012;
  head.add(cap);
  const eye = new THREE.MeshLambertMaterial({ color: 0x1c1e22 });
  for (const y of [0.03, -0.03]) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), eye);
    mesh.position.set(0.078, y, 0.02);
    head.add(mesh);
  }
  waistYaw.add(head);
  waistYaw.add(arm('left', bones, mat.skin));
  waistYaw.add(arm('right', bones, mat.skin));
  return { root, bones };
}

function buildBar() {
  const bar = document.createElement('div');
  bar.className = 'skinbar';
  bar.innerHTML = [
    '<select data-skin-pick aria-label="机器人皮肤">',
    '<option value="builtin:q1">原模型</option>',
    '<option value="builtin:figure">示意人形</option>',
    '</select>',
    '<label class="skinbar__file">导入<input data-skin-file type="file" accept=".glb,.gltf,.fbx" hidden></label>',
    '<button type="button" data-skin-delete hidden>删除</button>',
    '<span class="skinbar__note" data-skin-note hidden></span>',
  ].join('');
  document.body.appendChild(bar);
  return bar;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('intellibot-skins', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('files', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbList() {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const request = db.transaction('files').objectStore('files').getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  }));
}

function dbGet(id) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const request = db.transaction('files').objectStore('files').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

function dbPut(row) {
  const id = 'file:' + crypto.randomUUID();
  return openDb().then((db) => new Promise((resolve, reject) => {
    const request = db.transaction('files', 'readwrite').objectStore('files').put({ ...row, id });
    request.onsuccess = () => resolve(id);
    request.onerror = () => reject(request.error);
  }));
}

function dbDelete(id) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const request = db.transaction('files', 'readwrite').objectStore('files').delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  }));
}
