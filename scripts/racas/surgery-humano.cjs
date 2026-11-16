/**
 * Cirurgia no glTF do humano (Lost Warrior):
 *  - Descarta malhas absurdas (BeardLowPoly = 4.2M verts — cache de pêlo/partículas).
 *  - Reescreve buffer.bin contendo APENAS os acessores usados pelas malhas
 *    mantidas + skins/animações/materiais.
 *  - Cada acessor sobrevivente recebe um bufferView novo e enxuto.
 *  - Saída: public/racas/humano/humano.gltf + buffer.bin (+ imagens externas).
 */
const fs = require('fs');
const path = require('path');
const DIR = 'C:/dev/aetheria-idle/public/racas/humano/humano_out';
const OUT = 'C:/dev/aetheria-idle/public/racas/humano';

const json = JSON.parse(fs.readFileSync(path.join(DIR, 'humano.gltf'), 'utf8'));
const bin = fs.readFileSync(path.join(DIR, 'buffer.bin'));

const SIZES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NUMC = {
  SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16,
};

function accessorLen(acc, buffView) {
  const stride = buffView.byteStride || (acc.componentType && NUMC[acc.type] ? NUMC[acc.type] * SIZES[acc.componentType] : NUMC[acc.type] * SIZES[acc.componentType]);
  return (acc.count - 1) * stride + NUMC[acc.type] * SIZES[acc.componentType];
}

// 1) decidir quais meshes sobrevivem (threshold em vértices)
const keepMeshIdx = new Set();
const dropped = [];
(json.meshes || []).forEach((m, mi) => {
  let verts = 0;
  for (const p of m.primitives) {
    const posIdx = p.attributes.POSITION;
    if (posIdx !== undefined && posIdx !== null) verts += json.accessors[posIdx].count;
  }
  if (verts <= 400000) keepMeshIdx.add(mi);
  else dropped.push(`${m.name} (${verts.toLocaleString('pt-BR')} verts)`);
  if (m.name && m.name.toLowerCase().startsWith('beard')) dropped.push(`also dropping by name: ${m.name}`);
});
// beard sempre fora (por nome)
(json.meshes || []).forEach((m, mi) => {
  if (m.name && m.name.toLowerCase().startsWith('beard')) keepMeshIdx.delete(mi);
});
console.log('malhas descartadas:', dropped.join(' ;; ') || '(nenhuma)');

// 2) remover nós de cena que apontam para meshes descartadas
const meshMap = new Map(); // old -> new
let newMeshIdx = 0;
(json.meshes || []).forEach((_, oldIdx) => {
  if (keepMeshIdx.has(oldIdx)) meshMap.set(oldIdx, newMeshIdx++);
});
const keptMeshes = [];
(json.meshes || []).forEach((m, oldIdx) => {
  if (keepMeshIdx.has(oldIdx)) keptMeshes.push(m);
});

// 2) NÃO removemos nós (esqueleto/animação dependem deles): apenas anulamos
//    o campo mesh dos nós que apontavam para malhas descartadas.
const remap = (nodeIdx) => {
  const n = json.nodes[nodeIdx];
  if (!n) return;
  if (typeof n.mesh === 'number') {
    if (meshMap.has(n.mesh)) n.mesh = meshMap.get(n.mesh);
    else delete n.mesh;
  }
  (n.children || []).forEach(remap);
};
(json.scenes[0].nodes || []).forEach(remap);

// 3) acessores usados: das malhas mantidas + skins + animações + câmeras/luzes
const usedAcc = new Set();
const addAcc = (i) => { if (i != null) usedAcc.add(i); };
keptMeshes.forEach((m) => m.primitives.forEach((p) => {
  Object.values(p.attributes || {}).forEach(addAcc);
  addAcc(p.indices);
}));
(json.skins || []).forEach((s) => addAcc(s.inverseBindMatrices));
(json.animations || []).forEach((a) => a.samplers.forEach((s) => {
  // samplers apontam para accessors via output/input? Em glTF, sampler.input/output são índices de accessor
  addAcc(s.input);
  addAcc(s.output);
}));

// 4) montar novo buffer: cada acessor usado ganha view exclusiva
const compSize = (t) => SIZES[t];
const chunks = [];
const viewMap = new Map(); // oldViewIdx -> list of {accessors}
let offset = 0;
const newViews = [];
const accByteLen = (a) => {
  const view = json.bufferViews[a.bufferView];
  const numc = NUMC[a.type];
  const compBytes = compSize(a.componentType);
  const stride = view && view.byteStride ? view.byteStride : numc * compBytes;
  return (a.count - 1) * stride + numc * compBytes;
};
const sortedAcc = [...usedAcc].sort((a, b) => a - b);
for (const accIdx of sortedAcc) {
  const acc = json.accessors[accIdx];
  const viewIdx = acc.bufferView;
  const srcView = json.bufferViews[viewIdx];
  const len = accByteLen(acc);
  const srcStart = (srcView.byteOffset || 0) + (acc.byteOffset || 0);
  const data = bin.slice(srcStart, srcStart + len);
  if (data.length < len) throw new Error(`buffer curto no accessor ${accIdx}: precisa ${len}, tem ${data.length}`);
  chunks.push(data);
  const newViewIdx = newViews.length;
  newViews.push({ buffer: 0, byteOffset: offset, byteLength: len });
  acc.bufferView = newViewIdx;
  delete acc.byteOffset;
  offset += len;
}
// concat chunks com alinhamento 4 bytes
let binOut = Buffer.alloc(offset);
let cur = 0;
for (const c of chunks) {
  c.copy(binOut, cur);
  cur += c.length;
}
json.bufferViews = newViews;
json.buffers = [{ uri: 'buffer.bin', byteLength: binOut.length }];

// 5) substitui mesh list
json.meshes = keptMeshes;

// 6) grava
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'humano.gltf'), JSON.stringify(json, null, 1));
fs.writeFileSync(path.join(OUT, 'buffer.bin'), binOut);

// mover imagens junto
const imagesHere = (json.images || []).map((i) => i.uri).filter(Boolean);
for (const img of imagesHere) {
  const src = path.join(DIR, img);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(OUT, img));
}
console.log('novo buffer.bin:', (binOut.length / 1024 / 1024).toFixed(1), 'MB');
console.log('imagens copiadas:', imagesHere.join(', '));
console.log('malhas mantidas:', keptMeshes.length, '| nós:', json.nodes.length);
