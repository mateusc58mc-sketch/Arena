import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'node:fs';

const PATH = process.argv[2] ?? String.raw`C:\dev\aetheria-idle\public\racas\human\human_male_rigged.glb`;
const loader = new GLTFLoader();
const buf = fs.readFileSync(PATH);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const gltf = await loader.parseAsync(ab, '');

gltf.scene.traverse(function walk(o) {
  if (o.isSkinnedMesh || o.isBone || o.name === 'Armature' || /armature/i.test(o.name)) {
    const chain = [];
    let p = o;
    while (p) {
      const t = `${p.name || p.type}[p=(${p.position.toArray().map((n) => n.toFixed(2)).join(',')}), r=(${new THREE.Euler().setFromQuaternion(p.quaternion).toArray().slice(0, 3).map((n) => (n * 180 / Math.PI).toFixed(0)).join(',')}), s=(${p.scale.toArray().map((n) => n.toFixed(3)).join(',')})]`;
      chain.push(t);
      p = p.parent;
    }
    console.log(chain.reverse().join(' ->'));
  }
});
