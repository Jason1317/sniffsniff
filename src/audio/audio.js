import * as THREE from 'three';
import { SOUNDS, SR, LEVELS, loudness, brightness } from './synth.js';
import { SONGS, renderSong } from './radio.js';
import { pick } from '../core/util.js';

// Web Audio engine: buses, HRTF positional sound, a fog/mist muffle that dulls distant
// sources, procedural reverb, and the living ambience (birds by day, crickets by night).

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3();

export class AudioEngine {
  constructor(g) {
    this.g = g;
    this.ready = false;
    this.buffers = {};
    this.tracked = new Set();
    this.mode = 'none';
    this.ambient = [];      // handles started by the current mode
    this.emitters = [];     // relocating critter loops (night)
    this.lampLoops = [];
    this.threatSilence = 0; // 0..1, critters hush when something is near
    this.absorb = 0.004;    // distance muffle per meter (higher in mist)
    this.timers = { bird: 2, dog: 20, car: 30, breath: 0, heart: 0, zap: 3 };
    this.breathIn = true;
    this.listenerPos = new THREE.Vector3();
    // Radio songs take a moment to render: start right away, in a worker, so they're
    // done long before anyone clicks Play. (Falls back to rendering in init.)
    this.songs = {};
    this.songsReady = new Promise((resolve) => {
      const left = new Set(Object.keys(SONGS));
      const fallback = () => { for (const k of left) this.songs[k] = renderSong(SONGS[k]); left.clear(); resolve(); };
      try {
        const w = new Worker(new URL('./radioWorker.js', import.meta.url), { type: 'module' });
        w.onmessage = (e) => {
          this.songs[e.data.name] = e.data.data;
          left.delete(e.data.name);
          if (!left.size) { w.terminate(); resolve(); }
        };
        w.onerror = () => { w.terminate(); fallback(); };
      } catch (e) {
        fallback();
      }
    });
  }

  async init() {
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    // take the edge off anything bright before it reaches the ears
    const tame = ctx.createBiquadFilter();
    tame.type = 'highshelf';
    tame.frequency.value = 4500;
    tame.gain.value = -6;
    this.master.connect(tame).connect(comp).connect(ctx.destination);

    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb = ctx.createGain();
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.amb.connect(this.muffle).connect(this.master);

    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(2.4);
    this.verbGain = ctx.createGain();
    this.verbGain.gain.value = 0.18;
    this.verbSend = ctx.createGain();
    this.verbSend.connect(this.verb).connect(this.verbGain).connect(this.master);

    // Synthesize everything. Yield now and then so the "rewinding" text can paint.
    const names = Object.keys(SOUNDS);
    this.report = [];
    for (let i = 0; i < names.length; i++) {
      this.buffers[names[i]] = this._make(names[i], SOUNDS[names[i]]);
      if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0));
    }
    // the songs on the car radio
    await this.songsReady;
    for (const k of Object.keys(SONGS)) this.buffers['radio_' + k] = [this._fromData(this.songs[k], LEVELS.radio)];
    this.ready = true;
  }

  // A rendered mono track as a buffer, set to a target loudness (dB).
  _fromData(d, dB) {
    const b = this.ctx.createBuffer(1, d.length, SR);
    const out = b.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    const g = Math.min(Math.pow(10, dB / 20) / (loudness(d) || 1), 0.95 / (peak || 1));
    for (let i = 0; i < d.length; i++) out[i] = d[i] * g;
    return b;
  }

  // Build every variant, then set it to its target loudness from LEVELS so the mix is
  // decided in one table instead of by however loud each synth happened to come out.
  _make(name, def) {
    const ch = def.channels || 1;
    const n = Math.floor(def.dur * SR);
    const target = Math.pow(10, (LEVELS[name] ?? -28) / 20);
    const out = [];
    for (let v = 0; v < (def.variants || 1); v++) {
      const b = this.ctx.createBuffer(ch, n, SR);
      for (let c = 0; c < ch; c++) def.fn(b.getChannelData(c), n, c);
      const d0 = b.getChannelData(0);
      const L = loudness(d0) || 1;
      let k = target / L;
      let peak = 0;
      for (let c = 0; c < ch; c++) for (const s of b.getChannelData(c)) peak = Math.max(peak, Math.abs(s));
      if (peak * k > 0.95) k = 0.95 / peak;
      for (let c = 0; c < ch; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] *= k; }
      if (v === 0) this.report.push({ name, dB: +(20 * Math.log10(loudness(d0) || 1e-9)).toFixed(1), peak: +(peak * k).toFixed(2), hz: Math.round(brightness(d0)) });
      out.push(b);
    }
    return out;
  }

  _impulse(sec) {
    const sr = this.ctx.sampleRate; // a convolver's buffer must match the context rate
    const n = Math.floor(sec * sr), b = this.ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        lp += (Math.random() * 2 - 1 - lp) * 0.2;
        d[i] = lp * Math.pow(1 - i / n, 3.2) * (i < 400 ? i / 400 : 1);
      }
    }
    return b;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  setVolume(v) { if (this.master) this.master.gain.value = v; }
  setMuffle(freq, time = 0.6) { if (this.ctx) this.muffle.frequency.setTargetAtTime(freq, this.ctx.currentTime, time / 3); }
  setReverb(v) { if (this.ctx) this.verbGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.5); }

  // Play a sound. o: { pos, follow, vol, rate, vary, loop, bus:'amb'|'sfx', verb, ref, rolloff, delay }
  play(name, o = {}) {
    if (!this.ready) return null;
    const list = this.buffers[name];
    if (!list) { console.warn('missing sound', name); return null; }
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = pick(list);
    src.loop = !!o.loop;
    src.playbackRate.value = (o.rate || 1) * (1 + (Math.random() - 0.5) * (o.vary ?? 0.08));
    const gain = ctx.createGain();
    const vol = o.vol ?? 1;
    gain.gain.value = o.fadeIn ? 0 : vol;
    if (o.fadeIn) gain.gain.setTargetAtTime(vol, ctx.currentTime, o.fadeIn / 3);
    src.connect(gain);
    let out = gain, filter = null, panner = null;
    if (o.pos || o.follow) {
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 20000;
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = o.ref ?? 1.5;
      panner.rolloffFactor = o.rolloff ?? 1.1;
      panner.maxDistance = 300;
      gain.connect(filter).connect(panner);
      out = panner;
    }
    out.connect(o.bus === 'amb' ? this.amb : this.sfx);
    const send = o.verb ?? 0.35;
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = send;
      out.connect(s).connect(this.verbSend);
    }
    const h = { src, gain, filter, panner, vol, pos: o.pos ? o.pos.clone() : null, follow: o.follow || null, ended: false, offset: o.offset || null };
    src.onended = () => { h.ended = true; this.tracked.delete(h); };
    if (panner) { this._place(h); this.tracked.add(h); }
    src.start(ctx.currentTime + (o.delay || 0), o.at || 0);
    return h;
  }

  loop(name, o = {}) {
    return this.play(name, { ...o, loop: true, vary: o.vary ?? 0 });
  }

  setVol(h, v, time = 0.4) {
    if (!h || !this.ctx) return;
    h.vol = v;
    h.gain.gain.setTargetAtTime(v, this.ctx.currentTime, Math.max(0.01, time / 3));
  }

  stop(h, fade = 0.3) {
    if (!h || h.ended || !this.ctx) return;
    const t = this.ctx.currentTime;
    h.gain.gain.setTargetAtTime(0, t, Math.max(0.01, fade / 3));
    try { h.src.stop(t + fade + 0.05); } catch (e) { /* already stopped */ }
    h.ended = true;
    this.tracked.delete(h);
  }

  setPos(h, p) {
    if (!h) return;
    if (!h.pos) h.pos = new THREE.Vector3();
    h.pos.copy(p);
    this._place(h);
  }

  _place(h) {
    const p = h.follow ? h.follow.getWorldPosition(_v) : h.pos;
    if (!p) return;
    if (h.offset && h.follow) p.add(h.offset);
    const pn = h.panner;
    if (pn.positionX) { pn.positionX.value = p.x; pn.positionY.value = p.y; pn.positionZ.value = p.z; }
    else pn.setPosition(p.x, p.y, p.z);
    const dist = p.distanceTo(this.listenerPos);
    h.filter.frequency.value = 350 + 19650 * Math.exp(-dist * this.absorb);
  }

  // ---------- one-liners used all over ----------
  step(surface, pos, vol = 1) {
    const name = surface === 'grass' ? 'step_grass' : surface === 'wood' ? 'step_wood' : 'step_concrete';
    this.play(name, { pos, vol: 0.8 * Math.min(1, vol), vary: 0.12, verb: 0.08, ref: 1.2 });
  }

  // ---------- ambience ----------
  setMode(mode) {
    if (!this.ready || mode === this.mode) return;
    for (const h of this.ambient) this.stop(h, 2);
    for (const e of this.emitters) this.stop(e.h, 2);
    for (const l of this.lampLoops) this.stop(l.h, 1);
    this.ambient = [];
    this.emitters = [];
    this.lampLoops = [];
    this.mode = mode;
    const W = this.g.world;
    if (mode === 'day') {
      this.absorb = 0.004;
      this.setReverb(0.14);
      this.ambient.push(this.loop('wind', { bus: 'amb', vol: 1, fadeIn: 3, verb: 0 }));
      this.ambient.push(this.loop('sprinkler', { bus: 'amb', pos: W.spots.sprinkler, vol: 1, ref: 2, rolloff: 1.6, fadeIn: 2 }));
      this.ambient.push(this.loop('mower', { bus: 'amb', pos: W.spots.mower, vol: 1, ref: 8, rolloff: 0.8, fadeIn: 3 }));
    } else if (mode === 'night') {
      // Night is just crickets (near and far) and a little wind. When they stop, it means something.
      this.absorb = 0.03;
      this.setReverb(0.22);
      this.bed = this.loop('cricket_bed', { bus: 'amb', vol: 1, fadeIn: 4, verb: 0 });
      this.ambient.push(this.bed);
      this.ambient.push(this.loop('wind', { bus: 'amb', vol: 0.7, fadeIn: 4, verb: 0 }));
      for (const k of ['cricket_a', 'cricket_b', 'cricket_c', 'cricket_b']) {
        const pos = this._randomAround(8, 20);
        this.emitters.push({ kind: k, pos, base: 0.9, h: this.loop(k, { bus: 'amb', pos, vol: 0.9, rate: 0.92 + Math.random() * 0.16, ref: 3, fadeIn: 3, verb: 0.1 }) });
      }
    } else {
      this.absorb = 0.004;
    }
  }

  _randomAround(min, max) {
    const a = Math.random() * Math.PI * 2, r = min + Math.random() * (max - min);
    return new THREE.Vector3(this.listenerPos.x + Math.cos(a) * r, 0.3, this.listenerPos.z + Math.sin(a) * r);
  }

  update(dt) {
    if (!this.ready) return;
    const g = this.g, cam = g.player.camera;
    cam.getWorldPosition(this.listenerPos);
    cam.getWorldDirection(_f);
    _u.set(0, 1, 0).applyQuaternion(cam.getWorldQuaternion(new THREE.Quaternion()));
    const L = this.ctx.listener, p = this.listenerPos;
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = _f.x; L.forwardY.value = _f.y; L.forwardZ.value = _f.z;
      L.upX.value = _u.x; L.upY.value = _u.y; L.upZ.value = _u.z;
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(_f.x, _f.y, _f.z, _u.x, _u.y, _u.z);
    }
    for (const h of this.tracked) this._place(h);

    const T = this.timers;
    for (const k in T) T[k] -= dt;

    if (this.mode === 'day') {
      if (T.bird <= 0) {
        T.bird = 0.8 + Math.random() * 3.2;
        const pos = this._randomAround(10, 34);
        pos.y = 4 + Math.random() * 5;
        this.play(pick(['robin', 'robin', 'cardinal', 'chickadee', 'sparrow', 'sparrow', 'dove']), { bus: 'amb', pos, vol: 1, ref: 5, vary: 0.1 });
      }
      if (T.dog <= 0) {
        T.dog = 35 + Math.random() * 40;
        const pos = this._randomAround(60, 90);
        const n = 2 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) this.play('bark', { bus: 'amb', pos, vol: 1, delay: i * (0.35 + Math.random() * 0.25), ref: 10 });
      }
      if (T.car <= 0) {
        T.car = 40 + Math.random() * 50;
        this.play('car_pass', { bus: 'amb', pos: new THREE.Vector3(70, 0.5, p.z + (Math.random() - 0.5) * 120), vol: 1, ref: 12 });
      }
    } else if (this.mode === 'night') {
      const hush = 1 - this.threatSilence;
      if (this.bed) this.setVol(this.bed, hush, 1.0);
      for (const e of this.emitters) {
        const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
        if (d > 26 || d < 4) {
          e.pos.copy(this._randomAround(8, 20));
          this.setPos(e.h, e.pos);
        }
        this.setVol(e.h, e.base * hush, 0.8);
      }
      const zapper = g.world.spots.zapper;
      if (zapper && zapper.active && T.zap <= 0) {
        T.zap = 4 + Math.random() * 9;
        this.play('zap', { pos: zapper.pos, bus: 'amb', vol: 1, ref: 2, rolloff: 1.5 });
      }
    }

    // Richie's nerves: breathing and heartbeat only when it's actually bad.
    const nv = g.player.nerves;
    if (nv > 0.5 && T.breath <= 0) {
      const period = 2.0 - nv * 0.9;
      T.breath = period * (this.breathIn ? 0.45 : 0.55);
      this.play(this.breathIn ? 'breath_in' : 'breath_out', { vol: Math.min(1, (nv - 0.45) * 2), verb: 0.03, rate: 1 + nv * 0.1 });
      this.breathIn = !this.breathIn;
    }
    if (nv > 0.7 && T.heart <= 0) {
      T.heart = 1.1 - nv * 0.45;
      this.play('heart', { vol: Math.min(1, (nv - 0.65) * 3), verb: 0, vary: 0.02 });
    }
  }
}
