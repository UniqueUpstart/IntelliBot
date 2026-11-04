import * as THREE from 'three';

// Locally generated wood and brass pieces, driven by the shared motion rig.
export function buildClockwork(root, bones) {
  const pieces = [];
  const grain = document.createElement('canvas');
  grain.width = grain.height = 64;
  const ctx = grain.getContext('2d');
  ctx.fillStyle = '#d5b183'; ctx.fillRect(0,0,64,64);
  for (let i=0;i<22;i++) {
    ctx.strokeStyle = i%3 ? '#cba579' : '#dfbd93';
    ctx.beginPath();
    for(let y=0;y<=64;y+=4) {
      const x=i*3+Math.sin(y*.09+i)*1.2;
      if(y===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.stroke();
  }
  const texture=new THREE.CanvasTexture(grain);
  texture.colorSpace=THREE.SRGBColorSpace;
  const wood=new THREE.MeshStandardMaterial({map:texture,roughness:.64,metalness:0});
  const darkWood=new THREE.MeshLambertMaterial({color:0xb18a5e});
  const brass=new THREE.MeshStandardMaterial({color:0xcda55b,metalness:.45,roughness:.42});
  const ivory=new THREE.MeshLambertMaterial({color:0xf3e3bf});
  function add(parent,geometry,material,position) {
    const mesh=new THREE.Mesh(geometry,material);
    mesh.position.set(...position);mesh.userData.clockwork=true;mesh.visible=false;
    parent.add(mesh);pieces.push(mesh);return mesh;
  }
  const box=(p,s,v,m)=>add(p,new THREE.BoxGeometry(...s),m,v);
  function disk(p,r,depth,v,m) {
    const mesh=add(p,new THREE.CylinderGeometry(r,r,depth,24),m,v);
    mesh.rotation.z=Math.PI/2;return mesh;
  }
  function oval(parent, size, position, material=wood) {
    const mesh=add(parent,new THREE.SphereGeometry(1,32,24),material,position);
    mesh.scale.set(...size);return mesh;
  }
  function cylinder(parent, top, bottom, length, position, axis='z', material=wood) {
    const mesh=add(parent,new THREE.CylinderGeometry(top,bottom,length,32),material,position);
    if(axis==='z')mesh.rotation.x=Math.PI/2;
    else if(axis==='x')mesh.rotation.z=Math.PI/2;
    return mesh;
  }
  function joint(parent,r=.037) {
    oval(parent,[r,r,r],[0,0,0]);
    disk(parent,r*.30,r*2+.004,[0,0,0],brass);
  }
  // Rounded pelvis, short waist and tapered wooden chest.
  cylinder(root,.092,.105,.105,[0,0,.018]);
  oval(bones.waistYaw,[.066,.078,.047],[0,0,.043]);
  cylinder(bones.waistYaw,.128,.100,.218,[0,0,.176]);
  cylinder(bones.waistYaw,.035,.038,.052,[0,0,.310]);
  oval(bones.waistYaw,[.094,.103,.123],[0,0,.439]);
  // Front-mounted clock sits just beyond the round torso surface.
  disk(bones.waistYaw,.057,.012,[.116,0,.18],brass);
  disk(bones.waistYaw,.045,.014,[.125,0,.18],darkWood);
  // Visible clock hands on the chest medallion.
  box(bones.waistYaw,[.014,.009,.040],[.136,0,.197],ivory);
  box(bones.waistYaw,[.014,.034,.009],[.136,.013,.18],ivory);
  for(let i=0;i<4;i++) {
    const a=i*Math.PI/2;
    box(bones.waistYaw,[.014,.007,.007],[.136,Math.cos(a)*.038,.18+Math.sin(a)*.038],brass);
  }
  for(const side of ['l','r']) {
    joint(bones[side+'ShYaw'],.047);
    cylinder(bones[side+'ShYaw'],.033,.039,.133,[0,0,-.111]);
    joint(bones[side+'Elbow'],.031);
    cylinder(bones[side+'Elbow'],.032,.035,.109,[.090,0,0],'x');
    oval(bones[side+'Hand'],[.043,.033,.034],[.023,0,0]);
    joint(bones[side+'HipYaw'],.041);
    cylinder(bones[side+'HipYaw'],.046,.036,.164,[0,0,-.126]);
    joint(bones[side+'Knee'],.034);
    cylinder(bones[side+'Knee'],.036,.045,.169,[0,0,-.125]);
    oval(bones[side+'AnkleRoll'],[.081,.048,.031],[.027,0,-.019]);
    cylinder(bones[side+'AnkleRoll'],.023,.023,.012,[0,0,.008],'z',brass);
  }
  // Winding key sits behind the torso, protruding sideways for a clear silhouette.
  disk(bones.waistYaw,.026,.12,[-.13,0,.20],brass);
  const key=new THREE.Group();key.position.set(-.20,0,.20);bones.waistYaw.add(key);
  box(key,[.026,.23,.025],[0,0,0],brass);
  for(const sign of [-1,1]) {
    const ring=add(key,new THREE.TorusGeometry(.046,.012,8,24),brass,[0,sign*.125,0]);
    ring.rotation.y=Math.PI/2;
  }
  const still=window.matchMedia('(prefers-reduced-motion: reduce)');
  return {
    setVisible(on) { pieces.forEach(mesh=>{mesh.visible=on;}); },
    update() {key.rotation.x=still.matches ? 0 : performance.now()*.00030;},
  };
}
