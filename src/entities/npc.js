import * as THREE from 'three';
import { clamp, damp, dampAngle, nearAngle, yawTo } from '../core/util.js';
import { faceTex } from '../world/textures.js';

// Neighbors. Jointed box people with painted faces, a jaw that flaps while they talk,
// blinking, head tracking, a walk cycle, and gesture helpers (wave, handshake, hand-over,
// pet the dog, carry a box). Gestures are async so cutscenes can await them.

const _v = new THREE.Vector3();

function bx(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export class Npc {
  constructor(g, def) {
    this.g = g;
    this.def = def;
    this.id = def.id;
    this.voice = def.voice;
    const H = def.height || 1.75, k = H / 1.75, bw = def.build || 1;
    const L = (c) => new THREE.MeshLambertMaterial({ color: c, emissive: 0x060606 });
    const skin = L(def.skin), shirt = L(def.shirt), pants = L(def.pants), shoes = L(def.shoes || 0x2a2420);
    const sleeve = def.longSleeves ? shirt : skin;

    const root = (this.root = new THREE.Group());
    g.scene.add(root);
    this.legLen = 0.86 * k;
    this.hips = new THREE.Group();
    this.hips.position.y = this.legLen;
    root.add(this.hips);
    this.spine = new THREE.Group();
    this.hips.add(this.spine);
    const tl = 0.56 * k;
    this.spine.add(bx(0.36 * bw, 0.18, 0.2 * bw, pants, 0, 0.02, 0));
    this.chest = new THREE.Group();
    this.chest.position.y = 0.1;
    this.spine.add(this.chest);
    this.chest.add(bx(0.4 * bw, tl - 0.08, 0.22 * bw, shirt, 0, tl / 2 - 0.04, 0));
    if (def.belly) this.chest.add(bx(0.36 * bw, 0.22, 0.08, shirt, 0, 0.12, -0.13 * bw));
    if (def.dress) this.spine.add(bx(0.44 * bw, 0.5, 0.28 * bw, shirt, 0, -0.18, 0));
    if (def.apron) this.chest.add(bx(0.3, 0.5, 0.02, L(def.apron), 0, 0.1, -0.12 * bw));
    if (def.suspenders) for (const s of [-1, 1]) this.chest.add(bx(0.03, tl - 0.05, 0.005, L(0x5a3a22), s * 0.09, tl / 2 - 0.03, -0.115 * bw));

    // head
    this.neck = new THREE.Group();
    this.neck.position.y = tl;
    this.chest.add(this.neck);
    this.neck.add(bx(0.09, 0.08, 0.09, skin, 0, 0.03, 0));
    this.head = new THREE.Group();
    this.head.position.y = 0.07;
    this.neck.add(this.head);
    const hs = 0.245 * (def.headScale || 1);
    const faceMat = new THREE.MeshLambertMaterial({ map: faceTex(def.face), emissive: 0x060606 });
    const hairMat = L(def.hair || 0x3a2a1a);
    const head = new THREE.Mesh(new THREE.BoxGeometry(hs * 0.82, hs, hs * 0.9), [skin, skin, def.bald ? skin : hairMat, skin, def.bald ? skin : hairMat, faceMat]);
    head.position.y = hs / 2;
    head.castShadow = true;
    this.head.add(head);
    this.headSize = hs;
    // eyelids for blinking (cover the painted eyes)
    this.lids = [];
    for (const s of [-1, 1]) {
      const lid = bx(hs * 0.16, hs * 0.08, 0.004, skin, s * hs * 0.18, hs * 0.58, -hs * 0.452);
      lid.visible = false;
      this.head.add(lid);
      this.lids.push(lid);
    }
    this.mouth = bx(def.grin ? hs * 0.42 : hs * 0.24, 0.016, 0.006, L(def.grin ? 0xf4f0e6 : 0x5a2a28), 0, hs * 0.2, -hs * 0.455);
    this.head.add(this.mouth);
    if (def.grin) this.head.add(bx(hs * 0.46, 0.006, 0.005, L(0x3a1a18), 0, hs * 0.2 - 0.012, -hs * 0.456));
    this.addHair(def, hairMat, hs);
    if (def.cap) {
      const capMat = L(def.cap);
      this.head.add(bx(hs * 0.88, hs * 0.32, hs * 0.96, capMat, 0, hs * 0.92, 0));
      this.head.add(bx(hs * 0.8, 0.02, hs * 0.45, capMat, 0, hs * 0.78, -hs * 0.62));
      this.head.add(bx(hs * 0.4, hs * 0.18, 0.005, L(0xe8e2d0), 0, hs * 0.95, -hs * 0.485));
    }
    if (def.headband) this.head.add(bx(hs * 0.86, hs * 0.1, hs * 0.94, L(def.headband), 0, hs * 0.78, 0));
    if (def.headphones) {
      const band = L(0x1a1a1a), pad = L(0xff7a1a);
      this.head.add(bx(0.02, 0.02, hs * 0.5, band, 0, hs * 1.04, 0));
      for (const s of [-1, 1]) this.head.add(bx(0.03, 0.07, 0.07, pad, s * hs * 0.44, hs * 0.55, 0));
    }

    // arms
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * (0.2 * bw + 0.05), tl - 0.06, 0);
      this.chest.add(sh);
      sh.add(bx(0.1, 0.32 * k, 0.11, def.shortSleeves ? shirt : sleeve, 0, -0.14 * k, 0));
      const el = new THREE.Group();
      el.position.y = -0.3 * k;
      sh.add(el);
      el.add(bx(0.085, 0.28 * k, 0.09, sleeve, 0, -0.13 * k, 0));
      const hand = new THREE.Group();
      hand.position.y = -0.28 * k;
      el.add(hand);
      hand.add(bx(0.075, 0.1, 0.04, skin, 0, -0.05, 0));
      const hold = new THREE.Object3D();
      hold.position.set(0, -0.08, -0.02);
      hand.add(hold);
      this.arms.push({ s, sh, el, hand, hold });
    }
    this.armL = this.arms[0];
    this.armR = this.arms[1];

    // legs
    this.legs = [];
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.1 * bw, -0.04, 0);
      this.hips.add(hip);
      hip.add(bx(0.14 * bw, 0.44 * k, 0.15 * bw, def.dress ? skin : pants, 0, -0.2 * k, 0));
      const knee = new THREE.Group();
      knee.position.y = -0.42 * k;
      hip.add(knee);
      knee.add(bx(0.115, 0.4 * k, 0.12, def.dress || def.shorts ? skin : pants, 0, -0.2 * k, 0));
      const foot = bx(0.12, 0.07, 0.24, shoes, 0, -0.4 * k, -0.04);
      knee.add(foot);
      this.legs.push({ s, hip, knee });
    }

    // state
    this.yaw = def.yaw || 0;
    this.walking = false;
    this.speed = 0;
    this.phase = 0;
    this.lookTarget = null;       // world point or Object3D
    this.lookWeight = 1;
    this.headTurn = { y: 0, x: 0 };
    this.headLimit = def.headLimit || 1.2;
    this.talking = false;
    this.blinkT = 2;
    this.breath = Math.random() * 6;
    this.still = !!def.still;
    this.manual = false;          // gestures in progress (arms)
    this.pose = { lean: 0, crouch: 0 };
    this.root.rotation.y = this.yaw;
  }

  addHair(def, mat, hs) {
    const h = this.head;
    switch (def.hairStyle) {
      case 'curls':
        for (const [x, y, z, r] of [[0, 1.02, 0.05, 0.3], [-0.3, 0.92, 0.0, 0.24], [0.3, 0.92, 0.0, 0.24], [0, 0.95, 0.32, 0.28], [-0.22, 1.0, -0.22, 0.2], [0.22, 1.0, -0.22, 0.2], [-0.32, 0.7, 0.15, 0.2], [0.32, 0.7, 0.15, 0.2]]) {
          const m = new THREE.Mesh(new THREE.IcosahedronGeometry(hs * r, 0), mat);
          m.position.set(x * hs, y * hs, z * hs);
          h.add(m);
        }
        break;
      case 'flat':
        h.add(bx(hs * 0.86, hs * 0.14, hs * 0.94, mat, 0, hs * 1.04, 0));
        h.add(bx(hs * 0.86, hs * 0.5, hs * 0.1, mat, 0, hs * 0.72, hs * 0.44));
        break;
      case 'mullet':
        h.add(bx(hs * 0.88, hs * 0.18, hs * 0.96, mat, 0, hs * 1.02, 0));
        h.add(bx(hs * 0.8, hs * 0.8, hs * 0.14, mat, 0, hs * 0.45, hs * 0.48));
        h.add(bx(hs * 0.9, hs * 0.1, hs * 0.3, mat, 0, hs * 0.92, -hs * 0.36));
        break;
      case 'short':
        h.add(bx(hs * 0.86, hs * 0.12, hs * 0.94, mat, 0, hs * 1.02, 0));
        break;
      default:
        break;
    }
  }

  place(x, z, yaw = this.yaw) {
    this.root.position.set(x, this.g.world.groundHeight(x, z), z);
    this.yaw = yaw;
    this.root.rotation.y = yaw;
  }

  get pos() { return this.root.position; }

  headWorld(out = new THREE.Vector3()) {
    return this.head.getWorldPosition(out).add(new THREE.Vector3(0, this.headSize * 0.55, 0));
  }

  handWorld(side = 'R', out = new THREE.Vector3()) {
    return (side === 'R' ? this.armR : this.armL).hold.getWorldPosition(out);
  }

  update(dt) {
    const g = this.g;
    this.breath += dt;
    // walking along a path
    if (this.path && this.path.length) {
      const tgt = this.path[0];
      const dx = tgt.x - this.root.position.x, dz = tgt.z - this.root.position.z;
      const d = Math.hypot(dx, dz);
      const spd = this.walkSpeed || 1.3;
      if (d < 0.08) {
        this.path.shift();
        if (!this.path.length) { this.walking = false; if (this.pathDone) { const r = this.pathDone; this.pathDone = null; r(); } }
      } else {
        const step = Math.min(d, spd * dt);
        this.root.position.x += (dx / d) * step;
        this.root.position.z += (dz / d) * step;
        this.yaw = dampAngle(this.yaw, yawTo(dx, dz), 8, dt);
        this.walking = true;
      }
      this.root.position.y = damp(this.root.position.y, g.world.groundHeight(this.root.position.x, this.root.position.z), 12, dt);
    } else if (this.faceYaw !== undefined && this.faceYaw !== null) {
      this.yaw = dampAngle(this.yaw, this.faceYaw, 4, dt);
    }
    this.root.rotation.y = this.yaw;
    this.speed = damp(this.speed, this.walking ? (this.walkSpeed || 1.3) : 0, 8, dt);

    // walk cycle
    const run = this.running ? 1 : 0;
    this.phase += (this.speed * dt * Math.PI * 2) / (run ? 1.9 : 1.35);
    const a = Math.min(1, this.speed / 1.2) * (run ? 0.85 : 0.5);
    const crouch = this.pose.crouch;
    for (const l of this.legs) {
      const ph = this.phase + (l.s < 0 ? 0 : Math.PI);
      l.hip.rotation.x = Math.sin(ph) * a + crouch * 1.1;
      l.knee.rotation.x = -Math.max(0, -Math.cos(ph)) * a * 1.3 - crouch * 2.0;
    }
    if (!this.manual) {
      for (const arm of this.arms) {
        const ph = this.phase + (arm.s < 0 ? Math.PI : 0);
        arm.sh.rotation.x = damp(arm.sh.rotation.x, Math.sin(ph) * a * (run ? 1.2 : 0.8) + (run ? 0.3 : 0), 10, dt);
        arm.sh.rotation.z = damp(arm.sh.rotation.z, arm.s * 0.06, 10, dt);
        arm.el.rotation.x = damp(arm.el.rotation.x, run ? 1.4 : 0.15 + a * 0.3, 10, dt);
      }
    }
    const bob = Math.abs(Math.cos(this.phase)) * 0.03 * Math.min(1, this.speed);
    this.hips.position.y = this.legLen + bob - crouch * 0.32;
    const breathe = this.still ? 0 : Math.sin(this.breath * 1.6) * 0.008;
    this.chest.scale.set(1, 1 + breathe, 1 + breathe);
    this.spine.rotation.x = this.pose.lean + (run ? 0.15 : 0);

    // head look
    let ty = 0, tx = 0;
    const lt = this.lookTarget;
    if (lt) {
      const p = lt.isObject3D ? lt.getWorldPosition(_v) : _v.copy(lt);
      this.head.getWorldPosition(this._hw || (this._hw = new THREE.Vector3()));
      const hw = this._hw;
      const dx = p.x - hw.x, dz = p.z - hw.z, dy = p.y - hw.y - this.headSize * 0.5;
      const bodyYaw = this.yaw + this.spine.rotation.y;
      ty = clamp(nearAngle(0, yawTo(dx, dz) - bodyYaw), -this.headLimit, this.headLimit) * this.lookWeight;
      tx = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.6, 0.5) * this.lookWeight;
    }
    const rate = this.def.jerkyHead ? 2.5 : 6;
    this.headTurn.y = damp(this.headTurn.y, ty, rate, dt);
    this.headTurn.x = damp(this.headTurn.x, tx - this.pose.lean * 0.6, rate, dt);
    this.head.rotation.set(this.headTurn.x + (this.nod || 0), this.headTurn.y, this.headTilt || 0);

    // mouth + blink
    if (this.talking && !this.def.grin) {
      this.mouth.scale.y = 1 + Math.abs(Math.sin(g.time * 17) * Math.sin(g.time * 5.3)) * 3.2;
    } else this.mouth.scale.y = damp(this.mouth.scale.y, this.def.grin && this.talking ? 1.4 : 1, 10, dt);
    if (!this.still) {
      this.blinkT -= dt;
      const blinking = this.blinkT < 0.12;
      for (const l of this.lids) l.visible = blinking;
      if (this.blinkT <= 0) this.blinkT = 2 + Math.random() * 4;
      // small head nods while talking
      this.nod = this.talking ? Math.sin(g.time * 3.1) * 0.05 : damp(this.nod || 0, 0, 5, dt);
    }
  }

  // ---------- behavior helpers ----------
  walkPath(points, speed = 1.3) {
    this.walkSpeed = speed;
    this.path = points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], 0, p[1])));
    return new Promise((r) => (this.pathDone = r));
  }

  stop() { this.path = null; this.walking = false; if (this.pathDone) { const r = this.pathDone; this.pathDone = null; r(); } }

  face(yaw) { this.faceYaw = yaw; }
  faceToward(p) { this.faceYaw = yawTo(p.x - this.root.position.x, p.z - this.root.position.z); }

  // Speak a line with mouth movement + subtitles.
  say(text, opts = {}) {
    return this.g.voice.speak(this.voice, text, {
      ...opts,
      onStart: () => (this.talking = true),
      onEnd: () => (this.talking = false),
    });
  }

  async wave(times = 3, side = 'R') {
    const tw = this.g.tw, arm = side === 'R' ? this.armR : this.armL;
    this.manual = true;
    await Promise.all([tw.to(arm.sh.rotation, { x: 0.2, z: arm.s * 2.5 }, 0.4, 'outCubic'), tw.to(arm.el.rotation, { x: 0.4 }, 0.4)]);
    for (let i = 0; i < times; i++) {
      await tw.to(arm.el.rotation, { z: arm.s * 0.5 }, 0.18);
      await tw.to(arm.el.rotation, { z: arm.s * -0.3 }, 0.18);
    }
    await Promise.all([tw.to(arm.sh.rotation, { x: 0, z: arm.s * 0.06 }, 0.45), tw.to(arm.el.rotation, { x: 0.15, z: 0 }, 0.45)]);
    this.manual = false;
  }

  // Raise right hand forward (to shake, or to hand something over). Returns the hold point.
  async offerHand(dur = 0.6) {
    const tw = this.g.tw, arm = this.armR;
    this.manual = true;
    await Promise.all([tw.to(arm.sh.rotation, { x: 0.95, z: 0.15 }, dur, 'outCubic'), tw.to(arm.el.rotation, { x: 0.45, z: 0 }, dur)]);
    return arm.hold;
  }

  async pump(times = 3) {
    const tw = this.g.tw, arm = this.armR;
    for (let i = 0; i < times; i++) {
      await tw.to(arm.el.rotation, { x: 0.65 }, 0.13);
      await tw.to(arm.el.rotation, { x: 0.28 }, 0.13);
    }
    await tw.to(arm.el.rotation, { x: 0.45 }, 0.12);
  }

  async dropHand(dur = 0.5) {
    const tw = this.g.tw, arm = this.armR;
    await Promise.all([tw.to(arm.sh.rotation, { x: 0, z: arm.s * 0.06 }, dur), tw.to(arm.el.rotation, { x: 0.15, z: 0 }, dur)]);
    this.manual = false;
  }

  async crouchTo(v, dur = 0.7) {
    await Promise.all([this.g.tw.to(this.pose, { crouch: v, lean: v * 0.75 }, dur)]);
  }

  // Bend down and pat the dog's head a few times.
  async petDog(dog) {
    const tw = this.g.tw, arm = this.armR;
    this.lookTarget = dog.head;
    this.manual = true;
    await Promise.all([this.crouchTo(0.9, 0.8), tw.to(arm.sh.rotation, { x: 0.55, z: 0.05 }, 0.8), tw.to(arm.el.rotation, { x: 0.3 }, 0.8)]);
    for (let i = 0; i < 4; i++) {
      await tw.to(arm.sh.rotation, { x: 0.4 }, 0.22);
      await tw.to(arm.sh.rotation, { x: 0.6 }, 0.22);
    }
    await Promise.all([this.crouchTo(0, 0.8), tw.to(arm.sh.rotation, { x: 0, z: 0.06 }, 0.8), tw.to(arm.el.rotation, { x: 0.15 }, 0.8)]);
    this.manual = false;
  }

  // Arms forward holding a box at chest height.
  carry(on) {
    this.manual = on;
    for (const arm of this.arms) {
      if (on) { arm.sh.rotation.set(0.25, 0, arm.s * -0.12); arm.el.rotation.set(1.25, 0, arm.s * 0.25); }
    }
  }

  holdItem(obj, side = 'R') {
    (side === 'R' ? this.armR : this.armL).hold.add(obj);
    obj.position.set(0, 0, 0);
  }
}

// ---------------------------------------------------------------- cast

export const NEIGHBORS = {
  dorothy: {
    id: 'dorothy', voice: 'dorothy', height: 1.58, build: 1.1, belly: true, dress: true,
    skin: 0xe8c4a8, shirt: 0xb8a2c8, pants: 0xb8a2c8, shoes: 0xe8a0b8, hair: 0xc8c8cc, hairStyle: 'curls', apron: 0xf0ece0, longSleeves: true,
    face: { skin: '#e8c4a8', eye: '#4a5a6a', brow: '#b0b0b4', glasses: '#6a4a3a', wrinkles: true, blush: true },
  },
  walt: {
    id: 'walt', voice: 'walt', height: 1.86, build: 1.25, belly: true, shortSleeves: true, suspenders: true,
    skin: 0xd9a184, shirt: 0xe8e4d8, pants: 0x3a4a6a, shoes: 0x3a2a1a, hair: 0x9a9a98, hairStyle: 'short', cap: 0x2f4a2a,
    face: { skin: '#d9a184', eye: '#2a2a2a', brow: '#8a8a88', mustache: '#9a9a98', wrinkles: true, stubble: true },
  },
  lindqvist: {
    id: 'lindqvist', voice: 'lindqvist', height: 1.93, build: 0.92, shortSleeves: true, grin: true, still: true, jerkyHead: true, headLimit: 2.6,
    skin: 0xf0d8c8, shirt: 0xa8c8e0, pants: 0xc8b890, shoes: 0xf0f0f0, hair: 0xe8d8a0, hairStyle: 'flat',
    face: { skin: '#f0d8c8', eye: '#5a8ab8', brow: '#d8c890', wide: true },
  },
  jogger: {
    id: 'jogger', voice: 'jogger', height: 1.78, build: 0.95, shortSleeves: false, longSleeves: true, shorts: true,
    skin: 0xe0b090, shirt: 0x1ac8b0, pants: 0x2a2a6a, shoes: 0xf2f2f2, hair: 0x5a3a1e, hairStyle: 'mullet', headband: 0xff3a9a, headphones: true,
    face: { skin: '#e0b090', eye: '#3a2a1a', brow: '#5a3a1e' },
  },
};
