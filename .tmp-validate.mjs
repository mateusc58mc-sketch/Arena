import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'node:fs';

const PATH = process.argv[2];
const loader = new GLTFLoader();
const buf = fs.readFileSync(PATH);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const gltf = await loader.parseAsync(ab, '');

const bonesByName = new Map();
const bodies = [];
gltf.scene.traverse(function walk(o) {
  if (o.isSkinnedMesh) {
    bodies.push(o);
    for (const b of o.skeleton.bones) {
      if (!bonesByName.has(b.name)) bonesByName.set(b.name, b);
    }
  }
  if (o.isBone && !bonesByName.has(o.name)) bonesByName.set(o.name, o);
});

gltf.scene.updateMatrixWorld(true);
const get = (n) => bonesByName.get(n);
const fmt = (v) => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
console.log('REST (bind) three.js Y-up:');
for (const n of ['mixamorigHips', 'mixamorigNeck', 'mixamorigHead', 'mixamorigLeftFoot', 'mixamorigRightFoot']) {
  const b = get(n);
  console.log(`  ${n}: ${b ? fmt(b.getWorldPosition(new THREE.Vector3())) : 'AUSENTE'}`);
}

if (gltf.animations.length) {
  const mixer = new THREE.AnimationMixer(gltf.scene);
  for (const clip of gltf.animations) {
    for (let i = 0; i <= 4; i++) {
      mixer.stopAllAction();
      const action = mixer.clipAction(clip);
      action.reset().play();
      mixer.setTime((i / 4) * clip.duration * 0.999);
      gltf.scene.updateMatrixWorld(true);
      const hips = get('mixamorigHips');
      const head = get('mixamorigHead');
      const lFoot = get('mixamorigLeftFoot');
      const rFoot = get('mixamorigRightFoot');
      const lf = lFoot.getWorldPosition(new THREE.Vector3());
      const rf = rFoot.getWorldPosition(new THREE.Vector3());
      const feetY = (lf.y + rf.y) / 2;
      const hd = head.getWorldPosition(new THREE.Vector3());
      console.log(`${clip.name} t=${((i / 4) * clip.duration).toFixed(2)} hips=${fmt(hips.getWorldPosition(new THREE.Vector3()))} headY=${hd.y.toFixed(2)} feetY=${feetY.toFixed(2)} footSpread=${Math.hypot(lf.x - rf.x, lf.z - rf.z).toFixed(2)} height=${(hd.y - feetY).toFixed(2)}`);
      mixer.stopAllAction();
    }
  }
}
