import * as THREE from 'three';
import { Builder, gableGeo, shade } from './builder.js';
import { buildHouse, buildCar, buildRichieCar, buildTree, buildPole, buildFenceRun, buildMailbox } from './props.js';
import { posterTex, streetSignTex, canvasTex } from './textures.js';
import { rng, clamp } from '../core/util.js';

// Willet, Wisconsin. One residential block bounded by Birch Ln (z=0, south), Oak St (z=-64,
// north), Pine St (x=-70, west) and Mill Rd (x=70, east). Corn to the north, woods to the
// east, farm fields and the water tower to the west. North is -z.

const UV = { grass: 3, asphalt: 5, concrete: 1.6, siding: 1.0, shingle: 1.4, wood: 1.0, brick: 0.9, dirt: 1.5, garage: 2.2, wallpaper: 0.45, velour: 0.5 };

export const BOUNDS = { minX: -79, maxX: 77, minZ: -96, maxZ: 37 };

// side: BS = Birch south (faces north), BN = Birch north (faces south), OS/ON likewise for Oak.
const HOUSES = [
  { id: 'b408', num: 408, x: -51, side: 'BS', w: 10, d: 9, stories: 2, color: 0xaebcc4, roof: 0x4a4a4e, shutter: 0x283848, doorX: -1.4, garage: 'left', car: ['wagon', 0x8a8478], chimney: true },
  { id: 'richie', num: 412, x: -31, side: 'BS', w: 9, d: 8.5, stories: 1, color: 0xc9b48a, roof: 0x5a4a3e, doorColor: 0x5a3a28, doorX: 1.5, drive: 'right', interior: 'richie' },
  { id: 'dorothy', num: 416, x: -10, side: 'BS', w: 10, d: 9, stories: 1, color: 0xefede4, roof: 0x3e4a3e, shutter: 0x2f5a3a, doorColor: 0x2f5a3a, doorX: 0, garage: 'right', car: ['sedan', 0x9ab4c8], flowers: true },
  { id: 'b420', num: 420, x: 10, side: 'BS', w: 10, d: 9, stories: 2, color: 0x9aa88a, roof: 0x4e4a44, doorColor: 0x8a2a24, doorX: -1.5, garage: 'right' },
  { id: 'b424', num: 424, x: 31, side: 'BS', w: 11, d: 9, stories: 1, color: 0xc89a8a, roof: 0x4a3a34, doorX: 2, garage: 'left', car: ['minivan', 0x6a2232] },
  { id: 'b428', num: 428, x: 51, side: 'BS', w: 10, d: 9, stories: 2, color: 0xd8d0b0, roof: 0x5a5048, shutter: 0x5a2a22, doorX: 0, garage: 'right', car: ['sedan', 0x2e3e5e], noMailbox: true },
  { id: 'b409', num: 409, x: -51, side: 'BN', w: 10, d: 9, stories: 1, color: 0x8ea0b4, roof: 0x3e3e44, doorX: 1.5, garage: 'right', flamingos: true },
  { id: 'b413', num: 413, x: -31, side: 'BN', w: 10, d: 9, stories: 2, color: 0xe4dccb, roof: 0x5e3e34, shutter: 0x3a2a24, doorX: -1.4, garage: 'left', car: ['sedan', 0x7a7a72], flag: 'usa' },
  { id: 'b417', num: 417, x: -10, side: 'BN', w: 10, d: 9, stories: 1, color: 0xb4a08a, roof: 0x48403a, doorX: 1.2, garage: 'right', hoop: true },
  { id: 'b421', num: 421, x: 10, side: 'BN', w: 11, d: 9, stories: 2, color: 0xa8b8a0, roof: 0x3e4a3a, shutter: 0x2a3a2a, doorX: 0, garage: 'left', car: ['wagon', 0x5a3a24] },
  { id: 'lindqvist', num: 425, x: 31, side: 'BN', w: 10, d: 9, stories: 2, color: 0xe8e6e0, roof: 0x58585c, doorColor: 0xe8e6e0, doorX: 0, garage: 'right', interior: 'dark' },
  { id: 'b429', num: 429, x: 51, side: 'BN', w: 10, d: 9, stories: 1, color: 0xc4b48a, roof: 0x5a4a3a, doorX: -1.5, garage: 'left' },
  { id: 'o406', num: 406, x: -51, side: 'OS', w: 10, d: 9, stories: 1, color: 0xb8a490, roof: 0x4a4038, doorX: 1.5, garage: 'right' },
  { id: 'o410', num: 410, x: -31, side: 'OS', w: 10, d: 9, stories: 2, color: 0x9ab0b8, roof: 0x3e4448, shutter: 0x2a2a2a, doorX: 0, garage: 'left', car: ['minivan', 0x8c8c86] },
  { id: 'o414', num: 414, x: -10, side: 'OS', w: 10, d: 9, stories: 1, color: 0xd8c8a8, roof: 0x5a4a3a, doorX: -1.5, garage: 'right', chairs: true },
  { id: 'walt', num: 418, x: 10, side: 'OS', w: 11, d: 9.5, stories: 1, color: 0x8a9a8a, roof: 0x3a3a38, doorColor: 0x4a3a2a, doorX: -1.5, garage: 'left', interior: 'hall', flag: 'pack' },
  { id: 'o422', num: 422, x: 31, side: 'OS', w: 10, d: 9, stories: 2, color: 0xc0b0b8, roof: 0x4e4448, doorX: 1.5, garage: 'right' },
  { id: 'o426', num: 426, x: 51, side: 'OS', w: 10, d: 9, stories: 1, color: 0xa89878, roof: 0x4a3e32, doorX: 0, garage: 'left', car: ['sedan', 0x4a6a4a] },
  { id: 'o407', num: 407, x: -51, side: 'ON', w: 10, d: 9, stories: 2, color: 0xc8c0a0, roof: 0x4a4440, doorX: 0, garage: 'right' },
  { id: 'o411', num: 411, x: -31, side: 'ON', w: 10, d: 9, stories: 1, color: 0x98a8b8, roof: 0x3a3e44, doorX: 1.5, garage: 'left', car: ['pickup', 0x8a3a2a] },
  { id: 'o415', num: 415, x: -10, side: 'ON', w: 11, d: 9, stories: 1, color: 0xe0d8c8, roof: 0x5a5048, doorX: -1.5, garage: 'right' },
  { id: 'o419', num: 419, x: 10, side: 'ON', w: 10, d: 9, stories: 2, color: 0xb0a088, roof: 0x48403a, doorX: 0, garage: 'left' },
];

function placement(h) {
  const s = h.side;
  if (s === 'BS') return { yaw: 0, z: 16.1 + h.d / 2, sidewalkDist: 9, curbDist: 12.1 };
  if (s === 'BN') return { yaw: Math.PI, z: -15.6 - h.d / 2, sidewalkDist: 8.5, curbDist: 11.6 };
  if (s === 'OS') return { yaw: 0, z: -48.4 + h.d / 2, sidewalkDist: 8.5, curbDist: 11.6 };
  return { yaw: Math.PI, z: -79.9 - h.d / 2, sidewalkDist: 9, curbDist: 12.1 };
}

export class World {
  constructor(scene, tex) {
    this.scene = scene;
    this.tex = tex;
    this.dynamic = new THREE.Group();
    scene.add(this.dynamic);
    this.colliders = [];
    this.movers = [];
    this.platforms = [];
    this.surfaces = [];
    this.driveways = [];
    this.lamps = [];
    this.houses = {};
    this.spots = {};
    this.posters = [];
    this.cans = [];
    this.nightOnly = [];
    this.dayOnly = [];

    const Lm = (o) => new THREE.MeshLambertMaterial(o);
    this.mats = {
      flat: Lm({ vertexColors: true }),
      door: Lm({ vertexColors: true, emissive: 0x0c0a08 }),
      grass: Lm({ vertexColors: true, map: tex.grass }),
      asphalt: Lm({ vertexColors: true, map: tex.asphalt }),
      concrete: Lm({ vertexColors: true, map: tex.concrete }),
      siding: Lm({ vertexColors: true, map: tex.siding }),
      shingle: Lm({ vertexColors: true, map: tex.shingle }),
      wood: Lm({ vertexColors: true, map: tex.wood }),
      brick: Lm({ vertexColors: true, map: tex.brick }),
      dirt: Lm({ vertexColors: true, map: tex.dirt }),
      garage: Lm({ vertexColors: true, map: tex.garage }),
      wallpaper: Lm({ vertexColors: true, map: tex.wallpaper }),
      velour: Lm({ vertexColors: true, map: tex.velour }),
      glassDay: Lm({ color: 0x2c3b48, emissive: 0x18242e }),
      glassDark: Lm({ color: 0x0a0d12 }),
      glassLit: new THREE.MeshBasicMaterial({ color: 0xd9a560 }),
      glassTV: new THREE.MeshBasicMaterial({ color: 0x6a8cff }),
      carGlass: Lm({ color: 0x9ab0c0, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }),
      black: Lm({ color: 0x1a1a1a }),
      brass: Lm({ color: 0xc8a040 }),
      chrome: Lm({ color: 0xc8c8c8 }),
      bulbOff: Lm({ color: 0xe8e4d8, emissive: 0x1a1a1a }),
      bulbOn: new THREE.MeshBasicMaterial({ color: 0xfff2cc }),
      chain: Lm({ map: tex.chainlink, alphaTest: 0.5, side: THREE.DoubleSide }),
    };
    this.geo = { window: new THREE.PlaneGeometry(1.05, 1.25), bulb: new THREE.SphereGeometry(0.045, 8, 6) };
  }

  // ---------- registries ----------
  addCollider(c) { this.colliders.push(c); return c; }
  addPlatform(p) { this.platforms.push(p); }
  addSurface(rect, type) { this.surfaces.push({ ...rect, type }); }

  addLight(o) {
    const l = {
      pos: o.pos.clone(), kind: o.kind, color: new THREE.Color(o.color), power: o.power, range: o.range,
      on: !!o.on, level: o.on ? 1 : 0, mode: o.mode || 'steady', mesh: o.mesh || null, halo: o.halo || null,
      pool: o.pool || null, override: null, t: Math.random() * 10,
    };
    this.lamps.push(l);
    return l;
  }

  groundHeight(x, z) {
    let h = 0;
    for (const p of this.platforms) {
      const b = p.box;
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      if (p.ramp) {
        const { low, high } = p.ramp;
        const dx = high.x - low.x, dz = high.z - low.z;
        const t = clamp(((x - low.x) * dx + (z - low.z) * dz) / (dx * dx + dz * dz), 0, 1);
        h = Math.max(h, p.ramp.h * t);
      } else h = Math.max(h, p.h);
    }
    return h;
  }

  surfaceAt(x, z) {
    let found = 'grass';
    for (const s of this.surfaces) {
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      if (s.type === 'wood') return 'wood';
      found = s.type;
    }
    return found;
  }

  // Waypoints from `from` to `to` that walk around parked vehicles (box colliders flagged
  // `vehicle`) instead of through them. A box that either end is already inside is ignored.
  route(from, to, pad = 0.55) {
    const boxes = this.colliders.filter((c) => c.vehicle && !c.disabled && !inBox(from, c, pad) && !inBox(to, c, pad));
    const pts = [];
    let a = from.clone();
    for (let guard = 0; guard < 4; guard++) {
      const c = boxes.find((b) => segHitsBox(a, to, b, pad));
      if (!c) break;
      const e = pad + 0.2;
      const k = [[c.minX - e, c.minZ - e], [c.maxX + e, c.minZ - e], [c.maxX + e, c.maxZ + e], [c.minX - e, c.maxZ + e]].map(([x, z]) => new THREE.Vector3(x, 0, z));
      let best = null, bl = Infinity;
      for (let i = 0; i < 4; i++) {
        if (!segHitsBox(a, k[i], c, pad) && !segHitsBox(k[i], to, c, pad)) {
          const l = a.distanceTo(k[i]) + k[i].distanceTo(to);
          if (l < bl) { bl = l; best = [k[i]]; }
        }
        for (const j of [(i + 1) % 4, (i + 3) % 4]) {
          if (segHitsBox(a, k[i], c, pad) || segHitsBox(k[j], to, c, pad)) continue;
          const l = a.distanceTo(k[i]) + k[i].distanceTo(k[j]) + k[j].distanceTo(to);
          if (l < bl) { bl = l; best = [k[i], k[j]]; }
        }
      }
      if (!best) break;
      pts.push(...best);
      a = best[best.length - 1];
    }
    pts.push(to.clone());
    return pts;
  }

  // Keep a walker (neighbor) from passing through vehicles.
  collideVehicles(pos, r) {
    for (const c of this.colliders) {
      if (!c.vehicle || c.disabled) continue;
      if (pos.x < c.minX - r || pos.x > c.maxX + r || pos.z < c.minZ - r || pos.z > c.maxZ + r) continue;
      const cx = clamp(pos.x, c.minX, c.maxX), cz = clamp(pos.z, c.minZ, c.maxZ);
      const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz);
      if (d >= r) continue;
      if (d > 1e-6) { pos.x = cx + (dx / d) * r; pos.z = cz + (dz / d) * r; }
    }
  }

  // `self` is skipped when checking moving bodies (neighbors, Moose, Richie).
  collide(pos, r, bounds = true, self = null, npcsOnly = false) {
    for (let it = 0; it < 2; it++) {
      for (const m of this.movers) {
        if (m.obj === self || !m.obj.visible || (npcsOnly && !m.npc) || (m.active && !m.active())) continue;
        const p = m.obj.position;
        const dx = pos.x - p.x, dz = pos.z - p.z, rr = r + m.r, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-8) { const d = Math.sqrt(d2); pos.x = p.x + (dx / d) * rr; pos.z = p.z + (dz / d) * rr; }
      }
      for (const c of this.colliders) {
        if (c.disabled) continue;
        if (c.circle) {
          const dx = pos.x - c.x, dz = pos.z - c.z, rr = r + c.r, d2 = dx * dx + dz * dz;
          if (d2 < rr * rr && d2 > 1e-8) { const d = Math.sqrt(d2); pos.x = c.x + (dx / d) * rr; pos.z = c.z + (dz / d) * rr; }
          continue;
        }
        if (pos.x < c.minX - r || pos.x > c.maxX + r || pos.z < c.minZ - r || pos.z > c.maxZ + r) continue;
        const cx = clamp(pos.x, c.minX, c.maxX), cz = clamp(pos.z, c.minZ, c.maxZ);
        const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * r;
          pos.z = cz + (dz / d) * r;
        } else {
          const l = pos.x - c.minX, rt = c.maxX - pos.x, t = pos.z - c.minZ, bt = c.maxZ - pos.z;
          const m = Math.min(l, rt, t, bt);
          if (m === l) pos.x = c.minX - r; else if (m === rt) pos.x = c.maxX + r; else if (m === t) pos.z = c.minZ - r; else pos.z = c.maxZ + r;
        }
      }
    }
    if (bounds) {
      let hit = null;
      if (pos.x < BOUNDS.minX) { pos.x = BOUNDS.minX; hit = 'west'; }
      if (pos.x > BOUNDS.maxX) { pos.x = BOUNDS.maxX; hit = 'east'; }
      if (pos.z < BOUNDS.minZ) { pos.z = BOUNDS.minZ; hit = 'north'; }
      if (pos.z > BOUNDS.maxZ) { pos.z = BOUNDS.maxZ; hit = 'south'; }
      return hit;
    }
    return null;
  }

  // ---------- the town ----------
  build() {
    const b = new Builder(UV);
    const r = rng(412);
    const tex = this.tex;

    b.box(800, 0.1, 800, 0, -0.05, 0, 0xffffff, 'grass');

    const road = (x0, x1, z0, z1) => {
      b.box(x1 - x0, 0.04, z1 - z0, (x0 + x1) / 2, 0, (z0 + z1) / 2, 0xffffff, 'asphalt');
      this.addSurface({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 }, 'concrete');
    };
    road(-330, 74, -4, 4);
    road(-74, 74, -68, -60);
    road(-74, -66, -68, 4);
    road(66, 74, -330, 330);
    // faded center line on Mill Rd (county road), none on the residential streets
    for (let zz = -320; zz < 320; zz += 6) b.box(0.12, 0.01, 3, 70, 0.025, zz, 0xc8b048);

    const walk = (x0, x1, z0, z1) => {
      b.box(x1 - x0, 0.06, z1 - z0, (x0 + x1) / 2, 0.02, (z0 + z1) / 2, 0xffffff, 'concrete');
      this.addSurface({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 }, 'concrete');
    };
    walk(-78, 66, 5.5, 7.1);
    walk(-64.5, 64.5, -7.1, -5.5);
    walk(-64.5, 64.5, -58.5, -56.9);
    walk(-66, 66, -71.1, -69.5);
    walk(-64.5, -62.9, -58.5, -5.5);
    walk(62.9, 64.5, -58.5, -5.5);

    // houses
    for (const def of HOUSES) {
      const p = placement(def);
      const full = { ...def, ...p, z: p.z };
      const h = buildHouse(b, this, full);
      this.houses[def.id] = h;
      b.clearFrame();
    }

    // curbs with gaps at driveways
    const curbX = (z0, z1, x0, x1) => {
      const gaps = this.driveways.filter((d) => d.minZ <= z1 + 0.5 && d.maxZ >= z0 - 0.5).map((d) => [d.minX, d.maxX]).sort((a, c) => a[0] - c[0]);
      let x = x0;
      for (const [g0, g1] of gaps) {
        if (g1 < x0 || g0 > x1) continue;
        if (g0 > x) b.boxB(g0 - x, 0.12, z1 - z0, (x + g0) / 2, 0, (z0 + z1) / 2, 0xb0aca4, 'concrete');
        x = Math.max(x, g1);
      }
      if (x < x1) b.boxB(x1 - x, 0.12, z1 - z0, (x + x1) / 2, 0, (z0 + z1) / 2, 0xb0aca4, 'concrete');
    };
    curbX(4.0, 4.15, -78, 66);
    curbX(-4.15, -4.0, -66, 66);
    curbX(-60, -59.85, -66, 66);
    curbX(-68.15, -68, -66, 66);
    b.boxB(0.15, 0.12, 56, -65.925, 0, -32, 0xb0aca4, 'concrete');
    b.boxB(0.15, 0.12, 56, 65.925, 0, -32, 0xb0aca4, 'concrete');

    // yard trees
    for (const def of HOUSES) {
      const h = this.houses[def.id];
      const p = placement(def);
      const side = (def.garage || def.drive) === 'left' ? -1 : 1;
      const W = h.toWorld;
      const front = W(-side * (def.w / 2 - 0.5), 0, -def.d / 2 - 5.5);
      buildTree(b, front.x, front.z, r, 'maple');
      this.addCollider({ circle: true, x: front.x, z: front.z, r: 0.3 });
      const back = W((r() - 0.5) * 6, 0, def.d / 2 + 5 + r() * 3);
      buildTree(b, back.x, back.z, r, r() < 0.3 ? 'pine' : 'maple');
      this.addCollider({ circle: true, x: back.x, z: back.z, r: 0.3 });
    }

    // utility poles + streetlights. Each entry: x, z, crossarm axis, lamp direction (toward road) or null.
    const wires = { birch: [], oak: [], pine: [], mill: [] };
    const poles = [
      ['birch', -62, 4.75, 'x', null], ['birch', -55, 4.75, 'x', [0, -1]], ['birch', -38, 4.75, 'x', null], ['birch', -17, 4.75, 'x', [0, -1]],
      ['birch', 1, 4.75, 'x', null], ['birch', 21, 4.75, 'x', [0, -1]], ['birch', 39, 4.75, 'x', null], ['birch', 55, 4.75, 'x', [0, -1]],
      ['mill', 65.25, -6, 'z', null], ['mill', 65.25, -18, 'z', [1, 0]], ['mill', 65.25, -30, 'z', null], ['mill', 65.25, -42, 'z', [1, 0]], ['mill', 65.25, -55, 'z', null],
      ['oak', 56, -59.25, 'x', null], ['oak', 38, -59.25, 'x', [0, -1]], ['oak', 20, -59.25, 'x', null], ['oak', 0, -59.25, 'x', [0, -1]],
      ['oak', -18, -59.25, 'x', null], ['oak', -36, -59.25, 'x', [0, -1]], ['oak', -55, -59.25, 'x', null],
      ['pine', -65.25, -50, 'z', null], ['pine', -65.25, -40, 'z', [-1, 0]], ['pine', -65.25, -26, 'z', null], ['pine', -65.25, -14, 'z', [-1, 0]],
    ];
    this.poles = [];
    for (const [street, px, pz, axis, dir] of poles) {
      const { tops, head } = buildPole(b, px, pz, axis, dir);
      this.addCollider({ circle: true, x: px, z: pz, r: 0.18 });
      wires[street].push(tops);
      const pole = { street, x: px, z: pz, axis };
      this.poles.push(pole);
      if (head) pole.lamp = this._streetLamp(head, px === 65.25 && pz === -42 ? 'mercury' : 'sodium');
    }
    this.lampByName = {
      millDark: this.lamps.find((l) => l.kind === 'street' && Math.abs(l.pos.z + 42) < 0.1),
      millNear: this.lamps.find((l) => l.kind === 'street' && Math.abs(l.pos.z + 18) < 0.1),
    };
    // wires between poles (sagging lines)
    const wireMat = new THREE.LineBasicMaterial({ color: 0x1a1a1a });
    for (const street in wires) {
      const list = wires[street];
      for (let i = 0; i + 1 < list.length; i++) {
        for (let k = 0; k < 2; k++) {
          const a = list[i][k], c = list[i + 1][k], pts = [];
          for (let s = 0; s <= 10; s++) {
            const t = s / 10;
            pts.push(new THREE.Vector3(a.x + (c.x - a.x) * t, a.y + (c.y - a.y) * t - Math.sin(Math.PI * t) * 0.45, a.z + (c.z - a.z) * t));
          }
          this.dynamic.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireMat));
        }
      }
    }

    // terrace trees: birches on Birch Ln, maples elsewhere
    const okSpot = (x, z) => !this.driveways.some((d) => x > d.minX - 1.5 && x < d.maxX + 1.5 && z > d.minZ - 1 && z < d.maxZ + 1) && !this.poles.some((p) => Math.hypot(p.x - x, p.z - z) < 3);
    for (let x = -60; x <= 60; x += 9) {
      for (const [z, kind] of [[4.75, 'birch'], [-4.75, 'birch'], [-59.25, 'maple'], [-68.75, 'maple']]) {
        const xx = x + (r() - 0.5) * 3;
        if (!okSpot(xx, z) || r() < 0.25) continue;
        buildTree(b, xx, z, r, kind);
        this.addCollider({ circle: true, x: xx, z, r: 0.2 });
      }
    }

    // fences: chain-link behind Birch south yards and Oak north yards; farm fence on the west
    const chainA = buildFenceRun(b, -66, 37.5, 66, 37.5, 'chain', this.mats);
    const chainB = buildFenceRun(b, -66, -96.5, 22, -96.5, 'chain', this.mats);
    this.dynamic.add(chainA, chainB);
    buildFenceRun(b, -80, -100, -80, 40, 'farm');

    // stop signs + street names at the corners
    const signMat = (t) => new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const stopMat = signMat(tex.stop);
    const corner = (x, z, faceYaw, a, c) => {
      b.cyl(0.03, 0.03, 2.6, 4, x, 0, z, 0x8a8a8a);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), stopMat);
      s.position.set(x, 2.2, z);
      s.rotation.y = faceYaw;
      this.dynamic.add(s);
      const n1 = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.19), signMat(streetSignTex(a)));
      n1.position.set(x, 2.75, z);
      this.dynamic.add(n1);
      const n2 = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.19), signMat(streetSignTex(c)));
      n2.position.set(x, 2.95, z);
      n2.rotation.y = Math.PI / 2;
      this.dynamic.add(n2);
      this.addCollider({ circle: true, x, z, r: 0.08 });
    };
    corner(-65.2, -5.2, Math.PI, 'BIRCH LN', 'PINE ST');
    corner(65.2, -5.2, Math.PI, 'BIRCH LN', 'MILL RD');
    corner(-65.2, -58.8, 0, 'OAK ST', 'PINE ST');
    corner(65.2, -58.8, 0, 'OAK ST', 'MILL RD');

    // hydrants
    for (const [hx, hz] of [[-44, 4.6], [44, -4.6], [-24, -59.4], [65.3, -24]]) {
      b.cyl(0.13, 0.15, 0.6, 7, hx, 0, hz, 0xd8c020);
      b.cyl(0.16, 0.16, 0.08, 7, hx, 0.6, hz, 0xc03020);
      b.add(new THREE.SphereGeometry(0.11, 6, 4), 0xd8c020, 'flat', hx, 0.72, hz);
      b.cyl(0.05, 0.05, 0.42, 5, hx, 0.42, hz - 0.21, 0xd8c020, 'flat', Math.PI / 2);
      this.addCollider({ circle: true, x: hx, z: hz, r: 0.18 });
    }

    this._yardProps(b, r);
    this._landmarks(b, r);

    // trash cans at a few curbs (you can toss a poop bag in these)
    for (const id of ['richie', 'dorothy', 'b424', 'walt', 'o414', 'b409']) {
      const h = this.houses[id], mb = h.mailbox.local;
      const sideSign = h.def.side === 'BS' || h.def.side === 'OS' ? 1 : -1;
      const p = h.toWorld(mb[0] - 0.9 * Math.sign(mb[0] - h.drive.local || 1), 0, mb[1] + 0.2);
      b.cyl(0.27, 0.24, 0.85, 8, p.x, 0, p.z, 0x8e9294);
      b.cyl(0.3, 0.3, 0.06, 8, p.x, 0.85, p.z, 0x9ea2a4);
      b.cyl(0.06, 0.06, 0.06, 5, p.x, 0.91, p.z, 0x6e7274);
      this.addCollider({ circle: true, x: p.x, z: p.z, r: 0.3 });
      this.cans.push({ pos: new THREE.Vector3(p.x, 0.95, p.z), id, sideSign });
    }

    const statics = b.build(this.mats);
    this.scene.add(statics);

    this._cars();
    this._posters();
    this._corn(r);
    this._woods(r);
    this._smashedMailbox();

    // Named spots the story and audio use.
    const H = this.houses;
    this.spots.sprinkler = new THREE.Vector3(8, 0.3, 12);
    this.spots.mower = new THREE.Vector3(-31, 0.5, -77);
    this.spots.zapper = { pos: H.dorothy.toWorld(-1.4, 2.6, -d2(H.dorothy) - 0.3), active: false };
    this.spots.home = H.richie;
  }

  _streetLamp(head, type) {
    const color = type === 'mercury' ? 0xc8e0ff : 0xffb46a;
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.32), new THREE.MeshBasicMaterial({ color: 0x2a2a2a }));
    lens.position.set(head.x, head.y + 0.05, head.z);
    this.dynamic.add(lens);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    halo.position.set(head.x, head.y - 0.3, head.z);
    halo.scale.set(3.4, 3.4, 1);
    this.dynamic.add(halo);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(13, 13), new THREE.MeshBasicMaterial({ map: this.tex.glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(head.x, 0.075, head.z);
    this.dynamic.add(pool);
    return this.addLight({ pos: new THREE.Vector3(head.x, head.y - 0.1, head.z), kind: 'street', color, power: 70, range: 24, on: false, mesh: lens, halo, pool, mode: type === 'mercury' ? 'flicker' : 'steady' });
  }

  _yardProps(b, r) {
    const H = this.houses;
    // flamingos at 409
    const f = H.b409;
    for (const [lx, lz] of [[-3, -6], [-2.2, -6.6]]) {
      const p = f.toWorld(lx, 0, lz);
      b.cyl(0.008, 0.008, 0.55, 3, p.x, 0, p.z, 0x222222);
      b.box(0.12, 0.14, 0.26, p.x, 0.65, p.z, 0xf27fb0);
      b.box(0.04, 0.22, 0.04, p.x, 0.82, p.z - 0.1, 0xf27fb0);
      b.box(0.05, 0.05, 0.1, p.x, 0.94, p.z - 0.14, 0xf27fb0);
    }
    // kiddie pool + sprinkler at 420
    const k = H.b420;
    const kp = k.toWorld(3, 0, -3);
    b.cyl(1.1, 1.1, 0.25, 12, kp.x, 0, kp.z, 0x3a8ad8);
    b.cyl(1.0, 1.0, 0.22, 12, kp.x, 0.04, kp.z, 0x9ad0e8);
    b.cyl(0.08, 0.1, 0.12, 6, 8, 0, 12, 0x3a3a3a);
    // lawn chairs at 414
    const lc = H.o414;
    for (const lx of [2.5, 3.6]) {
      const p = lc.toWorld(lx, 0, -5.5);
      b.box(0.55, 0.05, 0.5, p.x, 0.38, p.z, 0x2e8a5a);
      b.box(0.55, 0.6, 0.05, p.x, 0.68, p.z + 0.25, 0xe8e8d8, 'flat', -0.25, 0, 0);
      for (const sx of [-0.27, 0.27]) b.box(0.03, 0.4, 0.5, p.x + sx, 0.2, p.z, 0xb8b8b8);
    }
    // flags on porches
    for (const id of ['b413', 'walt']) {
      const h = H[id];
      const base = h.toWorld(h.def.doorX - 1.45, 0.5, -h.def.d / 2 - 1.75);
      b.cyl(0.02, 0.02, 2.4, 4, base.x, 0.5, base.z, 0xd8d8d8, 'flat', 0.5 * (h.def.side === 'BN' ? -1 : 1), 0, 0);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshLambertMaterial({ map: flagTex(h.def.flag), side: THREE.DoubleSide }));
      const dir = h.def.side === 'BN' ? 1 : -1;
      flag.position.set(base.x + 0.45, 2.45, base.z + dir * 0.65);
      flag.rotation.set(0, 0, 0);
      this.dynamic.add(flag);
    }
    // SOLD sign at the Lindqvist place
    const ls = H.lindqvist.toWorld(-3.5, 0, -7);
    b.boxB(0.06, 1.3, 0.06, ls.x - 0.35, 0, ls.z, 0xf0f0f0);
    b.boxB(0.06, 1.3, 0.06, ls.x + 0.35, 0, ls.z, 0xf0f0f0);
    b.box(0.9, 0.05, 0.05, ls.x, 1.28, ls.z, 0xf0f0f0);
    const sold = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.52), new THREE.MeshLambertMaterial({ map: this.tex.sold, side: THREE.DoubleSide }));
    sold.position.set(ls.x, 0.92, ls.z);
    this.dynamic.add(sold);
    this.addCollider({ circle: true, x: ls.x, z: ls.z, r: 0.3 });
  }

  _landmarks(b, r) {
    // water tower to the west
    const wx = -165, wz = -30;
    for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) b.cyl(0.25, 0.3, 26, 5, wx + dx, 0, wz + dz, 0x9aa2a6, 'flat');
    b.cyl(7, 7, 7, 14, wx, 26, wz, 0xc9d4d8);
    b.add(new THREE.ConeGeometry(7.4, 3, 14), 0xb9c4c8, 'flat', wx, 34.5, wz);
    b.add(new THREE.SphereGeometry(7, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0xc9d4d8, 'flat', wx, 26, wz);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(7.05, 7.05, 2.4, 20, 1, true), new THREE.MeshLambertMaterial({ map: this.tex.waterTower }));
    band.position.set(wx, 30.5, wz);
    band.rotation.y = Math.PI / 2;
    this.dynamic.add(band);
    this.spots.beacon = new THREE.Vector3(wx, 36.4, wz);
    // red barn + silo, far west
    const bx = -200, bz = 30;
    b.boxB(14, 7, 22, bx, 0, bz, 0x8e2a22);
    b.add(gableGeo(22.5, 14.4, 5), 0x5a5050, 'flat', bx, 7, bz, 0, Math.PI / 2, 0);
    b.box(4.5, 5, 0.1, bx + 7.05, 2.5, bz, 0xf0e8d8, 'flat', 0, Math.PI / 2, 0);
    b.cyl(3, 3, 18, 12, bx - 2, 0, bz - 16, 0xa8a8a0);
    b.add(new THREE.SphereGeometry(3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x8a8a86, 'flat', bx - 2, 18, bz - 16);
    // a few far fields' trees to the west
    for (let i = 0; i < 18; i++) buildTree(b, -120 - r() * 120, -120 + r() * 220, r, 'maple');
  }

  _cars() {
    for (const def of HOUSES) {
      if (!def.car) continue;
      const h = this.houses[def.id];
      const lz = -def.d / 2 - 4.2;
      const p = h.toWorld(h.drive.local, 0, lz);
      buildCar(this, def.car[0], def.car[1], { x: p.x, z: p.z, yaw: h.facing + Math.PI });
    }
    // Walt's pickup sits in his driveway; Richie's sedan is built separately (it drives in)
    const w = this.houses.walt;
    const wp = w.toWorld(w.drive.local, 0, -w.def.d / 2 - 4.4);
    this.waltTruck = buildCar(this, 'pickup', 0x3a4a5a, { x: wp.x, z: wp.z, yaw: w.facing + Math.PI });
    this.waltTruckPos = wp;
    // a moving truck parked on Birch for the Lindqvists (day only)
    const tb = new Builder();
    tb.boxB(2.4, 2.6, 5.0, 0, 0.6, 0.6, 0xefe9dc);
    tb.boxB(2.2, 1.7, 1.8, 0, 0.4, -2.6, 0xd0601e);
    tb.box(2.0, 0.7, 0.05, 0, 1.75, -3.5, 0x26323c);
    for (const sx of [-1, 1]) for (const sz of [-2.4, 1.0, 2.2]) tb.add(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 10), 0x161616, 'flat', sx * 1.05, 0.42, sz, 0, 0, Math.PI / 2);
    const truck = tb.build({ flat: this.mats.flat });
    for (const s of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.7), new THREE.MeshLambertMaterial({ map: this.tex.truck }));
      side.position.set(s * 1.21, 2.0, 0.6);
      side.rotation.y = s * Math.PI / 2;
      truck.add(side);
    }
    truck.position.set(37.5, 0, -2.4);
    truck.rotation.y = Math.PI / 2;
    this.dynamic.add(truck);
    this.truck = { group: truck, collider: this.addCollider({ minX: 34, maxX: 41.5, minZ: -3.7, maxZ: -1.1, vehicle: true }) };
    this.dayOnly.push(truck);
  }

  _posters() {
    const defs = [
      { pole: [-17, 4.75], face: 1, title: 'LOST DOG', name: 'BUTTONS', short: ['Beagle, 6 yrs', 'Red collar'], phone: '555-0143',
        html: '<h3>LOST DOG</h3><div class="photo"></div><div class="name">"BUTTONS"</div><p>Beagle, 6 years old. Red collar. Very friendly, scared of thunder.</p><p>Last seen June 9 by Birch Ln.</p><div class="phone">CALL 555-0143 — Pruitt</div>',
        line: 'Buttons. Poor thing.' },
      { pole: [39, 4.75], face: 1, title: 'MISSING', name: 'DUKE', short: ['Black Lab', 'REWARD'], phone: '555-0167',
        html: '<h3>MISSING</h3><div class="photo"></div><div class="name">"DUKE"</div><p>Black Labrador. 9 years. Gray muzzle. Answers to Duke or Dukie.</p><p>REWARD. No questions asked.</p><div class="phone">555-0167</div>',
        line: "Reward. No questions asked. That's... specific." },
      { pole: [0, -59.25], face: 1, title: 'LOST CAT', name: 'SMOKEY', short: ['Gray, indoor cat'], phone: '555-0122', cat: true,
        html: '<h3>LOST CAT</h3><div class="photo"></div><div class="name">"SMOKEY"</div><p>Gray. Indoor cat. Has never been outside before.</p><p>Last seen June 14.</p><div class="phone">555-0122</div>',
        line: "Indoor cat. So how'd it get out?" },
      { pole: [65.25, -30], face: -1, axisX: true, title: 'LOST DOG', name: 'PEPPER', short: ['Terrier mix', 'June 2'], phone: '555-0190',
        html: '<h3>LOST DOG</h3><div class="photo"></div><div class="name">"PEPPER"</div><p>Terrier mix, white with black spots. Very friendly.</p><p>Got out June 2. Please check garages + sheds.</p><div class="phone">555-0190</div>',
        line: 'June second. That was weeks ago.' },
      { pole: [-38, 4.75], face: 1, title: 'HAVE YOU SEEN ME?', name: 'RUFUS', short: ['Golden mix', 'JUNE 17'], phone: '555-0131', night: true, paper: '#f6f2c8',
        html: '<h3>HAVE YOU SEEN ME?</h3><div class="photo"></div><div class="name">"RUFUS"</div><p>Golden retriever mix. 2 years old. Blue collar.</p><p>Got out tonight, June 17. Please call ANY time.</p><div class="phone">555-0131</div>',
        line: "June seventeenth. That's... today. Tonight." },
    ];
    for (const d of defs) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.55), new THREE.MeshLambertMaterial({ map: posterTex(d), side: THREE.DoubleSide }));
      const [px, pz] = d.pole;
      if (d.axisX) { m.position.set(px + d.face * 0.17, 1.55, pz); m.rotation.y = d.face * Math.PI / 2; }
      else { m.position.set(px, 1.55, pz + d.face * 0.17); m.rotation.y = d.face > 0 ? 0 : Math.PI; }
      m.rotation.z = (Math.random() - 0.5) * 0.08;
      this.dynamic.add(m);
      const poster = { ...d, mesh: m, pos: m.position.clone() };
      if (d.night) { m.visible = false; this.nightOnly.push(m); }
      this.posters.push(poster);
    }
  }

  _corn(r) {
    const cb = new Builder();
    // a stalk is a thin post plus two crossed leaf blades (cheap: ~28 triangles)
    cb.boxB(0.05, 2.3, 0.05, 0, 0, 0, 0x6a7a3a);
    const leaf = (a, y) => {
      const g = new THREE.PlaneGeometry(0.75, 0.1);
      g.rotateZ(-0.35);
      cb.add(g, 0x5a7a32, 'flat', Math.cos(a) * 0.3, y, Math.sin(a) * 0.3, 0, -a, 0);
    };
    leaf(0, 0.9);
    leaf(2.1, 1.35);
    leaf(4.2, 1.8);
    cb.add(new THREE.ConeGeometry(0.04, 0.35, 4), 0xb8a050, 'flat', 0, 2.45, 0);
    const geo = cb.build({ flat: this.mats.flat }).children[0].geometry;
    const xs = [];
    for (let z = -101; z > -140; z -= 1.45) for (let x = -112; x < 112; x += 1.35) xs.push([x + (r() - 0.5) * 0.4, z + (r() - 0.5) * 0.3]);
    const im = new THREE.InstancedMesh(geo, this.mats.flat, xs.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    xs.forEach(([x, z], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
      const sc = 0.85 + r() * 0.3;
      im.setMatrixAt(i, m.compose(p.set(x, 0, z), q, s.set(sc, sc, sc)));
      im.setColorAt(i, c.setScalar(0.85 + r() * 0.3));
    });
    im.receiveShadow = true;
    this.cornMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    im.material = this.cornMat;
    this.scene.add(im);
  }

  _woods(r) {
    const pb = new Builder();
    buildTree(pb, 0, 0, () => 0.5, 'pine');
    const pine = pb.build({ flat: this.mats.flat }).children[0].geometry;
    const db = new Builder();
    db.cyl(0.2, 0.28, 4, 6, 0, 0, 0, 0x4a3828);
    db.blob(2.2, 0, 5.2, 0, 0x3a5e2a, 1, 0.9, 1);
    db.blob(1.8, 1.2, 4.6, 0.6, 0x34562a, 1, 0.9, 1);
    db.blob(1.7, -1.0, 4.4, -0.7, 0x426a30, 1, 0.9, 1);
    const decid = db.build({ flat: this.mats.flat }).children[0].geometry;
    const spots = { pine: [], decid: [] };
    // east woods (behind Mill Rd) - dense
    for (let i = 0; i < 520; i++) {
      const x = 79 + Math.pow(r(), 0.8) * 90, z = -170 + r() * 260;
      (r() < 0.65 ? spots.pine : spots.decid).push([x, z]);
    }
    // a wooded strip behind the Birch Ln south yards
    for (let i = 0; i < 140; i++) spots[r() < 0.4 ? 'pine' : 'decid'].push([-80 + r() * 150, 41 + r() * 40]);
    // north beyond the corn
    for (let i = 0; i < 90; i++) spots[r() < 0.5 ? 'pine' : 'decid'].push([-130 + r() * 260, -146 - r() * 30]);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    for (const [key, geo] of [['pine', pine], ['decid', decid]]) {
      const list = spots[key];
      const im = new THREE.InstancedMesh(geo, this.mats.flat, list.length);
      list.forEach(([x, z], i) => {
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.28);
        const sc = 0.8 + r() * 0.8;
        im.setMatrixAt(i, m.compose(p.set(x, 0, z), q, s.set(sc, sc * (0.9 + r() * 0.3), sc)));
        im.setColorAt(i, c.setScalar(0.7 + r() * 0.4));
      });
      im.receiveShadow = true;
      this.scene.add(im);
    }
    // the first row of trees along Mill Rd blocks the player
    this.woodsEdge = 78.5;
  }

  _smashedMailbox() {
    const h = this.houses.b428;
    const [mx, mz] = h.mailbox.local;
    const sb = new Builder();
    sb.setFrame(h.def.x, h.toWorld(0, 0, 0).z, h.def.yaw || 0);
    buildMailbox(sb, mx, mz, 0x2a2a2a, true);
    // scattered mail
    for (let i = 0; i < 7; i++) sb.box(0.22, 0.005, 0.11, mx + (Math.random() - 0.5) * 2.2, 0.03, mz + (Math.random() - 0.5) * 1.8, 0xf2efe6, 'flat', 0, Math.random() * 3, 0);
    const smashed = sb.build({ flat: this.mats.flat });
    smashed.visible = false;
    this.dynamic.add(smashed);
    this.nightOnly.push(smashed);
    // hide the intact one at night by covering: build a separate intact copy we can toggle
    const ib = new Builder();
    ib.setFrame(h.def.x, h.toWorld(0, 0, 0).z, 0);
    buildMailbox(ib, mx, mz, 0x2a2a2a);
    const intact = ib.build({ flat: this.mats.flat });
    this.dynamic.add(intact);
    this.dayOnly.push(intact);
    this.spots.smashedMailbox = h.mailbox.pos.clone();
  }

  setNight(night) {
    for (const o of this.nightOnly) o.visible = night;
    for (const o of this.dayOnly) o.visible = !night;
    if (this.truck) this.truck.collider.disabled = night;
  }
}

function d2(h) { return h.def.d / 2; }

function flagTex(kind) {
  return canvasTex(36, 22, (x, w, h) => {
    if (kind === 'usa') {
      for (let i = 0; i < 7; i++) { x.fillStyle = i % 2 ? '#f2f2f2' : '#b22234'; x.fillRect(0, (i * h) / 7, w, h / 7 + 1); }
      x.fillStyle = '#3c3b6e'; x.fillRect(0, 0, 15, 12);
      x.fillStyle = '#fff';
      for (let i = 0; i < 12; i++) x.fillRect(2 + (i % 4) * 3, 2 + Math.floor(i / 4) * 3, 1, 1);
    } else {
      x.fillStyle = '#203731'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#ffb612'; x.fillRect(0, 8, w, 6);
    }
  }, { repeat: false });
}

function inBox(p, c, pad) { return p.x > c.minX - pad && p.x < c.maxX + pad && p.z > c.minZ - pad && p.z < c.maxZ + pad; }

// Does the segment p→q cross the box grown by `pad`? (2D slab test)
function segHitsBox(p, q, c, pad) {
  let t0 = 0, t1 = 1;
  for (const [o, d, lo, hi] of [[p.x, q.x - p.x, c.minX - pad, c.maxX + pad], [p.z, q.z - p.z, c.minZ - pad, c.maxZ + pad]]) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; continue; }
    let a = (lo - o) / d, b = (hi - o) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}
