import * as THREE from 'three';
import { clamp, damp, nearAngle, yawTo } from '../core/util.js';

// Richie. A rig at his feet (yaw), a head (pitch + roll), a "look" group for free-look
// during cutscenes, then the camera. Hands hang off the head so they stay put when the
// player glances around mid-cutscene.

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

export class Player {
  constructor(g) {
    this.g = g;
    this.rig = new THREE.Group();
    this.head = new THREE.Group();
    this.head.rotation.order = 'YXZ';
    this.look = new THREE.Group();
    this.look.rotation.order = 'YXZ';
    this.camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.03, 900);
    this.rig.add(this.head);
    this.head.add(this.look);
    this.look.add(this.camera);
    g.scene.add(this.rig);

    this.pos = this.rig.position;
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.eye = 1.62;
    this.vel = new THREE.Vector3();
    this.control = false;
    this.freeLook = true;      // during cutscenes, mouse adds a little head-turn
    this.cut = { yaw: 0, pitch: 0 };
    this.dip = 0; // extra glance down (lighting a cigarette) that doesn't fight the mouse
    this.bob = 0;
    this.bobAmt = 0;
    this.lastStep = 0;
    this.groundY = 0;
    this.followGround = true;
    this.lastPos = new THREE.Vector3();
    this.attached = null;

    this.nerves = 0;
    this.nervesTarget = 0;
    this.calm = 0;
    this.pull = new THREE.Vector3(); // leash tug from Moose (m/s)
    this.speedMul = 1;
    this.boundsCooldown = 0;
  }

  get forward() { return _a.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  place(x, z, yaw = this.yaw, pitch = 0) {
    this.pos.set(x, this.g.world.groundHeight(x, z), z);
    this.groundY = this.pos.y;
    this.yaw = yaw;
    this.pitch = pitch;
    this.lastPos.copy(this.pos);
  }

  update(dt) {
    const g = this.g, inp = g.input;
    const sens = g.settings.sens * 0.0021;

    if (this.control) {
      this.yaw -= inp.dx * sens;
      this.pitch = clamp(this.pitch - inp.dy * sens, -1.45, 1.45);
      this.cut.yaw = damp(this.cut.yaw, 0, 6, dt);
      this.cut.pitch = damp(this.cut.pitch, 0, 6, dt);
    } else {
      if (this.freeLook) {
        this.cut.yaw = clamp(this.cut.yaw - inp.dx * sens * 0.7, -0.6, 0.6);
        this.cut.pitch = clamp(this.cut.pitch - inp.dy * sens * 0.7, -0.35, 0.35);
      }
      this.cut.yaw = damp(this.cut.yaw, 0, 0.8, dt);
      this.cut.pitch = damp(this.cut.pitch, 0, 0.8, dt);
    }

    if (this.attached) {
      this.vel.set(0, 0, 0);
    } else if (this.control) {
      const f = (inp.keys.KeyW || inp.keys.ArrowUp ? 1 : 0) - (inp.keys.KeyS || inp.keys.ArrowDown ? 1 : 0);
      const s = (inp.keys.KeyD || inp.keys.ArrowRight ? 1 : 0) - (inp.keys.KeyA || inp.keys.ArrowLeft ? 1 : 0);
      const fw = _a.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const rt = _b.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const wish = new THREE.Vector3().addScaledVector(fw, f).addScaledVector(rt, s);
      if (wish.lengthSq() > 1) wish.normalize();
      const run = inp.keys.ShiftLeft || inp.keys.ShiftRight;
      const speed = (run ? 3.6 : 2.25) * this.speedMul * (f < 0 ? 0.75 : 1);
      this.vel.x = damp(this.vel.x, wish.x * speed, 9, dt);
      this.vel.z = damp(this.vel.z, wish.z * speed, 9, dt);

      // Moose on the leash: refusing makes walking away hard, pulling drags you along.
      const dog = g.dog;
      if (dog && dog.leashed) {
        const toDog = _b.subVectors(dog.root.position, this.pos);
        toDog.y = 0;
        const dist = toDog.length();
        if (dist > dog.leashLen * 0.92 && dog.resist > 0) {
          toDog.divideScalar(dist);
          const away = -this.vel.dot(toDog);
          if (away > 0) this.vel.addScaledVector(toDog, away * dog.resist);
        }
      }
      const next = this.pos.clone().addScaledVector(this.vel, dt).addScaledVector(this.pull, dt);
      const hit = g.world.collide(next, 0.28, true, this.rig, true);
      if (hit && this.boundsCooldown <= 0) {
        this.boundsCooldown = 14;
        g.story.onBounds(hit);
      }
      this.pos.x = next.x;
      this.pos.z = next.z;
    } else {
      this.vel.set(0, 0, 0);
    }
    this.boundsCooldown -= dt;
    this.pull.multiplyScalar(Math.exp(-dt * 4));

    if (!this.attached && this.followGround) {
      const gy = g.world.groundHeight(this.pos.x, this.pos.z);
      this.groundY = damp(this.groundY, gy, 14, dt);
      this.pos.y = this.groundY;
    }

    // head bob + footsteps from actual movement (cutscene walking bobs too)
    const moved = this.attached ? 0 : Math.hypot(this.pos.x - this.lastPos.x, this.pos.z - this.lastPos.z);
    this.lastPos.copy(this.pos);
    const spd = dt > 0 ? moved / dt : 0;
    this.bobAmt = damp(this.bobAmt, Math.min(1, spd / 1.5), 8, dt);
    if (spd > 0.15) {
      const prev = this.bob;
      this.bob += moved * (Math.PI * 2) / 1.7;
      if (Math.floor(prev / Math.PI) !== Math.floor(this.bob / Math.PI)) this.footstep(spd);
    }

    // nerves settle toward the target; a cigarette or a cuddle buys some calm
    this.calm = Math.max(0, this.calm - dt * 0.012);
    this.nerves = damp(this.nerves, clamp(this.nervesTarget - this.calm, 0, 1), 0.6, dt);
    g.renderer.nerves = this.nerves * 0.8;

    const t = g.time;
    const sway = Math.sin(t * 0.9) * 0.006 * this.nerves + Math.sin(t * 7.3) * 0.0015 * this.nerves;
    this.rig.rotation.y = this.attached ? this.attachYaw : this.yaw;
    this.head.position.set(Math.cos(this.bob * 0.5) * 0.018 * this.bobAmt, this.eye + Math.abs(Math.sin(this.bob * 0.5)) * 0.035 * this.bobAmt - 0.02 * this.bobAmt, 0);
    if (this.attached) this.head.rotation.set(this.pitch, this.yaw - this.attachYaw, this.roll + sway);
    else this.head.rotation.set(this.pitch, 0, this.roll + sway);
    this.look.rotation.set(this.cut.pitch + this.dip, this.cut.yaw, 0);
  }

  footstep(spd) {
    const g = this.g;
    const surf = this.pos.y > 0.25 ? (g.world.surfaceAt(this.pos.x, this.pos.z) === 'wood' ? 'wood' : 'concrete') : g.world.surfaceAt(this.pos.x, this.pos.z);
    const p = this.pos.clone();
    p.y += 0.05;
    g.audio.step(surf, p, Math.min(1.2, 0.6 + spd * 0.25));
    if (g.story && g.story.onStep) g.story.onStep(p, surf);
  }

  // ---------- cutscene helpers ----------
  eyeWorld(out = new THREE.Vector3()) { return this.camera.getWorldPosition(out); }

  turnTo(yaw, pitch = this.pitch, dur = 0.6, ease = 'inOutSine') {
    return this.g.tw.to(this, { yaw: nearAngle(this.yaw, yaw), pitch }, dur, ease);
  }

  lookAt(p, dur = 0.6, ease = 'inOutSine') {
    const e = this.eyeWorld();
    const dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z;
    return this.turnTo(yawTo(dx, dz), Math.atan2(dy, Math.hypot(dx, dz)), dur, ease);
  }

  // Walk somewhere (bob + footsteps happen automatically).
  async walkTo(x, z, speed = 1.35, faceYaw = null) {
    const d = Math.hypot(x - this.pos.x, z - this.pos.z);
    if (d < 0.02) return;
    const turn = this.turnTo(faceYaw !== null ? faceYaw : yawTo(x - this.pos.x, z - this.pos.z), this.pitch * 0.5, Math.min(0.5, d / speed));
    await Promise.all([turn, this.g.tw.to(this.pos, { x, z }, d / speed, 'inOutSine')]);
  }

  async moveTo(x, z, dur, ease = 'inOutSine') {
    await this.g.tw.to(this.pos, { x, z }, dur, ease);
  }

  attach(obj, local, yaw) {
    obj.add(this.rig);
    this.rig.position.copy(local);
    this.pos = this.rig.position;
    this.attached = obj;
    this.attachYaw = 0;
    this.yaw = yaw;
  }

  detach() {
    const obj = this.attached;
    if (!obj) return;
    const wp = this.rig.getWorldPosition(new THREE.Vector3());
    const parentYaw = new THREE.Euler().setFromQuaternion(obj.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
    this.g.scene.add(this.rig);
    this.rig.position.copy(wp);
    this.pos = this.rig.position;
    this.yaw = this.yaw + parentYaw;
    this.attached = null;
    this.groundY = wp.y;
    this.lastPos.copy(wp);
  }
}
