import * as THREE from 'three';
import type { PieceFeedback } from './toy-feedback';

/** Red pulse used for remove-mode tint. */
const REMOVE_TINT = new THREE.Color(0xe63946);

/**
 * Applies place pop-in scale and remove-mode wiggle/tint to piece holders.
 * Expects `userData.cellIndex` and `userData.baseRotY` on each holder (set by
 * `buildPiece`) and `userData.baseColor` on tintable materials.
 */
export function applyPieceFeedback(
  group: THREE.Group,
  feedback: PieceFeedback,
  timeSeconds: number,
): void {
  const wiggle = feedback.wiggleYaw(timeSeconds);
  const tint = feedback.tintPulse(timeSeconds);
  for (const child of group.children) {
    const index = child.userData.cellIndex as number | undefined;
    const baseRotY = child.userData.baseRotY as number | undefined;
    if (index === undefined || baseRotY === undefined) {
      continue;
    }
    const scale = feedback.scaleFor(index);
    child.scale.setScalar(scale);
    child.rotation.y = baseRotY + wiggle;
  }
  applyRemoveTint(group, tint);
}

/** Lerps shared template materials toward red by `amount` (0 = base color). */
export function applyRemoveTint(root: THREE.Object3D, amount: number): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) {
      return;
    }
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const material of materials) {
      if (!('color' in material)) {
        continue;
      }
      const colored = material as THREE.MeshLambertMaterial;
      const base = colored.userData.baseColor as THREE.Color | undefined;
      if (!base) {
        continue;
      }
      colored.color.copy(base);
      if (amount > 0) {
        colored.color.lerp(REMOVE_TINT, Math.min(1, amount));
      }
    }
  });
}
