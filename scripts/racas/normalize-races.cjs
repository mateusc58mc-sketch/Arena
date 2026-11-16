/**
 * PADRONIZAÇÃO DE RAÇAS 3D (etapa dev-only, roda no PC do dev):
 *  1. Copia modelos prontos (GLB) para public/racas/<raça>/
 *  2. Converte as texturas TGA 4K do orc (49–65 MB cada) em PNG/JPG 1K.
 *  3. Redimensiona as texturas do humano (pós-cirurgia do buffer).
 *  4. Gera public/racas/race-assets.json (manifesto consumido pela tela
 *     de criação LOCAL — include LOCAL_TEST_ONLY).
 * Altura padrão: 1.80 m, pivô nos pés — normalização aplicada em runtime
 * pelo componente (mesma função para todas as raças).
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { execFileSync } = require('child_process');

const ROOT = 'C:/Users/Dell/Downloads/racas';
const OUT = 'C:/dev/aetheria-idle/public/racas';
const fbx2gltfBin = (() => {
  // o humano já está convertido/cirurgiado — este conversor não é usado
  // na execução atual; mantemo fallback simples em caso de re-conversão.
  const binDir = path.dirname(require.resolve('fbx2gltf')) + '/bin/Windows_NT';
  try {
    for (const f of fs.readdirSync(binDir)) if (f.endsWith('.exe')) return path.join(binDir, f);
  } catch { /* ausente */ }
  return null;
})();

/** Decodificador TGA mínimo (type 2 uncompressed / type 10 RLE, 24/32bpp). */
function decodeTga(buf) {
  const idLength = buf[0];
  const imageType = buf[2];          // 2 = uncompressed RGB, 10 = RLE RGB
  const width = buf.readUInt16LE(12);
  const height = buf.readUInt16LE(14);
  const pixelDepth = buf[16];        // 24 = BGR, 32 = BGRA
  const desc = buf[17];
  const topOrigin = (desc & 0x20) !== 0;
  const bytesPP = pixelDepth / 8;
  let dataStart = 18 + idLength;
  if (buf[344 - 18] === undefined) { /* noop, guard not needed */ }
  // color map (se existir) — ignora, não usamos paleta (type 2/10 sem pal)
  const pixels = Buffer.alloc(width * height * bytesPP);
  if (imageType === 2) {
    buf.copy(pixels, 0, dataStart, dataStart + pixels.length);
  } else if (imageType === 10) {
    let src = dataStart, dst = 0;
    while (dst < pixels.length) {
      const packet = buf[src++];
      const count = (packet & 0x7f) + 1;
      if (packet & 0x80) {
        for (let i = 0; i < count; i++) { buf.copy(pixels, dst, src, src + bytesPP); dst += bytesPP; }
        src += bytesPP;
      } else {
        buf.copy(pixels, dst, src, src + count * bytesPP);
        dst += count * bytesPP; src += count * bytesPP;
      }
    }
  } else {
    throw new Error('TGA type ' + imageType + ' não suportado');
  }
  // BGR(A) -> RGB(A): inverte canal vermelho/azul de cada pixel
  for (let i = 0; i < pixels.length; i += bytesPP) {
    const b = pixels[i];
    pixels[i] = pixels[i + 2];
    pixels[i + 2] = b;
  }
  if (bytesPP === 3) pixels.buffer; // three/sharp lida sem alpha
  return { data: pixels, width, height, channels: bytesPP };
}

async function convertTga(tgaPath, outPath, maxSide = 1024, format = 'png') {
  const buf = fs.readFileSync(tgaPath);
  const img = decodeTga(buf);
  let pipe = sharp(img.data, { raw: { width: img.width, height: img.height, channels: img.channels === 4 ? 4 : 3 } });
  const meta = await pipe.metadata();
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  if (scale < 1) pipe = pipe.resize(Math.round(img.width * scale), Math.round(img.height * scale));
  if (format === 'jpg') await pipe.jpeg({ quality: 82 }).toFile(outPath);
  else await pipe.png({ compressionLevel: 9 }).toFile(outPath);
}

async function resizeImage(src, outFinal, maxSide = 2048, keepFormat = null) {
  const img = sharp(src);
  const meta = await img.metadata();
  let pipe = img;
  if (Math.max(meta.width, meta.height) > maxSide) {
    pipe = pipe.resize({ width: Math.min(meta.width, maxSide), height: Math.min(meta.height, maxSide), fit: 'inside' });
  }
  const isPng = keepFormat ? keepFormat === 'png' : (path.extname(src).toLowerCase() === '.png');
  if (isPng) await pipe.png({ compressionLevel: 9 }).toFile(outFinal);
  else await pipe.jpeg({ quality: 85 }).toFile(outFinal);
}

const copy = (src, dst) => { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); };

async function main() {
  const manifest = {
    generatedAt: new Date().toISOString(),
    standardHeight: 1.8,
    localTestOnly: true,
    note: 'Manifesto de raças 3D do diretório local C:/Users/Dell/Downloads/racas. EXCLUSIVO dev/local — nunca vão para build de produção.',
    races: {},
  };

  // ------------------------------------------------------ ANÃO (Brann)
  copy(`${ROOT}/anao/brann_bronzebeard.glb`, `${OUT}/anao/brann.glb`);
  manifest.races.anao = {
    status: 'ok',
    animation: 'procedural',
    model: '/racas/anao/brann.glb',
    note: 'GLB Sketchfab sem rig — preview estático + simulação de combate procedural.',
  };

  // ------------------------------------------------------ TAUREN
  copy(`${ROOT}/tauren/tauren__purple_markings.glb`, `${OUT}/tauren/tauren.glb`);
  manifest.races.tauren = {
    status: 'ok',
    animation: 'procedural',
    model: '/racas/tauren/tauren.glb',
    note: '13 peças (corpo/+acessórios) sem rig — preview estático + simulação procedural.',
  };

  // ------------------------------------------------------ HUMANO (Lost Warrior)
  // já convertido por fbx2gltf + cirurgia (BeardLowPoly 4.2M verts fora)
  const humanoDir = `${OUT}/humano`;
  const humanoImgs = [];
  for (const f of fs.readdirSync(humanoDir)) {
    if (!/\.(png|jpe?g)$/i.test(f)) continue;
    humanoImgs.push(f);
  }
  for (const f of humanoImgs) {
    // реresize a partir dos originais que o fbx2gltf deixou em humano/humano_out
    await resizeImage(`${humanoDir}/humano_out/${f}`, `${humanoDir}/${f}`, 2048);
  }
  // buffer.bin optimizado já está em humano/ via cirurgia
  manifest.races.humano = {
    status: 'ok',
    animation: 'embedded-single-clip',
    model: '/racas/humano/humano.gltf',
    clipNames: ['Armature|Armature|AvatarCurrentMotion|AvatarCurrentMotion'],
    note: 'FBX 147MB convertido e cirurgicamente otimizado (BeardLowPoly 4.2M verts removida, bin 53MB).',
  };

  // ------------------------------------------------------ ORC
  const orcOut = `${OUT}/orc`;
  copy(`${ROOT}/orc/Base mesh FBX/Base mesh.fbx`, `${orcOut}/base-mesh.fbx`);
  copy(`${ROOT}/orc/Base mesh FBX/axe.fbx`, `${orcOut}/axe.fbx`);
  const animsDir = `${ROOT}/orc/animation fbx`;
  const animFiles = fs.readdirSync(animsDir).filter((f) => f.endsWith('.fbx'));
  const anims = {};
  for (const f of animFiles) {
    const clip = f.match(/ork@([^\.]+)\.fbx/)[1];
    copy(`${animsDir}/${f}`, `${orcOut}/anims/${clip}.fbx`);
    anims[clip] = `/racas/orc/anims/${clip}.fbx`;
  }
  // texturas: ork_*.tga (personagem) e axe_*.tga (machado)
  const texJobs = [
    ['ork_Albedo.tga', 'ork_Albedo.jpg', 'jpg'],
    ['ork_Normal.tga', 'ork_Normal.png', 'png'],
    ['ork_Metallic.tga', 'ork_Metallic.jpg', 'jpg'],
    ['ork_Occlusion.tga', 'ork_Occlusion.jpg', 'jpg'],
    ['ork_gloss.tga', 'ork_Roughness.jpg', 'jpg'], // gloss ≈ 1-roughness
    ['axe_Albedo.tga', 'axe_Albedo.jpg', 'jpg'],
    ['axe_Normal.tga', 'axe_Normal.png', 'png'],
    ['axe_Metallic.tga', 'axe_Metallic.jpg', 'jpg'],
    ['axe_gloss.tga', 'axe_Roughness.jpg', 'jpg'],
  ];
  for (const [srcName, outName, fmt] of texJobs) {
    await convertTga(`${ROOT}/orc/texture/${srcName}`, `${orcOut}/tex/${outName}`, 1024, fmt);
  }
  manifest.races.orc = {
    status: 'ok',
    animation: 'real-clips',
    model: `/racas/orc/base-mesh.fbx`,
    axe: `/racas/orc/axe.fbx`,
    anims,
    textures: '/racas/orc/tex/',
    note: 'Blender/via escritório: clips FBX nomeados (atack1-3, idle1-2, run, walk, roar, death, gethit, jump, wound).',
  };

  // ------------------------------------------------------ ORCWOW (sem modelo!)
  manifest.races.orcwow = {
    status: 'missing-model',
    note: 'APENAS texturas — falta o arquivo de modelo (.fbx/.glb). Não importável até fornecer o modelo.',
  };

  fs.writeFileSync(`${OUT}/race-assets.json`, JSON.stringify(manifest, null, 2));
  console.log('race-assets.json gravado.');
}

main().then(() => console.log('CONCLUÍDO')).catch((e) => { console.error('ERRO:', e); process.exit(1); });
