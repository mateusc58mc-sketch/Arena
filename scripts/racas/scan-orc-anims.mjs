// Testa FBXLoader.parse em cada anim do orc — identifica arquivos quebrados
// e quantos clipes cada um produz.
import path from 'node:path';
import fs from 'node:fs';

(async () => {
  const THREE = await import('three');
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
  const dir = 'C:/dev/aetheria-idle/public/racas/orc/anims';
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.fbx'));

  const summary = [];
  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f));
    const loader = new FBXLoader();
    try {
      const group = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
      const clips = group.animations || [];
      summary.push(`${f}: OK — clips=${clips.length} names=[${clips.map((c) => c.name).join(', ')}]`);
    } catch (e) {
      summary.push(`${f}: BREAK — ${e.message}`);
    }
  }
  console.log(summary.join('\n'));

  // também o base-mesh e o machado
  for (const f of ['base-mesh.fbx', 'axe.fbx']) {
    const buf = fs.readFileSync(`C:/dev/aetheria-idle/public/racas/orc/${f}`);
    const loader = new FBXLoader();
    try {
      const group = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
      summary.push(`${f}: OK — meshes=${group.children.length}`);
    } catch (e) {
      summary.push(`${f}: BREAK — ${e.message}`);
    }
  }
  console.log('base/machado check (2 linhas acima):', summary.filter((s) => s.includes('OK — meshes')).length, 'de 2');
})().catch((e) => {
  console.error('ERRO GERAL:', e.message);
  process.exit(1);
});
