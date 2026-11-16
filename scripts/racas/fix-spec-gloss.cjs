/**
 * fix-spec-gloss.cjs — converte GLBs que usam
 * KHR_materials_pbrSpecularGlossiness para o PBR padrão do glTF
 * (pbrMetallicRoughness + baseColorTexture).
 *
 * Motivo: os GLBs do anão/tauren vêm do Sketchfab com a extensão antiga de
 * specular/glossiness. O GLTFLoader atual do three ignora essa extensão e o
 * modelo aparece branco (sem a textura difusa). A conversão só troca os campos
 * do material — geometria, imagens e o binário ficam intactos.
 *
 * Uso:
 *   node scripts/racas/fix-spec-gloss.cjs public/racas/anao/brann.glb ...
 */

const fs = require('fs');

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;

function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`${file}: não é GLB`);
  const version = buf.readUInt32LE(4);
  const chunks = [];
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    chunks.push({ type, data: Buffer.from(buf.subarray(offset + 8, offset + 8 + length)) });
    offset += 8 + length;
  }
  return { version, chunks };
}

function writeGlb(file, version, chunks) {
  const parts = chunks.map((chunk) => {
    let data = chunk.data;
    const remainder = data.length % 4;
    if (remainder !== 0) {
      const pad = Buffer.alloc(4 - remainder, chunk.type === CHUNK_JSON ? 0x20 : 0);
      data = Buffer.concat([data, pad]);
    }
    const header = Buffer.alloc(8);
    header.writeUInt32LE(data.length, 0);
    header.writeUInt32LE(chunk.type, 4);
    return Buffer.concat([header, data]);
  });

  const body = Buffer.concat(parts);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(GLB_MAGIC, 0);
  header.writeUInt32LE(version, 4);
  header.writeUInt32LE(12 + body.length, 8);
  fs.writeFileSync(file, Buffer.concat([header, body]));
}

function convert(json) {
  let changed = 0;

  for (const material of json.materials || []) {
    const extension = material.extensions && material.extensions.KHR_materials_pbrSpecularGlossiness;
    if (!extension) continue;

    const glossiness = typeof extension.glossinessFactor === 'number' ? extension.glossinessFactor : 1;
    const pbr = {
      baseColorFactor: extension.diffuseFactor || [1, 1, 1, 1],
      metallicFactor: 0,
      roughnessFactor: Math.min(1, Math.max(0, 1 - glossiness)),
    };
    if (extension.diffuseTexture) pbr.baseColorTexture = extension.diffuseTexture;

    material.pbrMetallicRoughness = { ...(material.pbrMetallicRoughness || {}), ...pbr };

    delete material.extensions.KHR_materials_pbrSpecularGlossiness;
    if (Object.keys(material.extensions).length === 0) delete material.extensions;

    changed += 1;
  }

  for (const key of ['extensionsUsed', 'extensionsRequired']) {
    if (!Array.isArray(json[key])) continue;
    json[key] = json[key].filter((name) => name !== 'KHR_materials_pbrSpecularGlossiness');
    if (json[key].length === 0) delete json[key];
  }

  return changed;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('informe os arquivos .glb');
  process.exit(1);
}

for (const file of files) {
  const { version, chunks } = readGlb(file);
  const jsonChunk = chunks.find((chunk) => chunk.type === CHUNK_JSON);
  if (!jsonChunk) throw new Error(`${file}: sem chunk JSON`);

  const json = JSON.parse(jsonChunk.data.toString('utf8'));
  const changed = convert(json);
  if (changed === 0) {
    console.log(`${file}: nada para converter`);
    continue;
  }

  jsonChunk.data = Buffer.from(JSON.stringify(json), 'utf8');
  writeGlb(file, version, chunks);
  console.log(`${file}: ${changed} material(is) convertido(s)`);
}
