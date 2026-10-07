import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp, nearAngle, yawTo, TAU } from '../core/util.js';

// Moose. A low-poly mutt puppy with a procedural trot, ears that flop with momentum, a tail
// that tells you how he feels, a jingling tag, and a red nylon leash. He follows, sniffs,
// sits, poops, alerts, growls, barks, refuses, and pulls.

const C = { coat: 0xc8925a, white: 0xefe6d8, dark: 0x6b4a2e, nose: 0x161210, collar: 0xb02020, tag: 0xd4b04a, tongue: 0xd86a7a, eye: 0x14100c };

function bx(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _lp = new THREE.Vector3();
const _q = new THREE.Quaternion(), _e = new THREE.Euler();

export class Dog {
  constructor(g) {
    this.g = g;
    const L = (c, e = 0x000000) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
    const M = (this.mats = {
      coat: L(C.coat, 0x0e0804), white: L(C.white, 0x0e0c0a), dark: L(C.dark), nose: L(C.nose), collar: L(C.collar),
      tag: L(C.tag, 0x302010), tongue: L(C.tongue), eye: L(C.eye), eyeshine: new THREE.MeshBasicMaterial({ color: 0x8adf6a }),
    });
    const root = (this.root = new THREE.Group());
    g.scene.add(root);
    this.scaleGroup = new THREE.Group();
    root.add(this.scaleGroup);
    const body = (this.body = new THREE.Group());
    this.scaleGroup.add(body);

    // torso
    this.torso = new THREE.Group();
    this.torso.position.set(0, 0.44, 0);
    body.add(this.torso);
    this.torso.add(bx(0.22, 0.2, 0.5, M.coat, 0, 0, 0));
    this.torso.add(bx(0.2, 0.08, 0.36, M.white, 0, -0.09, -0.04));
    this.torso.add(bx(0.21, 0.22, 0.16, M.coat, 0, 0.01, -0.24));
    this.torso.add(bx(0.15, 0.14, 0.06, M.white, 0, -0.03, -0.32));
    this.torso.add(bx(0.2, 0.16, 0.12, M.coat, 0, 0.0, 0.25));

    // neck + head
    this.neck = new THREE.Group();
    this.neck.position.set(0, 0.07, -0.27);
    this.torso.add(this.neck);
    this.neck.add(bx(0.13, 0.15, 0.13, M.coat, 0, 0.06, -0.03));
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 4, 10), M.collar);
    collar.position.set(0, 0.05, -0.03);
    collar.rotation.x = Math.PI / 2 + 0.5;
    this.neck.add(collar);
    this.tag = bx(0.03, 0.035, 0.008, M.tag, 0, -0.03, -0.1);
    this.neck.add(this.tag);
    this.collarRing = new THREE.Object3D();
    this.collarRing.position.set(0, 0.11, 0.02);
    this.neck.add(this.collarRing);

    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 0.14, -0.06);
    this.neck.add(this.headPivot);
    this.head = new THREE.Group();
    this.headPivot.add(this.head);
    this.head.add(bx(0.17, 0.16, 0.17, M.coat, 0, 0.04, -0.06));
    this.head.add(bx(0.1, 0.07, 0.11, M.white, 0, -0.005, -0.18));
    this.head.add(bx(0.05, 0.035, 0.03, M.nose, 0, 0.025, -0.24));
    this.head.add(bx(0.1, 0.03, 0.06, M.white, 0, 0.12, -0.08));
    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = bx(0.03, 0.03, 0.01, M.eye, s * 0.048, 0.07, -0.146);
      this.head.add(e);
      this.eyes.push(e);
    }
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, -0.035, -0.13);
    this.head.add(this.jaw);
    this.jaw.add(bx(0.085, 0.022, 0.09, M.white, 0, -0.012, -0.04));
    this.tongue = bx(0.05, 0.01, 0.07, M.tongue, 0, -0.002, -0.06);
    this.tongue.visible = false;
    this.jaw.add(this.tongue);
    this.ears = [];
    for (const s of [-1, 1]) {
      const ep = new THREE.Group();
      ep.position.set(s * 0.085, 0.11, -0.03);
      this.head.add(ep);
      const ear = bx(0.03, 0.12, 0.08, M.dark, s * 0.012, -0.055, 0);
      ep.add(ear);
      this.ears.push({ g: ep, s, a: 0, v: 0 });
    }

    // tail
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.07, 0.3);
    this.torso.add(this.tail);
    this.tail.add(bx(0.045, 0.045, 0.13, M.coat, 0, 0, 0.065));
    this.tail2 = new THREE.Group();
    this.tail2.position.z = 0.13;
    this.tail.add(this.tail2);
    this.tail2.add(bx(0.038, 0.038, 0.1, M.white, 0, 0, 0.05));

    // legs: [x, z, front?]
    this.legs = [];
    for (const [x, z, front] of [[-0.075, -0.2, true], [0.075, -0.2, true], [-0.075, 0.19, false], [0.075, 0.19, false]]) {
      const hip = new THREE.Group();
      hip.position.set(x, 0.36, z);
      body.add(hip);
      hip.add(bx(0.065, 0.19, 0.075, M.coat, 0, -0.08, 0));
      const knee = new THREE.Group();
      knee.position.y = -0.18;
      hip.add(knee);
      knee.add(bx(0.052, 0.16, 0.055, front ? M.coat : M.coat, 0, -0.08, front ? 0 : 0.01));
      knee.add(bx(0.07, 0.04, 0.09, M.white, 0, -0.165, -0.015));
      this.legs.push({ hip, knee, front, phase: front ? (x < 0 ? 0 : Math.PI) : x < 0 ? Math.PI : 0 });
    }

    // leash line
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(20 * 3), 3));
    this.leashLine = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xc02428 }));
    this.leashLine.frustumCulled = false;
    this.leashLine.visible = false;
    g.scene.add(this.leashLine);

    // state
    this.age = 0;
    this.setAge(0);
    this.yaw = 0;
    this.vel = new THREE.Vector3();
    this.state = 'follow';
    this.stateT = 0;
    this.target = new THREE.Vector3();
    this.lookAt = null;          // world point of interest
    this.leashed = false;
    this.leashLen = 2.4;
    this.resist = 0;
    this.mood = 'happy';         // happy, curious, alert, scared
    this.w = { sit: 0, squat: 0, alert: 0, sniff: 0, cower: 0, mouth: 0, lie: 0 };
    this.wTarget = { sit: 0, squat: 0, alert: 0, sniff: 0, cower: 0, mouth: 0, lie: 0 };
    this.gait = 0;
    this.speed = 0;
    this.wag = 0;
    this.wagAmt = 0.6;
    this.wagRate = 9;
    this.tailUp = 0.6;
    this.headTurn = { y: 0, x: 0 };
    this.bodyRoll = 0;
    this.hop = 0;
    this.shakeT = 0;
    this.barkT = 0;
    this.growlT = 0;
    this.pantT = 0;
    this.jingleD = 0;
    this.idleT = 0;
    this.scripted = false;
    this.threat = null;
    this.home = null;
    this.eyeshine = false;
  }

  setAge(a) {
    this.age = a;
    const s = lerp(0.6, 1, a);
    this.scaleGroup.scale.setScalar(s);
    this.head.scale.setScalar(lerp(1.4, 1, a));
    const leg = lerp(0.78, 1, a);
    for (const l of this.legs || []) l.hip.scale.y = leg;
    this.legScale = leg;
    this.size = s;
  }

  place(x, z, yaw = 0) {
    this.root.position.set(x, this.g.world.groundHeight(x, z), z);
    this.yaw = yaw;
    this.root.rotation.y = yaw;
  }

  // world position of the collar ring (where the leash clips)
  collarWorld(out = new THREE.Vector3()) {
    return this.collarRing.getWorldPosition(out);
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateT = 0;
  }

  // ---------- sounds & gestures ----------
  yip(n = 1, gap = 0.28) {
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        this.g.audio.play('yip', { follow: this.head, vol: 0.9, vary: 0.12, verb: 0.4 });
        this.barkT = 0.22;
        this.hop = 1;
      }, i * gap * 1000);
    }
  }

  growl() {
    this.g.audio.play('growl', { follow: this.head, vol: 0.8, rate: 1.25, verb: 0.2 });
    this.growlT = 1.8;
  }

  whine() { this.g.audio.play('whine', { follow: this.head, vol: 0.6, rate: 1.1 }); }

  shake() {
    this.shakeT = 0.9;
    this.g.audio.play('shake', { follow: this.torso, vol: 0.7 });
  }

  // ---------- update ----------
  update(dt) {
    const g = this.g, P = g.player;
    this.stateT += dt;
    const pos = this.root.position;
    const ppos = P.pos;

    if (!this.scripted) this.think(dt);
    else if (!this.moveScripted) this.vel.set(0, 0, 0);

    // movement toward target (when not scripted or when scripted with move flag)
    let desiredSpeed = 0;
    if (!this.scripted || this.moveScripted) {
      _v.subVectors(this.target, pos);
      _v.y = 0;
      const d = _v.length();
      const maxSpd = this.maxSpeed || 3.2;
      if (d > 0.08) {
        desiredSpeed = Math.min(maxSpd, d * 2.6);
        if (d < 0.25) desiredSpeed *= d / 0.25;
        _v.divideScalar(d);
        this.vel.x = damp(this.vel.x, _v.x * desiredSpeed, 6, dt);
        this.vel.z = damp(this.vel.z, _v.z * desiredSpeed, 6, dt);
      } else {
        this.vel.x = damp(this.vel.x, 0, 8, dt);
        this.vel.z = damp(this.vel.z, 0, 8, dt);
      }
      const next = pos.clone().addScaledVector(this.vel, dt);
      g.world.collide(next, 0.16 * this.size, true, this.root);
      pos.x = next.x;
      pos.z = next.z;
    }

    // leash constraint: the dog can't get farther than the leash from Richie's hand
    if (this.leashed && !this.scripted) {
      const hand = this.handWorld(_w);
      _v.subVectors(pos, hand);
      _v.y = 0;
      const d = _v.length();
      if (d > this.leashLen) {
        _v.multiplyScalar(this.leashLen / d);
        const nx = hand.x + _v.x, nz = hand.z + _v.z;
        this.vel.x += (nx - pos.x) / Math.max(dt, 0.001) * 0.3;
        this.vel.z += (nz - pos.z) / Math.max(dt, 0.001) * 0.3;
        pos.x = nx;
        pos.z = nz;
        if (this.pullDir) P.pull.addScaledVector(this.pullDir, this.pullStrength * dt * 2);
      }
    }
    if (!this.scripted || this.moveScripted) {
      const gy = g.world.groundHeight(pos.x, pos.z);
      pos.y = damp(pos.y, gy, 12, dt);
    }

    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.speed = damp(this.speed, sp, 10, dt);

    // facing
    if (!this.scripted || this.moveScripted) {
      if (sp > 0.25) this.yaw = dampAngle(this.yaw, yawTo(this.vel.x, this.vel.z), 9, dt);
      else if (this.faceYaw !== undefined && this.faceYaw !== null) this.yaw = dampAngle(this.yaw, this.faceYaw, 5, dt);
    }
    this.root.rotation.y = this.yaw;

    this.animate(dt);
    this.updateLeash();
    this.sounds(dt);
  }

  handWorld(out) {
    const hand = this.g.hands.L;
    return hand.grip.getWorldPosition(out);
  }

  // Default brain: trot beside Richie on his left; when he stops, potter around and sniff.
  think(dt) {
    const P = this.g.player, pos = this.root.position;
    const moving = P.vel.lengthSq() > 0.04;
    const fw = P.forward.clone();
    const left = new THREE.Vector3(-Math.cos(P.yaw), 0, Math.sin(P.yaw));
    this.maxSpeed = 4.6;
    this.faceYaw = null;
    switch (this.state) {
      case 'follow': {
        this.setPoseTargets({});
        this.tailUp = 0.6;
        this.wagAmt = 0.5;
        this.wagRate = 8;
        this.target.copy(P.pos).addScaledVector(fw, moving ? 0.9 : 0.6).addScaledVector(left, 0.75);
        this.lookAt = null;
        if (!moving) {
          this.idleT += dt;
          if (this.idleT > 1.6 && this.leashed) {
            this.idleT = 0;
            const a = P.yaw + Math.PI / 2 + (Math.random() - 0.5) * 2.2;
            const r = 0.8 + Math.random() * 1.1;
            this.sniffAt = new THREE.Vector3(P.pos.x - Math.sin(a) * r, 0, P.pos.z - Math.cos(a) * r);
            this.setState('sniff');
          } else if (this.idleT > 1.2 && !this.leashed) {
            this.idleT = 0;
            this.setState('sit');
          }
        } else this.idleT = 0;
        break;
      }
      case 'sniff': {
        this.target.copy(this.sniffAt);
        const d = this.sniffAt.distanceTo(_w.set(pos.x, 0, pos.z));
        this.setPoseTargets({ sniff: d < 0.5 ? 1 : 0.4 });
        this.lookAt = this.sniffAt;
        this.wagAmt = 0.3;
        this.wagRate = 5;
        this.maxSpeed = 1.6;
        if (moving && this.stateT > 0.4) this.setState('follow');
        if (this.stateT > 3.5 + Math.random()) this.setState(Math.random() < 0.35 ? 'sit' : 'follow');
        break;
      }
      case 'sit': {
        this.target.copy(pos);
        this.setPoseTargets({ sit: 1 });
        this.lookAt = P.camera;
        this.wagAmt = 0.4;
        this.wagRate = 6;
        this.faceYaw = yawTo(P.pos.x - pos.x, P.pos.z - pos.z);
        if (moving) this.setState('follow');
        break;
      }
      case 'alert':
      case 'bark':
      case 'refuse': {
        // fixated on a threat: stiff, ears up, tail high and still
        const t = this.threat;
        this.target.copy(pos);
        if (this.state === 'refuse' && this.home) {
          // brace against the leash, leaning toward home
          this.target.copy(pos).addScaledVector(_v.subVectors(this.home, pos).setY(0).normalize(), 0.15);
        }
        this.setPoseTargets({ alert: 1, cower: this.state === 'refuse' ? 0.6 : 0 });
        this.lookAt = t;
        if (t) this.faceYaw = yawTo(t.x - pos.x, t.z - pos.z);
        this.wagAmt = 0.04;
        this.tailUp = this.state === 'refuse' ? -0.4 : 1.1;
        this.maxSpeed = 0.6;
        if (this.state === 'bark' && this.barkT <= 0 && Math.random() < dt * 2.2) this.yip(1 + Math.floor(Math.random() * 3), 0.24);
        if (this.state !== 'bark' && this.growlT <= 0 && Math.random() < dt * 0.25) this.growl();
        break;
      }
      case 'pull': {
        // drag Richie toward pullTarget
        const to = _v.subVectors(this.pullTarget, P.pos).setY(0);
        const d = to.length();
        to.normalize();
        this.pullDir = to.clone();
        this.pullStrength = this.pullStrength || 1.2;
        this.target.copy(P.pos).addScaledVector(to, this.leashLen + 0.6);
        this.setPoseTargets({ sniff: 0.3 });
        this.lookAt = null;
        this.wagAmt = 0.5;
        this.maxSpeed = 2.4;
        if (d < 2) this.setState('follow');
        break;
      }
      case 'stay': {
        this.target.copy(pos);
        this.setPoseTargets({ sit: 1 });
        this.lookAt = P.camera;
        break;
      }
    }
    if (this.state !== 'pull') this.pullDir = null;
    this.resist = this.state === 'refuse' ? 0.85 : this.state === 'alert' || this.state === 'bark' ? 0.45 : 0;
  }

  setPoseTargets(t) {
    for (const k in this.wTarget) this.wTarget[k] = t[k] || 0;
  }

  animate(dt) {
    const w = this.w;
    for (const k in w) if (k !== 'mouth') w[k] = damp(w[k], this.wTarget[k], 6, dt);
    const sp = this.speed;
    this.gait += (sp * dt * TAU) / (0.42 * this.size + 0.12);
    const amp = clamp(sp * 0.4, 0, 0.75);
    const fold = w.sit, squat = w.squat, lie = w.lie;

    // legs
    for (const l of this.legs) {
      const ph = this.gait + l.phase;
      let hipX = Math.sin(ph) * amp;
      let kneeX = l.front ? -Math.max(0, Math.cos(ph)) * amp * 1.0 : Math.max(0, -Math.cos(ph)) * amp * 1.1;
      if (!l.front) { hipX += fold * 1.25 + squat * 0.7 + lie * 1.4; kneeX -= fold * 2.0 + squat * 1.1 + lie * 2.2; }
      else { hipX -= squat * 0.15 + lie * 1.2; kneeX += lie * 0.4; }
      l.hip.rotation.x = hipX;
      l.knee.rotation.x = kneeX;
    }
    // body: bob, sit pitch, squat, alert
    const bob = Math.abs(Math.sin(this.gait)) * 0.012 * Math.min(1, sp);
    this.hop = damp(this.hop, 0, 9, dt);
    let shake = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      shake = Math.sin(this.shakeT * 55) * Math.min(1, this.shakeT * 3) * 0.45;
    }
    this.body.position.y = bob - fold * 0.1 - squat * 0.08 - lie * 0.2 + w.alert * 0.015 - w.cower * 0.05 + this.hop * 0.03;
    this.body.rotation.x = fold * 0.45 + squat * 0.18 - w.sniff * 0.05;
    this.body.rotation.z = shake;
    this.body.position.z = fold * 0.05;

    // head: look at point of interest (clamped), sniff nose-down, bark jerk
    let ty = 0, tx = 0;
    if (this.lookAt) {
      const la = this.lookAt.isObject3D ? this.lookAt.getWorldPosition(_lp) : this.lookAt;
      this.headPivot.parent.getWorldPosition(_v);
      const dx = la.x - _v.x, dz = la.z - _v.z, dy = la.y - _v.y;
      const baseYaw = this.root.parent === this.g.scene ? this.yaw : _e.setFromQuaternion(this.root.getWorldQuaternion(_q), 'YXZ').y;
      ty = clamp(nearAngle(0, yawTo(dx, dz) - baseYaw), -1.0, 1.0);
      tx = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.8, 0.7);
    }
    tx -= w.sniff * 0.8;
    tx += Math.sin(this.g.time * 14) * 0.06 * w.sniff;
    tx += this.barkT > 0 ? 0.25 : 0;
    this.headTurn.y = damp(this.headTurn.y, ty, 7, dt);
    this.headTurn.x = damp(this.headTurn.x, tx, 7, dt);
    this.headPivot.rotation.set(this.headTurn.x - fold * 0.35, this.headTurn.y, shake * 1.4 + (this.tilt || 0));
    this.neck.rotation.x = -w.sniff * 0.3 + w.alert * 0.15 - w.cower * 0.2;

    // mouth: bark snaps, panting when hot and happy
    this.barkT -= dt;
    this.growlT -= dt;
    const panting = this.pantLeft > 0 && sp < 0.5 && this.state !== 'alert' && this.state !== 'bark';
    let mouth = this.barkT > 0 ? 1 : panting ? 0.45 + Math.sin(this.g.time * 14) * 0.15 : 0;
    if (this.growlT > 0) mouth = 0.15;
    if (this.lickT > 0) { this.lickT -= dt; mouth = 0.6; }
    w.mouth = damp(w.mouth, mouth, 18, dt);
    this.jaw.rotation.x = w.mouth * 0.55;
    this.tongue.visible = panting || this.lickT > 0;
    this.tongue.position.z = this.lickT > 0 ? -0.09 : -0.06;

    // ears: spring toward pose, kicked by acceleration
    const earBase = w.alert * -0.6 + w.cower * 0.5;
    for (const e of this.ears) {
      const target = earBase + Math.sin(this.gait) * 0.12 * Math.min(1, sp) + shake * 2;
      e.v += (target - e.a) * 90 * dt;
      e.v *= Math.exp(-8 * dt);
      e.a += e.v * dt;
      e.g.rotation.set(w.alert * -0.3, 0, e.s * (0.15 + e.a * 0.8));
    }

    // tail
    this.wag += dt * this.wagRate;
    const wagNow = Math.sin(this.wag) * this.wagAmt;
    this.tail.rotation.set(-this.tailUp - fold * 0.4 - squat * 0.6, wagNow, 0);
    this.tail2.rotation.set(-0.3 * this.tailUp, wagNow * 0.8, 0);

    // eyes glow when lit at night
  }

  updateLeash() {
    const line = this.leashLine;
    line.visible = this.leashed || !!this.leashFrom;
    if (!line.visible) return;
    const a = this.leashFrom ? this.leashFrom.getWorldPosition(_w) : this.handWorld(_w);
    const b = this.collarWorld(_v);
    const pts = line.geometry.attributes.position.array;
    const dist = a.distanceTo(b);
    const slack = Math.max(0, this.leashLen - dist);
    const sag = Math.min(0.9, Math.sqrt(slack * this.leashLen) * 0.45);
    for (let i = 0; i < 20; i++) {
      const t = i / 19;
      let y = a.y + (b.y - a.y) * t - Math.sin(Math.PI * t) * sag;
      y = Math.max(y, 0.03);
      pts[i * 3] = a.x + (b.x - a.x) * t;
      pts[i * 3 + 1] = y;
      pts[i * 3 + 2] = a.z + (b.z - a.z) * t;
    }
    line.geometry.attributes.position.needsUpdate = true;
  }

  sounds(dt) {
    const g = this.g;
    // the tag jingles as he moves (and goes very quiet when he freezes)
    // An occasional soft tick of the tag, not a constant jingle.
    this.jingleD += this.speed * dt;
    if (this.jingleD > 1.4 + Math.random() * 1.4) {
      this.jingleD = 0;
      if (this.speed > 0.5 && Math.random() < 0.6) g.audio.play('jingle', { follow: this.tag, vol: 0.5 + Math.min(0.5, this.speed * 0.15), vary: 0.1, verb: 0.05, ref: 0.8 });
    }
    // Panting comes in short bursts when he's resting in the heat, then stops for a while.
    this.pantT -= dt;
    if (this.pantT <= 0) {
      if (this.pantLeft > 0) {
        this.pantLeft--;
        this.pantT = 0.32 + Math.random() * 0.06;
        g.audio.play('pant', { follow: this.head, vol: 0.8, vary: 0.08, verb: 0.02, ref: 0.6 });
      } else {
        this.pantT = 9 + Math.random() * 12;
        if (this.panting && this.speed < 0.3 && this.state !== 'alert' && this.state !== 'bark') this.pantLeft = 4 + Math.floor(Math.random() * 4);
      }
    }
    this.sniffT = (this.sniffT || 0) - dt;
    if (this.state === 'sniff' && this.w.sniff > 0.7 && this.sniffT <= 0) {
      this.sniffT = 1.6 + Math.random() * 2;
      g.audio.play('sniff', { follow: this.head, vol: 0.9, ref: 0.6 });
    }
  }

  // ---------- scripted helpers (cutscenes) ----------
  async walkTo(x, z, speed = 1.6) {
    this.scripted = true;
    this.moveScripted = true;
    this.maxSpeed = speed;
    this.target.set(x, 0, z);
    await this.g.tw.until(() => Math.hypot(this.root.position.x - x, this.root.position.z - z) < 0.12, 12);
    this.vel.set(0, 0, 0);
  }

  release() {
    this.scripted = false;
    this.moveScripted = false;
    this.setState('follow');
  }
}
