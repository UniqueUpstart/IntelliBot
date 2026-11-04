import * as THREE from 'three';

// Steve-inspired, locally drawn pixel art. Shares the existing motion pivots.
export function buildPixelBuddy(root, bones) {
  const pieces = [];
  const skin = new THREE.MeshLambertMaterial({color: 0xb8876b});
  const shirt = new THREE.MeshLambertMaterial({color: 0x21adad});
  const pants = new THREE.MeshLambertMaterial({color: 0x4845a3});
  const boots = new THREE.MeshLambertMaterial({color: 0x55515b});
  const hair = new THREE.MeshLambertMaterial({color: 0x38271d});
  function box(parent, size, position, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.userData.pixelBuddy = true;
    mesh.visible = false;
    parent.add(mesh);
    pieces.push(mesh);
    return mesh;
  }
  box(root, [.15, .22, .105], [0, 0, .025], pants);
  box(bones.waistYaw, [.15, .22, .09], [0, 0, .035], shirt);
  box(bones.waistYaw, [.16, .25, .25], [0, 0, .17], shirt);
  box(bones.waistYaw, [.10, .105, .045], [0, 0, .315], skin);
  box(bones.waistYaw, [.245, .245, .245], [0, 0, .435], skin);
  box(bones.waistYaw, [.248, .248, .055], [0, 0, .534], hair);
  box(bones.waistYaw, [.04, .248, .18], [-.107, 0, .44], hair);
  for (const side of ['l', 'r']) {
    box(bones[side + 'ShYaw'], [.09, .10, .082], [0, 0, -.037], shirt);
    box(bones[side + 'ShYaw'], [.09, .10, .105], [0, 0, -.128], skin);
    box(bones[side + 'Elbow'], [.09, .10, .09], [.005, 0, 0], skin);
    box(bones[side + 'Elbow'], [.15, .10, .09], [.085, 0, 0], skin);
    box(bones[side + 'Hand'], [.05, .10, .09], [.01, 0, 0], skin);
    box(bones[side + 'HipYaw'], [.105, .108, .24], [0, 0, -.12], pants);
    box(bones[side + 'Knee'], [.105, .108, .235], [0, 0, -.1175], pants);
    box(bones[side + 'AnkleRoll'], [.15, .108, .062], [.025, 0, -.015], boots);
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const ctx = canvas.getContext('2d');
  const pixels = [
    'hhhhhhhh', 'hhhhhhhh', 'hssssssh', 'ssssssss',
    'swwsswws', 'sssnnsss', 'ssbddbss', 'sssbbsss',
  ];
  const colors = {h:'#38271d',s:'#b8876b',w:'#ded9cd',n:'#99634d',b:'#55372a',d:'#8b4f3a'};
  pixels.forEach((row,y) => [...row].forEach((c,x) => {
    ctx.fillStyle = colors[c] || colors.s; ctx.fillRect(x,y,1,1);
  }));
  // Blue-purple eyes and a square nose/beard, drawn directly without downloads.
  ctx.fillStyle='#575098'; ctx.fillRect(2,4,1,1);ctx.fillRect(5,4,1,1);
  ctx.fillStyle='#9d6954';ctx.fillRect(3,5,2,1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(.245,.245),
    new THREE.MeshLambertMaterial({map:texture}));
  face.position.set(.123,0,.435);
  face.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0)));
  face.userData.pixelBuddy = true;face.visible = false;
  bones.waistYaw.add(face);pieces.push(face);
  return {
    setVisible(on) { pieces.forEach(mesh => {mesh.visible=on;}); },
    update() {},
  };
}
