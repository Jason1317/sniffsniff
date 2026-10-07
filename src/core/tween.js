// Promise-based tweens and timers driven by the game clock (they freeze while paused).
// Every cutscene and transition in the game is an async function built from these.

export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  outSine: (t) => Math.sin((t * Math.PI) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
};

export class Tweens {
  constructor() {
    this.items = [];
  }

  update(dt) {
    const list = this.items;
    let finished = false;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (it.done) continue;
      it.t += dt;
      const k = it.dur > 0 ? Math.min(1, it.t / it.dur) : 1;
      it.step(k, dt);
      if (k >= 1) {
        it.done = true;
        finished = true;
        it.resolve();
      }
    }
    if (finished) this.items = this.items.filter((it) => !it.done);
  }

  // Animate numeric properties of `target`. A newer tween on the same key takes it over.
  to(target, props, dur = 0.5, ease = 'inOutSine') {
    const fn = typeof ease === 'function' ? ease : Ease[ease] || Ease.inOutSine;
    for (const it of this.items) {
      if (it.target === target && it.keys) for (const k in props) delete it.keys[k];
    }
    const keys = {};
    for (const k in props) keys[k] = [target[k], props[k]];
    return new Promise((resolve) => {
      this.items.push({
        target, keys, t: 0, dur, done: false, resolve,
        step(k) {
          const e = fn(k);
          for (const key in this.keys) {
            const a = this.keys[key];
            target[key] = a[0] + (a[1] - a[0]) * e;
          }
        },
      });
    });
  }

  vec(v, to, dur, ease) {
    return this.to(v, { x: to.x, y: to.y, z: to.z }, dur, ease);
  }

  // Call fn(k 0..1, dt) every frame for `dur` seconds.
  during(dur, fn) {
    return new Promise((resolve) => {
      this.items.push({ t: 0, dur, done: false, resolve, step: (k, dt) => fn(k, dt) });
    });
  }

  wait(sec) {
    return this.during(sec, () => {});
  }

  // Resolve when cond() becomes true (checked every frame).
  until(cond, timeout = 9999) {
    return new Promise((resolve) => {
      const it = {
        t: 0, dur: timeout, done: false, resolve,
        step: () => {
          if (cond()) { it.t = it.dur; }
        },
      };
      this.items.push(it);
    });
  }

  clear() {
    for (const it of this.items) { it.done = true; it.resolve(); }
    this.items = [];
  }
}
