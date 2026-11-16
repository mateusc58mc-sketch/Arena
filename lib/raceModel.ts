import * as THREE from 'three';
import { STANDARD_HEIGHT } from './racesAssets';

/**
 * Normaliza um modelo de raça para a cena:
 *  - altura fixa (1,80 m por padrão) — independente da escala do export;
 *  - pivô nos pés (y = 0 apoiado no chão);
 *  - centralizado em X/Z.
 *
 * Retorna um `Group` novo; o objeto recebido é consumido (use `.clone(true)`
 * antes se precisar preservar o original).
 */
export function buildRaceModel(source: THREE.Object3D, height = STANDARD_HEIGHT): THREE.Group {
  // Cenas skinned: Box3.setFromObject mente (usa a geometria de bind em
  // unidade/rotação do FBX de origem). Nesses casos medimos pelos bones,
  // que seguem a pose resultante (feet->head cobre toda a altura do corpo).
  let isSkinned = false;
  source.traverse((o) => {
    if ((o as THREE.Bone).isBone) isSkinned = true;
  });

  let box: THREE.Box3;
  if (isSkinned) {
    source.updateMatrixWorld(true);
    box = new THREE.Box3();
    const v = new THREE.Vector3();
    source.traverse((o) => {
      if ((o as THREE.Bone).isBone) {
        o.getWorldPosition(v);
        box.expandByPoint(v);
      }
    });
  } else {
    box = new THREE.Box3().setFromObject(source);
  }

  const size = box.getSize(new THREE.Vector3());

  const sizeY = Number.isFinite(size.y) && size.y > 0.0001 ? size.y : height;
  const scale = height / sizeY;

  const group = new THREE.Group();

  if (Number.isFinite(scale) && scale > 0) {
    source.scale.setScalar(scale);
    const centerX = (box.min.x + size.x / 2) * scale;
    const centerZ = (box.min.z + size.z / 2) * scale;
    source.position.set(
      Number.isFinite(centerX) ? -centerX : 0,
      Number.isFinite(box.min.y * scale) ? -box.min.y * scale : 0,
      Number.isFinite(centerZ) ? -centerZ : 0,
    );
  }

  group.add(source);
  return group;
}
