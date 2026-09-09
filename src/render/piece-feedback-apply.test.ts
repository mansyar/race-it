import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyPieceFeedback, applyRemoveTint } from './piece-feedback-apply';
import { PieceFeedback, POP_IN_SECONDS } from './toy-feedback';

function makeHolder(cellIndex: number, baseRotY: number): THREE.Object3D {
  const holder = new THREE.Object3D();
  holder.userData.cellIndex = cellIndex;
  holder.userData.baseRotY = baseRotY;
  return holder;
}

function makeMeshWithBaseColor(hex: number): THREE.Mesh {
  const material = new THREE.MeshLambertMaterial({ color: hex });
  material.userData.baseColor = new THREE.Color(hex);
  return new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
}

describe('applyPieceFeedback', () => {
  it('applies pop-in scale then settles at 1', () => {
    const group = new THREE.Group();
    const holder = makeHolder(0, 0);
    group.add(holder);
    const feedback = new PieceFeedback();
    feedback.notePlaced(0);
    applyPieceFeedback(group, feedback, 0);
    expect(holder.scale.x).toBeLessThan(1);
    feedback.tick(POP_IN_SECONDS + 0.01);
    applyPieceFeedback(group, feedback, POP_IN_SECONDS);
    expect(holder.scale.x).toBeCloseTo(1, 5);
  });

  it('wiggles yaw from the base rotation only in remove mode', () => {
    const group = new THREE.Group();
    const holder = makeHolder(0, Math.PI / 4);
    group.add(holder);
    const feedback = new PieceFeedback();
    applyPieceFeedback(group, feedback, 0.1);
    expect(holder.rotation.y).toBeCloseTo(Math.PI / 4, 5);
    feedback.setRemoveMode(true);
    applyPieceFeedback(group, feedback, 0.1);
    expect(holder.rotation.y).not.toBeCloseTo(Math.PI / 4, 3);
    expect(Math.abs(holder.rotation.y - Math.PI / 4)).toBeLessThanOrEqual(
      (4 * Math.PI) / 180 + 1e-6,
    );
  });

  it('tints materials toward red in remove mode and restores after', () => {
    const group = new THREE.Group();
    const mesh = makeMeshWithBaseColor(0xffffff);
    group.add(mesh);
    const feedback = new PieceFeedback();
    feedback.setRemoveMode(true);
    applyPieceFeedback(group, feedback, 0);
    const colored = mesh.material as THREE.MeshLambertMaterial;
    expect(colored.color.r).toBeLessThan(1);
    expect(colored.color.r).toBeGreaterThan(colored.color.b);
    feedback.setRemoveMode(false);
    applyPieceFeedback(group, feedback, 0.5);
    expect(colored.color.getHex()).toBe(0xffffff);
  });
});

describe('applyRemoveTint', () => {
  it('is a no-op at amount 0 and mixes red otherwise', () => {
    const mesh = makeMeshWithBaseColor(0x808080);
    applyRemoveTint(mesh, 0);
    const colored = mesh.material as THREE.MeshLambertMaterial;
    expect(colored.color.getHex()).toBe(0x808080);
    applyRemoveTint(mesh, 0.5);
    expect(colored.color.r).toBeGreaterThan(colored.color.g);
  });
});
