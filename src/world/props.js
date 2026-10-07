import * as THREE from 'three';
import { Builder, gableGeo, shade } from './builder.js';

// Builders for houses, cars and street furniture. Everything faces local -z ("front").
// Static pieces go into the shared Builder; moving pieces (doors, windows, bulbs) are
// real meshes so the story can animate or relight them.

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- houses

export function buildHouse(b, world, def) {
  const {
    x, z, yaw, w, d, stories = 1, color, trim = 0xf0eee6, roof = 0x55504a, doorColor = 0x7a2a22,
    shutter = null, doorX = 0, porch = true, garage = null, drive = 'right', chimney = false,
    sidewalkDist, curbDist, interior = 'none', flowers = false,
  } = def;
  const M = world.mats;
  b.setFrame(x, z, yaw);
  const frame = b.frame.clone();
  const W = (lx, ly, lz) => V(lx, ly, lz).applyMatrix4(frame);
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  grp.rotation.y = yaw;
  world.dynamic.add(grp);

  const F = 0.5, H = stories === 2 ? 5.3 : 2.75, t = 0.18, fz = -d / 2, dw = 1.0, dh = 2.1;
  const house = { def, id: def.id, group: grp, frame, windows: [], F, toWorld: W, front: fz };

  // foundation + hollow walls (front wall is cut around the door)
  b.box(w + 0.12, F, d + 0.12, 0, F / 2, 0, 0x8d8a84, 'concrete');
  b.box(w, H, t, 0, F + H / 2, d / 2 - t / 2, color, 'siding');
  b.box(t, H, d, -w / 2 + t / 2, F + H / 2, 0, color, 'siding');
  b.box(t, H, d, w / 2 - t / 2, F + H / 2, 0, color, 'siding');
  const L = doorX - dw / 2 + w / 2, R = w / 2 - (doorX + dw / 2);
  b.box(L, H, t, -w / 2 + L / 2, F + H / 2, fz + t / 2, color, 'siding');
  b.box(R, H, t, doorX + dw / 2 + R / 2, F + H / 2, fz + t / 2, color, 'siding');
  b.box(dw, H - dh, t, doorX, F + dh + (H - dh) / 2, fz + t / 2, color, 'siding');
  b.box(w, 0.1, d, 0, F + H + 0.05, 0, shade(color, 0.6));
  // trim corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.boxB(0.14, H, 0.14, sx * (w / 2 + 0.01), F, sz * (d / 2 + 0.01), trim);

  // roof: siding-colored gable, two shingle slabs, ridge cap
  const rh = stories === 2 ? 2.0 : 1.6, hd = d / 2, o = 0.45, L0 = Math.hypot(hd, rh), a = Math.atan2(rh, hd);
  b.add(gableGeo(w, d, rh), color, 'siding', 0, F + H, 0);
  for (const s of [-1, 1]) {
    const cz = s * (hd / 2 + (hd / L0) * (o / 2) + (rh / L0) * 0.06);
    const cy = F + H + rh / 2 - (rh / L0) * (o / 2) + (hd / L0) * 0.06;
    b.box(w + 0.7, 0.12, L0 + o, 0, cy, cz, roof, 'shingle', s * a, 0, 0);
  }
  b.box(w + 0.75, 0.1, 0.28, 0, F + H + rh + 0.06, 0, shade(roof, 0.8));
  if (chimney) b.boxB(0.8, H + rh + 1.0, 0.8, -w / 2 + 1.0, 0, d / 4, 0xb0a090, 'brick');

  // door frame + door (pivot at hinge, opens inward toward +z)
  b.box(0.1, dh + 0.1, 0.06, doorX - dw / 2 - 0.05, F + dh / 2, fz - 0.03, trim);
  b.box(0.1, dh + 0.1, 0.06, doorX + dw / 2 + 0.05, F + dh / 2, fz - 0.03, trim);
  b.box(dw + 0.3, 0.12, 0.07, doorX, F + dh + 0.06, fz - 0.03, trim);
  const pivot = new THREE.Group();
  pivot.position.set(doorX - dw / 2, F, fz + t / 2);
  grp.add(pivot);
  // the door is one merged mesh: slab, raised panels, knobs, deadbolt
  const db = new Builder();
  db.box(dw - 0.02, dh - 0.01, 0.05, dw / 2, dh / 2, 0, doorColor);
  for (const [px, py] of [[0.27, 0.55], [0.73, 0.55], [0.27, 1.45], [0.73, 1.45]]) db.box(0.3, 0.6, 0.02, px * dw, py, -0.03, shade(doorColor, 1.18));
  for (const sz of [-1, 1]) {
    db.add(new THREE.SphereGeometry(0.03, 6, 4), 0xc8a040, 'flat', dw - 0.1, 0.98, sz * 0.05);
    db.box(0.05, 0.05, 0.02, dw - 0.1, 1.18, sz * 0.035, 0xc8a040);
  }
  pivot.add(db.build({ flat: world.mats.door }));
  house.door = { pivot, open: 0, width: dw };
  house.doorWorld = W(doorX, F, fz);
  house.facing = yaw; // yaw of someone walking out the front door
  house.knockSpot = W(doorX + 0.1, F, fz - 0.62);
  house.insideSpot = W(doorX, F, fz + 1.4);
  house.knobWorld = W(doorX + dw / 2 - 0.1, F + 0.98, fz - 0.06);
  house.boltWorldInside = W(doorX + dw / 2 - 0.1, F + 1.18, fz + 0.2);

  // windows
  const winY = [F + 1.45];
  if (stories === 2) winY.push(F + 4.05);
  const frontXs = [];
  for (const wx of [-w / 2 + 1.5, -w / 2 + 3.4, w / 2 - 3.4, w / 2 - 1.5]) if (Math.abs(wx - doorX) > 1.4) frontXs.push(wx);
  const addWindow = (wx, wy, face, floor) => {
    // face: 'front' (normal -z), 'left' (-x), 'right' (+x)
    const n = face === 'front' ? [0, -1] : face === 'left' ? [-1, 0] : [1, 0];
    const ry = face === 'front' ? 0 : Math.PI / 2;
    const px = face === 'front' ? wx : n[0] * w / 2, pz = face === 'front' ? fz : wx;
    const off = (k) => [px + n[0] * k, pz + n[1] * k];
    let [ox, oz] = off(0.03);
    b.box(1.25, 1.45, 0.06, ox, wy, oz, trim, 'flat', 0, ry, 0);
    [ox, oz] = off(0.08);
    b.box(0.05, 1.22, 0.03, ox, wy, oz, trim, 'flat', 0, ry, 0);
    b.box(1.04, 0.05, 0.03, ox, wy, oz, trim, 'flat', 0, ry, 0);
    [ox, oz] = off(0.08);
    b.box(1.4, 0.07, 0.14, ox, wy - 0.76, oz, trim, 'flat', 0, ry, 0);
    if (shutter) {
      const tx = face === 'front' ? [1, 0] : [0, 1];
      for (const s of [-1, 1]) {
        [ox, oz] = off(0.04);
        b.box(0.4, 1.45, 0.05, ox + tx[0] * s * 0.85, wy, oz + tx[1] * s * 0.85, shutter, 'flat', 0, ry, 0);
      }
    }
    const glass = new THREE.Mesh(world.geo.window, world.mats.glassDay);
    [ox, oz] = off(0.065);
    glass.position.set(ox, wy, oz);
    glass.rotation.y = face === 'front' ? Math.PI : face === 'left' ? -Math.PI / 2 : Math.PI / 2;
    grp.add(glass);
    house.windows.push({ mesh: glass, floor, face, pos: W(ox, wy, oz) });
  };
  winY.forEach((wy, fl) => {
    for (const wx of frontXs) addWindow(wx, wy, 'front', fl);
    if (fl === 1) addWindow(doorX, wy, 'front', fl);
    if (garage !== 'left') addWindow(0, wy, 'left', fl);
    if (garage !== 'right') addWindow(0, wy, 'right', fl);
  });

  // porch, steps, posts, porch roof, porch light
  const pw = 3.2, pd = 1.9;
  let stepsBottom = fz;
  if (porch) {
    b.box(pw, F, pd, doorX, F / 2, fz - pd / 2, 0x8f949a, 'wood');
    b.boxB(1.5, (F * 2) / 3, 0.3, doorX, 0, fz - pd - 0.15, 0x9a9690, 'concrete');
    b.boxB(1.5, F / 3, 0.3, doorX, 0, fz - pd - 0.45, 0x9a9690, 'concrete');
    for (const s of [-1, 1]) b.boxB(0.12, 2.6, 0.12, doorX + s * (pw / 2 - 0.1), F, fz - pd + 0.1, trim);
    b.box(pw + 0.3, 0.12, pd + 0.25, doorX, F + 2.66, fz - pd / 2, shade(roof, 0.9), 'shingle');
    stepsBottom = fz - pd - 0.6;
    world.addPlatform({ minX: 0, maxX: 0, minZ: 0, maxZ: 0, box: worldRect(frame, doorX - pw / 2, doorX + pw / 2, fz - pd, fz + 0.2), h: F });
    const lowW = W(doorX, 0, fz - pd - 0.6), highW = W(doorX, 0, fz - pd);
    world.addPlatform({ box: worldRect(frame, doorX - 0.75, doorX + 0.75, fz - pd - 0.6, fz - pd), ramp: { low: lowW, high: highW, h: F } });
    world.addSurface(worldRect(frame, doorX - pw / 2, doorX + pw / 2, fz - pd, fz + 0.2), 'wood');
    for (const s of [-1, 1]) world.addCollider({ circle: true, x: W(doorX + s * (pw / 2 - 0.1), 0, 0).x, z: W(0, 0, fz - pd + 0.1).z, r: 0.12 });
  } else {
    b.boxB(1.4, F, 0.6, doorX, 0, fz - 0.3, 0x9a9690, 'concrete');
    stepsBottom = fz - 0.6;
    world.addPlatform({ box: worldRect(frame, doorX - 0.7, doorX + 0.7, fz - 0.6, fz + 0.2), h: F });
  }
  // porch light: wall plate + socket + bulb
  const fix = new THREE.Group();
  fix.position.set(doorX + dw / 2 + 0.36, F + 1.95, fz - 0.02);
  grp.add(fix);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.03), world.mats.black);
  plate.position.z = -0.015;
  fix.add(plate);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.1), world.mats.black);
  arm.position.set(0, 0.04, -0.06);
  fix.add(arm);
  const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.07, 6), world.mats.black);
  sock.position.set(0, 0.0, -0.1);
  fix.add(sock);
  const bulbHolder = new THREE.Group();
  bulbHolder.position.set(0, -0.07, -0.1);
  fix.add(bulbHolder);
  const bulb = new THREE.Mesh(world.geo.bulb, world.mats.bulbOff);
  bulb.scale.y = 1.2;
  bulbHolder.add(bulb);
  house.porchLight = { group: fix, holder: bulbHolder, bulb, pos: W(doorX + dw / 2 + 0.36, F + 1.88, fz - 0.12), on: false };
  house.porchLight.source = world.addLight({ pos: house.porchLight.pos, kind: 'porch', color: 0xffd9a0, power: 6, range: 9, on: false, mesh: bulb });

  // walkway, driveway, garage
  b.boxB(1.1, 0.04, sidewalkDist - (fz - stepsBottom) + 0.05, doorX, 0, stepsBottom - (sidewalkDist - (fz - stepsBottom)) / 2, 0xffffff, 'concrete');
  world.addSurface(worldRect(frame, doorX - 0.55, doorX + 0.55, fz - sidewalkDist, stepsBottom), 'concrete');
  const side = (garage || drive) === 'left' ? -1 : 1;
  let gx;
  if (garage) {
    const gw = 3.6, gd = 6.0;
    gx = side * (w / 2 + gw / 2);
    const gz = fz + 0.5 + gd / 2;
    b.box(gw, 2.6, gd, gx, 1.3, gz, color, 'siding');
    b.add(gableGeo(gd + 0.6, gw + 0.5, 1.05), roof, 'shingle', gx, 2.6, gz, 0, Math.PI / 2, 0);
    b.box(2.8, 2.15, 0.06, gx, 1.075, fz + 0.47, 0xffffff, 'garage');
    b.box(3.1, 0.12, 0.08, gx, 2.2, fz + 0.46, trim);
    if (def.hoop) {
      b.box(1.2, 0.8, 0.05, gx, 3.4, fz + 0.4, 0xf4f4f4);
      b.add(new THREE.TorusGeometry(0.23, 0.015, 4, 12), 0xd5541e, 'flat', gx, 3.05, fz + 0.15, Math.PI / 2, 0, 0);
    }
    const g0 = W(gx - gw / 2, 0, fz + 0.5), g1 = W(gx + gw / 2, 0, fz + 0.5 + gd);
    world.addCollider(rectFrom(g0, g1));
  } else {
    gx = side * (w / 2 + 2.6);
  }
  const dStart = garage ? fz + 0.5 : fz + 4.5;
  const dLen = dStart - (fz - curbDist);
  b.boxB(3.2, 0.03, dLen, gx, 0, dStart - dLen / 2, 0xffffff, 'concrete');
  house.drive = { rect: worldRect(frame, gx - 1.6, gx + 1.6, fz - curbDist, dStart), x: W(gx, 0, 0).x, local: gx };
  world.addSurface(house.drive.rect, 'concrete');
  world.driveways.push(house.drive.rect);

  // mailbox on the terrace beside the driveway
  const mbx = gx + side * 2.2, mbz = fz - curbDist + 0.6;
  house.mailbox = { pos: W(mbx, 0, mbz), local: [mbx, mbz] };
  if (!def.noMailbox) buildMailbox(b, mbx, mbz, def.mailboxColor || 0x2a2a2a);
  world.addCollider({ circle: true, x: house.mailbox.pos.x, z: house.mailbox.pos.z, r: 0.15 });

  // shrubs + flowers
  for (const bx of [-w / 2 + 0.8, -w / 2 + 2.4, w / 2 - 2.4, w / 2 - 0.8]) {
    if (Math.abs(bx - doorX) < 2.0) continue;
    if (flowers) continue;
    b.blob(0.55, bx, 0.4, fz - 0.55, 0x3d5a2a, 1.2, 0.8, 0.9);
  }
  if (flowers) {
    b.boxB(w - 0.4, 0.08, 1.1, 0, 0, fz - 0.7, 0xffffff, 'dirt');
    const cols = [0xd8344a, 0xf2c12e, 0xf27fb0, 0xffffff, 0x8a5ad8, 0xff8a2a];
    for (let i = 0; i < 46; i++) {
      const fx = -w / 2 + 0.4 + (i / 45) * (w - 0.8);
      if (Math.abs(fx - doorX) < 1.0) continue;
      const fzz = fz - 0.35 - ((i * 7) % 5) * 0.16;
      b.boxB(0.03, 0.28, 0.03, fx, 0.08, fzz, 0x3a6a2a);
      b.box(0.11, 0.08, 0.11, fx, 0.4, fzz, cols[i % cols.length]);
    }
  }

  // hallway set behind the door
  if (interior !== 'none') {
    const hz = fz + t, len = 3.2, wx = 0.9;
    const wallMat = interior === 'richie' ? 'wallpaper' : 'flat';
    const wallCol = interior === 'richie' ? 0xffffff : interior === 'dark' ? 0x1a1814 : 0x8a7a62;
    b.boxB(wx * 2, 0.02, len, doorX, F, hz + len / 2, interior === 'dark' ? 0x14110e : 0x6b4a30, 'wood');
    b.box(0.08, 2.5, len, doorX - wx, F + 1.25, hz + len / 2, wallCol, wallMat);
    b.box(0.08, 2.5, len, doorX + wx, F + 1.25, hz + len / 2, wallCol, wallMat);
    b.box(wx * 2, 2.5, 0.08, doorX, F + 1.25, hz + len, wallCol, wallMat);
    b.box(wx * 2, 0.06, len, doorX, F + 2.5, hz + len / 2, 0xd8d2c4);
    house.hall = { z0: hz, len, wx };
    world.addPlatform({ box: worldRect(frame, doorX - wx, doorX + wx, hz - 0.2, hz + len), h: F });
  }

  // collider for the house body
  const c0 = W(-w / 2 - 0.1, 0, -d / 2 - 0.1), c1 = W(w / 2 + 0.1, 0, d / 2 + 0.1);
  house.collider = world.addCollider(rectFrom(c0, c1));
  return house;
}

function rectFrom(a, b) {
  return { minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
}

// Local-space rectangle -> world-space AABB (houses only rotate by 0 or pi).
export function worldRect(frame, x0, x1, z0, z1) {
  const a = V(x0, 0, z0).applyMatrix4(frame), b = V(x1, 0, z1).applyMatrix4(frame);
  return rectFrom(a, b);
}

export function buildMailbox(b, x, z, color, smashed = false) {
  if (smashed) {
    b.boxB(0.09, 0.55, 0.09, x, 0, z, 0x6b5238);
    b.box(0.09, 0.55, 0.09, x + 0.25, 0.08, z + 0.1, 0x6b5238, 'flat', 0, 0.4, 1.45);
    b.box(0.22, 0.2, 0.46, x - 0.4, 0.1, z + 0.35, color, 'flat', 0.3, 0.9, 0.2);
    return;
  }
  b.boxB(0.09, 1.0, 0.09, x, 0, z, 0x6b5238);
  b.box(0.22, 0.2, 0.46, x, 1.1, z, color);
  b.add(new THREE.CylinderGeometry(0.11, 0.11, 0.46, 8, 1, false, 0, Math.PI), color, 'flat', x, 1.2, z, Math.PI / 2, 0, Math.PI / 2);
  b.box(0.02, 0.16, 0.05, x + 0.12, 1.22, z + 0.12, 0xc0202a);
}

// ---------------------------------------------------------------- vehicles

const CAR_TYPES = {
  sedan: { L: 4.7, W: 1.76, cab: [-0.6, 1.4], cabTop: 1.38, trunk: 0.92 },
  wagon: { L: 5.0, W: 1.8, cab: [-0.6, 2.3], cabTop: 1.42, trunk: 0.95 },
  minivan: { L: 4.8, W: 1.82, cab: [-1.3, 2.3], cabTop: 1.68, trunk: 1.0 },
  pickup: { L: 5.2, W: 1.85, cab: [-0.7, 0.5], cabTop: 1.62, trunk: 1.0 },
};

// Simple parked car: one merged mesh.
export function buildCar(world, type, color, opts = {}) {
  const T = CAR_TYPES[type];
  const b = new Builder();
  const { L, W } = T;
  const glass = 0x26323c;
  b.boxB(W, 0.55, L, 0, 0.3, 0, color);
  b.box(W + 0.04, 0.14, 0.12, 0, 0.42, -L / 2 - 0.02, 0x9a9a98);
  b.box(W + 0.04, 0.14, 0.12, 0, 0.42, L / 2 + 0.02, 0x9a9a98);
  for (const s of [-1, 1]) {
    b.box(0.34, 0.12, 0.04, s * (W / 2 - 0.3), 0.7, -L / 2 - 0.01, 0xf2ead0);
    b.box(0.3, 0.12, 0.04, s * (W / 2 - 0.3), 0.72, L / 2 + 0.01, 0x9a1d1d);
  }
  b.box(0.6, 0.18, 0.03, 0, 0.66, -L / 2 - 0.01, 0x2a2a2a);
  const [c0, c1] = T.cab;
  const top = T.cabTop;
  b.boxB(W - 0.1, top - 0.85, c1 - c0, 0, 0.85, (c0 + c1) / 2, glass);
  b.box(W - 0.06, 0.06, c1 - c0 + 0.04, 0, top, (c0 + c1) / 2, color);
  for (const s of [-1, 1]) b.boxB(0.06, top - 0.85, 0.1, s * (W / 2 - 0.06), 0.85, (c0 + c1) / 2, color);
  if (type === 'wagon') for (const s of [-1, 1]) b.box(0.02, 0.28, L - 1.2, s * (W / 2 + 0.005), 0.58, 0.2, 0x6a4424);
  if (type === 'pickup') {
    b.boxB(W, 0.55, 2.2, 0, 0.85, 1.4, color);
    b.boxB(W - 0.2, 0.5, 2.0, 0, 0.9, 1.4, 0x1e1e1e);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.add(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 10), 0x161616, 'flat', sx * (W / 2 - 0.12), 0.33, sz * (L / 2 - 0.9), 0, 0, Math.PI / 2);
    b.add(new THREE.CylinderGeometry(0.18, 0.18, 0.23, 8), 0xa8a8a8, 'flat', sx * (W / 2 - 0.12), 0.33, sz * (L / 2 - 0.9), 0, 0, Math.PI / 2);
  }
  const g = b.build({ flat: world.mats.flat });
  if (opts.x !== undefined) {
    g.position.set(opts.x, 0, opts.z);
    g.rotation.y = opts.yaw || 0;
    world.dynamic.add(g);
    const c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y);
    const hx = Math.abs(c) * W / 2 + Math.abs(s) * L / 2, hz = Math.abs(s) * W / 2 + Math.abs(c) * L / 2;
    world.addCollider({ minX: opts.x - hx, maxX: opts.x + hx, minZ: opts.z - hz, maxZ: opts.z + hz });
  }
  return g;
}

// Richie's 1984 sedan: hollow body, interior, opening front doors, steering wheel, key.
export function buildRichieCar(world, tex) {
  const M = world.mats;
  const color = 0x6a4a32, tan = 0xc2a882, dark = 0x2a2420;
  const L = 4.7, W = 1.76;
  const b = new Builder({ velour: 0.5 });
  const root = new THREE.Group();
  // floor, engine bay, trunk, rear quarter sides
  b.boxB(W - 0.1, 0.12, 2.4, 0, 0.3, 0.55, dark);
  b.boxB(W, 0.58, 1.75, 0, 0.3, -L / 2 + 0.875, color);
  b.boxB(W, 0.62, 0.7, 0, 0.3, L / 2 - 0.35, color);
  for (const s of [-1, 1]) b.boxB(0.08, 0.58, 0.85, s * (W / 2 - 0.04), 0.3, 1.27, color);
  b.box(W - 0.12, 0.06, 1.62, 0, 0.9, -L / 2 + 0.85, color, 'flat', 0.04, 0, 0);
  // bumpers, lights, grille
  b.box(W + 0.05, 0.15, 0.13, 0, 0.43, -L / 2 - 0.02, 0xa8a8a6);
  b.box(W + 0.05, 0.15, 0.13, 0, 0.43, L / 2 + 0.02, 0xa8a8a6);
  for (const s of [-1, 1]) {
    b.box(0.36, 0.13, 0.04, s * (W / 2 - 0.3), 0.7, -L / 2 - 0.01, 0xf2ead0);
    b.box(0.34, 0.12, 0.04, s * (W / 2 - 0.3), 0.74, L / 2 + 0.01, 0x9a1d1d);
  }
  b.box(0.7, 0.16, 0.03, 0, 0.68, -L / 2 - 0.01, 0x262626);
  // dashboard, column, radio, rear-view mirror, air freshener
  b.box(W - 0.14, 0.24, 0.42, 0, 0.82, -0.78, 0x3a302a);
  b.box(W - 0.14, 0.05, 0.3, 0, 0.96, -0.82, 0x2a221e, 'flat', -0.12, 0, 0);
  b.box(0.42, 0.14, 0.05, -0.38, 0.9, -0.56, 0x1a1a1a);
  b.add(new THREE.CylinderGeometry(0.035, 0.04, 0.32, 6), 0x2a2420, 'flat', -0.38, 0.86, -0.6, Math.PI / 2 - 0.45, 0, 0);
  b.box(0.04, 0.2, 0.36, 0, 0.6, -0.55, 0x3a302a);
  b.box(0.22, 0.06, 0.03, 0, 0.82, -0.565, 0x111111);
  b.box(0.16, 0.05, 0.03, 0, 1.31, -0.32, 0x1a1a1a);
  b.box(0.145, 0.04, 0.005, 0, 1.31, -0.303, 0x8a96a0);
  b.box(0.004, 0.07, 0.002, 0, 1.245, -0.32, 0x7a6a50);
  b.add(new THREE.ConeGeometry(0.02, 0.05, 3), 0x2e7a3a, 'flat', 0, 1.19, -0.32, Math.PI, 0, 0);
  // seats
  for (const s of [-1, 1]) {
    b.boxB(0.52, 0.14, 0.52, s * 0.38, 0.42, 0.05, tan, 'velour');
    b.box(0.52, 0.62, 0.13, s * 0.38, 0.86, 0.36, tan, 'velour', -0.12, 0, 0);
    b.box(0.3, 0.18, 0.1, s * 0.38, 1.27, 0.43, tan, 'velour', -0.12, 0, 0);
  }
  b.boxB(W - 0.22, 0.16, 0.5, 0, 0.42, 1.25, tan, 'velour');
  b.box(W - 0.22, 0.6, 0.12, 0, 0.84, 1.55, tan, 'velour', -0.15, 0, 0);
  // pillars + roof
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 0.06);
    b.box(0.06, 0.68, 0.07, x, 1.12, -0.375, color, 'flat', -0.75, 0, 0);
    b.boxB(0.07, 0.5, 0.1, x, 0.88, 0.88, color);
    b.box(0.06, 0.62, 0.08, x, 1.14, 1.53, color, 'flat', 0.66, 0, 0);
    b.boxB(0.06, 0.04, 0.85, x, 0.88, 1.27, color);
  }
  b.box(W - 0.08, 0.05, 1.55, 0, 1.385, 0.6, color);
  b.box(W - 0.16, 0.02, 1.5, 0, 1.355, 0.6, 0xb8aa92);
  // wheels
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.add(new THREE.CylinderGeometry(0.33, 0.33, 0.22, 10), 0x161616, 'flat', sx * (W / 2 - 0.12), 0.33, sz * 1.45, 0, 0, Math.PI / 2);
    b.add(new THREE.CylinderGeometry(0.19, 0.19, 0.23, 8), 0xa8a8a8, 'flat', sx * (W / 2 - 0.12), 0.33, sz * 1.45, 0, 0, Math.PI / 2);
  }
  root.add(b.build({ flat: M.flat, velour: M.velour }));

  // glass: windshield, rear window, rear side windows
  const gw = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.14, 0.66), M.carGlass);
  gw.position.set(0, 1.12, -0.375);
  gw.rotation.x = -0.75;
  root.add(gw);
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.14, 0.6), M.carGlass);
  gr.position.set(0, 1.14, 1.53);
  gr.rotation.x = 0.66;
  root.add(gr);
  for (const s of [-1, 1]) {
    const gs = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.44), M.carGlass);
    gs.position.set(s * (W / 2 - 0.05), 1.12, 1.25);
    gs.rotation.y = Math.PI / 2;
    root.add(gs);
  }
  // plate
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshLambertMaterial({ map: tex.plate }));
  plate.position.set(0, 0.52, L / 2 + 0.09);
  root.add(plate);
  // radio display (lit)
  const radio = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.025), new THREE.MeshBasicMaterial({ color: 0x5cff8a }));
  radio.position.set(0, 0.83, -0.53);
  root.add(radio);

  // front doors: pivot at front edge, open outward
  const doors = {};
  for (const [name, s] of [['driver', -1], ['passenger', 1]]) {
    const pivot = new THREE.Group();
    pivot.position.set(s * (W / 2 - 0.04), 0, -0.55);
    root.add(pivot);
    const db = new Builder({ velour: 0.5 });
    db.boxB(0.08, 0.58, 1.4, 0, 0.3, 0.7, color);
    db.box(0.03, 0.4, 1.3, -s * 0.05, 0.62, 0.7, 0x4a3c30);
    db.box(0.06, 0.05, 0.4, -s * 0.07, 0.78, 0.75, 0x3a302a);
    db.box(0.03, 0.03, 0.12, -s * 0.07, 0.83, 0.42, 0xb0b0b0);
    db.boxB(0.05, 0.46, 0.05, 0, 0.88, 1.36, color);
    db.box(0.05, 0.05, 1.3, 0, 1.33, 0.75, color);
    db.box(0.02, 0.03, 0.15, s * 0.05, 0.82, 1.15, 0xb0b0b0);
    pivot.add(db.build({ flat: M.flat, velour: M.velour }));
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.43), M.carGlass);
    win.position.set(0, 1.1, 0.72);
    win.rotation.y = Math.PI / 2;
    pivot.add(win);
    doors[name] = { pivot, side: s, open: 0, handleLocal: V(-s * 0.08, 0.83, 0.42), outerHandle: V(s * 0.05, 0.82, 1.15) };
  }

  // steering wheel
  const wheel = new THREE.Group();
  wheel.position.set(-0.38, 0.98, -0.43);
  wheel.rotation.x = -0.45;
  root.add(wheel);
  const spin = new THREE.Group();
  wheel.add(spin);
  spin.add(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.018, 5, 16), M.black));
  const hub = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.05), M.black);
  spin.add(hub);
  for (const a of [0, Math.PI * 0.75, -Math.PI * 0.75]) {
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.17, 0.015), M.black);
    sp.position.set(Math.sin(a) * 0.09, -Math.cos(a) * 0.09, 0);
    sp.rotation.z = a;
    spin.add(sp);
  }

  // ignition key + keychain
  const key = new THREE.Group();
  key.position.set(-0.2, 0.84, -0.6);
  root.add(key);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.006), M.chrome);
  blade.position.x = 0.02;
  key.add(blade);
  const fob = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.05, 0.015), new THREE.MeshLambertMaterial({ color: 0xc8b070 }));
  fob.position.set(0.05, -0.04, 0);
  key.add(fob);

  return { root, doors, wheel: spin, key, radio, seat: V(-0.38, 0, 0.12), passengerSeat: V(0.38, 0.56, 0.05), L, W };
}

// ---------------------------------------------------------------- vegetation & street

export function buildTree(b, x, z, r, kind = 'maple') {
  if (kind === 'pine') {
    const h = 6 + r() * 5;
    b.cyl(0.14, 0.2, h * 0.35, 5, x, 0, z, 0x4a3628);
    const g = [0x1f3a24, 0x23422a, 0x2a4a2e][Math.floor(r() * 3)];
    for (let i = 0; i < 4; i++) b.add(new THREE.ConeGeometry(h * 0.28 * (1 - i * 0.2), h * 0.36, 6), g, 'flat', x, h * 0.3 + i * h * 0.17, z);
    return;
  }
  if (kind === 'birch') {
    const h = 4 + r() * 2.5;
    b.cyl(0.08, 0.12, h, 5, x, 0, z, 0xe6e2d6);
    for (let i = 0; i < 4; i++) b.box(0.13, 0.04, 0.13, x, 0.6 + i * h * 0.22, z, 0x2a2a2a);
    for (let i = 0; i < 3; i++) b.blob(1.0 + r() * 0.6, x + (r() - 0.5) * 1.4, h + (r() - 0.3) * 1.2, z + (r() - 0.5) * 1.4, 0x6a9a42, 1, 1.2, 1);
    return;
  }
  const h = 3 + r() * 2;
  b.cyl(0.18, 0.26, h, 6, x, 0, z, 0x4e3b2c);
  const g = [0x3d6a2e, 0x46762f, 0x355e28, 0x4e7e36][Math.floor(r() * 4)];
  const n = 3 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const rr = 1.6 + r() * 1.1;
    b.blob(rr, x + (r() - 0.5) * 2.4, h + 0.8 + r() * 1.6, z + (r() - 0.5) * 2.4, shade(g, 0.85 + r() * 0.3), 1, 0.85, 1);
  }
}

// Wooden utility pole, crossarm along `axis` ('x' or 'z'), optional cobra-head streetlight.
export function buildPole(b, x, z, axis, lampDir = null) {
  b.cyl(0.12, 0.15, 9.4, 6, x, 0, z, 0x5a4a3a);
  const ry = axis === 'x' ? 0 : Math.PI / 2;
  b.box(2.2, 0.12, 0.12, x, 8.9, z, 0x5a4a3a, 'flat', 0, ry, 0);
  for (const s of [-0.9, 0, 0.9]) {
    const ix = axis === 'x' ? x + s : x, iz = axis === 'x' ? z : z + s;
    b.cyl(0.04, 0.05, 0.16, 5, ix, 8.96, iz, 0x3a6a5a);
  }
  const tops = [-0.9, 0.9].map((s) => (axis === 'x' ? V(x + s, 9.1, z) : V(x, 9.1, z + s)));
  let head = null;
  if (lampDir) {
    const [dx, dz] = lampDir;
    const ax = x + dx * 0.9, az = z + dz * 0.9;
    b.box(Math.abs(dx) * 1.8 + 0.08, 0.08, Math.abs(dz) * 1.8 + 0.08, ax, 7.5, az, 0x8a8a88);
    b.box(Math.abs(dx) * 0.25 + 0.3, 0.16, Math.abs(dz) * 0.25 + 0.3, x + dx * 1.85, 7.45, z + dz * 1.85, 0x9a9a98);
    head = V(x + dx * 1.85, 7.33, z + dz * 1.85);
  }
  return { tops, head };
}

export function buildFenceRun(b, x0, z0, x1, z1, kind, mats) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 3));
  const ry = Math.atan2(-(z1 - z0), x1 - x0);
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
    if (kind === 'farm') b.cyl(0.06, 0.07, 1.3, 5, x, 0, z, 0x6b5a46);
    else b.cyl(0.035, 0.035, 1.5, 5, x, 0, z, 0x8f9498);
  }
  if (kind === 'chain') {
    b.cyl(0.025, 0.025, len, 4, (x0 + x1) / 2, 1.48 - len / 2, (z0 + z1) / 2, 0x8f9498, 'flat', 0, ry, Math.PI / 2);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.45), mats.chain);
    m.position.set((x0 + x1) / 2, 0.75, (z0 + z1) / 2);
    m.rotation.y = ry;
    const tex = mats.chain.map;
    m.material = mats.chain;
    m.geometry.attributes.uv.array.forEach((v, i, a) => { a[i] = i % 2 === 0 ? v * len * 3 : v * 4.5; });
    return m;
  }
  for (const y of [0.45, 0.85, 1.2]) b.cyl(0.012, 0.012, len, 3, (x0 + x1) / 2, y - len / 2, (z0 + z1) / 2, 0x6a6a6a, 'flat', 0, ry, Math.PI / 2);
  return null;
}
