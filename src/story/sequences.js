import * as THREE from 'three';
import { Ease } from '../core/tween.js';
import { POSES } from '../player/hands.js';
import { yawTo, pick, clamp } from '../core/util.js';
import { makeProps, Smoke } from './props.js';

// The hand-animated transitions. Each is an async function: camera moves, hand reaches,
// finger poses, props changing hands, sounds on contact. Arm positions are in head space.

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _q = new THREE.Quaternion();

export class Seq {
  constructor(g) {
    this.g = g;
    this.P = makeProps(g);
    this.fx = new Smoke(g);
    this.mouth = new THREE.Object3D();
    this.mouth.position.set(0.012, -0.08, -0.05);
    g.player.head.add(this.mouth);
    this.cigState = 'none';
    this.cigs = 18;
    this.handsBusy = false;
    this.holding = null;
    this.wispT = 0;
    this.thrown = [];
  }

  get tw() { return this.g.tw; }

  // ---------- arm helpers ----------
  take(arm) { arm.manual = true; }
  give(arm) { arm.manual = false; }

  // Slide an arm (wrist) toward a moving world target over `dur`.
  track(arm, getWorld, dur, ease = 'inOutSine', offset = null) {
    const H = this.g.hands, start = arm.group.position.clone(), fn = Ease[ease] || Ease.inOutSine;
    const t = V();
    return this.tw.during(dur, (k) => {
      H.toLocal(getWorld(), t);
      if (offset) t.add(offset);
      arm.group.position.lerpVectors(start, t, fn(k));
    });
  }

  // Nudge an arm so that a point it carries (prop, fingertip) lands on a world target.
  alignTo(arm, getPoint, getTarget, dur = 0.3) {
    const H = this.g.hands, a = V(), b = V();
    return this.tw.during(dur, (k) => {
      H.toLocal(getPoint(), a);
      H.toLocal(getTarget(), b);
      arm.group.position.addScaledVector(b.sub(a), Math.min(1, 0.2 + k * 0.6));
    });
  }

  // Keep a point the arm carries glued to a world target for `dur` seconds.
  glue(arm, getPoint, getTarget, dur) {
    const H = this.g.hands, a = V(), b = V();
    return this.tw.during(dur, () => {
      H.toLocal(getPoint(), a);
      H.toLocal(getTarget(), b);
      arm.group.position.add(b.sub(a));
    });
  }

  moveArm(arm, p, r, dur = 0.5, ease = 'inOutSine') {
    const ps = [this.tw.to(arm.group.position, { x: p[0], y: p[1], z: p[2] }, dur, ease)];
    if (r) ps.push(this.tw.to(arm.group.rotation, { x: r[0], y: r[1], z: r[2] }, dur, ease));
    return Promise.all(ps);
  }

  rot(arm, r, dur = 0.4, ease) { return this.tw.to(arm.group.rotation, { x: r[0], y: r[1], z: r[2] }, dur, ease); }
  pose(arm, name, dur = 0.25) { return this.tw.to(arm.pose, { ...POSES[name] }, dur); }

  kneel(eye, dur = 0.7) {
    this.g.audio.play('cloth', { vol: 0.45 });
    return this.tw.to(this.g.player, { eye }, dur, 'inOutSine');
  }

  richie(text, opts) { return this.g.voice.speak('richie', text, opts); }
  sfx(name, o = {}) { return this.g.audio.play(name, o); }
  w(obj, x = 0, y = 0, z = 0) { return obj.localToWorld(V(x, y, z)); }

  // ---------- per-frame: cigarette burn, smoke, props that dangle ----------
  update(dt) {
    const g = this.g, c = this.P.cig;
    this.fx.update(dt);
    if (c.lit) {
      this.P.setBurn(Math.min(1, c.burn + dt / 60));
      c.glow = Math.max(0.3, c.glow - dt * 0.6);
      const k = c.glow * (0.85 + Math.random() * 0.15);
      c.emberMat.color.setRGB(0.2 + k * 0.8, 0.12 + k * 0.28, 0.08 + k * 0.02);
      this.wispT -= dt;
      if (this.wispT <= 0) {
        this.wispT = 0.14;
        this.fx.emit(c.tip.getWorldPosition(V()), V((Math.random() - 0.5) * 0.02, 0.12, (Math.random() - 0.5) * 0.02), { size: 0.02, grow: 0.12, life: 1.8, op: 0.22 });
      }
      const H = g.hands;
      if (g.atmos.mode === 'night') {
        H.toLocal(c.tip.getWorldPosition(V()), H.light.position);
        H.light.intensity = this.flame ? 0.35 : 0.02 + c.glow * 0.08;
      } else H.light.intensity = 0;
      if (c.burn >= 1 && !this.handsBusy && !g.busy) this.flickCig();
    } else if (!this.flame) g.hands.light.intensity = 0;
    if (this.flame) {
      const f = this.P.lighter.flame;
      f.scale.set(1 + Math.random() * 0.2, 0.8 + Math.random() * 0.5, 1 + Math.random() * 0.2);
      g.hands.toLocal(f.getWorldPosition(V()), g.hands.light.position);
      g.hands.light.intensity = (g.atmos.mode === 'night' ? 0.35 : 0.04) * (1 + Math.random() * 0.3);
    }
    // the poop bag always dangles straight down
    if (this.holding === 'bag') {
      const b = this.P.bag.full;
      if (b.parent) {
        b.parent.getWorldQuaternion(_q).invert();
        b.quaternion.copy(_q);
        b.rotateZ(Math.sin(g.time * 3) * 0.12 * (0.3 + g.player.bobAmt));
      }
    }
    // thrown things (cigarette butts)
    for (const t of this.thrown) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (!t.landed) {
        t.vel.y -= 9.8 * dt;
        t.obj.position.addScaledVector(t.vel, dt);
        t.obj.rotation.x += dt * 9;
        if (t.obj.position.y < 0.02) { t.obj.position.y = 0.02; t.landed = true; t.obj.rotation.set(Math.PI / 2, 0, Math.random() * 6); }
      }
      t.glow = Math.max(0, t.glow - dt * 0.25);
      if (t.mat) t.mat.color.setRGB(0.15 + t.glow * 0.85, 0.1 + t.glow * 0.25, 0.08);
      if (t.life <= 0 && t.obj.parent) t.obj.parent.remove(t.obj);
    }
  }

  // ================================================================ THE CAR
  async introCar(djLines) {
    const g = this.g, { player: P, hands: H, dog: D, audio: A, tw } = g, car = g.car;
    const pts = [[-125, 2], [-80, 2], [-40, 2], [-29, 2.4], [-25.2, 5.4], [-24.4, 9.8], [-24.4, 13.6]].map(([x, z]) => V(x, 0, z));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const placeCar = (u) => {
      const p = curve.getPointAt(u), t = curve.getTangentAt(u);
      car.root.position.copy(p);
      car.root.rotation.y = yawTo(t.x, t.z);
    };
    placeCar(0);
    car.root.updateMatrixWorld(true);
    P.attach(car.root, V(-0.38, 0.05, 0.1), 0);
    P.eye = 1.07;
    P.pitch = -0.08;
    car.root.add(D.root);
    D.root.position.copy(car.passengerSeat);
    D.yaw = 0;
    D.scripted = true;
    D.moveScripted = false;
    D.setPoseTargets({ sit: 1 });
    D.lookAt = null;
    D.panting = true;

    // hands on the wheel at ten and two; they turn with it
    this.take(H.L);
    this.take(H.R);
    Object.assign(H.L.pose, POSES.grip);
    Object.assign(H.R.pose, POSES.grip);
    H.L.group.rotation.set(0.55, 0.15, 1.35);
    H.R.group.rotation.set(0.55, -0.15, -1.35);
    // Hands ride the rim for small turns, then slide (no hand-over-hand cross-ups).
    const rim = { L: V(-0.165, 0.09, 0.03), R: V(0.165, 0.09, 0.03) };
    const on = { L: true, R: true };
    const hook = () => {
      const a = clamp(car.wheel.rotation.z, -0.7, 0.7);
      for (const s of ['L', 'R']) {
        if (!on[s]) continue;
        const p = rim[s].clone().applyAxisAngle(V(0, 0, 1), a);
        H.toLocal(car.wheel.parent.localToWorld(p), H[s].group.position).add(V(0, -0.02, 0.05));
      }
    };
    g.hooks.add(hook);

    A.setMuffle(650, 0.01);
    const engine = A.loop('engine', { follow: car.root, vol: 0.5, verb: 0.03, ref: 2.5 });
    tw.to(g.renderer, { fade: 0 }, 3.5);

    // The radio: the tail of one song, then the DJ talking over the next one's intro.
    const R = { follow: car.radio, verb: 0.02, ref: 1.0, vary: 0 };
    let song = A.play('radio_a', { ...R, vol: 0.85, at: 60 });
    const show = (async () => {
      await tw.wait(5.5);
      A.stop(song, 2.2);
      await tw.wait(1.4);
      song = A.play('radio_b', { ...R, vol: 0.3 });
      await tw.wait(0.8);
      for (const line of djLines) await g.voice.speak('dj', line, { vol: 0.8 });
      A.setVol(song, 0.8, 1.8);
    })();

    // Drive: the car rolls into turns, dips its nose under braking, and bumps a little.
    const total = curve.getLength();
    let lastYaw = car.root.rotation.y, steer = 0, lastU = 0, v = 0, acc = 0, roll = 0, pitch = 0;
    const drive = tw.during(17, (k, dt) => {
      const u = Math.min(0.9999, 1 - Math.pow(1 - k, 2.2));
      placeCar(u);
      const h = Math.max(dt, 1e-3);
      const y = car.root.rotation.y;
      let yr = y - lastYaw;
      if (yr > Math.PI) yr -= Math.PI * 2;
      if (yr < -Math.PI) yr += Math.PI * 2;
      lastYaw = y;
      const nv = ((u - lastU) * total) / h;
      lastU = u;
      acc += ((nv - v) / h - acc) * Math.min(1, dt * 4);
      v = nv;
      steer += ((yr / h) * 2.4 - steer) * Math.min(1, dt * 5);
      car.wheel.rotation.z = clamp(steer, -2.4, 2.4);
      roll += (clamp(-(yr / h) * v * 0.01, -0.035, 0.035) - roll) * Math.min(1, dt * 3);
      pitch += (clamp(acc * 0.008, -0.025, 0.02) - pitch) * Math.min(1, dt * 4);
      const t = g.time;
      car.root.rotation.x = pitch + (Math.sin(t * 11.3) * Math.sin(t * 3.1)) * 0.0025 * Math.min(1, v / 6);
      car.root.rotation.z = roll + Math.sin(t * 7.7) * 0.0015 * Math.min(1, v / 6);
      car.root.position.y = Math.abs(Math.sin(t * 9.1) * Math.sin(t * 2.3)) * 0.006 * Math.min(1, v / 6);
      // eyes lead into the turn
      P.extraYaw = clamp((yr / h) * 0.35, -0.35, 0.35);
      if (engine) engine.src.playbackRate.value = 0.8 + Math.min(1, v / 12) * 0.5;
    });
    // Richie isn't a statue: he checks the houses, the radio, Moose.
    const glances = (async () => {
      await tw.wait(3.4);
      await P.turnTo(0.6, -0.02, 1.2);
      await tw.wait(1.3);
      await P.turnTo(0.04, -0.08, 1.0);
      await tw.wait(1.9);
      await P.turnTo(-0.42, -0.45, 0.8);
      await tw.wait(1.1);
      await P.turnTo(0, -0.08, 0.9);
      await tw.wait(2.2);
      D.lookAt = P.camera;
      D.wagAmt = 0.8;
      await P.turnTo(-0.9, -0.36, 0.9);
      await tw.wait(1.2);
      D.lookAt = null;
      await P.turnTo(0, -0.1, 0.9);
    })();
    await drive;
    await glances;
    P.extraYaw = 0;
    car.wheel.rotation.z = 0;
    // settle on the springs
    await tw.to(car.root.rotation, { x: -0.022 }, 0.25, 'outQuad');
    await tw.to(car.root.rotation, { x: 0.008 }, 0.35, 'inOutSine');
    await tw.to(car.root.rotation, { x: 0, z: 0 }, 0.4, 'inOutSine');
    car.root.position.y = 0;
    await show;
    await tw.wait(1.4);

    await this.richie('Okay. Okay, Moose. Th-this is it.');
    D.wagAmt = 1;
    D.wagRate = 14;
    D.yip(1);

    // reach for the key, turn it off
    on.R = false;
    const keyW = () => car.key.localToWorld(V(0.03, 0, 0));
    await Promise.all([this.track(H.R, keyW, 0.6, 'inOutSine', V(0.02, -0.03, 0.09)), this.rot(H.R, [0.2, -0.3, -1.45], 0.6), this.pose(H.R, 'pinch', 0.5)]);
    await this.alignTo(H.R, () => H.R.grip.getWorldPosition(V()), keyW, 0.2);
    this.sfx('key', { follow: car.key, vol: 0.6 });
    await Promise.all([tw.to(H.R.group.rotation, { z: -2.25 }, 0.35), tw.to(car.key.rotation, { x: -1.0 }, 0.35)]);
    A.stop(engine, 0.2);
    A.stop(song, 0.03);
    car.radio.visible = false;
    this.sfx('engine_off', { follow: car.root, vol: 0.55 });
    g.ui.vhs('JUN 17 1995<br>8:07 AM');
    await tw.wait(0.3);
    this.give(H.R);
    H.R.setRest('none');
    await tw.wait(1.4);
    await this.richie('Home sweet... uh. Home.');

    // look over at Moose
    await P.turnTo(-0.95, -0.5, 0.9);
    D.lookAt = P.camera;
    D.yip(2, 0.22);
    await this.richie("Stay. Stay. I'll come around and get you.");
    await tw.wait(0.3);

    // open the driver door
    on.L = false;
    g.hooks.delete(hook);
    await P.turnTo(0.9, -0.22, 0.75);
    const door = car.doors.driver;
    const handleW = () => door.pivot.localToWorld(door.handleLocal.clone());
    await Promise.all([this.track(H.L, handleW, 0.55, 'inOutSine', V(0.0, -0.02, 0.06)), this.rot(H.L, [0.25, 0.4, 1.45], 0.55), this.pose(H.L, 'open', 0.3)]);
    await this.pose(H.L, 'grip', 0.15);
    this.sfx('car_door_open', { follow: door.pivot, vol: 0.7 });
    A.setMuffle(20000, 1.5);
    await Promise.all([this.glue(H.L, () => H.L.grip.getWorldPosition(V()), handleW, 0.5), tw.to(door.pivot.rotation, { y: -0.5 }, 0.5, 'outQuad')]);
    this.give(H.L);
    H.L.setRest('none');
    await tw.to(door.pivot.rotation, { y: -1.15 }, 0.55, 'outCubic');

    // swing the legs out, duck under the roof, stand up
    const carYaw = car.root.rotation.y;
    P.detach();
    const left = V(-Math.cos(carYaw), 0, Math.sin(carYaw)), fwd = V(-Math.sin(carYaw), 0, -Math.cos(carYaw));
    const p0 = P.pos.clone();
    const p1 = p0.clone().addScaledVector(left, 0.6).addScaledVector(fwd, 0.15);
    const p2 = p0.clone().addScaledVector(left, 1.3).addScaledVector(fwd, -0.1);
    this.sfx('cloth', { vol: 0.6 });
    await Promise.all([P.turnTo(carYaw + Math.PI / 2, -0.4, 0.7), tw.to(P, { eye: 0.98 }, 0.7), P.moveTo(p1.x, p1.z, 0.75)]);
    this.sfx('breath_out', { vol: 0.35 });
    await Promise.all([tw.to(P, { eye: 1.62 }, 1.0), P.moveTo(p2.x, p2.z, 1.0), tw.to(P, { pitch: 0 }, 1.0), tw.to(P, { roll: 0.04 }, 0.5)]);
    tw.to(P, { roll: 0 }, 0.5);

    // and shut the door behind him
    await this.closeCarDoor(door, carYaw - Math.PI / 2 + 0.75);
    g.world.addCollider(this.carCollider());
  }

  carCollider() {
    const car = this.g.car, p = car.root.position, y = car.root.rotation.y;
    const c = Math.abs(Math.cos(y)), s = Math.abs(Math.sin(y));
    const hx = c * car.W / 2 + s * car.L / 2, hz = s * car.W / 2 + c * car.L / 2;
    return { minX: p.x - hx, maxX: p.x + hx, minZ: p.z - hz, maxZ: p.z + hz, vehicle: true };
  }

  async closeCarDoor(door, lookYaw = null) {
    const { player: P, hands: H, tw } = this.g;
    const edge = () => door.pivot.localToWorld(V(door.side * 0.06, 0.95, 1.2));
    if (lookYaw !== null) await P.turnTo(lookYaw, -0.2, 0.6);
    else await P.lookAt(edge(), 0.5);
    this.take(H.R);
    H.R.group.position.set(0.3, -0.7, -0.25);
    await Promise.all([this.track(H.R, edge, 0.45, 'outCubic', V(0, -0.02, 0.07)), this.rot(H.R, [0.6, 0.4, -0.3], 0.45), this.pose(H.R, 'open', 0.3)]);
    await Promise.all([this.glue(H.R, () => H.R.grip.getWorldPosition(V()), edge, 0.32), tw.to(door.pivot.rotation, { y: 0 }, 0.32, 'inQuad')]);
    this.sfx('car_door_close', { follow: door.pivot, vol: 0.9 });
    this.g.dog.lookAt = this.g.player.camera;
    this.give(H.R);
    await tw.wait(0.2);
  }

  // Clip the leash onto Moose's collar. Assumes Richie is close and looking at him.
  async clipLeash(fromCoil = null) {
    const g = this.g, { hands: H, dog: D, tw } = g;
    const collar = () => D.collarWorld(V());
    this.take(H.L);
    this.take(H.R);
    await Promise.all([this.track(H.L, collar, 0.55, 'inOutSine', V(-0.05, 0.02, 0.07)), this.rot(H.L, [0.45, -0.2, 1.35], 0.55), this.pose(H.L, 'open', 0.3)]);
    await this.pose(H.L, 'grip', 0.2);
    D.lookAt = H.L.grip;
    const clip = this.P.clip;
    if (fromCoil) fromCoil.visible = false;
    H.R.grip.add(clip);
    clip.position.set(0, 0, -0.01);
    clip.rotation.set(0, 0, 0);
    clip.visible = true;
    D.leashFrom = clip;
    if (!fromCoil) H.R.group.position.set(0.22, -0.65, -0.3);
    await Promise.all([this.track(H.R, collar, 0.75, 'outCubic', V(0.05, 0.0, 0.06)), this.rot(H.R, [0.5, 0.3, -1.25], 0.75), this.pose(H.R, 'pinch', 0.3)]);
    await Promise.all([
      this.alignTo(H.R, () => clip.getWorldPosition(V()), collar, 0.4),
      this.glue(H.L, () => H.L.grip.getWorldPosition(V()), () => collar().add(V(0, 0.03, 0)), 0.4),
    ]);
    this.sfx('clip', { follow: D.neck, vol: 0.8 });
    D.collarRing.attach(clip);
    D.leashFrom = null;
    D.leashed = true;
    this.give(H.L);
    H.L.setRest('leash');
    // Moose licks the hand that's still there
    D.lookAt = H.R.grip;
    D.lickT = 0.8;
    D.wagAmt = 1.2;
    D.wagRate = 16;
    this.sfx('lick', { follow: D.head, vol: 0.6 });
    await tw.wait(0.5);
    this.give(H.R);
    H.R.setRest('none');
  }

  async leashFromCar() {
    const g = this.g, { player: P, hands: H, dog: D, tw } = g, car = g.car, door = car.doors.passenger;
    const W = (x, y, z) => car.root.localToWorld(V(x, y, z));
    const stand = W(car.W / 2 + 0.85, 0, 0.8);
    const handleW = () => door.pivot.localToWorld(door.outerHandle.clone());
    await P.walkTo(stand.x, stand.z, 1.3);
    await P.lookAt(handleW(), 0.45);
    this.take(H.R);
    H.R.group.position.set(0.3, -0.7, -0.25);
    await Promise.all([this.track(H.R, handleW, 0.5, 'outCubic', V(0, -0.02, 0.07)), this.rot(H.R, [0.2, 0.3, -1.5], 0.5), this.pose(H.R, 'open', 0.25)]);
    await this.pose(H.R, 'grip', 0.12);
    this.sfx('car_door_open', { follow: door.pivot, vol: 0.7 });
    await Promise.all([this.glue(H.R, () => H.R.grip.getWorldPosition(V()), handleW, 0.55), tw.to(door.pivot.rotation, { y: 0.55 }, 0.55, 'outQuad')]);
    tw.to(door.pivot.rotation, { y: 1.2 }, 0.6, 'outCubic');
    this.give(H.R);
    // Moose gets up, all wiggles
    D.setPoseTargets({});
    D.wagAmt = 1.3;
    D.wagRate = 17;
    D.yip(2, 0.2);
    const lean = W(car.W / 2 + 0.12, 0, 0.18);
    await Promise.all([P.moveTo(lean.x, lean.z, 0.8), tw.to(P, { eye: 1.2 }, 0.8), P.lookAt(D.collarWorld(V()).add(V(0, 0.12, 0)), 0.8)]);
    await this.clipLeash();
    await this.richie('Ha— okay, okay. Good boy.');
    await Promise.all([P.moveTo(stand.x, stand.z, 0.7), tw.to(P, { eye: 1.62 }, 0.7)]);
    await P.lookAt(D.collarWorld(V()).add(V(0, 0.12, 0)), 0.4);
    await this.richie('Okay. Out you come.');

    // hop down
    g.scene.attach(D.root);
    const from = D.root.position.clone();
    const to = P.pos.clone().addScaledVector(P.forward, 0.55).addScaledVector(V(-Math.cos(P.yaw), 0, Math.sin(P.yaw)), 0.55);
    to.y = 0;
    D.yaw = yawTo(to.x - from.x, to.z - from.z);
    D.root.rotation.set(0, D.yaw, 0);
    this.sfx('jingle', { follow: D.tag, vol: 0.5 });
    await tw.during(0.55, (k) => {
      D.root.position.lerpVectors(from, to, k);
      D.root.position.y += Math.sin(Math.PI * k) * 0.3;
    });
    this.sfx('land', { pos: to, vol: 0.7 });
    this.sfx('jingle', { follow: D.tag, vol: 0.6 });
    await tw.wait(0.3);
    D.shake();
    await tw.wait(1.0);
    await this.closeCarDoor(door);
    D.release();
  }

  // Night: grab the leash off the coat hook, kneel, clip it on.
  async leashFromHook(hookPos) {
    const g = this.g, { player: P, hands: H, dog: D, tw } = g;
    const coil = this.P.coil;
    await P.lookAt(hookPos, 0.6);
    this.take(H.R);
    H.R.group.position.set(0.3, -0.7, -0.25);
    await Promise.all([this.track(H.R, () => hookPos, 0.6, 'outCubic', V(0, -0.06, 0.08)), this.rot(H.R, [0.7, 0, -1.3], 0.6), this.pose(H.R, 'open', 0.3)]);
    await this.alignTo(H.R, () => H.R.grip.getWorldPosition(V()), () => coil.getWorldPosition(V()), 0.2);
    await this.pose(H.R, 'grip', 0.15);
    H.R.grip.attach(coil);
    this.sfx('jingle', { pos: hookPos, vol: 0.25, rate: 0.7 });
    await this.moveArm(H.R, [0.22, -0.35, -0.38], null, 0.45);
    // step up to Moose and turn him around to face you
    const dp = D.root.position.clone();
    const dir = V(P.pos.x - dp.x, 0, P.pos.z - dp.z).normalize();
    const stand = dp.clone().addScaledVector(dir, 0.5);
    D.lookAt = P.camera;
    D.yaw = yawTo(dir.x, dir.z);
    D.root.rotation.y = D.yaw;
    D.setPoseTargets({ sit: 1 });
    await P.walkTo(stand.x, stand.z, 1.0, yawTo(-dir.x, -dir.z));
    await Promise.all([P.lookAt(D.collarWorld(V()).add(V(0, 0.12, 0)), 0.7), this.kneel(0.72, 0.8)]);
    await this.clipLeash(coil);
    if (coil.parent) coil.parent.remove(coil);
    await this.kneel(1.62, 0.8);
  }

  // ================================================================ MOOSE
  async petDog(line) {
    const g = this.g, { player: P, hands: H, dog: D, tw } = g;
    await this.ditchCig();
    D.scripted = true;
    D.moveScripted = false;
    const dp = D.root.position.clone();
    const dir = V(dp.x - P.pos.x, 0, dp.z - P.pos.z);
    if (dir.lengthSq() < 0.01) dir.copy(P.forward);
    dir.normalize();
    const stand = dp.clone().addScaledVector(dir, -0.72);
    D.yaw = yawTo(-dir.x, -dir.z);
    D.root.rotation.y = D.yaw;
    D.setPoseTargets({ sit: 1 });
    D.lookAt = P.camera;
    const headW = () => D.head.localToWorld(V(0, 0.14, -0.04));
    await Promise.all([P.walkTo(stand.x, stand.z, 1.1, yawTo(dir.x, dir.z)), this.kneel(0.8, 0.9)]);
    await P.lookAt(headW(), 0.45);
    this.take(H.R);
    H.R.group.position.set(0.28, -0.6, -0.28);
    await Promise.all([this.track(H.R, headW, 0.6, 'outCubic', V(0, 0.07, 0.07)), this.rot(H.R, [0.25, 0, -0.15], 0.6), this.pose(H.R, 'relaxed', 0.3)]);
    D.wagAmt = 1.3;
    D.wagRate = 17;
    D.tilt = 0.28;
    for (const e of D.eyes) e.scale.y = 0.35;
    for (let i = 0; i < 3; i++) {
      this.sfx('cloth', { vol: 0.25, rate: 1.4 });
      await this.track(H.R, () => D.head.localToWorld(V(0, 0.09, 0.14)), 0.5, 'inOutSine', V(0, 0.07, 0.07));
      await this.track(H.R, headW, 0.38, 'inOutSine', V(0, 0.08, 0.07));
    }
    const say = this.richie(line);
    await Promise.all([this.track(H.R, () => D.head.localToWorld(V(0.06, 0.02, 0.0)), 0.6, 'inOutSine', V(0.04, 0.05, 0.06)), this.pose(H.R, 'open', 0.4)]);
    await say;
    D.tilt = 0;
    for (const e of D.eyes) e.scale.y = 1;
    this.give(H.R);
    await this.kneel(1.62, 0.8);
    D.release();
  }

  async pickupPoop(poop, line) {
    const g = this.g, { player: P, hands: H, tw } = g;
    await this.ditchCig();
    const pp = poop.position.clone();
    const dir = V(pp.x - P.pos.x, 0, pp.z - P.pos.z);
    if (dir.lengthSq() < 0.01) dir.copy(P.forward);
    dir.normalize();
    const stand = pp.clone().addScaledVector(dir, -0.62);
    await P.walkTo(stand.x, stand.z, 1.2);
    await Promise.all([P.lookAt(pp, 0.6), this.kneel(0.82, 0.8)]);
    this.take(H.R);
    const bag = this.P.bag;
    H.R.grip.add(bag.empty);
    bag.empty.position.set(0, -0.01, -0.02);
    bag.empty.rotation.set(0, 0, 0);
    H.R.group.position.set(0.3, -0.7, -0.25);
    H.R.group.rotation.set(0.2, 0, -0.3);
    this.sfx('crinkle', { vol: 0.5 });
    await Promise.all([this.moveArm(H.R, [0.12, -0.3, -0.36], [0.4, 0, -0.5], 0.6, 'outCubic'), this.pose(H.R, 'open', 0.3)]);
    // shake the bag open
    for (let i = 0; i < 2; i++) { await tw.to(H.R.group.rotation, { z: -0.9 }, 0.09); await tw.to(H.R.group.rotation, { z: -0.4 }, 0.09); }
    await tw.wait(0.15);
    // hand in the bag, down over it
    await Promise.all([this.track(H.R, () => pp.clone().add(V(0, 0.08, 0)), 0.6, 'inOutSine', V(0, 0, 0.07)), this.rot(H.R, [-0.1, 0, -0.2], 0.6)]);
    await this.alignTo(H.R, () => H.R.grip.getWorldPosition(V()), () => pp.clone().add(V(0, 0.035, 0)), 0.3);
    this.sfx('crinkle', { vol: 0.7 });
    await this.pose(H.R, 'grip', 0.3);
    poop.visible = false;
    // pull it up, flip the bag inside-out, knot it
    H.R.grip.remove(bag.empty);
    H.R.grip.add(bag.full);
    bag.full.position.set(0, -0.02, 0);
    this.holding = 'bag';
    await this.moveArm(H.R, [0.1, -0.28, -0.36], [0.3, 0, -1.3], 0.55);
    for (let i = 0; i < 3; i++) {
      await tw.to(H.R.group.rotation, { y: 0.6 }, 0.12);
      this.sfx('crinkle', { vol: 0.25, rate: 1.6 });
      await tw.to(H.R.group.rotation, { y: -0.4 }, 0.12);
    }
    await Promise.all([this.kneel(1.62, 0.8), this.richie(line)]);
    H.R.setRest('bag');
    this.give(H.R);
  }

  async tossBag(can) {
    const g = this.g, { player: P, hands: H, tw } = g;
    const bagObj = this.P.bag.full;
    await P.lookAt(can.pos, 0.45);
    this.take(H.R);
    await this.moveArm(H.R, [0.32, -0.3, -0.12], [-0.4, 0, -1.2], 0.35, 'outQuad');
    await this.moveArm(H.R, [0.15, -0.12, -0.6], [0.6, 0, -1.2], 0.16, 'inQuad');
    this.holding = null;
    g.scene.attach(bagObj);
    const from = bagObj.position.clone(), to = can.pos.clone().add(V(0, 0.12, 0));
    H.R.setRest('none');
    this.give(H.R);
    this.sfx('cloth', { vol: 0.3 });
    await tw.during(0.6, (k) => {
      bagObj.position.lerpVectors(from, to, k);
      bagObj.position.y += Math.sin(Math.PI * k) * 0.7;
      bagObj.rotation.x += 0.25;
    });
    this.sfx('clang', { pos: can.pos, vol: 0.7 });
    if (bagObj.parent) bagObj.parent.remove(bagObj);
    await this.richie(pick(['Two points.', "Nothin' but net.", 'And... it is good.']));
  }

  async whistle() {
    if (this.handsBusy) return;
    this.sfx('whistle', { vol: 0.6, verb: 0.4 });
  }

  // ================================================================ CIGARETTES
  async smoke() {
    const g = this.g, { hands: H, tw } = g, Pr = this.P;
    if (this.handsBusy || g.busy) return;
    if (this.holding === 'bag') return this.richie("Not while I'm holding... this.");
    if (this.cigState === 'lit') return this.drag();
    if (this.cigs <= 0) return this.richie('Out. Great.');
    this.handsBusy = true;
    this.cigs--;
    this.take(H.R);

    // pack out of the shirt pocket
    const pack = Pr.pack;
    H.R.grip.add(pack.group);
    pack.group.position.set(0, -0.012, -0.005);
    pack.group.rotation.set(0, 0, Math.PI / 2);
    H.R.group.position.set(0.3, -0.75, -0.25);
    H.R.group.rotation.set(0.3, 0, -1.4);
    Object.assign(H.R.pose, POSES.grip);
    this.sfx('cloth', { vol: 0.3 });
    await this.moveArm(H.R, [0.12, -0.25, -0.36], [0.45, 0.15, -1.4], 0.55, 'outCubic');
    this.sfx('clip', { vol: 0.12, rate: 1.8 });
    await tw.to(pack.lid.rotation, { x: -2.0 }, 0.15);
    const cig = Pr.cig.group;
    pack.group.add(cig);
    cig.position.set(0.01, 0.045, 0);
    cig.rotation.set(-Math.PI / 2, 0, 0);
    Pr.setBurn(0);
    Pr.cig.lit = false;
    Pr.cig.glow = 0;
    Pr.cig.emberMat.color.set(0x2a2018);
    for (let i = 0; i < 2; i++) {
      await tw.to(H.R.group.position, { y: -0.21 }, 0.06, 'outQuad');
      await tw.to(H.R.group.position, { y: -0.25 }, 0.09, 'inQuad');
    }
    await tw.to(cig.position, { y: 0.085 }, 0.2);

    // to the lips (eyes drop to watch)
    const filterTip = () => cig.localToWorld(V(0, 0, 0.02));
    tw.to(g.player, { dip: -0.42 }, 0.6);
    await this.moveArm(H.R, [0.03, -0.17, -0.2], [0.9, 0.2, -1.4], 0.5);
    await this.alignTo(H.R, filterTip, () => this.mouth.getWorldPosition(V()), 0.25);
    this.mouth.attach(cig);
    await Promise.all([tw.to(cig.position, { x: 0, y: 0, z: 0 }, 0.2), tw.to(cig.rotation, { x: -0.22, y: -0.1, z: 0 }, 0.2)]);
    await this.moveArm(H.R, [0.3, -0.8, -0.25], [0.3, 0, -1.4], 0.4);
    pack.group.parent.remove(pack.group);
    pack.lid.rotation.x = 0;

    // lighter
    const L = Pr.lighter;
    H.R.grip.add(L.group);
    L.group.position.set(0, -0.012, 0);
    L.group.rotation.set(0, 0, Math.PI / 2);
    await this.moveArm(H.R, [0.07, -0.24, -0.26], [0.55, 0.2, -1.45], 0.5, 'outCubic');
    await this.alignTo(H.R, () => L.flame.getWorldPosition(V()), () => Pr.cig.tip.getWorldPosition(V()).add(V(0, -0.02, 0)), 0.35);
    await this.flick(false);
    await tw.wait(0.3);
    await this.flick(true);
    this.sfx('inhale', { vol: 0.55 });
    Pr.cig.lit = true;
    await Promise.all([tw.to(Pr.cig, { glow: 1.4 }, 1.1), this.glue(H.R, () => L.flame.getWorldPosition(V()), () => Pr.cig.tip.getWorldPosition(V()).add(V(0, -0.02, 0)), 1.1)]);
    this.flame = false;
    L.flame.visible = false;
    await this.moveArm(H.R, [0.3, -0.8, -0.25], null, 0.4);
    L.group.parent.remove(L.group);

    // take it from the lips between two fingers
    H.R.group.rotation.set(0.9, 0, -0.6);
    await Promise.all([this.moveArm(H.R, [0.05, -0.2, -0.24], [1.05, 0.1, -0.6], 0.45, 'outCubic'), this.pose(H.R, 'cig', 0.3)]);
    await this.alignTo(H.R, () => H.R.pinch.getWorldPosition(V()), filterTip, 0.25);
    H.R.pinch.attach(cig);
    tw.to(cig.position, { x: 0, y: 0, z: 0.01 }, 0.25);
    tw.to(cig.rotation, { x: 0, y: 0, z: 0 }, 0.25);
    this.cigState = 'lit';
    H.R.setRest('cig');
    this.give(H.R);
    tw.to(g.player, { dip: 0 }, 0.9);
    await tw.wait(0.3);
    this.exhale();
    g.player.calm = Math.min(0.6, g.player.calm + 0.35);
    this.handsBusy = false;
  }

  async flick(success) {
    const { hands: H, tw } = this.g, L = this.P.lighter;
    await tw.to(H.R.pose, { t: 0.95 }, 0.06);
    this.sfx(success ? 'lighter' : 'lighter_fail', { vol: 0.6 });
    L.spark.visible = true;
    setTimeout(() => (L.spark.visible = false), 70);
    if (success) { L.flame.visible = true; this.flame = true; }
    await tw.to(H.R.pose, { t: 0.4 }, 0.12);
  }

  exhale() {
    const g = this.g;
    this.sfx('exhale', { vol: 0.5 });
    const fwd = V();
    g.tw.during(1.5, (k) => {
      if (Math.random() < 0.55) {
        g.player.camera.getWorldDirection(fwd);
        const p = this.mouth.getWorldPosition(V()).addScaledVector(fwd, 0.08);
        this.fx.emit(p, fwd.clone().multiplyScalar(0.55 * (1 - k * 0.6)).add(V((Math.random() - 0.5) * 0.08, 0.04, (Math.random() - 0.5) * 0.08)), { size: 0.05, grow: 0.55, life: 2.4, op: 0.3 * (1 - k * 0.5) });
      }
    });
  }

  async drag() {
    const g = this.g, { hands: H, tw } = g, cig = this.P.cig;
    this.handsBusy = true;
    this.take(H.R);
    tw.to(g.player, { dip: -0.3 }, 0.5);
    await this.moveArm(H.R, [0.04, -0.2, -0.2], [1.1, 0.1, -0.6], 0.45);
    await this.alignTo(H.R, () => cig.group.localToWorld(V(0, 0, 0.02)), () => this.mouth.getWorldPosition(V()), 0.25);
    this.sfx('inhale', { vol: 0.5 });
    await tw.to(cig, { glow: 1.4 }, 1.0);
    this.give(H.R);
    tw.to(g.player, { dip: 0 }, 0.7);
    await tw.wait(0.45);
    this.exhale();
    g.player.calm = Math.min(0.6, g.player.calm + 0.15);
    this.handsBusy = false;
  }

  async flickCig() {
    const g = this.g, { hands: H, tw } = g, Pr = this.P;
    if (this.cigState !== 'lit') return;
    this.handsBusy = true;
    this.take(H.R);
    await Promise.all([this.moveArm(H.R, [0.22, -0.24, -0.42], [0.6, 0, -0.9], 0.3), this.pose(H.R, 'flick', 0.2)]);
    await tw.to(H.R.pose, { t: 0, i: 0.2 }, 0.06);
    const cig = Pr.cig.group;
    g.scene.attach(cig);
    Pr.cig.lit = false;
    const butt = cig.clone();
    g.scene.add(butt);
    cig.parent.remove(cig);
    const mat = butt.children[2].material = Pr.cig.emberMat.clone();
    const fwd = g.player.camera.getWorldDirection(V());
    this.thrown.push({ obj: butt, vel: fwd.multiplyScalar(2.6).add(V(0, 1.6, 0)), life: 30, glow: 0.8, mat, landed: false });
    this.cigState = 'none';
    H.R.setRest('none');
    this.give(H.R);
    this.handsBusy = false;
  }

  async ditchCig() {
    if (this.cigState === 'lit') {
      while (this.handsBusy) await this.tw.wait(0.1);
      await this.flickCig();
      await this.tw.wait(0.2);
    }
  }

  // ================================================================ GREETINGS
  async waveBack() {
    const g = this.g, { hands: H, tw } = g;
    if (this.handsBusy || this.holding === 'bag') return;
    this.handsBusy = true;
    this.take(H.R);
    await Promise.all([this.moveArm(H.R, [0.24, -0.04, -0.5], [1.45, 0, 0], 0.4, 'outCubic'), this.pose(H.R, 'open', 0.3)]);
    for (let i = 0; i < 3; i++) {
      await tw.to(H.R.group.rotation, { z: 0.35 }, 0.15);
      await tw.to(H.R.group.rotation, { z: -0.35 }, 0.15);
    }
    this.give(H.R);
    this.handsBusy = false;
  }

  async handshake(npc) {
    const g = this.g, { hands: H, tw } = g;
    await this.ditchCig();
    this.take(H.R);
    const hold = npc.armR.hold;
    const target = () => hold.getWorldPosition(V());
    const np = npc.offerHand(0.75);
    await tw.wait(0.25);
    H.R.group.position.set(0.3, -0.7, -0.25);
    await Promise.all([np, this.track(H.R, target, 0.65, 'outCubic', V(0.01, 0.0, 0.07)), this.rot(H.R, [0.1, 0.15, -1.45], 0.65), this.pose(H.R, 'open', 0.3)]);
    await this.alignTo(H.R, () => H.R.grip.getWorldPosition(V()), target, 0.15);
    await this.pose(H.R, 'grip', 0.15);
    this.sfx('cloth', { vol: 0.45 });
    await Promise.all([npc.pump(3), this.glue(H.R, () => H.R.grip.getWorldPosition(V()), target, 3 * 0.26 + 0.14)]);
    await this.pose(H.R, 'open', 0.12);
    npc.dropHand(0.5);
    this.give(H.R);
    await tw.wait(0.3);
  }

  async receive(npc, prop, lookLine = null) {
    const g = this.g, { hands: H, tw } = g;
    await this.ditchCig();
    npc.holdItem(prop);
    prop.rotation.set(Math.PI / 2, 0, 0);
    prop.visible = true;
    const np = npc.offerHand(0.7);
    this.take(H.R);
    await tw.wait(0.3);
    H.R.group.position.set(0.3, -0.7, -0.25);
    const target = () => npc.armR.hold.getWorldPosition(V());
    await Promise.all([np, this.track(H.R, target, 0.6, 'outCubic', V(0.0, 0.02, 0.06)), this.rot(H.R, [0.2, 0.1, -1.2], 0.6), this.pose(H.R, 'open', 0.3)]);
    await this.alignTo(H.R, () => H.R.grip.getWorldPosition(V()), target, 0.15);
    await this.pose(H.R, 'pinch', 0.15);
    H.R.grip.attach(prop);
    npc.dropHand(0.5);
    await this.moveArm(H.R, [0.12, -0.26, -0.38], [0.9, 0, -0.3], 0.5);
    if (lookLine) await this.richie(lookLine); else await tw.wait(0.6);
    await this.moveArm(H.R, [0.35, -0.85, -0.2], null, 0.45);
    this.sfx('cloth', { vol: 0.3 });
    if (prop.parent) prop.parent.remove(prop);
    this.give(H.R);
  }

  async handOver(npc, prop) {
    const g = this.g, { hands: H, tw } = g;
    await this.ditchCig();
    this.take(H.R);
    H.R.grip.add(prop);
    prop.position.set(0, -0.005, -0.03);
    prop.rotation.set(0, 0, 0);
    prop.visible = true;
    H.R.group.position.set(0.32, -0.8, -0.2);
    this.sfx('cloth', { vol: 0.3 });
    await Promise.all([this.moveArm(H.R, [0.12, -0.24, -0.46], [0.5, 0, -0.9], 0.6), this.pose(H.R, 'pinch', 0.3)]);
    const hold = npc.armR.hold;
    await npc.offerHand(0.6);
    await this.alignTo(H.R, () => prop.getWorldPosition(V()), () => hold.getWorldPosition(V()), 0.45);
    hold.attach(prop);
    await this.pose(H.R, 'open', 0.15);
    this.give(H.R);
    await tw.wait(0.4);
    await npc.dropHand(0.6);
    if (prop.parent) prop.parent.remove(prop);
  }

  // ================================================================ DOORS
  doorOutsideKnob(h) { return h.door.pivot.localToWorld(V(h.door.width - 0.1, 0.98, -0.06)); }
  doorInsideKnob(h) { return h.door.pivot.localToWorld(V(h.door.width - 0.1, 0.98, 0.06)); }
  doorInsideBolt(h) { return h.door.pivot.localToWorld(V(h.door.width - 0.1, 1.18, 0.05)); }

  async knock(h) {
    const g = this.g, { player: P, hands: H, tw } = g;
    await this.ditchCig();
    await P.walkTo(h.knockSpot.x, h.knockSpot.z, 1.25);
    const face = () => h.door.pivot.localToWorld(V(0.6, 1.4, -0.05));
    await P.lookAt(face().add(V(0, 0.05, 0)), 0.5);
    this.take(H.R);
    H.R.group.position.set(0.3, -0.7, -0.25);
    await Promise.all([this.track(H.R, face, 0.5, 'outCubic', V(0.02, -0.02, 0.17)), this.rot(H.R, [0.2, 0.15, -1.35], 0.5), this.pose(H.R, 'knock', 0.3)]);
    const knuckle = () => H.R.fingers[1].fg.getWorldPosition(V());
    for (let i = 0; i < 3; i++) {
      const back = H.R.group.position.clone();
      await this.alignTo(H.R, knuckle, face, 0.07);
      this.sfx('knock', { pos: face(), vol: 1, verb: 0.5 });
      await tw.to(H.R.group.position, { x: back.x, y: back.y, z: back.z }, 0.15, 'outQuad');
      await tw.wait(0.16);
    }
    this.give(H.R);
  }

  async doorTo(h, angle, dur = 0.8, sound = 'door_open') {
    if (sound) this.sfx(sound, { pos: h.doorWorld.clone().add(V(0, 1, 0)), vol: 0.75 });
    await this.tw.to(h.door.pivot.rotation, { y: -angle }, dur, 'inOutSine');
  }

  async enterHouse(h) {
    const g = this.g, { player: P, hands: H, dog: D, tw } = g;
    await this.ditchCig();
    await P.walkTo(h.knockSpot.x, h.knockSpot.z, 1.25);
    const knob = () => this.doorOutsideKnob(h);
    await P.lookAt(knob(), 0.45);
    this.take(H.R);
    H.R.group.position.set(0.3, -0.7, -0.25);
    await Promise.all([this.track(H.R, knob, 0.5, 'outCubic', V(0, -0.03, 0.08)), this.rot(H.R, [0.15, 0.2, -1.45], 0.5), this.pose(H.R, 'open', 0.25)]);
    await this.alignTo(H.R, () => H.R.grip.getWorldPosition(V()), knob, 0.15);
    await this.pose(H.R, 'grip', 0.12);
    await tw.to(H.R.group.rotation, { z: -2.0 }, 0.25);
    this.sfx('door_open', { pos: knob(), vol: 0.7 });
    await Promise.all([this.glue(H.R, () => H.R.grip.getWorldPosition(V()), knob, 0.45), tw.to(h.door.pivot.rotation, { y: -0.5 }, 0.45)]);
    this.give(H.R);
    tw.to(h.door.pivot.rotation, { y: -1.6 }, 0.8, 'outCubic');
    D.scripted = true;
    D.moveScripted = true;
    D.target.copy(h.insideSpot).add(V(0.3, 0, 0.5));
    const done = P.walkTo(h.insideSpot.x, h.insideSpot.z, 1.1);
    tw.to(g.renderer, { fade: 1 }, 1.6);
    await done;
    await tw.wait(0.6);
  }

  // Night: from the hallway, unlock, open, step out, pull it shut behind.
  async leaveHouse(h) {
    const g = this.g, { player: P, hands: H, dog: D, tw } = g;
    const bolt = () => this.doorInsideBolt(h);
    await P.lookAt(bolt(), 0.5);
    this.take(H.R);
    H.R.group.position.set(0.3, -0.7, -0.25);
    await Promise.all([this.track(H.R, bolt, 0.5, 'outCubic', V(0, -0.03, 0.07)), this.rot(H.R, [0.15, 0.1, -1.4], 0.5), this.pose(H.R, 'pinch', 0.25)]);
    await this.alignTo(H.R, () => H.R.grip.getWorldPosition(V()), bolt, 0.15);
    await tw.to(H.R.group.rotation, { z: -2.4 }, 0.22);
    this.sfx('deadbolt', { pos: bolt(), vol: 0.8 });
    const knob = () => this.doorInsideKnob(h);
    await Promise.all([this.track(H.R, knob, 0.35, 'inOutSine', V(0, -0.03, 0.07)), this.rot(H.R, [0.15, 0.1, -1.4], 0.35), this.pose(H.R, 'grip', 0.2)]);
    await tw.to(H.R.group.rotation, { z: -2.0 }, 0.22);
    this.sfx('door_open', { pos: knob(), vol: 0.75 });
    // door swings in toward him; he steps back
    const back = P.pos.clone().addScaledVector(P.forward, -0.35);
    await Promise.all([this.glue(H.R, () => H.R.grip.getWorldPosition(V()), knob, 0.6), tw.to(h.door.pivot.rotation, { y: -0.9 }, 0.6), P.moveTo(back.x, back.z, 0.6)]);
    this.give(H.R);
    H.R.setRest('none');
    tw.to(h.door.pivot.rotation, { y: -1.6 }, 0.6, 'outCubic');
    g.audio.setMuffle(20000, 1.0);
    // out onto the porch, Moose first
    D.scripted = true;
    D.moveScripted = true;
    D.maxSpeed = 2;
    const porch = h.knockSpot.clone().addScaledVector(V(-Math.sin(h.facing), 0, -Math.cos(h.facing)), 0.5);
    D.target.copy(porch).add(V(0.5, 0, 0));
    await P.walkTo(h.knockSpot.x, h.knockSpot.z, 1.0);
    // turn around, pull it shut
    await P.turnTo(h.facing + Math.PI, -0.1, 0.7);
    const knobOut = () => this.doorOutsideKnob(h);
    this.take(H.R);
    H.R.group.position.set(0.3, -0.7, -0.25);
    await Promise.all([this.track(H.R, knobOut, 0.5, 'outCubic', V(0, -0.03, 0.07)), this.rot(H.R, [0.15, 0.2, -1.45], 0.5), this.pose(H.R, 'open', 0.2)]);
    await this.pose(H.R, 'grip', 0.12);
    await Promise.all([this.glue(H.R, () => H.R.grip.getWorldPosition(V()), knobOut, 0.45), tw.to(h.door.pivot.rotation, { y: 0 }, 0.45, 'inQuad')]);
    this.sfx('door_close', { pos: knobOut(), vol: 0.8 });
    this.give(H.R);
    await tw.wait(0.3);
    await P.turnTo(h.facing, 0, 0.8);
    D.release();
  }

  // Night ending: inside, shut it, bolt it, chain it, slide down the door.
  async lockUp(h) {
    const g = this.g, { player: P, hands: H, dog: D, tw } = g;
    await this.ditchCig();
    const knob = () => this.doorOutsideKnob(h);
    await P.walkTo(h.knockSpot.x, h.knockSpot.z, 1.6);
    await P.lookAt(knob(), 0.3);
    this.take(H.R);
    H.R.group.position.set(0.3, -0.7, -0.25);
    await Promise.all([this.track(H.R, knob, 0.35, 'outCubic', V(0, -0.03, 0.08)), this.rot(H.R, [0.15, 0.2, -1.45], 0.35), this.pose(H.R, 'grip', 0.2)]);
    this.sfx('door_open', { pos: knob(), vol: 0.7, rate: 1.3 });
    this.give(H.R);
    tw.to(h.door.pivot.rotation, { y: -1.6 }, 0.6, 'outCubic');
    D.scripted = true;
    D.moveScripted = true;
    D.maxSpeed = 3;
    D.target.copy(h.insideSpot).add(V(0, 0, 0)).addScaledVector(V(-Math.sin(h.facing), 0, -Math.cos(h.facing)), -1.0);
    await P.walkTo(h.insideSpot.x, h.insideSpot.z, 2.0);
    g.audio.setMuffle(900, 0.8);
    await P.turnTo(h.facing, -0.05, 0.6);
    // slam it
    const edge = () => h.door.pivot.localToWorld(V(h.door.width - 0.05, 1.2, 0.05));
    this.take(H.R);
    await Promise.all([this.track(H.R, edge, 0.35, 'outCubic', V(0, 0, 0.08)), this.rot(H.R, [0.6, 0.4, -0.3], 0.35), this.pose(H.R, 'open', 0.2)]);
    await Promise.all([this.glue(H.R, () => H.R.grip.getWorldPosition(V()), edge, 0.3), tw.to(h.door.pivot.rotation, { y: 0 }, 0.3, 'inQuad')]);
    this.sfx('door_close', { pos: edge(), vol: 1 });
    g.renderer.flash = 0.04;
    tw.to(g.renderer, { flash: 0 }, 0.2);
    // deadbolt
    const bolt = () => this.doorInsideBolt(h);
    await Promise.all([P.lookAt(bolt(), 0.3), this.track(H.R, bolt, 0.35, 'outCubic', V(0, -0.03, 0.07)), this.rot(H.R, [0.15, 0.1, -1.4], 0.35), this.pose(H.R, 'pinch', 0.2)]);
    await tw.to(H.R.group.rotation, { z: -2.4 }, 0.18);
    this.sfx('deadbolt', { pos: bolt(), vol: 0.9 });
    // chain: slide it along the track
    const chainA = () => h.door.pivot.localToWorld(V(h.door.width + 0.15, 1.45, 0.06));
    const chainB = () => h.door.pivot.localToWorld(V(h.door.width - 0.15, 1.45, 0.06));
    await Promise.all([this.track(H.R, chainA, 0.3, 'outCubic', V(0, -0.03, 0.07)), this.rot(H.R, [0.4, 0, -1.2], 0.3), this.pose(H.R, 'pinch', 0.15)]);
    this.sfx('chain', { pos: chainA(), vol: 0.7 });
    await this.track(H.R, chainB, 0.45, 'inOutSine', V(0, -0.03, 0.07));
    this.give(H.R);
    // back against the door, slide down
    await P.turnTo(h.facing + Math.PI, -0.1, 0.8);
    this.sfx('cloth', { vol: 0.6 });
    await Promise.all([tw.to(P, { eye: 0.85, pitch: 0.12, roll: 0.05 }, 2.2, 'inOutSine')]);
  }

  // ================================================================ THE BULB
  async fixBulb(h) {
    const g = this.g, { player: P, hands: H, tw } = g, pl = h.porchLight;
    await this.ditchCig();
    // Stand back a little so it's a comfortable reach, not straight overhead.
    const f = V(-Math.sin(h.facing), 0, -Math.cos(h.facing));
    const stand = pl.pos.clone().addScaledVector(f, 0.45);
    await P.walkTo(stand.x, stand.z, 1.2, h.facing + Math.PI);
    const bulbW = () => pl.holder.getWorldPosition(V());
    const gripW = () => H.R.grip.getWorldPosition(V());
    await P.lookAt(bulbW().add(V(0, -0.05, 0)), 0.8);
    this.take(H.R);
    const palm = H.R.palm;
    palm.rotation.set(0, 0, 0);
    // Hand comes up open, fingers up, palm toward the bulb, and closes around it.
    H.R.group.position.set(0.28, -0.6, -0.3);
    H.R.group.rotation.set(0.6, 0, -0.2);
    await Promise.all([
      this.track(H.R, bulbW, 0.75, 'outCubic', V(0.06, -0.1, 0.04)),
      this.rot(H.R, [1.45, 0, -1.57], 0.75),
      this.pose(H.R, 'open', 0.4),
    ]);
    await this.alignTo(H.R, gripW, bulbW, 0.25);
    // One twist = close fingers, turn the wrist (the bulb turns with it), let go, turn back.
    // The hand stays glued to the bulb the whole time so nothing drifts.
    const twist = async (dir) => {
      const hold = this.glue(H.R, gripW, bulbW, 0.95);
      await this.pose(H.R, 'grip', 0.14);
      this.sfx('squeak', { pos: bulbW(), vol: 0.7 });
      await Promise.all([
        tw.to(palm.rotation, { z: -0.5 * dir }, 0.42, 'inOutSine'),
        tw.to(pl.holder.rotation, { y: pl.holder.rotation.y + 1.0 * dir }, 0.42, 'inOutSine'),
        tw.to(pl.holder.position, { y: pl.holder.position.y - 0.004 * dir }, 0.42),
      ]);
      await this.pose(H.R, 'open', 0.12);
      await tw.to(palm.rotation, { z: 0.5 * dir }, 0.25);
      await hold;
    };
    await tw.to(palm.rotation, { z: 0.5 }, 0.2);
    for (let i = 0; i < 3; i++) await twist(1);
    // It comes free. Down to the pocket, swap for the new one.
    await this.pose(H.R, 'grip', 0.14);
    const old = pl.bulb;
    H.R.grip.attach(old);
    await Promise.all([tw.to(palm.rotation, { z: 0 }, 0.4), this.moveArm(H.R, [0.32, -0.8, -0.25], [0.4, 0, -0.3], 0.6)]);
    old.visible = false;
    this.sfx('cloth', { vol: 0.6 });
    const nb = this.P.newBulb;
    H.R.grip.add(nb);
    nb.position.set(0, 0, 0);
    nb.rotation.set(-Math.PI / 2, 0, 0);
    const say = this.richie('Old one... new one.');
    await tw.wait(0.4);
    await Promise.all([
      this.track(H.R, bulbW, 0.8, 'outCubic', V(0.06, -0.12, 0.04)),
      this.rot(H.R, [1.45, 0, -1.57], 0.8),
    ]);
    await this.alignTo(H.R, gripW, () => bulbW().add(V(0, -0.012, 0)), 0.3);
    await say;
    pl.holder.position.y -= 0.012;
    await tw.to(palm.rotation, { z: -0.5 }, 0.2);
    for (let i = 0; i < 3; i++) await twist(-1);
    // seat it in the socket and let go
    pl.holder.attach(nb);
    await Promise.all([tw.to(nb.position, { x: 0, y: 0, z: 0 }, 0.15), tw.to(nb.rotation, { x: 0, z: 0 }, 0.15)]);
    pl.bulb = nb.children[0];
    this.sfx('bulb_on', { pos: bulbW(), vol: 1 });
    for (const on of [true, false, true, false, true]) {
      g.atmos.setPorch(h.id, on);
      await tw.wait(0.06 + Math.random() * 0.1);
    }
    // squint, hand drops away
    await Promise.all([tw.to(palm.rotation, { z: 0 }, 0.3), this.pose(H.R, 'open', 0.2), this.moveArm(H.R, [0.2, -0.3, -0.4], [0.9, 0, -0.2], 0.4)]);
    this.give(H.R);
    H.R.setRest('none');
    await P.lookAt(bulbW().add(V(0, -1.2, 0)).addScaledVector(f, 1.5), 0.6);
  }

  // ================================================================ READING
  async readPoster(p) {
    const g = this.g, { player: P } = g;
    const n = p.mesh.getWorldDirection(V());
    n.y = 0;
    n.normalize();
    const stand = p.pos.clone().addScaledVector(n, 0.8);
    await P.walkTo(stand.x, stand.z, 1.2);
    await P.lookAt(p.pos, 0.45);
    await g.ui.note(p.html);
    this.richie(p.line);
  }
}
