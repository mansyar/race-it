import * as THREE from 'three';
import { mulberry32 } from '../race/rng';

/** Number of confetti particles per burst. */
export const CONFETTI_COUNT = 300;

/** Particle lifetime in seconds (~2 s celebration puff). */
export const CONFETTI_LIFE = 2.0;

/** Gravity applied to confetti particles (world units/s^2). */
export const CONFETTI_GRAVITY = -9.8;

/** Horizontal spawn spread around the burst origin. */
const CONFETTI_SPREAD = 1.5;

/** Upward launch speed band (world units/s). */
const CONFETTI_VY_MIN = 2;
const CONFETTI_VY_MAX = 5;

/** Horizontal launch speed band (world units/s). */
const CONFETTI_VX_MAX = 1.5;

/** Confetti particle state; pure math, no rendering concerns. */
export interface ConfettiParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
}

/** Deterministically spawns a confetti burst above a world position. */
export function createConfetti(seed: number, count: number, origin: { x: number; z: number }): ConfettiParticle[] {
  const rng = mulberry32(seed);
  const particles: ConfettiParticle[] = [];
  for (let i = 0; i < count; i++) {
    particles.push({
      x: origin.x + (rng() * 2 - 1) * CONFETTI_SPREAD,
      y: 0.4,
      z: origin.z + (rng() * 2 - 1) * CONFETTI_SPREAD,
      vx: (rng() * 2 - 1) * CONFETTI_VX_MAX,
      vy: CONFETTI_VY_MIN + rng() * (CONFETTI_VY_MAX - CONFETTI_VY_MIN),
      vz: (rng() * 2 - 1) * CONFETTI_VX_MAX,
      age: 0,
      life: 0.6 + rng() * (CONFETTI_LIFE - 0.6),
    });
  }
  return particles;
}

/** Advances particles by dt; returns only the still-alive particles. */
export function stepConfetti(particles: ConfettiParticle[], dt: number): ConfettiParticle[] {
  const alive: ConfettiParticle[] = [];
  for (const particle of particles) {
    particle.vy += CONFETTI_GRAVITY * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.z += particle.vz * dt;
    particle.age += dt;
    if (particle.age < particle.life) {
      alive.push(particle);
    }
  }
  return alive;
}

/** Three.js wrapper: one Points object, one draw call, rebuilt per burst. */
export class ConfettiBurst {
  readonly points = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.PointsMaterial({ color: 0xffd166, size: 0.12, transparent: true, opacity: 0.9 }),
  );
  private particles: ConfettiParticle[] = [];
  private readonly position = new THREE.BufferAttribute(new Float32Array(CONFETTI_COUNT * 3), 3);

  constructor() {
    this.points.geometry.setAttribute('position', this.position);
    this.points.visible = false;
  }

  /** Bursts confetti above the given world position using a seed. */
  burst(origin: { x: number; z: number }, seed: number): void {
    this.particles = createConfetti(seed, CONFETTI_COUNT, origin);
    this.points.visible = true;
    this.writePositions();
  }

  /** Advances the burst; hides the points once every particle has expired. */
  update(dt: number): void {
    if (!this.points.visible) {
      return;
    }
    this.particles = stepConfetti(this.particles, dt);
    this.writePositions();
    if (this.particles.length === 0) {
      this.points.visible = false;
    }
  }

  /** Hides and empties the burst (race restart / quit). */
  clear(): void {
    this.particles = [];
    this.points.visible = false;
  }

  private writePositions(): void {
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const particle = this.particles[i];
      if (particle) {
        this.position.setXYZ(i, particle.x, particle.y, particle.z);
      } else {
        this.position.setXYZ(i, 0, -100, 0); // park dead particles out of view
      }
    }
    this.position.needsUpdate = true;
  }
}