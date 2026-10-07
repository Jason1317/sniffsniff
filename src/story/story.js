import * as THREE from 'three';
import { Npc, NEIGHBORS } from '../entities/npc.js';
import { pick, yawTo, clamp } from '../core/util.js';

// Day 1 and Night 1 of Sniff Sniff. Triggers are checked every frame; scenes are async.

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const DJ = [
  "Good mornin', Willet! Eight-oh-five on a Saturday. This is W-L-K-R, ninety-eight point one.",
  "Gonna be a hot one, folks. High of eighty-eight.",
  'And a reminder from the Willet P.D. — keep your pets inside after dark.',
];

const LINES = {
  petDay: ["Who's a good boy? You are.", "You're alright, Moose. You're alright.", 'Yeah. Yeah, I like you too.', 'Look at those ears.'],
  petNight: ["We're okay. We're okay, bud.", 'Hey. Hey. I got you.', 'Just you and me, huh?', "Don't look at me like that."],
  poop: ['Gross. Gross, gross, gross.', 'The things I do for you.', 'Why is it warm. Why is it always warm.'],
  bounds: {
    east: ["I'm not going in those woods.", 'Nope. Not in there.'],
    west: ["That's somebody's field.", 'Farm. Not ours.'],
    north: ['Corn. Just... corn.', 'Lot of corn out here.'],
    south: ["Somebody's backyard. Nope.", "That's a fence. Okay."],
  },
};

export class Story {
  constructor(g) {
    this.g = g;
    this.flags = {};
    this.mode = 'title';
    this.t = 0;
    this.once = new Set();
    this.threat = 0;
    this.walked = 0;
    this.lastStepPos = null;
  }

  say(text, opts) { return this.g.voice.speak('richie', text, opts); }
  mutter(text) { if (!this.g.voice.busyRichie) this.g.voice.speak('richie', text); }
  first(key) { if (this.once.has(key)) return false; this.once.add(key); return true; }

  // ---------------------------------------------------------------- setup
  init() {
    const g = this.g;
    g.npcs = {};
    for (const k of ['dorothy', 'walt', 'lindqvist', 'jogger']) {
      g.npcs[k] = new Npc(g, NEIGHBORS[k]);
      g.world.movers.push({ obj: g.npcs[k].root, r: 0.32, npc: true });
    }
    // Moose bumps around Richie's legs instead of walking through them
    g.world.movers.push({ obj: g.player.rig, r: 0.3, active: () => !g.player.attached });
    this.letter = g.seq.P.letter;
    this.initWalk();
    this.makeTall();
    this.makeHallway();
    this.makeInteractables();
  }

  // The thing in the fog: very tall, very thin, pale. No face.
  makeTall() {
    const g = this.g;
    const m = new THREE.MeshLambertMaterial({ color: 0xc8c4bc, emissive: 0x3a3a3e });
    const t = new THREE.Group();
    const part = (w, h, d, x, y, z, rz = 0) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      b.rotation.z = rz;
      t.add(b);
      return b;
    };
    part(0.07, 1.35, 0.08, -0.08, 0.68, 0);
    part(0.07, 1.35, 0.08, 0.08, 0.68, 0);
    part(0.26, 0.95, 0.15, 0, 1.8, 0);
    part(0.06, 1.25, 0.06, -0.19, 1.6, 0, 0.05);
    part(0.06, 1.25, 0.06, 0.19, 1.6, 0, -0.05);
    part(0.07, 0.16, 0.07, 0, 2.33, 0);
    const head = part(0.2, 0.3, 0.2, 0, 2.55, 0);
    head.rotation.z = 0.25;
    t.visible = false;
    g.scene.add(t);
    this.tall = t;
  }

  // Richie's hallway: coat hook with the leash, wall phone, calendar, boxes, a lamp.
  makeHallway() {
    const g = this.g, h = g.world.houses.richie, d = h.def;
    const fz = -d.d / 2, F = 0.5, hz = fz + 0.18;
    const W = (x, y, z) => h.toWorld(x, y, z);
    const L = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
    const grp = new THREE.Group();
    grp.position.copy(W(0, 0, 0));
    grp.rotation.y = h.facing;
    g.scene.add(grp);
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); grp.add(m); return m; };
    const dx = d.doorX;
    // hook rail on the right wall (+x side), leash coil hanging from it
    add(new THREE.BoxGeometry(0.04, 0.08, 0.7), L(0x6a4a2a), dx + 0.86, F + 1.7, hz + 0.9);
    for (const k of [0.65, 0.9, 1.15]) add(new THREE.BoxGeometry(0.06, 0.02, 0.02), L(0x8a8a8a), dx + 0.82, F + 1.68, hz + k);
    const jacket = add(new THREE.BoxGeometry(0.1, 0.65, 0.42), L(0x3a2a6a), dx + 0.78, F + 1.35, hz + 1.15);
    jacket.rotation.z = 0.05;
    add(new THREE.BoxGeometry(0.11, 0.66, 0.08), L(0x1ac8b0), dx + 0.77, F + 1.35, hz + 1.15);
    const coil = g.seq.P.coil;
    coil.position.set(dx + 0.8, F + 1.55, hz + 0.65);
    coil.rotation.set(0, Math.PI / 2, 0);
    grp.add(coil);
    this.hookPos = () => coil.getWorldPosition(V());
    // wall phone + calendar on the left wall
    add(new THREE.BoxGeometry(0.06, 0.22, 0.1), L(0xd8ccb0), dx - 0.86, F + 1.45, hz + 1.6);
    add(new THREE.BoxGeometry(0.05, 0.2, 0.05), L(0xd8ccb0), dx - 0.82, F + 1.45, hz + 1.6);
    const cal = add(new THREE.PlaneGeometry(0.3, 0.38), new THREE.MeshLambertMaterial({ map: g.tex.calendar }), dx - 0.855, F + 1.5, hz + 2.2);
    cal.rotation.y = Math.PI / 2;
    // moving boxes + a little table and lamp at the end
    for (const [x, y, z, s] of [[-0.55, 0.2, 2.6, 0.45], [-0.5, 0.6, 2.62, 0.38], [0.5, 0.2, 2.7, 0.42]]) add(new THREE.BoxGeometry(s, s * 0.85, s), L(0xb08a5a), dx + x, F + y, hz + z);
    add(new THREE.BoxGeometry(0.4, 0.7, 0.3), L(0x5a3a22), dx + 0.0, F + 0.35, hz + 2.85);
    const shade = add(new THREE.CylinderGeometry(0.1, 0.16, 0.2, 8), new THREE.MeshBasicMaterial({ color: 0xffd8a0 }), dx, F + 0.95, hz + 2.85);
    this.hallLamp = g.world.addLight({ pos: shade.getWorldPosition(V()).add(V(0, 0.1, 0)), kind: 'interior', color: 0xffc890, power: 1.4, range: 6, on: false });
    // Moose's bowl
    add(new THREE.CylinderGeometry(0.1, 0.08, 0.06, 10), L(0xb02a2a), dx - 0.5, F + 0.03, hz + 1.9);
    this.hallGroup = grp;
  }

  makeInteractables() {
    const g = this.g, I = g.interact, H = g.world.houses, seq = g.seq;
    const day = () => this.mode === 'day';
    const night = () => this.mode === 'night';

    // pet Moose
    I.add({
      label: 'Pet Moose', radius: 2.0, aim: 0.5,
      pos: () => g.dog.head.getWorldPosition(V()),
      enabled: () => g.dog.leashed && !g.dog.scripted && !seq.handsBusy && seq.holding !== 'bag',
      action: () => g.cut(() => seq.petDog(pick(night() ? LINES.petNight : LINES.petDay)).then(() => {
        g.player.calm = Math.min(0.6, g.player.calm + (night() ? 0.3 : 0.1));
      })),
    });
    // get Moose out of the car
    I.add({
      label: 'Get Moose out', radius: 2.4, aim: 0.6,
      pos: () => g.car.doors.passenger.pivot.localToWorld(g.car.doors.passenger.outerHandle.clone()),
      enabled: () => this.flags.needLeash,
      action: () => g.cut(async () => {
        this.flags.needLeash = false;
        await seq.leashFromCar();
        g.dog.panting = true;
      }),
    });
    // posters
    for (const p of g.world.posters) {
      I.add({ label: 'Read poster', radius: 2.4, aim: 0.45, pos: p.pos, enabled: () => p.mesh.visible, action: () => g.cut(() => seq.readPoster(p)) });
    }
    // trash cans
    for (const c of g.world.cans) {
      I.add({ label: 'Toss the bag', radius: 2.4, aim: 0.6, pos: c.pos, enabled: () => seq.holding === 'bag', action: () => g.cut(() => seq.tossBag(c)) });
    }
    // Dorothy's porch light
    const pl = H.dorothy.porchLight;
    I.add({ label: 'Change the bulb', radius: 2.6, aim: 0.6, pos: pl.pos, enabled: () => day() && this.flags.bulbTask && !this.flags.bulbFixed, action: () => this.fixBulb() });
    // Walt's door
    I.add({ label: 'Knock', radius: 2.4, aim: 0.5, pos: H.walt.doorWorld.clone().add(V(0, 1.3, 0)), enabled: () => day() && !this.flags.letterDelivered, action: () => this.waltDoor() });
    // home
    I.add({ label: 'Go inside', radius: 2.4, aim: 0.5, pos: H.richie.doorWorld.clone().add(V(0, 1.2, 0)), enabled: () => (day() && !this.flags.needLeash) || night(), action: () => this.homeDoor() });
    // Lindqvist
    I.add({
      label: 'Say hello', radius: 3.6, aim: 0.5,
      pos: () => g.npcs.lindqvist.headWorld(),
      enabled: () => day() && !this.flags.metLindqvist,
      action: () => this.lindqvistTalk(),
    });
    // Dorothy small talk after the intro
    I.add({
      label: 'Talk', radius: 3.0, aim: 0.5,
      pos: () => g.npcs.dorothy.headWorld(),
      enabled: () => day() && this.flags.metDorothy && this.flags.letter && !this.dorothyBusy,
      action: () => g.cut(async () => {
        const d = g.npcs.dorothy;
        d.lookTarget = g.player.camera;
        await g.player.lookAt(d.headWorld(), 0.5);
        await d.say(pick(["Walt's just around the block, dear. Four-eighteen Oak.", 'Oh, he is just a doll.', 'You let me know if you need anything, hon.']));
      }),
    });
    // poop
    I.add({
      label: 'Pick it up', radius: 2.2, aim: 0.7,
      pos: () => (this.poop ? this.poop.obj.position : V(0, -99, 0)),
      enabled: () => this.poop && !this.poop.picked && seq.holding !== 'bag',
      action: () => g.cut(async () => {
        this.poop.picked = true;
        this.flags.pickedPoop = true;
        await seq.pickupPoop(this.poop.obj, pick(LINES.poop));
      }),
    });
  }

  // ---------------------------------------------------------------- input hooks
  onKey(code) {
    const g = this.g;
    if (!g.player.control || g.busy) return;
    if (code === 'KeyC') g.seq.smoke();
    if (code === 'KeyQ') {
      g.seq.whistle();
      const D = g.dog;
      if (!D.scripted) {
        D.setState('follow');
        setTimeout(() => D.yip(1), 500);
      }
    }
  }

  onBounds(side) { this.mutter(pick(LINES.bounds[side])); }

  onStep(p) {
    if (this.lastStepPos) this.walked += flat(p, this.lastStepPos);
    this.lastStepPos = p.clone();
    if (this.mode === 'night' && this.glassAt && flat(p, this.glassAt) < 2.2) this.g.audio.play('glass', { pos: p, vol: 0.6 });
  }

  // Tasks are derived from story state every frame (see computeTasks), so scenes never
  // have to remember to update the HUD. This stays as a no-op for older call sites.
  objective() {}

  // ---------------------------------------------------------------- walk progress
  // The block is a loop of street centerlines. Walking anywhere near a stretch of it
  // marks that stretch as covered, in either direction.
  initWalk() {
    const pts = [[-67, 0], [67, 0], [67, -64], [-67, -64]];
    const w = (this.walk = { segs: [], len: 0, visited: new Set(), progress: 0 });
    for (let i = 0; i < 4; i++) {
      const a = V(pts[i][0], 0, pts[i][1]), b = V(pts[(i + 1) % 4][0], 0, pts[(i + 1) % 4][1]);
      const L = a.distanceTo(b);
      w.segs.push({ a, b, L, s0: w.len });
      w.len += L;
    }
    w.nBins = Math.round(w.len / 12);
  }

  walkPoint(bin) {
    const w = this.walk, s = ((bin + 0.5) / w.nBins) * w.len;
    const seg = w.segs.find((q) => s >= q.s0 && s <= q.s0 + q.L) || w.segs[0];
    return seg.a.clone().lerp(seg.b, (s - seg.s0) / seg.L);
  }

  updateWalk() {
    const w = this.walk, p = this.g.player.pos;
    for (const q of w.segs) {
      const ab = V().subVectors(q.b, q.a), t = clamp(V().subVectors(p, q.a).dot(ab) / (q.L * q.L), 0, 1);
      const c = q.a.clone().addScaledVector(ab, t);
      if (Math.hypot(p.x - c.x, p.z - c.z) < 15) w.visited.add(Math.min(w.nBins - 1, Math.floor(((q.s0 + t * q.L) / w.len) * w.nBins)));
    }
    w.progress = w.visited.size / w.nBins;
  }

  walkTarget() {
    const w = this.walk, p = this.g.player.pos;
    let best = null, bd = Infinity;
    for (let i = 0; i < w.nBins; i++) {
      if (w.visited.has(i)) continue;
      const q = this.walkPoint(i), d = flat(q, p);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  computeTasks() {
    const g = this.g, f = this.flags, H = g.world.houses, t = [];
    let hint = '';
    const door = (h) => h.doorWorld.clone().add(V(0, 1, 0));
    if (this.mode === 'day' && f.started) {
      if (f.needLeash) {
        t.push({ id: 'car', text: 'Get Moose out of the car', target: g.car.doors.passenger.pivot.localToWorld(g.car.doors.passenger.outerHandle.clone()), label: 'the car' });
      } else {
        const p = this.walk.progress, walkDone = p >= 0.9;
        t.push({ id: 'walk', text: 'Walk Moose around the block', done: walkDone, progress: Math.min(1, p / 0.9), progressLabel: `${Math.min(100, Math.round((p / 0.9) * 100))}% of the way around`, target: walkDone ? null : this.walkTarget(), label: 'keep walking' });
        if (f.bulbTask) t.push({ id: 'bulb', text: "Change Mrs. Kessler's porch light", done: f.bulbFixed, target: H.dorothy.porchLight.pos, label: "Mrs. Kessler's porch" });
        if (f.letter) t.push({ id: 'letter', text: "Deliver Walt Brenner's letter (418 Oak St)", done: f.letterDelivered, target: door(H.walt), label: '418 Oak St' });
        if (this.poop && !this.poop.picked && !f.poopLeft) t.push({ id: 'poop', text: 'Pick up after Moose', optional: true, target: this.poop.obj.position, label: "Moose's mess" });
        if (g.seq.holding === 'bag') {
          const P = g.player.pos, can = g.world.cans.reduce((a, c) => (flat(c.pos, P) < flat(a.pos, P) ? c : a));
          t.push({ id: 'bag', text: 'Toss the bag in a trash can', optional: true, target: can.pos, label: 'trash can' });
        }
        if (walkDone && (!f.letter || f.letterDelivered)) t.push({ id: 'home', text: 'Head home', target: door(H.richie), label: 'home' });
      }
    } else if (this.mode === 'night' && f.nightStarted) {
      if (!f.climaxDone) {
        t.push({ id: 'follow', text: 'Let Moose find a spot', target: f.climaxStarted ? null : g.dog.pullTarget, label: 'Moose wants to go this way' });
        hint = f.waltWarned ? 'Stay in the light. If it goes quiet, go home.' : 'Stay in the light.';
      } else t.push({ id: 'home', text: 'Get home', target: door(H.richie), label: 'home' });
    }
    return { list: t, hint };
  }

  updateHud() {
    const g = this.g, P = g.player;
    const { list, hint } = this.computeTasks();
    g.ui.tasks(list, hint);
    const order = ['car', 'bulb', 'letter', 'home', 'bag', 'poop', 'walk', 'follow'];
    let tgt = null;
    for (const id of order) {
      const t = list.find((x) => x.id === id && !x.done && x.target);
      if (t) { tgt = t; break; }
    }
    if (!tgt || !P.control || g.busy) return g.ui.pointer(null);
    const cam = P.camera.getWorldPosition(V());
    const dx = tgt.target.x - cam.x, dz = tgt.target.z - cam.z, d = Math.hypot(dx, dz);
    if (d < 6) return g.ui.pointer(null);
    let rel = yawTo(dx, dz) - P.yaw;
    rel = Math.atan2(Math.sin(rel), Math.cos(rel));
    g.ui.pointer(-rel, `${tgt.label} · ${Math.round((d * 3.28) / 10) * 10} ft`);
  }

  // ================================================================ DAY
  async startDay() {
    const g = this.g, H = g.world.houses, N = g.npcs;
    this.mode = 'day';
    this.flags = {};
    this.initWalk();
    g.atmos.setMode('day');
    g.audio.setMode('day');
    g.dog.panting = true;
    g.dog.eyeshine = false;

    // Dorothy waters her flowers
    const dh = H.dorothy;
    const dPos = dh.toWorld(-2.6, 0, -dh.def.d / 2 - 1.6);
    N.dorothy.place(dPos.x, dPos.z, dh.facing + Math.PI);
    this.wateringCan(true);
    // Walt waits inside his hallway
    N.walt.root.visible = false;
    // Lindqvist hauls boxes from the truck
    N.lindqvist.place(41.5, -3.6, 0);
    this.lindqvistLoop();
    // the jogger loops the block
    N.jogger.place(20, 2.4, Math.PI / 2);
    N.jogger.running = true;
    this.joggerLoop();

    g.renderer.fade = 1;
    g.ui.vhs(null);
    if (new URLSearchParams(location.search).has('skipcar')) {
      // playtest shortcut: start on the driveway, Moose already leashed
      g.player.place(-23.5, 10, Math.PI * 0.75, -0.1);
      g.dog.place(-23, 9.2, 0);
      g.dog.leashed = true;
      g.dog.collarRing.add(g.seq.P.clip);
      g.hands.L.setRest('leash', true);
      g.ui.vhs('JUN 17 1995<br>8:09 AM');
      g.tw.to(g.renderer, { fade: 0 }, 1.5);
      g.player.control = true;
      this.flags.started = true;
      return;
    }
    await g.ui.card('<span class="small">S N I F F &nbsp; S N I F F</span>\n\nWillet, Wisconsin\nSaturday, June 17, 1995', 2.4, false);
    g.ui.vhs('JUN 17 1995<br>8:05 AM');
    g.ui.hideCard();
    await g.cut(() => g.seq.introCar(DJ));
    this.flags.needLeash = true;
    this.flags.started = true;
    this.carYipT = 3;
  }

  wateringCan(on) {
    const g = this.g, d = g.npcs.dorothy;
    if (on) {
      if (!this.can) {
        const c = new THREE.Group();
        const m = new THREE.MeshLambertMaterial({ color: 0x3a8a4a });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.2, 8), m);
        body.position.y = -0.12;
        const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.3, 5), m);
        spout.position.set(0, -0.08, -0.17);
        spout.rotation.x = -1.0;
        const tip = new THREE.Object3D();
        tip.position.set(0, 0.06, -0.3);
        c.add(body, spout, tip);
        this.can = c;
        this.canTip = tip;
      }
      d.holdItem(this.can);
      d.manual = true;
      d.armR.sh.rotation.set(0.45, 0, 0.1);
      d.armR.el.rotation.set(0.4, 0, 0);
      d.lookTarget = this.canTip;
      d.watering = true;
    } else {
      d.watering = false;
      if (this.can && this.can.parent) this.can.parent.remove(this.can);
      d.manual = false;
    }
  }

  async lindqvistLoop() {
    const g = this.g, L = g.npcs.lindqvist, h = g.world.houses.lindqvist;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.4), new THREE.MeshLambertMaterial({ color: 0xb08a5a }));
    const stacked = [];
    const porch = h.toWorld(-0.9, 0, -h.def.d / 2 - 0.9);
    const steps = h.toWorld(0, 0, -h.def.d / 2 - 2.9);
    while (this.mode === 'day') {
      if (this.lindqvistPause) { await g.tw.wait(0.5); continue; }
      L.chest.add(box);
      box.position.set(0, 0.02, -0.3);
      box.rotation.set(0, 0, 0);
      L.carry(true);
      await L.walkPath([[38, -6.3], [steps.x, -6.3], [steps.x, steps.z], [porch.x, porch.z]], 1.05);
      if (this.mode !== 'day') break;
      while (this.lindqvistPause) await g.tw.wait(0.3);
      // set it down on the stack; the stack grows all day
      const b = box.clone();
      const n = stacked.length;
      b.position.set(porch.x - 0.4 + (n % 3) * 0.55, 0.5 + 0.18 + Math.floor(n / 3) * 0.37, porch.z + (h.facing === 0 ? -0.3 : 0.3));
      g.scene.add(b);
      stacked.push(b);
      if (box.parent) box.parent.remove(box);
      L.carry(false);
      await g.tw.wait(1.2);
      while (this.lindqvistPause) await g.tw.wait(0.3);
      await L.walkPath([[steps.x, steps.z], [steps.x, -6.3], [38, -6.3], [41.5, -3.6]], 1.05);
      await g.tw.wait(1.5);
    }
  }

  async joggerLoop() {
    const g = this.g, J = g.npcs.jogger;
    const loop = [[-66.5, 2.4], [-67.5, -61], [67.5, -61], [67.5, 2.4]];
    let i = 0;
    while (this.mode === 'day') {
      await J.walkPath([loop[i]], 2.9);
      i = (i + 1) % loop.length;
    }
    J.stop();
    J.root.visible = false;
  }

  // ---------------------------------------------------------------- Dorothy
  async dorothyIntro() {
    const g = this.g, d = g.npcs.dorothy, P = g.player, D = g.dog, tw = g.tw;
    this.flags.metDorothy = true;
    this.dorothyBusy = true;
    await g.cut(async () => {
      this.wateringCan(false);
      d.lookTarget = P.camera;
      d.wave(3);
      const hi = d.say('Yoo-hoo! Hello there!');
      await P.lookAt(d.headWorld(), 0.8);
      await hi;
      const dir = V(d.pos.x - P.pos.x, 0, d.pos.z - P.pos.z);
      const dist = dir.length();
      dir.normalize();
      const meet = P.pos.clone().addScaledVector(dir, Math.min(dist, 1.35));
      if (dist > 1.6) {
        const walk = d.walkPath([meet], 0.95);
        await g.tw.during(Math.max(0.5, (dist - 1.35) / 0.95), () => P.lookAt(d.headWorld(), 0.05));
        await walk;
      }
      d.faceToward(P.pos);
      await P.lookAt(d.headWorld(), 0.4);
      await d.say('You must be the young man who moved into the old Gunderson place!');
      await this.say("I— yeah. Renting. I'm, uh, renting it. I'm Richie.");
      await d.say('Dorothy Kessler. Forty-one years on Birch Lane.');
      await g.seq.handshake(d);
      // she meets Moose: he trots up to her feet
      const toP = V(P.pos.x - d.pos.x, 0, P.pos.z - d.pos.z).normalize();
      const side = V(-toP.z, 0, toP.x);
      const spot = d.pos.clone().addScaledVector(toP, 0.5).addScaledVector(side, 0.15);
      D.lookAt = d.head;
      await D.walkTo(spot.x, spot.z, 1.8);
      D.moveScripted = false;
      D.faceYaw = null;
      D.yaw = yawTo(d.pos.x - D.root.position.x, d.pos.z - D.root.position.z);
      D.setPoseTargets({ sit: 1 });
      D.lookAt = d.head;
      D.wagAmt = 1.2;
      D.wagRate = 16;
      await d.say('And who is this little peanut?');
      const pet = d.petDog(D);
      D.yip(1);
      await P.lookAt(D.head.getWorldPosition(V()), 0.6);
      await this.say("That's M-Moose. Got him off a farm out on County K. Free puppies.");
      await pet;
      D.release();
      d.lookTarget = P.camera;
      await P.lookAt(d.headWorld(), 0.6);
      await d.say("Well, you keep a good eye on him, hon. The Pruitts' beagle got out last week.");
      await d.say("And she wasn't the first.");
      await this.say('Got out?');
      await tw.wait(0.9);
      d.lookTarget = null;
      await tw.wait(0.7);
      d.lookTarget = P.camera;
      await d.say("That's what folks say.");
      await d.say("Say. Would you do an old lady a favor? My porch light's burnt out, and with my hip, I can't get up there.");
      const c = await g.ui.choose(['S-sure. Yeah, I can do that.', "I'm, uh... kind of in the middle of something. Sorry."]);
      if (c === 0) {
        await this.say('S-sure. Yeah, I can do that.');
        await d.say("Oh, aren't you a dear! Bulb's right there on the step.");
        this.flags.bulbTask = true;
        this.objective("Change Mrs. Kessler's porch light.");
        this.dorothyBusy = false;
        this.dorothyWatch();
      } else {
        await this.say("I'm, uh... kind of in the middle of something. Sorry.");
        await tw.wait(0.5);
        await d.say("Oh. No, that's... that's alright, dear.");
        this.flags.bulbRefused = true;
        await this.dorothyLetter(false);
      }
    });
  }

  async dorothyWatch() {
    const g = this.g, d = g.npcs.dorothy, h = g.world.houses.dorothy;
    const spot = h.toWorld(1.8, 0, -h.def.d / 2 - 3.2);
    await d.walkPath([spot], 0.9);
    d.lookTarget = g.player.camera;
  }

  async fixBulb() {
    const g = this.g, d = g.npcs.dorothy, P = g.player;
    await g.cut(async () => {
      await g.seq.fixBulb(g.world.houses.dorothy);
      this.flags.bulbFixed = true;
      d.lookTarget = P.camera;
      const line = d.say('Well, would you look at that! Let there be light.');
      await P.lookAt(d.headWorld(), 0.8);
      await line;
      await this.say('It was, uh... it was just the bulb.');
      await this.dorothyLetter(true);
    });
  }

  async dorothyLetter(nice) {
    const g = this.g, d = g.npcs.dorothy, P = g.player;
    this.dorothyBusy = true;
    if (flat(d.pos, P.pos) > 2.0) {
      const dir = V(d.pos.x - P.pos.x, 0, d.pos.z - P.pos.z).normalize();
      const meet = P.pos.clone().addScaledVector(dir, 1.3);
      await d.walkPath([meet], 0.95);
    }
    d.faceToward(P.pos);
    d.lookTarget = P.camera;
    await P.lookAt(d.headWorld(), 0.5);
    if (nice) await d.say("Oh, and one more thing, since you're so handy.");
    else await d.say('Could you at least run this around the block for me?');
    await d.say("It's Walt Brenner's. Four-eighteen Oak. Mailman keeps giving me his.");
    await g.seq.receive(d, this.letter, 'Walt Brenner. Four-eighteen Oak.');
    await d.say("Don't mind Walt. He's all bark.");
    await this.say('O-okay.');
    this.flags.letter = true;
    this.objective("Deliver Walt Brenner's letter. 418 Oak St, other side of the block.");
    this.dorothyBusy = false;
    const h = g.world.houses.dorothy;
    const back = h.toWorld(-2.6, 0, -h.def.d / 2 - 1.6);
    d.walkPath([back], 0.9).then(() => {
      d.face(h.facing + Math.PI);
      if (this.mode === 'day') this.wateringCan(true);
    });
  }

  // ---------------------------------------------------------------- Lindqvist
  async lindqvistTalk() {
    const g = this.g, L = g.npcs.lindqvist, P = g.player, D = g.dog, tw = g.tw;
    this.flags.metLindqvist = true;
    this.lindqvistPause = true;
    L.stop();
    await g.cut(async () => {
      L.lookTarget = P.camera;
      L.faceToward(P.pos);
      g.tw.to(L, { yaw: L.faceYaw + Math.round((L.yaw - L.faceYaw) / (Math.PI * 2)) * Math.PI * 2 }, 0.9);
      await P.lookAt(L.headWorld(), 0.6);
      await L.say('Hello. Neighbor.');
      await this.say("Oh! Uh, hi. I'm Richie. I'm new too. Sort of. Four-twelve.");
      await L.say('We are the Lindqvists. We are new. We like it here very much.');
      // Moose wants no part of this
      D.scripted = true;
      D.moveScripted = true;
      const behind = P.pos.clone().addScaledVector(P.forward, -0.6).add(V(0.2, 0, 0));
      D.target.copy(behind);
      D.maxSpeed = 2.5;
      D.setPoseTargets({ cower: 1 });
      D.tailUp = -0.5;
      D.lookAt = L.head;
      D.growl();
      L.lookTarget = D.head;
      await tw.wait(0.6);
      await L.say('Your dog.');
      await tw.wait(1.3);
      await L.say('Is nervous.');
      L.lookTarget = P.camera;
      await this.say("He's, uh. He's a puppy.");
      await tw.wait(1.6);
      await L.say('Yes.');
      await tw.wait(1.2);
      D.moveScripted = false;
      D.release();
      D.tailUp = 0.6;
    });
    this.lindqvistPause = false;
    setTimeout(() => this.mutter('...Okay then.'), 1800);
  }

  // ---------------------------------------------------------------- Walt
  async waltDoor() {
    const g = this.g, W = g.npcs.walt, h = g.world.houses.walt, P = g.player, D = g.dog, tw = g.tw, seq = g.seq;
    await g.cut(async () => {
      await seq.knock(h);
      await tw.wait(1.2);
      D.lookAt = h.doorWorld.clone().add(V(0, 0.6, 0));
      // footsteps coming to the door
      for (let i = 0; i < 4; i++) {
        g.audio.play('step_wood', { pos: h.insideSpot.clone().add(V(0, 0.5, 0)).addScaledVector(V(-Math.sin(h.facing), 0, -Math.cos(h.facing)), -2 + i * 0.5), vol: 0.5 + i * 0.15 });
        await tw.wait(0.45);
      }
      // he peeks through the gap on the latch side
      const inside = h.toWorld(h.def.doorX + 0.42, 0.5, -h.def.d / 2 + 0.42);
      W.place(inside.x, inside.z, h.facing);
      W.root.visible = true;
      W.lookTarget = P.camera;
      g.audio.play('deadbolt', { pos: h.doorWorld.clone().add(V(0, 1.2, 0)), vol: 0.8 });
      await tw.wait(0.25);
      await seq.doorTo(h, 0.24, 0.35);
      await P.lookAt(W.headWorld(), 0.4);
      if (!this.flags.letter) {
        await W.say("Whatever you're selling. No.");
        await seq.doorTo(h, 0, 0.3, 'door_close');
        W.root.visible = false;
        await tw.wait(0.4);
        await this.say("I'm not... selling...");
        D.release();
        return;
      }
      await W.say('Yeah?');
      await this.say("H-hi. I'm Richie, from over on Birch? Mrs. Kessler asked me to bring you this.");
      await seq.doorTo(h, 0, 0.3, 'door_close');
      await tw.wait(0.3);
      g.audio.play('chain', { pos: h.doorWorld.clone().add(V(0, 1.4, 0)), vol: 0.7 });
      await tw.wait(0.9);
      seq.doorTo(h, 1.35, 0.9);
      const thresh = h.toWorld(h.def.doorX + 0.1, 0.5, -h.def.d / 2 + 0.2);
      await W.walkPath([thresh], 0.7);
      W.face(h.facing);
      await P.lookAt(W.headWorld(), 0.4);
      await W.say("Dorothy. 'Course she did.");
      await seq.handOver(W, this.letter);
      W.lookTarget = D.head;
      D.lookAt = W.head;
      await tw.wait(1.1);
      if (this.flags.poopLeft) {
        await W.say('That your dog left a present on the Fergusons\' lawn back there?');
        const c = await g.ui.choose(["Y-yes sir. I'll— I'll go get it.", '...No sir.']);
        if (c === 0) { await this.say("Y-yes sir. I'll— I'll go get it."); await W.say('Hm.'); }
        else { await this.say('...No sir.'); await W.say('Hm. Must be the other puppy.'); }
      } else if (this.flags.pickedPoop) {
        await W.say('Saw you pick up after him. More than I can say for some.');
      }
      await W.say('Got yourself a puppy.');
      W.lookTarget = P.camera;
      await tw.wait(0.5);
      await W.say('You walk him at night, you stay in the light. Streetlights. Porch lights. You hear me?');
      const c = await g.ui.choose(['Why?', 'Y-yes sir.']);
      if (c === 0) { await this.say('Why?'); await tw.wait(0.6); await W.say("'Cause I said so."); this.flags.askedWalt = true; }
      else { await this.say('Y-yes sir.'); await W.say('Good.'); }
      await W.say('And you keep him off Mill Road.');
      await tw.wait(0.4);
      await W.say("One more thing. If it goes quiet out there — I mean quiet, crickets and all — you turn around and go home.");
      this.flags.waltWarned = true;
      const backIn = h.toWorld(h.def.doorX + 0.15, 0.5, -h.def.d / 2 + 1.2);
      W.walkPath([backIn], 0.8);
      await tw.wait(0.5);
      await seq.doorTo(h, 0, 0.5, 'door_close');
      W.root.visible = false;
      g.audio.play('deadbolt', { pos: h.doorWorld.clone().add(V(0, 1.2, 0)), vol: 0.7 });
      await tw.wait(0.6);
      await this.say('...Friendly town.');
      this.flags.letterDelivered = true;
      this.objective('Head home.');
      D.release();
    });
  }

  // ---------------------------------------------------------------- home door
  async homeDoor() {
    const g = this.g;
    if (this.mode === 'day') {
      if (this.flags.letter && !this.flags.letterDelivered) return this.mutter("I've still got Walt's letter.");
      if (this.walk.progress < 0.9) return this.mutter("He hasn't had his walk yet. Around the block, then home.");
      if (g.seq.holding === 'bag') return this.mutter('Not bringing this inside.');
      await g.cut(async () => {
        await g.seq.enterHouse(g.world.houses.richie);
      });
      await this.toNight();
    } else {
      if (!this.flags.climaxDone) return this.mutter(pick(["He hasn't even gone yet.", 'Come on, Moose. Just... go.']));
      await this.ending();
    }
  }

  // ================================================================ NIGHT
  async toNight() {
    const g = this.g;
    g.busy++;
    g.player.control = false;
    this.mode = 'transition';
    g.ui.vhs(null);
    g.renderer.fade = 1;
    await g.ui.card('<span class="small">later</span>', 1.4, false);
    await this.startNight(true);
  }

  async startNight(fromDay = false) {
    const g = this.g, H = g.world.houses, N = g.npcs, P = g.player, D = g.dog, tw = g.tw, seq = g.seq;
    this.mode = 'night';
    if (!fromDay) { g.busy++; g.player.control = false; }
    g.renderer.fade = 1;
    g.atmos.setMode('night');
    g.audio.setMode('night');
    g.audio.setMuffle(900, 0.01);
    this.wateringCan(false);
    for (const k of ['dorothy', 'walt', 'jogger']) { N[k].stop(); N[k].root.visible = false; }
    N.lindqvist.stop();
    N.lindqvist.carry(false);
    D.panting = false;

    // the street at midnight
    g.atmos.setPorch('richie', true);
    g.atmos.setPorch('walt', true);
    g.atmos.setWindows('walt', 'tv', 0, 1);
    g.atmos.setWindows('b408', 'lit', 1, 1);
    g.atmos.setWindows('o410', 'tv', 0, 1);
    g.atmos.setPorch('b424', true);
    g.atmos.setPorch('o426', true);
    if (this.flags.bulbFixed) {
      g.atmos.setPorch('dorothy', true);
      g.atmos.setWindows('dorothy', 'lit', 0, 1);
      g.world.spots.zapper.active = true;
      this.makeZapper();
      this.makeDorothySilhouette();
    }
    // Lindqvist stands on his lawn facing his dark house
    const lh = H.lindqvist;
    const lp = lh.toWorld(0.6, 0, -lh.def.d / 2 - 4.2);
    N.lindqvist.place(lp.x, lp.z, lh.facing + Math.PI);
    N.lindqvist.root.visible = true;
    N.lindqvist.lookTarget = null;
    N.lindqvist.headLimit = 3.0;
    // glass by Walt's truck
    this.makeGlass();
    this.hallLamp.on = true;
    this.hallLamp.level = 1;

    // inside Richie's hallway, Moose at the door
    const h = H.richie;
    if (D.root.parent !== g.scene) g.scene.attach(D.root);
    D.leashed = false;
    if (seq.P.clip.parent) seq.P.clip.parent.remove(seq.P.clip);
    if (seq.P.coil.parent !== this.hallGroup) {
      this.hallGroup.add(seq.P.coil);
      seq.P.coil.visible = true;
      seq.P.coil.position.set(h.def.doorX + 0.8, 0.5 + 1.55, -h.def.d / 2 + 0.18 + 0.65);
      seq.P.coil.rotation.set(0, Math.PI / 2, 0);
    }
    const near = h.toWorld(h.def.doorX - 0.2, 0.5, -h.def.d / 2 + 0.55);
    D.place(near.x, near.z, h.facing);
    D.scripted = true;
    D.moveScripted = false;
    D.setPoseTargets({});
    D.lookAt = h.doorWorld.clone().add(V(0, 0.4, 0));
    D.root.position.y = 0.5;
    const inside = h.toWorld(h.def.doorX, 0.5, -h.def.d / 2 + 1.6);
    P.place(inside.x, inside.z, h.facing, -0.2);
    P.eye = 1.62;
    h.door.pivot.rotation.y = 0;
    if (seq.cigState === 'lit') { seq.P.cig.lit = false; seq.cigState = 'none'; if (seq.P.cig.group.parent) seq.P.cig.group.parent.remove(seq.P.cig.group); g.hands.R.setRest('none'); }
    seq.holding = null;
    g.hands.L.setRest('none');

    g.ui.vhs('JUN 17 1995<br>11:52 PM');
    g.ui.hideCard();
    await g.cut(async () => {
      tw.to(g.renderer, { fade: 0 }, 2.0);
      // scratching and whining
      const scratch = async () => {
        for (let i = 0; i < 3; i++) {
          g.audio.play('scratch', { follow: D.head, vol: 0.4, rate: 1.5 });
          await tw.to(D.legs[0].hip.rotation, { x: -1.2 }, 0.12);
          await tw.to(D.legs[0].hip.rotation, { x: -0.6 }, 0.12);
        }
      };
      D.whine();
      await scratch();
      await tw.wait(0.4);
      await this.say("Moose. It's midnight.");
      D.whine();
      D.lookAt = P.camera;
      await scratch();
      await tw.wait(0.5);
      await this.say('...Fine. Fine! Quick one.');
      await seq.leashFromHook(this.hookPos());
      await seq.leaveHouse(h);
    });
    g.busy = Math.max(0, g.busy - (fromDay ? 1 : 1));
    if (!g.busy) g.player.control = true;
    this.flags.nightStarted = true;
    this.nightT = 0;
    D.panting = false;
  }

  makeZapper() {
    if (this.zapper) return;
    const g = this.g, p = g.world.spots.zapper.pos;
    const z = new THREE.Group();
    z.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 0.22), new THREE.MeshBasicMaterial({ color: 0x6a5aff })));
    const cage = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.33, 0.25), new THREE.MeshBasicMaterial({ color: 0x222222, wireframe: true }));
    z.add(cage);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: g.tex.glow, color: 0x6a5aff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
    glow.scale.set(1.4, 1.4, 1);
    z.add(glow);
    z.position.copy(p);
    g.scene.add(z);
    this.zapper = z;
  }

  makeDorothySilhouette() {
    const g = this.g, h = g.world.houses.dorothy;
    const win = h.windows.find((w) => w.face === 'front' && w.floor === 0);
    if (!win) return;
    const m = new THREE.MeshBasicMaterial({ color: 0x1a120c });
    const s = new THREE.Group();
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.01), m);
    head.position.y = 0.2;
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.01), m);
    hair.position.y = 0.3;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.01), m);
    body.position.y = -0.2;
    const arm = new THREE.Group();
    arm.position.set(0.22, -0.05, 0);
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4, 0.01), m);
    a.position.y = 0.2;
    arm.add(a);
    s.add(head, hair, body, arm);
    s.position.copy(win.pos).add(V(0, -0.15, 0)).addScaledVector(V(-Math.sin(h.facing), 0, -Math.cos(h.facing)), 0.012);
    s.rotation.y = h.facing + Math.PI;
    s.visible = false;
    g.scene.add(s);
    this.silhouette = { group: s, arm };
  }

  makeGlass() {
    if (this.glass) return;
    const g = this.g, p = g.world.waltTruckPos;
    const side = V(p.x + 1.2, 0.03, p.z);
    const geo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 90; i++) pts.push(side.x + (Math.random() - 0.3) * 1.4, 0.03, side.z + (Math.random() - 0.5) * 1.8);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.glass = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xd0e8ff, size: 0.03 }));
    g.scene.add(this.glass);
    this.glassAt = side;
    // the driver's window is gone: a dark hole on the truck's side
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.42), new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.DoubleSide }));
    hole.position.set(p.x + 0.94, 1.18, p.z + 0.15);
    hole.rotation.y = Math.PI / 2;
    g.scene.add(hole);
  }

  // ---------------------------------------------------------------- night climax
  async climax() {
    const g = this.g, P = g.player, D = g.dog, A = g.audio, tw = g.tw, W = g.world;
    this.flags.climaxStarted = true;
    const lamp = W.lampByName.millDark;
    const origin = P.pos.clone();
    // Moose finally goes
    D.scripted = true;
    D.moveScripted = false;
    D.setPoseTargets({ squat: 1 });
    D.tailUp = 0.9;
    A.play('pee', { follow: D.torso, vol: 0.5 });
    await tw.wait(2.4);
    D.setPoseTargets({});
    this.mutter('Finally. Good— good boy. Okay. Home.');
    D.release();
    await tw.wait(1.2);
    // and then the crickets stop. Walt said what that means.
    tw.to(A, { threatSilence: 1 }, 2.5);
    await tw.wait(3.0);
    this.mutter(this.flags.waltWarned ? '...The crickets stopped.' : "...Why'd the crickets stop?");
    const threat = V(88, 1.6, -41);
    D.threat = threat;
    D.setState('alert');
    this.dogOverride = true;
    D.growl();
    this.threat = 0.35;
    this.objective(null);
    // the fog thins a little, and Richie's head turns to where Moose is staring
    tw.to(g.atmos.fog, { density: 0.038 }, 4);
    await P.lookAt(threat, 1.8, 'inOutCubic');
    await tw.wait(0.6);
    // the light on Mill Rd doesn't like what's out there
    const T = this.tall;
    const steps = [88, 84, 81, 78, 75.5];
    tw.to(g.atmos, { mistAmount: 0.35 }, 3);
    lamp.override = 'on';
    T.visible = false;
    for (let i = 0; i < steps.length; i++) {
      lamp.override = 'off';
      A.play('tick', { pos: lamp.pos, vol: 1, ref: 3 });
      await tw.wait(0.35 + Math.random() * 0.4);
      T.position.set(steps[i], 0, -42 + (Math.random() - 0.5) * 2);
      T.rotation.y = yawTo(P.pos.x - T.position.x, P.pos.z - T.position.z);
      T.visible = true;
      lamp.override = 'on';
      D.setState('bark');
      this.threat = 0.5 + i * 0.12;
      if (i === 0) this.mutter('M-Moose.');
      if (i === 2) this.mutter('Moose, come on. Come on.');
      // leave the scene early if Richie backs away
      const leftEarly = await Promise.race([tw.wait(1.6 + Math.random() * 1.2).then(() => false), tw.until(() => flat(P.pos, origin) > 16, 3).then(() => flat(P.pos, origin) > 16)]);
      if (leftEarly) break;
    }
    // pop
    lamp.override = 'off';
    lamp.on = false;
    A.play('pop', { pos: lamp.pos, vol: 1.0, ref: 4 });
    for (let i = 0; i < 16; i++) g.seq.fx.emit(lamp.pos.clone(), V((Math.random() - 0.5) * 3, -Math.random() * 2, (Math.random() - 0.5) * 3), { size: 0.02, grow: 0.02, life: 0.7, op: 0.9, color: 0xffd080 });
    T.visible = false;
    g.renderer.flash = 0.15;
    tw.to(g.renderer, { flash: 0 }, 0.4);
    this.threat = 1;
    await tw.wait(0.8);
    // something runs past in the dark behind him
    const runner = new THREE.Object3D();
    g.scene.add(runner);
    const fw = P.forward.clone();
    const back = P.pos.clone().addScaledVector(fw, -9);
    const side = V(-fw.z, 0, fw.x);
    runner.position.copy(back).addScaledVector(side, -10);
    A.play('run_steps', { follow: runner, vol: 1.2, ref: 3 });
    tw.to(runner.position, { x: back.x + side.x * 10, z: back.z + side.z * 10 }, 2.0, 'linear');
    D.setState('bark');
    D.yip(3, 0.18);
    await tw.wait(2.2);
    this.say('Go. Go go go go.');
    tw.to(g.atmos.fog, { density: 0.052 }, 5);
    tw.to(g.atmos, { mistAmount: 1 }, 6);
    this.flags.climaxDone = true;
    this.dogOverride = false;
    D.pullStrength = 2.0;
    this.objective('Get home.');
    tw.to(A, { threatSilence: 0.7 }, 6);
  }

  async ending() {
    const g = this.g, P = g.player, D = g.dog, tw = g.tw;
    await g.cut(async () => {
      await g.seq.lockUp(g.world.houses.richie);
      D.lookAt = P.camera;
      D.whine();
      await tw.wait(1.2);
      await this.say('...What was that, Moose?');
      await tw.wait(1.4);
      D.whine();
      await tw.wait(1.0);
      await tw.to(g.renderer, { fade: 1 }, 2.5);
    });
    g.busy++;
    g.player.control = false;
    g.ui.vhs(null);
    this.mode = 'ending';
    g.audio.setMode('silent');
    const f = this.flags;
    const lines = [
      `<span class="small">Mrs. Kessler's porch light</span>\n${f.bulbFixed ? 'ON — she waved goodnight' : 'OFF — something stood in her yard'}`,
      `<span class="small">Moose's business</span>\n${f.pickedPoop ? 'picked up' : f.poopLeft ? 'left on the Fergusons\' lawn' : '—'}`,
      `<span class="small">cigarettes</span>\n${18 - g.seq.cigs}`,
    ].join('\n\n');
    await g.ui.card(`S N I F F &nbsp; S N I F F\n<span class="small">end of tape 1</span>\n\n${lines}\n\n<span class="small">Sunday, June 18, 1995 — coming soon</span>`, 9, false);
    this.mode = 'end';
    document.getElementById('card-text').innerHTML += '\n\n<span class="small">[ click to rewind ]</span>';
    this.waitingRestart = true;
  }

  // ================================================================ per-frame
  update(dt) {
    const g = this.g, P = g.player, D = g.dog, N = g.npcs;
    this.t += dt;
    if (!N) return;
    for (const k in N) N[k].update(dt);

    if (this.mode === 'day') this.updateDay(dt);
    else if (this.mode === 'night') this.updateNight(dt);
    if (this.walk) this.updateHud();
  }

  updateDay(dt) {
    const g = this.g, P = g.player, D = g.dog, N = g.npcs, tw = g.tw;
    let nerves = 0.04;

    // Moose yips from the car until you come get him
    if (this.flags.needLeash) {
      this.carYipT -= dt;
      if (this.carYipT <= 0) { this.carYipT = 5 + Math.random() * 5; D.yip(1 + Math.floor(Math.random() * 2)); }
    }
    // Dorothy waters (pouring tilt + droplets)
    const d = N.dorothy;
    if (d.watering && this.canTip) {
      d.armR.hand.rotation.x = Math.sin(this.t * 0.7) * 0.25 - 0.2;
      if (Math.random() < 0.6) g.seq.fx.emit(this.canTip.getWorldPosition(V()), V((Math.random() - 0.5) * 0.1, -0.9, (Math.random() - 0.5) * 0.1), { size: 0.015, grow: 0, life: 0.45, op: 0.7, color: 0x9ac8ff });
    }

    const free = P.control && !g.busy;
    // Dorothy notices you
    if (free && !this.flags.metDorothy && D.leashed && flat(P.pos, d.pos) < 14) this.dorothyIntro();
    if (free) this.updateWalk();

    // Lindqvist stops and stares, holding up one hand, far too long
    const L = N.lindqvist, ld = flat(P.pos, L.pos);
    if (ld < 13) {
      nerves += 0.12;
      L.lookTarget = P.camera;
      if (free && this.first('lindqvistWave')) this.lindqvistWave();
    } else if (!this.lindqvistPause) L.lookTarget = null;

    // the jogger
    const J = N.jogger;
    if (J.root.visible && free && flat(P.pos, J.pos) < 8 && (!this.joggerCD || this.t > this.joggerCD)) {
      this.joggerCD = this.t + 40;
      this.joggerCount = (this.joggerCount || 0) + 1;
      J.lookTarget = P.camera;
      J.say(['Mornin\'!', 'Cute pup!', 'Hot one today!'][Math.min(2, this.joggerCount - 1)]);
      J.wave(2);
      D.yip(1);
      setTimeout(() => { g.seq.waveBack(); if (this.joggerCount === 1) this.mutter('H-hi.'); J.lookTarget = null; }, 900);
    }

    // poop time
    if (free && this.flags.metDorothy && !this.flags.poopEvent && this.walked > 45 && !D.scripted && g.world.surfaceAt(D.root.position.x, D.root.position.z) === 'grass') this.poopEvent();
    if (this.poop && !this.poop.picked && !this.flags.poopLeft && flat(P.pos, this.poop.obj.position) > 24) {
      this.flags.poopLeft = true;
      this.mutter('...Nobody saw that.');
    }

    P.nervesTarget = nerves;
  }

  async lindqvistWave() {
    const g = this.g, L = g.npcs.lindqvist, D = g.dog, tw = g.tw;
    this.lindqvistPause = true;
    L.stop();
    L.faceToward(g.player.pos);
    await tw.wait(0.6);
    const arm = L.armL;
    const wasManual = L.manual;
    L.manual = true;
    await tw.to(arm.sh.rotation, { z: -2.6, x: 0.1 }, 0.8);
    if (!D.scripted) { D.threat = L.headWorld(); D.setState('alert'); }
    await tw.wait(5.5);
    await tw.to(arm.sh.rotation, { z: -0.06, x: 0 }, 0.8);
    L.manual = wasManual;
    if (D.state === 'alert') D.setState('follow');
    this.lindqvistPause = false;
    this.mutter('Okay... hi.');
  }

  async poopEvent() {
    const g = this.g, D = g.dog, tw = g.tw;
    this.flags.poopEvent = true;
    D.scripted = true;
    D.moveScripted = true;
    const start = D.root.position.clone();
    let spot = start.clone();
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.6 + Math.random() * 0.9;
      const c = start.clone().add(V(Math.cos(a) * r, 0, Math.sin(a) * r));
      if (g.world.surfaceAt(c.x, c.z) === 'grass' && c.distanceTo(g.player.pos) < 2.2) { spot = c; break; }
    }
    await D.walkTo(spot.x, spot.z, 1.2);
    D.moveScripted = false;
    D.setPoseTargets({ sniff: 1 });
    g.audio.play('sniff', { follow: D.head, vol: 0.5 });
    const y0 = D.yaw;
    await tw.to(D, { yaw: y0 + Math.PI * 2 }, 1.6);
    D.setPoseTargets({ squat: 1 });
    D.wagAmt = 0;
    D.tailUp = 1.0;
    D.lookAt = g.player.camera;
    this.mutter('Oh. Oh, here? Okay. Sure. Right here.');
    await tw.wait(2.8);
    const obj = g.seq.P.poop();
    obj.position.copy(D.root.localToWorld(V(0, 0, 0.32 * D.size)));
    obj.position.y = 0.01;
    g.scene.add(obj);
    D.setPoseTargets({});
    g.audio.play('scratch', { follow: D.torso, vol: 0.5 });
    for (let i = 0; i < 8; i++) g.seq.fx.emit(D.root.localToWorld(V(0, 0.05, 0.4 * D.size)), V((Math.random() - 0.5) * 0.6, 0.4, 0.6), { size: 0.02, grow: 0.02, life: 0.5, op: 0.8, color: 0x4a3a20 });
    D.hop = 1;
    await tw.wait(0.4);
    D.release();
    this.poop = { obj, picked: false };
  }

  updateNight(dt) {
    const g = this.g, P = g.player, D = g.dog, N = g.npcs, W = g.world, H = W.houses, A = g.audio, tw = g.tw;
    this.nightT = (this.nightT || 0) + dt;
    const free = P.control && !g.busy;
    this.threat = Math.max(0, this.threat - dt * 0.04);

    // one distant dog, early. Then none, ever.
    if (this.nightT > 8 && this.first('nightDog')) A.play('bark', { pos: V(-60, 1, -140), vol: 0.6, ref: 10, bus: 'amb' });
    if (this.nightT > 30 && this.first('train')) A.play('train', { pos: V(-260, 5, -120), vol: 1, ref: 40, rolloff: 0.4, bus: 'amb' });

    // Moose leads the way to Mill Rd (and, after, drags you home)
    if (free && !D.scripted && !this.dogOverride) {
      if (!this.flags.climaxDone) {
        let tgt;
        if (P.pos.x > 56) tgt = V(66, 0, -30);
        else if (P.pos.z > -32) tgt = V(64, 0, 3);
        else tgt = V(64, 0, -62);
        D.pullTarget = tgt;
        D.pullStrength = 0.7;
        if (D.state !== 'pull' && D.state !== 'alert' && D.state !== 'bark') D.setState('pull');
      } else {
        D.pullTarget = H.richie.knockSpot;
        if (D.state !== 'pull' && D.state !== 'alert' && D.state !== 'bark') D.setState('pull');
      }
    }

    // nerves: darkness, threats, and the comfort of a porch light
    let lightD = 99;
    for (const l of W.lamps) if (l.level > 0.4 && (l.kind === 'street' || l.kind === 'porch')) lightD = Math.min(lightD, flat(l.pos, P.pos));
    let n = 0.2 + 0.3 * clamp((lightD - 8) / 12, 0, 1) + this.threat;
    if (this.flags.bulbFixed && flat(P.pos, H.dorothy.doorWorld) < 10) n -= 0.15;
    if (D.state === 'alert' || D.state === 'bark') n += 0.12;
    P.nervesTarget = clamp(n, 0, 1);

    // ----- Mrs. Kessler's house
    const dh = H.dorothy, dd = flat(P.pos, dh.doorWorld);
    if (this.flags.bulbFixed) {
      if (this.silhouette && dd < 18 && this.first('silhouette')) {
        this.silhouette.group.visible = true;
        (async () => {
          for (let i = 0; i < 4; i++) {
            await tw.to(this.silhouette.arm.rotation, { z: 0.5 }, 0.25);
            await tw.to(this.silhouette.arm.rotation, { z: -0.2 }, 0.25);
          }
          await tw.wait(3);
          this.mutter("She's... still up.");
          await tw.wait(6);
          this.silhouette.group.visible = false;
          g.atmos.setWindows('dorothy', 'dark', 0, 1);
        })();
      }
    } else if (!this.flags.tallGone) {
      const T = this.tall;
      if (!T.visible && free && dd < 30 && dd > 14 && this.first('tallDorothy')) {
        const p = dh.toWorld(1.5, 0, -dh.def.d / 2 - 3.5);
        T.position.copy(p);
        T.rotation.y = dh.facing + Math.PI;
        T.visible = true;
        this.lookAwayT = 0;
      }
      if (T.visible) {
        const cam = P.camera.getWorldPosition(V()), dir = P.camera.getWorldDirection(V());
        const to = T.position.clone().add(V(0, 1.6, 0)).sub(cam);
        const dist = to.length();
        const looking = free && dir.dot(to.normalize()) > 0.88;
        if (looking) {
          this.sawTall = true;
          if (this.first('tallGrowl')) { D.threat = T.position.clone().add(V(0, 1.5, 0)); D.setState('alert'); D.growl(); this.threat = 0.4; }
          this.lookAwayT = 0;
        } else if (this.sawTall) this.lookAwayT += dt;
        if (dist < 12 || this.lookAwayT > 0.9) {
          T.visible = false;
          this.flags.tallGone = true;
          A.play('snap', { pos: T.position.clone().add(V(0, 1, 6)), vol: 0.6 });
          if (D.state === 'alert') D.setState('pull');
          if (this.sawTall) setTimeout(() => this.mutter('N-nope. Nope. Nope.'), 600);
          this.threat = 0.45;
        }
      }
    }

    // ----- kids and the mailbox
    if (flat(P.pos, W.spots.smashedMailbox) < 12 && this.first('kids')) {
      const bike = new THREE.Object3D();
      g.scene.add(bike);
      bike.position.set(P.pos.x + 22, 0.8, 2);
      A.play('bell', { follow: bike, vol: 0.8, ref: 4 });
      A.play('freewheel', { follow: bike, vol: 0.7, ref: 3, delay: 0.3 });
      tw.to(bike.position, { x: P.pos.x + 40 }, 3, 'linear');
      setTimeout(() => this.mutter("Kids. It's... just kids."), 1800);
    }

    // ----- Mr. Lindqvist, on his lawn, in the dark
    const L = N.lindqvist;
    if (L.root.visible) {
      const ld = flat(P.pos, L.pos);
      if (ld < 18 && !this.flags.lindqvistSpoke) {
        if (!D.scripted && D.state !== 'alert' && !this.flags.climaxStarted) { D.threat = L.headWorld(); D.setState('alert'); }
        this.threat = Math.max(this.threat, 0.25);
      }
      if (ld < 9.5 && this.first('lindqvistNight')) {
        this.flags.lindqvistSpoke = true;
        L.lookTarget = P.camera;
        (async () => {
          await tw.wait(1.8);
          await L.say('Good evening, Richie.');
          await tw.wait(2.0);
          await L.say('Nice. Dog.');
          D.setState('bark');
          await tw.wait(2.5);
          if (D.state === 'bark') D.setState('pull');
        })();
      }
      if (this.flags.lindqvistSpoke && ld > 22 && this.first('lindqvistGone')) {
        L.root.visible = false;
        H.lindqvist.door.pivot.rotation.y = -1.2;
      }
    }

    // ----- Walt's truck
    const wt = W.waltTruckPos, wd = flat(P.pos, wt);
    if (wd < 46 && this.first('alarm')) this.alarm = A.loop('alarm', { pos: wt.clone().add(V(0, 1, 0)), vol: 0.9, ref: 6 });
    if (this.alarm && wd < 19 && this.first('alarmStop')) {
      A.stop(this.alarm, 0.02);
      g.atmos.setPorch('walt', false);
      g.atmos.setWindows('walt', 'dark', 0, 1);
      setTimeout(() => this.mutter("Walt's truck..."), 1200);
      this.threat = Math.max(this.threat, 0.3);
    }

    // ----- Mill Rd
    if (free && !this.flags.climaxStarted && P.pos.x > 57 && P.pos.z < -6 && P.pos.z > -56) this.climax();

    // stinger on the way home
    if (this.flags.climaxDone && flat(P.pos, H.richie.knockSpot) < 45 && this.first('stinger')) {
      A.play('snap', { pos: P.pos.clone().addScaledVector(P.forward, -7), vol: 0.8 });
      D.whine();
      this.threat = Math.max(this.threat, 0.5);
    }
  }
}
