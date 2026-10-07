import * as THREE from 'three';
import { damp } from '../core/util.js';

// Richie's first-person arms: flannel sleeves, jointed fingers, and a small library of rest
// poses. Cutscenes take an arm "manual" and tween it directly; when released, it eases back
// to its rest pose. Positions are in head space (x right, y up, -z forward).

const SKIN = 0xe2b49a;
const _w = new THREE.Vector3(), _d = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);
const _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Vector3(), _x = new THREE.Vector3(1, 0, 0);

export const POSES = {
  relaxed: { i: 0.25, m: 0.3, r: 0.35, p: 0.4, t: 0.2, spread: 0.1 },
  open: { i: 0.02, m: 0.02, r: 0.02, p: 0.05, t: 0, spread: 0.5 },
  fist: { i: 1, m: 1, r: 1, p: 1, t: 0.85, spread: 0 },
  grip: { i: 0.8, m: 0.85, r: 0.9, p: 0.95, t: 0.6, spread: 0 },
  pinch: { i: 0.45, m: 0.35, r: 0.8, p: 0.9, t: 0.55, spread: 0 },
  cig: { i: 0.15, m: 0.2, r: 0.85, p: 0.95, t: 0.65, spread: 0 },
  point: { i: 0, m: 0.95, r: 1, p: 1, t: 0.8, spread: 0 },
  knock: { i: 1, m: 1, r: 1, p: 1, t: 0.9, spread: 0 },
  flick: { i: 0.8, m: 0.85, r: 0.9, p: 0.95, t: 0.3, spread: 0 },
};

// Rest transforms per arm & mode: [position], [rotation], pose
const REST = {
  L: {
    none: { p: [-0.34, -0.85, -0.3], r: [0.2, 0, 0.2], pose: 'relaxed' },
    leash: { p: [-0.27, -0.36, -0.48], r: [0.35, 0.25, 1.25], pose: 'fist' },
    bag: { p: [-0.27, -0.36, -0.48], r: [0.35, 0.25, 1.25], pose: 'fist' },
  },
  R: {
    none: { p: [0.34, -0.85, -0.3], r: [0.2, 0, -0.2], pose: 'relaxed' },
    cig: { p: [0.24, -0.33, -0.44], r: [0.95, -0.1, -0.55], pose: 'cig' },
    bag: { p: [0.3, -0.45, -0.46], r: [0.3, -0.2, -1.2], pose: 'fist' },
  },
};

class Arm {
  constructor(side, mats) {
    this.side = side; // -1 left, +1 right
    this.key = side < 0 ? 'L' : 'R';
    this.group = new THREE.Group();
    this.manual = false;
    this.mode = 'none';
    this.pose = { ...POSES.relaxed };

    // The forearm is not part of the hand: it spans from the wrist to an elbow anchor
    // below the frame, re-aimed every frame (a cheap IK that keeps arms looking natural).
    const fg = new THREE.BoxGeometry(0.082, 0.078, 1);
    fg.translate(0, 0, 0.5);
    this.forearm = new THREE.Mesh(fg, mats.sleeve);
    const ug = new THREE.BoxGeometry(0.095, 0.09, 1);
    ug.translate(0, 0, 0.5);
    this.upper = new THREE.Mesh(ug, mats.sleeve);
    this.elbow = new THREE.Vector3();
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.104, 0.099, 0.05), mats.cuff);
    cuff.position.set(0, -0.005, 0.04);
    this.group.add(cuff);
    const wrist = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.046, 0.05), mats.skin);
    wrist.position.set(0, 0, 0.005);
    this.group.add(wrist);

    this.palm = new THREE.Group();
    this.palm.scale.setScalar(1.15);
    this.group.add(this.palm);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.03, 0.095), mats.skin);
    palm.position.set(0, 0, -0.047);
    this.palm.add(palm);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.022, 0.04), mats.skin);
    pad.position.set(side * -0.03, -0.008, -0.03);
    this.palm.add(pad);

    this.fingers = [];
    const lens = [[0.046, 0.04], [0.05, 0.043], [0.047, 0.04], [0.038, 0.032]];
    for (let f = 0; f < 4; f++) {
      const fg = new THREE.Group();
      fg.position.set(side * (-0.03 + f * 0.02), 0.002, -0.093);
      this.palm.add(fg);
      const [l1, l2] = lens[f];
      const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.0185, 0.018, l1), mats.skin);
      s1.position.z = -l1 / 2;
      fg.add(s1);
      const j2 = new THREE.Group();
      j2.position.z = -l1;
      fg.add(j2);
      const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.0165, 0.016, l2), mats.skin);
      s2.position.z = -l2 / 2;
      j2.add(s2);
      const nail = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.003, 0.012), mats.nail);
      nail.position.set(0, 0.009, -l2 + 0.007);
      j2.add(nail);
      const tip = new THREE.Object3D();
      tip.position.z = -l2;
      j2.add(tip);
      this.fingers.push({ fg, j2, tip });
    }
    this.thumb = new THREE.Group();
    this.thumb.position.set(side * -0.04, -0.006, -0.028);
    this.palm.add(this.thumb);
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.021, 0.02, 0.04), mats.skin);
    t1.position.z = -0.02;
    this.thumb.add(t1);
    this.thumbJ = new THREE.Group();
    this.thumbJ.position.z = -0.04;
    this.thumb.add(this.thumbJ);
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.019, 0.018, 0.032), mats.skin);
    t2.position.z = -0.016;
    this.thumbJ.add(t2);

    // attach points for held things
    this.grip = new THREE.Object3D();
    this.grip.position.set(0, -0.035, -0.07);
    this.palm.add(this.grip);
    this.pinch = new THREE.Object3D();
    this.pinch.position.set(side * -0.022, 0.0, -0.135);
    this.palm.add(this.pinch);

    this.setRest('none', true);
    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } });
  }

  rest() { return REST[this.key][this.mode] || REST[this.key].none; }

  setRest(mode, snap = false) {
    this.mode = mode;
    if (snap) {
      const R = this.rest();
      this.group.position.fromArray(R.p);
      this.group.rotation.set(R.r[0], R.r[1], R.r[2]);
      Object.assign(this.pose, POSES[R.pose]);
    }
  }

  applyPose() {
    const p = this.pose, c = [p.i, p.m, p.r, p.p];
    this.fingers.forEach((f, i) => {
      f.fg.rotation.set(-c[i] * 1.45, this.side * p.spread * (i - 1.5) * 0.12, 0);
      f.j2.rotation.x = -c[i] * 1.6;
    });
    this.thumb.rotation.set(-0.2 - p.t * 0.5, this.side * (0.7 - p.t * 0.85), this.side * -0.3);
    this.thumbJ.rotation.x = -p.t * 0.9;
  }

  update(dt) {
    if (!this.manual) {
      const R = this.rest(), k = 7;
      const gp = this.group.position, gr = this.group.rotation;
      gp.x = damp(gp.x, R.p[0], k, dt); gp.y = damp(gp.y, R.p[1], k, dt); gp.z = damp(gp.z, R.p[2], k, dt);
      gr.x = damp(gr.x, R.r[0], k, dt); gr.y = damp(gr.y, R.r[1], k, dt); gr.z = damp(gr.z, R.r[2], k, dt);
      const P = POSES[R.pose];
      for (const key in P) this.pose[key] = damp(this.pose[key], P[key], 10, dt);
    }
    this.applyPose();
    this.aimForearm(this.pitch || 0);
  }

  // Two-bone IK: wrist -> elbow -> shoulder, elbow bending down and out.
  aimForearm(pitch = 0) {
    const g = this.group, wrist = _w.set(0, -0.004, 0.035).applyEuler(g.rotation).add(g.position);
    // shoulders belong to the body, not the head: undo the head's pitch
    const S = _s.set(this.side * 0.25, -0.3, 0.07).applyAxisAngle(_x, -pitch);
    const A = 0.3, B = 0.36;
    const toS = _d.subVectors(S, wrist);
    const d = Math.min(A + B - 0.002, Math.max(0.05, toS.length()));
    toS.normalize();
    const cosA = Math.min(1, Math.max(-1, (A * A + d * d - B * B) / (2 * A * d)));
    const sinA = Math.sqrt(1 - cosA * cosA);
    const pole = _p.set(this.side * 0.45, -1, 0.2);
    pole.addScaledVector(toS, -pole.dot(toS)).normalize();
    this.elbow.copy(wrist).addScaledVector(toS, A * cosA).addScaledVector(pole, A * sinA);
    this.place(this.forearm, wrist, this.elbow);
    this.place(this.upper, this.elbow, S);
  }

  place(mesh, a, b) {
    const dir = _e.subVectors(b, a);
    const len = dir.length();
    mesh.position.copy(a);
    mesh.quaternion.setFromUnitVectors(_z, dir.divideScalar(len || 1));
    mesh.scale.set(1, 1, len);
  }
}

export class Hands {
  constructor(g) {
    this.g = g;
    const tex = g.tex;
    const mats = {
      skin: new THREE.MeshLambertMaterial({ color: SKIN, emissive: 0x2a1a14 }),
      nail: new THREE.MeshLambertMaterial({ color: 0xf0d0c4, emissive: 0x2a1a14 }),
      sleeve: new THREE.MeshLambertMaterial({ map: tex.flannel, emissive: 0x140808 }),
      cuff: new THREE.MeshLambertMaterial({ color: 0x5a1e1e, emissive: 0x100606 }),
    };
    this.mats = mats;
    this.root = new THREE.Group();
    g.player.head.add(this.root);
    this.L = new Arm(-1, mats);
    this.R = new Arm(1, mats);
    this.root.add(this.L.group, this.R.group, this.L.forearm, this.R.forearm, this.L.upper, this.R.upper);
    for (const f of [this.L.forearm, this.R.forearm, this.L.upper, this.R.upper]) f.frustumCulled = false;
    // one light reserved for flames and embers so the shader light count never changes
    this.light = new THREE.PointLight(0xff9a40, 0, 3.5, 2);
    this.light.position.set(0.05, -0.1, -0.35);
    this.root.add(this.light);
    this.swayT = 0;
  }

  arm(side) { return side === 'L' ? this.L : this.R; }

  // Head-space position of a world point (for reaching toward things).
  toLocal(world, out = new THREE.Vector3()) {
    this.root.updateWorldMatrix(true, false);
    return this.root.worldToLocal(out.copy(world));
  }

  update(dt) {
    const p = this.g.player;
    this.swayT += dt;
    const b = p.bob, a = p.bobAmt;
    const tremble = p.nerves * 0.0025;
    this.root.position.set(
      Math.cos(b * 0.5) * 0.01 * a + (Math.random() - 0.5) * tremble,
      -Math.abs(Math.sin(b * 0.5)) * 0.012 * a + Math.sin(this.swayT * 1.3) * 0.003 + (Math.random() - 0.5) * tremble,
      0,
    );
    this.L.pitch = this.R.pitch = p.pitch + p.cut.pitch * 0;
    this.L.update(dt);
    this.R.update(dt);
  }
}
