import * as THREE from 'three';

// Small hand-held props for the transitions, plus a pooled smoke particle system.

export function makeProps(g) {
  const T = g.tex;
  const L = (c, e = 0x000000) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
  const P = {};

  // cigarette: filter at +z, lit end toward -z
  const cig = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.07, 6), L(0xf4f2ec, 0x2a2a2a));
  paper.rotation.x = Math.PI / 2;
  paper.position.z = -0.035;
  const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.0044, 0.0044, 0.022, 6), L(0xd0904a, 0x201008));
  filter.rotation.x = Math.PI / 2;
  filter.position.z = 0.011;
  const emberMat = new THREE.MeshBasicMaterial({ color: 0x2a2018 });
  const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.0046, 0.0046, 0.006, 6), emberMat);
  ember.rotation.x = Math.PI / 2;
  const tip = new THREE.Object3D();
  cig.add(paper, filter, ember, tip);
  P.cig = { group: cig, paper, ember, emberMat, tip, burn: 0, lit: false, glow: 0 };
  P.setBurn = (b) => {
    const c = P.cig, k = 1 - b * 0.78;
    c.burn = b;
    c.paper.scale.y = k;
    c.paper.position.z = -0.035 * k;
    c.ember.position.z = -0.07 * k - 0.002;
    c.tip.position.z = -0.07 * k - 0.006;
  };
  P.setBurn(0);

  // pack with a flip-top lid
  const pack = new THREE.Group();
  const packMat = new THREE.MeshLambertMaterial({ map: T.cigpack, emissive: 0x111111 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.07, 0.022), packMat);
  body.position.y = 0.035;
  const lid = new THREE.Group();
  lid.position.set(0, 0.07, 0.011);
  const lidM = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.018, 0.022), packMat);
  lidM.position.set(0, 0.009, -0.011);
  lid.add(lidM);
  pack.add(body, lid);
  P.pack = { group: pack, lid };

  // disposable lighter
  const lighter = new THREE.Group();
  const lb = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.07, 0.013), L(0x2a5ac8, 0x080810));
  lb.position.y = 0.035;
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.013), L(0xb8b8b8));
  top.position.y = 0.076;
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.01, 6), L(0x777777));
  wheel.rotation.x = Math.PI / 2;
  wheel.position.set(0, 0.084, 0.003);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb050, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.032, 6), flameMat);
  flame.position.y = 0.1;
  flame.visible = false;
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.006, 4, 3), new THREE.MeshBasicMaterial({ color: 0xffe0a0 }));
  spark.position.y = 0.088;
  spark.visible = false;
  lighter.add(lb, top, wheel, flame, spark);
  P.lighter = { group: lighter, flame, spark };

  // bread bag (empty, then knotted and full)
  const bagMat = new THREE.MeshLambertMaterial({ map: T.breadbag, side: THREE.DoubleSide, emissive: 0x111111 });
  const empty = new THREE.Group();
  const e1 = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.006, 0.19), bagMat);
  e1.rotation.z = 0.2;
  const e2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.006, 0.08), bagMat);
  e2.position.set(0.01, 0.01, 0.08);
  e2.rotation.x = 0.6;
  empty.add(e1, e2);
  const full = new THREE.Group();
  const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), bagMat);
  blob.scale.set(1, 1.25, 0.9);
  blob.position.y = -0.06;
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.05, 0.02), bagMat);
  neck.position.y = 0.0;
  const knot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.016, 0), bagMat);
  knot.position.y = 0.03;
  full.add(blob, neck, knot);
  P.bag = { empty, full };

  // letter
  const letter = new THREE.Group();
  const env = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.004, 0.1), L(0xf4f1e8, 0x1a1a1a));
  const stamp = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.005, 0.026), L(0xc03030));
  stamp.position.set(0.08, 0.001, -0.03);
  const lines = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.005, 0.025), L(0x6a6a6a));
  lines.position.set(-0.01, 0.001, 0.01);
  letter.add(env, stamp, lines);
  P.letter = letter;

  // light bulb (new one, frosted)
  const bulb = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), L(0xf4f2ec, 0x2a2a2a));
  glass.scale.y = 1.2;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 8), L(0xb8b8b8));
  base.position.y = 0.06;
  bulb.add(glass, base);
  P.newBulb = bulb;

  // leash clip + coiled leash on a hook
  const clip = new THREE.Group();
  const metal = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, 0.045), L(0xc8c8c8, 0x1a1a1a));
  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.004, 0.08), L(0xc02428, 0x200404));
  strap.position.z = 0.06;
  clip.add(metal, strap);
  P.clip = clip;
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 4, 14), L(0xc02428, 0x200404));
  coil.scale.y = 1.7;
  P.coil = coil;

  P.poop = () => {
    const p = new THREE.Group();
    const m = new THREE.MeshLambertMaterial({ color: 0x4a3018 });
    for (const [x, z, r] of [[0, 0, 0.03], [0.03, 0.015, 0.024], [-0.02, 0.03, 0.022]]) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), m);
      b.position.set(x, r * 0.7, z);
      b.scale.y = 0.8;
      p.add(b);
    }
    return p;
  };

  return P;
}

export class Smoke {
  constructor(g) {
    this.g = g;
    this.parts = [];
    for (let i = 0; i < 70; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.tex.smoke, color: 0xd0d0d0, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false;
      g.scene.add(s);
      this.parts.push({ s, vel: new THREE.Vector3(), life: 0, max: 1, op: 0.4, size: 0.1, grow: 0.3 });
    }
  }

  emit(pos, vel, o = {}) {
    const p = this.parts.find((q) => q.life <= 0);
    if (!p) return;
    p.s.position.copy(pos);
    p.vel.copy(vel);
    p.life = p.max = o.life || 2;
    p.op = o.op ?? 0.35;
    p.size = o.size || 0.06;
    p.grow = o.grow ?? 0.35;
    p.s.visible = true;
    p.s.material.rotation = Math.random() * 6;
    if (o.color) p.s.material.color.set(o.color); else p.s.material.color.set(0xd0d0d0);
  }

  update(dt) {
    for (const p of this.parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      p.vel.y += 0.06 * dt;
      p.vel.multiplyScalar(Math.exp(-dt * 0.9));
      p.vel.x += (Math.random() - 0.5) * 0.05 * dt;
      p.s.position.addScaledVector(p.vel, dt);
      const age = 1 - p.life / p.max;
      const sz = p.size + age * p.grow;
      p.s.scale.set(sz, sz, 1);
      p.s.material.opacity = p.op * Math.min(1, age * 6) * (1 - age);
      p.s.material.rotation += dt * 0.3;
    }
  }
}
