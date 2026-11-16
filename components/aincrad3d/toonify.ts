import * as THREE from 'three';

type ToonOptions = {
  /** Multiplica a cor base para deixar o modelo mais legível na cena. */
  boost?: number;
  /** Cor de emissão aplicada aos materiais convertidos. */
  emissive?: string;
  emissiveIntensity?: number;
};

/**
 * Converte os materiais PBR dos GLBs em MeshToonMaterial, mantendo texturas
 * e transparência. É o mesmo tratamento usado no PoC, compartilhado aqui para
 * heróis e inimigos.
 */
export function toonify(root: THREE.Object3D, options: ToonOptions = {}) {
  const { boost = 1, emissive, emissiveIntensity = 0 } = options;

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;

    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;

    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const toon = source.map((material) => {
      // GLB/FBX podem chegar como MeshStandardMaterial (glTF) ou
      // MeshPhongMaterial (FBX) — os dois viram o material toon do projeto.
      const convertable =
        material instanceof THREE.MeshStandardMaterial ||
        material instanceof THREE.MeshPhongMaterial;
      if (!convertable) return material;

      const next = new THREE.MeshToonMaterial({
        map: material.map,
        color: material.color.clone().multiplyScalar(boost),
        transparent: material.transparent,
        opacity: material.opacity,
        alphaTest: material.alphaTest,
        side: material.side,
        vertexColors: material.vertexColors,
      });

      if (emissive) {
        next.emissive = new THREE.Color(emissive);
        next.emissiveIntensity = emissiveIntensity;
      }

      next.name = material.name;
      return next;
    });

    mesh.material = Array.isArray(mesh.material) ? toon : toon[0];
  });
}

/**
 * Baixa os braços de um rig em T-pose (UE Mannequin: upperarm_l/r) para uma
 * pose A relaxada — usado nos GLB sem animações, onde a rest pose fica
 * crucificada. Genérico: mede a direção real do braço no mundo e rotaciona
 * cada upperarm para baixo em volta do eixo perpendicular.
 */
export function relaxTPose(root: THREE.Object3D, angle = 1.05) {
  const bones = new Map<string, THREE.Object3D>();
  root.traverse((object) => {
    if ((object as THREE.Bone).isBone) bones.set(object.name.toLowerCase(), object);
  });

  for (const side of ['l', 'r']) {
    const upperarm = bones.get(`upperarm_${side}`);
    const lowerarm = bones.get(`lowerarm_${side}`);
    if (!upperarm || !lowerarm) continue;

    root.updateWorldMatrix(true, true);
    const shoulder = new THREE.Vector3().setFromMatrixPosition(upperarm.matrixWorld);
    const elbow = new THREE.Vector3().setFromMatrixPosition(lowerarm.matrixWorld);
    const armDir = elbow.sub(shoulder).normalize();
    if (!Number.isFinite(armDir.x + armDir.y + armDir.z) || armDir.lengthSq() < 0.5) continue;

    const up = new THREE.Vector3(0, 1, 0);
    const axis = new THREE.Vector3().crossVectors(up, armDir).normalize();
    if (axis.lengthSq() < 0.5) continue;

    const parentQuat = new THREE.Quaternion();
    upperarm.parent?.getWorldQuaternion(parentQuat);
    // transforma o eixo (mundo) para o espaço local do pai
    axis.applyQuaternion(parentQuat.clone().invert());
    const swing = new THREE.Quaternion().setFromAxisAngle(axis, angle);
    upperarm.quaternion.premultiply(swing);
  }

  root.updateMatrixWorld(true);
}

/** Textura radial suave, usada em brilhos e névoa do portal. */
export function makeGlowTexture(color = '#69ffbe', size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (context) {
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.25, `${color}b0`);
    gradient.addColorStop(0.55, `${color}38`);
    gradient.addColorStop(1, `${color}00`);
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
