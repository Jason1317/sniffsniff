import * as THREE from 'three';
import { Builder } from './builder.js';

// Cars. Every body starts as a side profile (with real wheel arches) extruded into two
// side panels, then gets skins (hood, deck, faces), a greenhouse that leans in toward
// the roof ("tumblehome"), chrome, lights and wheels. Front is local -z.

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const CHROME = 0xb9b8b2, RUBBER = 0x161616, TIRE = 0x141414, WELL = 0x0b0b0b;
const RED = 0x8c1c1a, AMBER = 0xd0882c, LENS = 0xeeead6;

//      L/W: size. zf/zr: axles. belt: window sill height. hf: hood front. tail: deck end.
//      ws: windshield base (z, y). roof: [front z, rear z, height]. rg: rear glass base (z, y).
export const CAR_SPECS = {
  coupe: { L: 4.7, W: 1.76, zf: -1.5, zr: 1.35, wr: 0.31, belt: 0.86, hf: 0.78, tail: 0.84, ws: [-1.05, 0.87], roof: [-0.45, 0.95, 1.37], rg: [1.72, 0.89], inset: 0.12 },
  sedan: { L: 4.7, W: 1.76, zf: -1.45, zr: 1.4, wr: 0.31, belt: 0.86, hf: 0.77, tail: 0.84, ws: [-0.95, 0.87], roof: [-0.35, 1.0, 1.38], rg: [1.55, 0.89], inset: 0.11, doors: 4 },
  wagon: { L: 5.0, W: 1.8, zf: -1.55, zr: 1.45, wr: 0.32, belt: 0.88, hf: 0.78, tail: 0.88, ws: [-1.0, 0.89], roof: [-0.4, 2.3, 1.42], rg: [2.42, 0.9], inset: 0.1, doors: 4, wood: true },
  minivan: { L: 4.8, W: 1.82, zf: -1.55, zr: 1.45, wr: 0.32, belt: 0.95, hf: 0.86, tail: 0.95, ws: [-1.6, 0.96], roof: [-0.7, 2.25, 1.7], rg: [2.36, 0.97], inset: 0.08, doors: 3 },
  pickup: { L: 5.2, W: 1.85, zf: -1.6, zr: 1.55, wr: 0.34, belt: 0.98, hf: 0.92, tail: 0.98, ws: [-0.85, 0.99], roof: [-0.4, 0.45, 1.66], rg: [0.5, 0.99], inset: 0.07, bed: 0.62 },
};

// ---------------------------------------------------------------- geometry helpers

// A box running from (z0, y0) to (z1, y1) at lateral position x: struts, pillars, slabs.
function bar(b, x, z0, y0, z1, y1, w, t, color, mat = 'flat') {
  const dz = z1 - z0, dy = y1 - y0;
  return b.add(new THREE.BoxGeometry(w, Math.hypot(dz, dy), t), color, mat, x, (y0 + y1) / 2, (z0 + z1) / 2, Math.atan2(dz, dy), 0, 0);
}

// Lean everything above the beltline in toward the centerline.
function taper(geo, s) {
  const p = geo.attributes.position, k = s.inset / (s.W / 2), y0 = s.belt, y1 = s.roof[2];
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > y0) p.setX(i, p.getX(i) * (1 - k * Math.min(1, (y - y0) / (y1 - y0))));
  }
  p.needsUpdate = true;
  return geo;
}

// A shape drawn in (z, y) extruded sideways into a panel spanning x0..x0+depth.
function sidePanel(shape, x0, depth) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12 });
  geo.rotateY(-Math.PI / 2);
  geo.translate(x0 + depth, 0, 0);
  return geo;
}

// Flat (z, y) polygon as a double-sided plane at lateral position x (window glass).
function sidePlane(pts, x) {
  const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ShapeGeometry(sh);
  geo.rotateY(-Math.PI / 2);
  geo.translate(x, 0, 0);
  return geo;
}

function poly(pts) { return new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y))); }

// Plane spanning two (z, y) points, full width w (windshields, back glass).
function slopePlane(w, z0, y0, z1, y1) {
  const dz = z1 - z0, dy = y1 - y0;
  const geo = new THREE.PlaneGeometry(w, Math.hypot(dz, dy));
  geo.rotateX(Math.atan2(dz, dy));
  geo.translate(0, (y0 + y1) / 2, (z0 + z1) / 2);
  return geo;
}

const archR = (s) => s.wr + 0.08, archY = (s) => s.wr - 0.03;

// The lower body seen from the side. `door` cuts a gap [z0, z1] for a real opening door.
function lowerProfile(s, door = null) {
  const fz = -s.L / 2, rz = s.L / 2, ar = archR(s), cy = archY(s);
  const sh = new THREE.Shape();
  sh.moveTo(fz + 0.1, 0.24);
  sh.lineTo(fz, 0.4);
  sh.lineTo(fz - 0.01, s.hf - 0.08);
  sh.lineTo(fz + 0.05, s.hf);
  sh.lineTo(s.ws[0], s.belt - 0.01);
  if (door) {
    sh.lineTo(door[0], 0.27);
    sh.lineTo(door[1], 0.27);
    sh.lineTo(door[1], s.belt);
  }
  sh.lineTo(s.rg[0], s.belt + 0.01);
  sh.lineTo(rz - 0.06, s.tail);
  sh.lineTo(rz, s.tail - 0.06);
  sh.lineTo(rz + 0.005, 0.4);
  sh.lineTo(rz - 0.1, 0.24);
  sh.absarc(s.zr, cy, ar, 0, Math.PI, false);
  sh.lineTo(s.zr - ar - 0.03, 0.2);
  sh.lineTo(s.zf + ar + 0.03, 0.2);
  sh.absarc(s.zf, cy, ar, 0, Math.PI, false);
  sh.closePath();
  return sh;
}

function archTrim(s, za) {
  const ar = archR(s), cy = archY(s);
  const sh = new THREE.Shape();
  sh.absarc(za, cy, ar + 0.035, 0, Math.PI, false);
  sh.absarc(za, cy, ar, Math.PI, 0, true);
  sh.closePath();
  return sh;
}

// ---------------------------------------------------------------- shared body

function lowerBody(b, s, color, o = {}) {
  const { L, W } = s, hw = W / 2, fz = -L / 2, rz = L / 2, ar = archR(s), cy = archY(s);
  // side panels (with arches), skins, floor, wheel wells
  for (const sd of [-1, 1]) b.add(sidePanel(lowerProfile(s, o.door), sd < 0 ? -hw : hw - 0.05, 0.05), color);
  bar(b, 0, fz + 0.05, s.hf, s.ws[0], s.belt - 0.01, W - 0.02, 0.04, color);
  b.box(W - 0.02, s.hf - 0.34, 0.05, 0, (s.hf + 0.26) / 2, fz + 0.02, color);
  if (!s.bed) {
    bar(b, 0, s.rg[0], s.belt + 0.01, rz - 0.06, s.tail, W - 0.02, 0.04, color);
    bar(b, 0, rz - 0.06, s.tail, rz, s.tail - 0.06, W - 0.02, 0.04, color);
  }
  b.box(W - 0.02, s.tail - 0.4, 0.05, 0, (s.tail + 0.32) / 2, rz - 0.02, color);
  b.box(W - 0.08, 0.04, L - 0.5, 0, 0.26, 0, 0x1c1814);
  b.box(W - 0.2, 0.1, L - 0.3, 0, 0.17, 0, 0x0e0e0e);
  for (const za of [s.zf, s.zr]) b.box(W - 0.1, 0.4, 2 * ar - 0.04, 0, cy + 0.17, za, WELL);
  b.box(W - 0.1, Math.max(0.1, s.belt - 0.32), 0.04, 0, (s.belt + 0.3) / 2, s.ws[0] + 0.05, 0x141210);

  // arch moldings, rocker, rub strips (skipping the arches and any opening door)
  for (const sd of [-1, 1]) {
    for (const za of [s.zf, s.zr]) b.add(sidePanel(archTrim(s, za), sd < 0 ? -hw - 0.012 : hw - 0.028, 0.04), RUBBER);
    b.box(0.02, 0.05, s.zr - s.zf - 2 * ar - 0.06, sd * (hw + 0.002), 0.235, (s.zf + s.zr) / 2, 0x2a2622);
    const segs = [[fz + 0.12, s.zf - ar - 0.03], [s.zf + ar + 0.03, s.zr - ar - 0.03], [s.zr + ar + 0.03, rz - 0.12]];
    for (let [z0, z1] of segs) {
      if (o.door) {
        if (z0 < o.door[1] && z1 > o.door[0]) {
          if (o.door[0] - z0 > 0.05) segStrip(b, sd, hw, z0, o.door[0] - 0.01);
          z0 = o.door[1] + 0.01;
        }
      }
      if (z1 - z0 > 0.05) segStrip(b, sd, hw, z0, z1);
    }
    // corner marker lights
    b.box(0.012, 0.05, 0.12, sd * (hw + 0.004), 0.6, fz + 0.22, AMBER);
    b.box(0.012, 0.05, 0.12, sd * (hw + 0.004), 0.6, rz - 0.22, RED);
  }

  // bumpers: chrome with a rubber strip, wrapped around the corners, guards
  for (const [z, dir] of [[fz - 0.07, 1], [rz + 0.07, -1]]) {
    b.box(W + 0.02, 0.15, 0.12, 0, 0.42, z, CHROME);
    b.box(W + 0.03, 0.04, 0.125, 0, 0.44, z, RUBBER);
    for (const sd of [-1, 1]) {
      b.box(0.12, 0.15, 0.42, sd * (hw - 0.04), 0.42, z + dir * 0.2, CHROME);
      b.box(0.125, 0.04, 0.425, sd * (hw - 0.04), 0.44, z + dir * 0.2, RUBBER);
      b.box(0.07, 0.14, 0.07, sd * 0.36, 0.43, z - dir * 0.07, RUBBER);
    }
  }

  // wheels: tire, thin whitewall, hubcap, center cap
  for (const sx of [-1, 1]) for (const za of [s.zf, s.zr]) {
    const x = sx * (hw - 0.14);
    b.add(new THREE.CylinderGeometry(s.wr, s.wr, 0.2, 16), TIRE, 'flat', x, s.wr, za, 0, 0, Math.PI / 2);
    if (o.whitewall) b.add(new THREE.CylinderGeometry(s.wr - 0.07, s.wr - 0.07, 0.204, 16), 0xd9d6cb, 'flat', x, s.wr, za, 0, 0, Math.PI / 2);
    b.add(new THREE.CylinderGeometry(s.wr - 0.095, s.wr - 0.095, 0.206, 12), CHROME, 'flat', x, s.wr, za, 0, 0, Math.PI / 2);
    b.add(new THREE.CylinderGeometry(0.05, 0.05, 0.21, 8), 0x3a3a38, 'flat', x, s.wr, za, 0, 0, Math.PI / 2);
  }
  // exhaust
  b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6), 0x2a2a28, 'flat', -0.5, 0.22, rz - 0.05, Math.PI / 2, 0, 0);
}

function segStrip(b, sd, hw, z0, z1) {
  b.box(0.02, 0.045, z1 - z0, sd * (hw + 0.006), 0.6, (z0 + z1) / 2, RUBBER);
  b.box(0.021, 0.008, z1 - z0, sd * (hw + 0.007), 0.63, (z0 + z1) / 2, CHROME);
}

function frontAndRear(b, s, color, o = {}) {
  const { W } = s, fz = -s.L / 2, rz = s.L / 2;
  const gy = s.hf - 0.17;
  // grille: chrome surround, black field, horizontal bars
  b.box(0.86, 0.22, 0.02, 0, gy, fz - 0.012, CHROME);
  b.box(0.8, 0.17, 0.02, 0, gy, fz - 0.02, 0x121212);
  for (let i = 0; i < 4; i++) b.box(0.8, 0.012, 0.012, 0, gy - 0.06 + i * 0.04, fz - 0.03, CHROME);
  for (const sd of [-1, 1]) {
    if (o.quad) {
      for (const k of [0, 1]) {
        const x = sd * (0.52 + k * 0.19);
        b.box(0.18, 0.13, 0.02, x, gy, fz - 0.015, CHROME);
        b.box(0.155, 0.105, 0.02, x, gy, fz - 0.024, LENS);
      }
    } else {
      b.box(0.36, 0.14, 0.02, sd * 0.62, gy, fz - 0.015, CHROME);
      b.box(0.33, 0.115, 0.02, sd * 0.62, gy, fz - 0.024, LENS);
    }
    b.box(0.26, 0.05, 0.02, sd * 0.6, 0.53, fz - 0.012, AMBER);
    // tail lamps with reverse lights
    b.box(0.56, 0.15, 0.02, sd * 0.56, s.tail - 0.2, rz + 0.012, RED);
    b.box(0.12, 0.13, 0.02, sd * 0.36, s.tail - 0.2, rz + 0.02, 0xd8d6cc);
  }
  b.box(0.38, 0.2, 0.01, 0, s.tail - 0.2, rz + 0.008, 0x2a2a28);
  if (!o.plate) b.box(0.3, 0.15, 0.012, 0, s.tail - 0.2, rz + 0.012, 0xe2dcc4);
  // hood ornament, trunk lock
  b.box(0.02, 0.05, 0.05, 0, s.hf + 0.035, fz + 0.14, CHROME);
  if (!s.bed) b.box(0.05, 0.03, 0.01, 0, s.tail - 0.06, rz + 0.008, CHROME);
}

// A side mirror on the driver's side (parked cars) or on a door (Richie's).
function mirror(b, x, y, z, sd, color) {
  b.box(0.06, 0.03, 0.05, x + sd * 0.03, y - 0.03, z, color);
  b.box(0.07, 0.09, 0.14, x + sd * 0.08, y, z + 0.02, color);
  b.box(0.06, 0.07, 0.005, x + sd * 0.08, y, z + 0.093, 0x7a8a96);
}

// ---------------------------------------------------------------- parked cars

export function buildCar(world, type, color, opts = {}) {
  const s = CAR_SPECS[type];
  const b = new Builder();
  const { W } = s, hw = W / 2, top = s.roof[2], glass = 0x1d2730;
  lowerBody(b, s, color, { whitewall: type === 'sedan' });
  frontAndRear(b, s, color, { quad: type !== 'pickup' && type !== 'minivan' });

  // window sill + a closed, tinted greenhouse; pillars and roof on top of it
  b.box(W - 0.02, 0.03, s.rg[0] - s.ws[0], 0, s.belt, (s.ws[0] + s.rg[0]) / 2, color);
  const gh = poly([[s.ws[0], s.ws[1]], [s.roof[0], top], [s.roof[1], top], [s.rg[0], s.rg[1]]]);
  taper(b.add(sidePanel(gh, -hw + 0.05, W - 0.1), glass), s);
  taper(b.box(W - 0.08, 0.045, s.roof[1] - s.roof[0] + 0.06, 0, top + 0.02, (s.roof[0] + s.roof[1]) / 2, color), s);
  for (const sd of [-1, 1]) {
    const x = sd * (hw - 0.04);
    taper(bar(b, x, s.ws[0], s.ws[1], s.roof[0], top, 0.07, 0.07, color), s);
    // C-pillar
    const cz = s.roof[1], back = Math.max(0.3, (s.rg[0] - cz) * 0.6);
    const c = poly([[cz - 0.18, top], [cz + 0.02, top], [s.rg[0], s.rg[1]], [s.rg[0] - back, s.belt]]);
    taper(b.add(sidePanel(c, sd < 0 ? -hw + 0.02 : hw - 0.05, 0.03), color), s);
    // blacked-out B pillar(s) and door seams/handles
    const doors = s.doors || 2;
    const bz = s.ws[0] + (doors === 2 ? 1.25 : 1.0);
    taper(bar(b, x + sd * 0.002, bz, s.belt, bz, top - 0.02, 0.05, 0.08, 0x121212), s);
    const seams = doors === 2 ? [s.ws[0] + 0.02, bz + 0.05] : doors === 3 ? [s.ws[0] + 0.02, bz + 0.05, s.zr - archR(s) - 0.06] : [s.ws[0] + 0.02, bz + 0.03, s.zr - archR(s) - 0.04];
    for (const z of seams) b.box(0.012, s.belt - 0.3, 0.012, sd * (hw + 0.004), (s.belt + 0.28) / 2, z, 0x1a1816);
    b.box(0.02, 0.035, 0.16, sd * (hw + 0.008), s.belt - 0.07, bz - 0.2, CHROME);
    if (doors !== 2) b.box(0.02, 0.035, 0.14, sd * (hw + 0.008), s.belt - 0.07, seams[2] - 0.18, CHROME);
    if (s.wood) b.box(0.012, 0.24, s.zr - s.zf - 2 * archR(s) - 0.12, sd * (hw + 0.006), 0.5, (s.zf + s.zr) / 2, 0x6a4424);
  }
  mirror(b, -hw - 0.01, s.belt + 0.1, s.ws[0] + 0.12, -1, color);

  if (s.bed) {
    // pickup bed: floor, inside walls, tailgate stripe
    b.box(W - 0.12, 0.04, s.L / 2 - s.bed - 0.06, 0, 0.66, (s.bed + s.L / 2) / 2, 0x222220);
    for (const sd of [-1, 1]) b.box(0.03, s.belt - 0.66, s.L / 2 - s.bed - 0.06, sd * (hw - 0.07), (s.belt + 0.66) / 2, (s.bed + s.L / 2) / 2, 0x2a2a28);
    b.box(W - 0.06, s.belt - 0.66, 0.04, 0, (s.belt + 0.66) / 2, s.bed + 0.02, color);
    b.box(W - 0.02, 0.03, 0.08, 0, s.belt + 0.01, s.L / 2 - 0.04, color);
  }
  const g = b.build({ flat: world.mats.flat });
  if (opts.x !== undefined) {
    g.position.set(opts.x, 0, opts.z);
    g.rotation.y = opts.yaw || 0;
    world.dynamic.add(g);
    const c = Math.cos(g.rotation.y), sn = Math.sin(g.rotation.y);
    const hx = Math.abs(c) * W / 2 + Math.abs(sn) * s.L / 2, hz = Math.abs(sn) * W / 2 + Math.abs(c) * s.L / 2;
    world.addCollider({ minX: opts.x - hx, maxX: opts.x + hx, minZ: opts.z - hz, maxZ: opts.z + hz, vehicle: true });
  }
  return g;
}

// ---------------------------------------------------------------- Richie's car

// Richie's '84 coupe: brown with a tan vinyl top. Hollow, with an interior, see-through
// glass, two opening doors, a steering wheel and an ignition key.
export function buildRichieCar(world, tex) {
  const M = world.mats, s = CAR_SPECS.coupe;
  const color = 0x6b4a33, vinyl = 0xd4c8aa, tan = 0xc2a882, trim = 0x4a3c30, dash = 0x3a302a;
  const { L, W } = s, hw = W / 2, top = s.roof[2], [wz, wy] = s.ws, [rf, rr] = s.roof, [gz, gy] = s.rg;
  const door = [wz, 0.35];
  const b = new Builder({ velour: 0.5 });
  const root = new THREE.Group();
  root.rotation.order = 'YXZ';

  lowerBody(b, s, color, { door, whitewall: true });
  frontAndRear(b, s, color, { quad: true, plate: true });
  // a little rust on the rear quarters and rockers
  for (const sd of [-1, 1]) {
    b.box(0.006, 0.05, 0.14, sd * (hw + 0.003), 0.31, s.zr + 0.48, 0x6a3a1c);
    b.box(0.006, 0.035, 0.08, sd * (hw + 0.003), 0.36, s.zr + 0.6, 0x7a4622);
  }
  // antenna on the passenger fender
  bar(b, hw - 0.12, -1.3, 0.83, -1.22, 1.75, 0.008, 0.008, CHROME);
  // cowl vent + wipers resting at the base of the windshield
  b.box(W - 0.12, 0.012, 0.09, 0, wy - 0.005, wz - 0.06, 0x141414);
  for (const x of [-0.3, 0.22]) b.box(0.5, 0.012, 0.02, x, wy + 0.012, wz + 0.01, RUBBER, 'flat', 0, 0, x < 0 ? 0.05 : 0.03);

  // ---- greenhouse
  const T = (g) => taper(g, s);
  for (const sd of [-1, 1]) {
    const x = sd * (hw - 0.05);
    T(bar(b, x, wz, wy, rf, top, 0.07, 0.07, color));
    // vinyl-covered C pillar (sail panel)
    const c = poly([[rr - 0.12, top], [rr + 0.03, top], [gz, gy], [gz - 0.55, s.belt]]);
    T(b.add(sidePanel(c, sd < 0 ? -hw + 0.02 : hw - 0.06, 0.04), vinyl));
    // inner sill + quarter trim
    b.box(0.1, 0.03, gz - door[1], sd * (hw - 0.08), s.belt + 0.01, (door[1] + gz) / 2, 0x2a221e);
    b.box(0.04, 0.42, 1.3, sd * (hw - 0.08), 0.62, 1.0, trim);
    // seal where the door glass meets the quarter glass
    T(bar(b, sd * (hw - 0.05), door[1] + 0.012, s.belt + 0.01, door[1] + 0.012, top - 0.03, 0.03, 0.025, RUBBER));
    // drip rail
    T(b.box(0.025, 0.025, rr - rf + 0.12, sd * (hw - 0.05), top + 0.005, (rf + rr) / 2, CHROME));
  }
  T(b.box(W - 0.1, 0.045, rr - rf + 0.08, 0, top + 0.02, (rf + rr) / 2, vinyl));
  T(b.box(W - 0.4, 0.02, rr - rf - 0.1, 0, top + 0.05, (rf + rr) / 2, vinyl));
  T(b.box(W - 0.2, 0.02, rr - rf + 0.02, 0, top - 0.02, (rf + rr) / 2, 0xc8bca0));
  // windshield + rear glass trim
  T(b.box(W - 0.14, 0.03, 0.03, 0, top - 0.005, rf + 0.01, CHROME));
  T(b.box(W - 0.14, 0.025, 0.04, 0, gy + 0.005, gz - 0.01, CHROME));

  // ---- interior
  b.box(W - 0.12, 0.26, 0.42, 0, 0.75, -0.8, dash);
  bar(b, 0, -0.95, 0.89, -0.58, 0.93, W - 0.14, 0.05, 0x2e2622);
  b.box(0.5, 0.08, 0.16, -0.38, 0.95, -0.62, 0x2a221e);
  b.box(0.44, 0.12, 0.02, -0.38, 0.86, -0.585, 0x151515);
  b.box(0.3, 0.025, 0.006, -0.38, 0.875, -0.574, 0xcfc28c);
  b.box(0.006, 0.03, 0.006, -0.43, 0.875, -0.57, 0xc83a2a);
  b.box(0.26, 0.08, 0.03, 0, 0.76, -0.58, 0x111111);
  for (const x of [-0.1, 0.1]) b.add(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 8), 0x8a8a86, 'flat', x, 0.76, -0.56, Math.PI / 2, 0, 0);
  for (const x of [-0.2, 0.2, 0.62]) b.box(0.12, 0.04, 0.01, x, 0.86, -0.585, 0x111111);
  b.box(0.4, 0.004, 0.006, 0.4, 0.7, -0.588, 0x2a221e);
  bar(b, -0.38, -0.62, 0.86, -0.45, 0.97, 0.07, 0.07, 0x2a2420);
  b.box(0.3, 0.12, 1.0, 0, 0.32, -0.3, 0x2a221e);
  for (const x of [-0.5, -0.32]) b.box(0.07, 0.1, 0.02, x, 0.42, -0.86, 0x1a1a1a, 'flat', -0.4, 0, 0);
  // seats: buckets in front, a bench behind (backs lean back)
  for (const sd of [-1, 1]) {
    const x = sd * 0.38;
    b.boxB(0.44, 0.14, 0.4, x, 0.27, 0.08, 0x2a221e);
    b.boxB(0.52, 0.15, 0.52, x, 0.41, 0.08, tan, 'velour');
    bar(b, x, 0.36, 0.55, 0.47, 1.15, 0.52, 0.13, tan, 'velour');
    bar(b, x, 0.49, 1.16, 0.52, 1.34, 0.28, 0.1, tan, 'velour');
  }
  b.boxB(1.25, 0.15, 0.42, 0, 0.4, 0.82, tan, 'velour');
  bar(b, 0, 1.0, 0.55, 1.16, 1.1, 1.3, 0.14, tan, 'velour');
  b.box(W - 0.2, 0.03, 0.45, 0, 0.92, 1.48, 0x2a221e);
  // visors, rear-view mirror, pine-tree air freshener
  for (const sd of [-1, 1]) T(b.box(0.42, 0.02, 0.16, sd * 0.36, top - 0.045, rf + 0.1, tan));
  bar(b, 0, -0.47, 1.34, -0.42, 1.3, 0.02, 0.02, 0x1a1a1a);
  b.box(0.24, 0.07, 0.04, 0, 1.28, -0.4, 0x1a1a1a);
  b.box(0.22, 0.055, 0.004, 0, 1.28, -0.379, 0x8a96a0);
  b.box(0.003, 0.08, 0.002, 0.04, 1.205, -0.4, 0x7a6a50);
  b.add(new THREE.ConeGeometry(0.022, 0.06, 3), 0x2e7a3a, 'flat', 0.04, 1.14, -0.4, Math.PI, 0, 0);

  root.add(b.build({ flat: M.flat, velour: M.velour }));

  // ---- glass (see-through from inside)
  const glassMat = M.carGlass;
  const addGlass = (geo, parent = root) => { const m = new THREE.Mesh(geo, glassMat); m.renderOrder = 2; parent.add(m); return m; };
  addGlass(T(slopePlane(W - 0.16, wz + 0.02, wy + 0.01, rf + 0.01, top - 0.01)));
  addGlass(T(slopePlane(W - 0.16, rr + 0.01, top - 0.01, gz - 0.02, gy + 0.01)));
  for (const sd of [-1, 1]) addGlass(T(sidePlane([[door[1] + 0.03, s.belt + 0.02], [gz - 0.56, s.belt + 0.02], [rr - 0.13, top - 0.04], [door[1] + 0.03, top - 0.04]], sd * (hw - 0.05))));

  // plate + radio display (lit)
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshLambertMaterial({ map: tex.plate }));
  plate.position.set(0, s.tail - 0.2, L / 2 + 0.016);
  root.add(plate);
  const radio = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.022), new THREE.MeshBasicMaterial({ color: 0x5cff8a }));
  radio.position.set(0, 0.765, -0.563);
  root.add(radio);

  // ---- doors: hinge at the A-pillar base, open outward. Parts are authored in car
  // space (closed) and the whole set is offset into the hinge's frame.
  const doors = {};
  const len = door[1] - door[0];
  for (const [name, sd] of [['driver', -1], ['passenger', 1]]) {
    const px = sd * (hw - 0.04);
    const pivot = new THREE.Group();
    pivot.position.set(px, 0, door[0]);
    root.add(pivot);
    const inner = new THREE.Group();
    inner.position.set(-px, 0, -door[0]);
    pivot.add(inner);
    const db = new Builder({ velour: 0.5 });
    const zc = (door[0] + door[1]) / 2, ox = sd * hw;
    db.boxB(0.07, s.belt - 0.27, len - 0.01, px, 0.27, zc, color);
    segStrip(db, sd, hw, door[0] + 0.03, door[1] - 0.03);
    db.box(0.02, 0.035, 0.17, ox + sd * 0.008, 0.8, door[1] - 0.25, CHROME);
    db.box(0.03, 0.42, len - 0.08, px - sd * 0.05, 0.6, zc, trim);
    db.box(0.07, 0.05, 0.42, px - sd * 0.08, 0.72, door[0] + 0.95, dash);
    db.box(0.025, 0.025, 0.08, px - sd * 0.085, 0.8, door[0] + 0.8, CHROME);
    db.box(0.03, 0.02, 0.07, px - sd * 0.075, 0.55, door[0] + 1.1, CHROME);
    db.box(0.03, 0.03, 0.03, px - sd * 0.09, 0.55, door[0] + 1.15, 0x2a2420);
    db.box(0.1, 0.03, len - 0.02, px - sd * 0.02, s.belt + 0.01, zc, 0x2a221e);
    mirror(db, ox, s.belt + 0.1, door[0] + 0.1, sd, color);
    inner.add(db.build({ flat: M.flat, velour: M.velour }));
    // (no door glass: it is June and both windows are rolled down)
    const toPivot = (x, y, z) => V(x - px, y, z - door[0]);
    doors[name] = {
      pivot, side: sd, open: 0,
      handleLocal: toPivot(px - sd * 0.085, 0.8, door[0] + 0.8),
      outerHandle: toPivot(ox + sd * 0.01, 0.8, door[1] - 0.25),
    };
  }

  // steering wheel
  const wheel = new THREE.Group();
  wheel.position.set(-0.38, 0.98, -0.43);
  wheel.rotation.x = -0.45;
  root.add(wheel);
  const spin = new THREE.Group();
  wheel.add(spin);
  spin.add(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.018, 6, 20), M.black));
  const hub = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.05), M.black);
  spin.add(hub);
  for (const a of [0, Math.PI * 0.75, -Math.PI * 0.75]) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.17, 0.015), M.black);
    sp.position.set(Math.sin(a) * 0.09, -Math.cos(a) * 0.09, 0);
    sp.rotation.z = a;
    spin.add(sp);
  }

  // ignition key + keychain, on the column
  const key = new THREE.Group();
  key.position.set(-0.29, 0.9, -0.56);
  root.add(key);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.006), M.chrome);
  blade.position.x = 0.02;
  key.add(blade);
  const fob = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.05, 0.015), new THREE.MeshLambertMaterial({ color: 0xc8b070 }));
  fob.position.set(0.05, -0.04, 0);
  key.add(fob);

  return { root, doors, wheel: spin, key, radio, seat: V(-0.38, 0, 0.12), passengerSeat: V(0.38, 0.56, 0.05), L, W };
}
