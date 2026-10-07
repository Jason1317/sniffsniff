// Small math helpers shared everywhere.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
// Frame-rate independent exponential approach.
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

// Return `to` shifted by whole turns so it is the closest angle to `from`.
export function nearAngle(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return from + d;
}

export const dampAngle = (a, b, rate, dt) => damp(a, nearAngle(a, b), rate, dt);

// Yaw convention: an object with rotation.y = yaw faces (-sin yaw, 0, -cos yaw).
export const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

// Seeded PRNG (mulberry32) so the town is the same every time.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];
