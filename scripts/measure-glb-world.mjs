// Measures TRUE world-space bbox of each GLB (applying node transforms).
// Usage: node scripts/measure-glb-world.mjs <file.glb> ...
import { readFileSync } from 'node:fs';

function measure(path) {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const accessors = json.accessors ?? [];
  const nodes = json.nodes ?? [];
  const meshes = json.meshes ?? [];

  // Node world matrix via DFS from scene roots.
  const world = new Map();
  const identity = { t: [0, 0, 0], s: [1, 1, 1] };
  const walk = (idx, parent) => {
    const n = nodes[idx] ?? {};
    const s = (n.scale ?? [1, 1, 1]).map((v, i) => v * parent.s[i]);
    const t = (n.translation ?? [0, 0, 0]).map((v, i) => v * parent.s[i] + parent.t[i]);
    // NOTE: ignores node rotation (Kenney roots are typically rotation-free).
    const mine = { t, s };
    world.set(idx, mine);
    for (const c of n.children ?? []) walk(c, mine);
  };
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
  for (const r of roots) walk(r, identity);

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const nodeEntries = [...world.entries()];
  for (const [nodeIdx, xf] of nodeEntries) {
    const n = nodes[nodeIdx];
    if (n.mesh === undefined) continue;
    const mesh = meshes[n.mesh];
    for (const prim of mesh.primitives ?? []) {
      const acc = accessors[prim.attributes?.POSITION];
      if (!acc?.min || !acc?.max) continue;
      for (let i = 0; i < 3; i++) {
        for (const v of [acc.min[i], acc.max[i]]) {
          const w = v * xf.s[i] + xf.t[i];
          min[i] = Math.min(min[i], w);
          max[i] = Math.max(max[i], w);
        }
      }
    }
  }
  const size = min.map((m, i) => (max[i] - m).toFixed(3));
  const center = min.map((m, i) => ((m + max[i]) / 2).toFixed(3));
  console.log(
    path.split(/[\\/]/).pop().padEnd(24),
    'min [',
    min.map((m) => m.toFixed(3)).join(', '),
    ']',
    'size [',
    size.join(', '),
    ']',
    'center [',
    center.join(', '),
    ']',
  );
}

for (const arg of process.argv.slice(2)) measure(arg);
