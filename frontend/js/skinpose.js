/* 把导入的人形骨架对齐到场景，再用 Q1 示意骨架驱动它。
   肩的 pitch、roll 只带动大臂的指向，肩的 yaw 和肘的 pitch 带动小臂。
   髋的 pitch、roll 只带动大腿，髋的 yaw 和膝带动小腿。
   没有对应关节的骨头保持导入时的姿势。 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

const ROLES = {
  hips: 'hips',
  spine: 'spine',
  spine1: 'spine1',
  spine2: 'spine2',
  leftArm: 'leftarm',
  leftForeArm: 'leftforearm',
  rightArm: 'rightarm',
  rightForeArm: 'rightforearm',
  leftUpLeg: 'leftupleg',
  leftLeg: 'leftleg',
  leftFoot: 'leftfoot',
  rightUpLeg: 'rightupleg',
  rightLeg: 'rightleg',
  rightFoot: 'rightfoot',
};

/* 父级在前，这样子骨头读到的是已经摆好的父级。 */
const DRIVE_ORDER = [
  'hips', 'chest',
  'leftUpLeg', 'leftLeg', 'leftFoot',
  'rightUpLeg', 'rightLeg', 'rightFoot',
  'leftArm', 'leftForeArm',
  'rightArm', 'rightForeArm',
];

const _now = new THREE.Quaternion();
const _restInv = new THREE.Quaternion();
const _delta = new THREE.Quaternion();
const _target = new THREE.Quaternion();
const _parent = new THREE.Quaternion();
const _box = new THREE.Box3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();
const _left = new THREE.Vector3();
const _right = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _restDir = new THREE.Vector3();
const _localDesired = new THREE.Vector3();
const _swing = new THREE.Quaternion();
const _parentQ = new THREE.Quaternion();
const _hinge = new THREE.Vector3();
const _want = new THREE.Vector3();
const _cross = new THREE.Vector3();
const _worldQ = new THREE.Quaternion();

/* 大臂、大腿、脚只对齐长轴，扭转留在导入姿势上。
   小臂、小腿还要跟上肘轴、膝轴，肩 yaw 和髋 yaw 才会作用到下一段。 */
const AIMED = new Set([
  'leftArm', 'leftForeArm', 'rightArm', 'rightForeArm',
  'leftUpLeg', 'leftLeg', 'leftFoot',
  'rightUpLeg', 'rightLeg', 'rightFoot',
]);

const HINGED = {
  leftForeArm: new THREE.Vector3(0, 0, 1),
  rightForeArm: new THREE.Vector3(0, 0, -1),
  leftLeg: new THREE.Vector3(0, 1, 0),
  rightLeg: new THREE.Vector3(0, 1, 0),
};

export function boneKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/^mixamorig/, '')
    .replace(/^armature[|_:]?/, '')
    .replace(/[^a-z0-9]/g, '');
}

export function findBones(root) {
  const byRole = {};
  root.traverse((node) => {
    const key = boneKey(node.name);
    for (const [role, token] of Object.entries(ROLES)) {
      if (key === token && !byRole[role]) byRole[role] = node;
    }
  });
  byRole.chest = byRole.spine2 || byRole.spine1 || byRole.spine || null;
  return byRole;
}

export async function loadCharacter(buffer, filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (ext === 'fbx') return new FBXLoader().parse(buffer);
  if (ext === 'glb' || ext === 'gltf') {
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    return gltf.scene;
  }
  throw new Error('只支持 .fbx、.glb、.gltf');
}

/* Y 轴朝上的模型转成场景的 Z 轴朝上。身高收到 1，和原模型一样；脚落在地面，正面朝 +X（镜头）。 */
export function mountImported(root) {
  const yaw = new THREE.Group();
  const tilt = new THREE.Group();
  yaw.name = 'imported-skin';
  yaw.add(tilt);
  tilt.add(root);

  root.updateMatrixWorld(true);
  _box.setFromObject(root);
  _box.getSize(_size);
  if (_size.y > _size.z * 1.25) tilt.rotation.x = Math.PI / 2;

  tilt.updateMatrixWorld(true);
  _box.setFromObject(tilt);
  _box.getSize(_size);
  const height = _size.z || 1;
  tilt.scale.setScalar(1 / height);

  const bones = findBones(yaw);
  if (bones.leftArm && bones.rightArm) {
    let best = -Infinity;
    let bestYaw = 0;
    for (const deg of [0, 90, 180, 270]) {
      yaw.rotation.z = deg * Math.PI / 180;
      yaw.updateMatrixWorld(true);
      bones.leftArm.getWorldPosition(_left);
      bones.rightArm.getWorldPosition(_right);
      const score = _left.y - _right.y;
      if (score > best) {
        best = score;
        bestYaw = yaw.rotation.z;
      }
    }
    yaw.rotation.z = bestYaw;
  }

  yaw.updateMatrixWorld(true);
  _box.setFromObject(yaw);
  _box.getCenter(_center);
  yaw.position.set(-_center.x, -_center.y, -_box.min.z);
  yaw.userData.place = yaw.position.clone();
  return { object: yaw, bones };
}

function writeWorldQuat(bone, worldQuat) {
  const parent = bone.parent;
  if (parent) {
    parent.updateMatrixWorld(true);
    parent.getWorldQuaternion(_parent);
    bone.quaternion.copy(_parent.invert()).multiply(worldQuat);
  } else {
    bone.quaternion.copy(worldQuat);
  }
  bone.updateMatrixWorld(true);
}

function limbAxis(bone) {
  let best = null;
  let bestLen = 0;
  for (const child of bone.children) {
    const len = child.position.length();
    if (len > bestLen) {
      bestLen = len;
      best = child.position;
    }
  }
  if (!best || bestLen < 1e-5) return new THREE.Vector3(0, 1, 0);
  return best.clone().multiplyScalar(1 / bestLen);
}

function aimPreserveTwist(bone, localAxis, restQuat, worldDir) {
  if (worldDir.lengthSq() < 1e-8) return;
  worldDir.normalize();
  bone.parent.updateMatrixWorld(true);
  bone.parent.getWorldQuaternion(_parentQ);
  _localDesired.copy(worldDir).applyQuaternion(_parentQ.invert());
  if (_localDesired.lengthSq() < 1e-8) return;
  _localDesired.normalize();
  _restDir.copy(localAxis).applyQuaternion(restQuat).normalize();
  _swing.setFromUnitVectors(_restDir, _localDesired);
  bone.quaternion.copy(_swing).multiply(restQuat);
  bone.updateMatrixWorld(true);
}

function chooseHingeAxis(bone, lengthLocal, worldTarget) {
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  let best = new THREE.Vector3(1, 0, 0);
  let bestDot = -Infinity;
  for (const axis of [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ]) {
    _hinge.set(axis[0], axis[1], axis[2]);
    if (Math.abs(_hinge.dot(lengthLocal)) > 0.35) continue;
    _hinge.applyQuaternion(world);
    const score = _hinge.dot(worldTarget);
    if (score > bestDot) {
      bestDot = score;
      best = new THREE.Vector3(axis[0], axis[1], axis[2]);
    }
  }
  return best;
}

/* 长轴已经对准之后，绕长轴转到和示意骨架的肘轴或膝轴一致。 */
function twistToHinge(bone, lengthLocal, hingeLocal, hingeWorld) {
  bone.getWorldQuaternion(_worldQ);
  _dir.copy(lengthLocal).applyQuaternion(_worldQ);
  if (_dir.lengthSq() < 1e-8) return;
  _dir.normalize();
  _hinge.copy(hingeLocal).applyQuaternion(_worldQ).projectOnPlane(_dir);
  _want.copy(hingeWorld).projectOnPlane(_dir);
  if (_hinge.lengthSq() < 1e-6 || _want.lengthSq() < 1e-6) return;
  _hinge.normalize();
  _want.normalize();
  _cross.crossVectors(_hinge, _want);
  const angle = Math.atan2(_cross.dot(_dir), THREE.MathUtils.clamp(_hinge.dot(_want), -1, 1));
  bone.quaternion.multiply(_swing.setFromAxisAngle(lengthLocal, angle));
  bone.updateMatrixWorld(true);
}

/* proc.rest / proc.nodes 在示意骨架的平举姿势下采一次。
   proc.segments 是四肢每一段的两端，用来取世界空间里的指向。 */
export function bindRetarget(mounted, proc) {
  const { object, bones } = mounted;
  object.updateMatrixWorld(true);
  const links = [];
  for (const role of DRIVE_ORDER) {
    const bone = bones[role];
    const src = proc.nodes[role];
    const restSrc = proc.rest.get(role);
    if (!bone || !src || !restSrc) continue;
    const link = {
      role,
      bone,
      src,
      restSrc,
      restBone: bone.getWorldQuaternion(new THREE.Quaternion()),
      restQuat: bone.quaternion.clone(),
    };
    if (AIMED.has(role) && proc.segments && proc.segments[role]) {
      link.localAxis = limbAxis(bone);
      link.segment = proc.segments[role];
      const hingeRef = HINGED[role];
      if (hingeRef && proc.hinges && proc.hinges[role]) {
        link.hingeLocal = chooseHingeAxis(bone, link.localAxis, hingeRef);
        link.hingeNode = proc.hinges[role];
      }
    }
    links.push(link);
  }
  return {
    object,
    links,
    apply() {
      object.updateWorldMatrix(true, false);
      for (const link of links) {
        if (link.segment) {
          link.segment[0].getWorldPosition(_from);
          link.segment[1].getWorldPosition(_to);
          _dir.subVectors(_to, _from);
          aimPreserveTwist(link.bone, link.localAxis, link.restQuat, _dir);
          if (link.hingeLocal && link.hingeNode) {
            link.hingeNode.updateWorldMatrix(true, false);
            _want.set(0, 1, 0).applyQuaternion(link.hingeNode.getWorldQuaternion(_worldQ));
            twistToHinge(link.bone, link.localAxis, link.hingeLocal, _want);
          }
          continue;
        }
        link.src.updateWorldMatrix(true, false);
        link.src.getWorldQuaternion(_now);
        _restInv.copy(link.restSrc).invert();
        _delta.copy(_now).multiply(_restInv);
        _target.copy(_delta).multiply(link.restBone);
        writeWorldQuat(link.bone, _target);
      }
    },
  };
}
