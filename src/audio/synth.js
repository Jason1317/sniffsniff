// Every sound in the game is synthesized here, sample by sample, at load time.
// No audio files. Each entry: { dur, variants?, channels?, loop?, fn(data, n, channel) }.

export const SR = 22050;
const TAU = Math.PI * 2;
const rand = Math.random;
const noise = () => rand() * 2 - 1;
const lpk = (fc) => 1 - Math.exp((-TAU * fc) / SR);

class LP {
  constructor(fc) { this.k = lpk(fc); this.y = 0; }
  run(x) { this.y += (x - this.y) * this.k; return this.y; }
}

// Two-pole resonator (a ringing band-pass), used for creaks and wood.
class Res {
  constructor(f, bw) {
    const r = Math.exp((-Math.PI * bw) / SR);
    this.a1 = 2 * r * Math.cos((TAU * f) / SR);
    this.a2 = -r * r;
    this.g = 1 - r;
    this.y1 = 0;
    this.y2 = 0;
  }
  run(x) {
    const y = this.g * x + this.a1 * this.y1 + this.a2 * this.y2;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

function normalize(d, peak = 0.9) {
  let m = 0;
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
  if (m > 0) {
    const k = peak / m;
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
}

// Add a tonal sweep (bird syllables, whistles).
function sweep(d, t0, dur, f0, f1, amp, warble = 0, wf = 0) {
  let ph = 0;
  const s0 = Math.floor(t0 * SR), L = Math.floor(dur * SR);
  for (let j = 0; j < L && s0 + j < d.length; j++) {
    const k = j / L;
    const f = f0 + (f1 - f0) * k + warble * Math.sin((TAU * wf * j) / SR);
    ph += (TAU * f) / SR;
    d[s0 + j] += Math.sin(ph) * Math.pow(Math.sin(Math.PI * k), 0.6) * amp;
  }
}

// A small brass tag tapping the collar ring: soft, short, mostly below 4 kHz.
function jingleInto(d, s0, amp) {
  const parts = [1850, 2700, 3500, 4300].map((f) => [f * (0.97 + rand() * 0.06), 0.4 + rand() * 0.6, 30 + rand() * 25]);
  for (let i = s0; i < d.length; i++) {
    const t = (i - s0) / SR;
    if (t > 0.2) break;
    let s = 0;
    for (const [f, a, dk] of parts) s += Math.sin(TAU * f * t) * a * Math.exp(-t * dk);
    d[i] += s * amp * Math.min(1, t * 2000);
  }
}

// Shoe on lawn: a dull, low brush.
function grassStepInto(d, s0, amp) {
  const lp = new LP(1100), lpb = new LP(1100), lp2 = new LP(200);
  const L = Math.floor(0.24 * SR);
  for (let j = 0; j < L && s0 + j < d.length; j++) {
    const t = j / SR;
    const e = Math.min(1, t / 0.025) * Math.exp(-t * 14);
    const a = lpb.run(lp.run(noise() * (rand() < 0.1 ? 1.6 : 0.8)));
    d[s0 + j] += (a - lp2.run(a)) * e * amp;
  }
}

// run a buffer through a gentle low-pass in place (to darken noisy sounds)
function darken(d, fc, passes = 1) {
  for (let p = 0; p < passes; p++) {
    const lp = new LP(fc);
    for (let i = 0; i < d.length; i++) d[i] = lp.run(d[i]);
  }
}

// Momentary loudness: the loudest 50 ms window, as RMS.
export function loudness(d) {
  const W = Math.floor(SR * 0.05);
  let best = 0;
  for (let s = 0; s + W <= d.length; s += Math.floor(W / 2)) {
    let acc = 0;
    for (let i = s; i < s + W; i++) acc += d[i] * d[i];
    best = Math.max(best, Math.sqrt(acc / W));
  }
  return best;
}

// Rough brightness: average zero-crossing frequency of the loud part.
export function brightness(d) {
  let z = 0, n = 0;
  const peak = d.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  for (let i = 1; i < d.length; i++) {
    if (Math.abs(d[i]) < peak * 0.05) continue;
    n++;
    if ((d[i] >= 0) !== (d[i - 1] >= 0)) z++;
  }
  return n ? (z / n) * SR / 2 : 0;
}

// Target loudness per sound (dBFS of the loudest 50 ms). This is the mix.
export const LEVELS = {
  step_concrete: -31, step_grass: -33, step_wood: -30, glass: -32,
  jingle: -40, pant: -42, sniff: -38, yip: -21, bark: -21, growl: -25, whine: -28, lick: -38, shake: -33, scratch: -33, land: -32, pee: -38,
  heart: -27, breath_in: -33, breath_out: -33, cloth: -36, whistle: -26,
  lighter: -29, lighter_fail: -30, inhale: -34, exhale: -34, crinkle: -36, clip: -32, squeak: -38, bulb_on: -31, knock: -19,
  door_open: -26, door_close: -21, deadbolt: -26, chain: -30, car_door_open: -25, car_door_close: -19,
  engine: -27, engine_off: -25, key: -31, static: -38, car_pass: -27,
  clang: -23, thud: -27, zap: -33, tick: -30, pop: -16, snap: -20, run_steps: -22, bell: -25, freewheel: -34, alarm: -23, train: -24,
  wind: -34, sprinkler: -36, mower: -31, cricket_a: -36, cricket_b: -36, cricket_c: -36, cricket_bed: -35,
  robin: -29, cardinal: -29, chickadee: -29, sparrow: -30, dove: -30,
};

// Seamless loop: generate n + X samples, crossfade the tail into the head.
function loopify(gen, n, X) {
  const out = new Float32Array(n);
  for (let j = 0; j < n; j++) out[j] = gen[j];
  for (let j = 0; j < X; j++) {
    const k = j / X;
    out[j] = gen[j] * k + gen[n + j] * (1 - k);
  }
  return out;
}

function cricketLoop(f, interval, pulses) {
  return {
    dur: 2.0, loop: true,
    fn(d, n) {
      const count = Math.max(1, Math.round(2.0 / interval));
      const per = 2.0 / count;
      const L = Math.floor(0.018 * SR);
      for (let c = 0; c < count; c++) {
        for (let p = 0; p < pulses; p++) {
          const s0 = Math.floor((c * per + p * 0.028) * SR);
          const a = 0.8 + rand() * 0.2;
          for (let j = 0; j < L; j++) d[(s0 + j) % n] += Math.sin((TAU * f * j) / SR) * Math.sin((Math.PI * j) / L) * a;
        }
      }
      normalize(d, 0.5);
    },
  };
}

export const SOUNDS = {
  // ---------- footsteps ----------
  // sneaker on a sidewalk: a soft heel thud, then a quieter toe, no clicks
  step_concrete: { dur: 0.2, variants: 6, fn(d, n) {
    const lp = new LP(650 + rand() * 300), lpB = new LP(130);
    const toe = 0.05 + rand() * 0.03;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const atk = Math.min(1, t / 0.004);
      const e = atk * (Math.exp(-t * 55) + (t > toe ? 0.45 * Math.exp(-(t - toe) * 70) : 0));
      const x = noise();
      d[i] = lp.run(x) * e * 0.9 + lpB.run(x) * Math.exp(-t * 35) * atk * 3.0;
    }
    normalize(d, 0.7);
  } },
  step_grass: { dur: 0.26, variants: 6, fn(d) { grassStepInto(d, 0, 1); normalize(d, 0.45); } },
  step_wood: { dur: 0.22, variants: 4, fn(d, n) {
    const f = 105 + rand() * 30, lp = new LP(700);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const atk = Math.min(1, t / 0.003);
      d[i] = (Math.sin(TAU * f * t) * Math.exp(-t * 28) * 0.9 + lp.run(noise()) * Math.exp(-t * 45) * 0.7) * atk;
    }
    normalize(d, 0.7);
  } },
  glass: { dur: 0.6, variants: 3, fn(d, n) {
    for (let h = 0; h < 14; h++) {
      const s0 = Math.floor(rand() * 0.45 * SR), f = 3000 + rand() * 4500, dk = 40 + rand() * 40, a = 0.3 + rand() * 0.4;
      for (let j = 0; s0 + j < n && j < SR * 0.12; j++) d[s0 + j] += Math.sin((TAU * f * j) / SR) * Math.exp((-j / SR) * dk) * a;
    }
    const lp = new LP(2500);
    for (let i = 0; i < n; i++) d[i] += lp.run(noise()) * Math.exp((-i / SR) * 18) * 0.6;
    normalize(d, 0.5);
  } },

  // ---------- Moose ----------
  jingle: { dur: 0.25, variants: 6, fn(d) {
    jingleInto(d, 0, 1);
    if (rand() < 0.5) jingleInto(d, Math.floor((0.04 + rand() * 0.05) * SR), 0.35);
    normalize(d, 0.5);
  } },
  // a short, breathy "hah" with a little voice in it (played in occasional bursts)
  pant: { dur: 0.2, variants: 4, fn(d, n) {
    const lp = new LP(1100), lp2 = new LP(250);
    let ph = 0;
    const f = 260 + rand() * 60;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const e = Math.pow(Math.sin(Math.PI * k), 2);
      ph += (TAU * f) / SR;
      const a = lp.run(noise());
      d[i] = ((a - lp2.run(a)) + Math.sin(ph) * 0.06) * e;
    }
    darken(d, 1400);
    normalize(d, 0.35);
  } },
  // two quick nasal sniffs, low and soft
  sniff: { dur: 0.32, variants: 3, fn(d, n) {
    const lp = new LP(2000), lp2 = new LP(600);
    const starts = [0, 0.13 + rand() * 0.03];
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let e = 0;
      for (const s0 of starts) { const u = t - s0; if (u > 0 && u < 0.07) e = Math.max(e, Math.pow(Math.sin((Math.PI * u) / 0.07), 2)); }
      const a = lp.run(noise());
      d[i] = (a - lp2.run(a)) * e;
    }
    darken(d, 2200);
    normalize(d, 0.4);
  } },
  yip: { dur: 0.22, variants: 5, fn(d, n) {
    const f0 = 950 + rand() * 300, lp = new LP(4000);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR, k = i / n;
      const f = f0 * (1 + 0.15 * Math.sin(Math.PI * Math.min(1, k * 3)) - 0.35 * k);
      ph += (TAU * f) / SR;
      let s = 0;
      for (let h = 1; h <= 7; h++) s += Math.sin(ph * h) * (Math.exp(-Math.pow((f * h - 2200) / 1400, 2)) + 0.4 / h);
      const e = Math.min(1, t / 0.01) * Math.exp(-t * 12);
      d[i] = Math.tanh(lp.run(s * e + noise() * 0.15 * e) * 2);
    }
    normalize(d, 0.8);
  } },
  bark: { dur: 0.34, variants: 4, fn(d, n) {
    const f0 = 380 + rand() * 80;
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR, k = i / n;
      const f = f0 * (1 + 0.25 * Math.sin(Math.PI * Math.min(1, k * 2.5)) - 0.4 * k);
      ph += (TAU * f) / SR;
      let s = 0;
      for (let h = 1; h <= 12; h++) s += Math.sin(ph * h) * (Math.exp(-Math.pow((f * h - 900) / 500, 2)) + 0.5 / h);
      const e = Math.min(1, t / 0.012) * Math.exp(-t * 9);
      d[i] = Math.tanh((s + noise() * 0.6) * e * 1.5);
    }
    normalize(d, 0.8);
  } },
  growl: { dur: 1.8, variants: 2, fn(d, n) {
    const lp = new LP(1400), base = 190 + rand() * 30;
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const f = base + 18 * Math.sin(TAU * 2.3 * t) + (rand() - 0.5) * 25;
      ph += (TAU * f) / SR;
      let s = 0;
      for (let h = 1; h <= 10; h++) s += Math.sin(ph * h) * (1 / h) * (h % 2 ? 1 : 0.7);
      const rough = 0.55 + 0.45 * Math.sin(TAU * 31 * t + Math.sin(TAU * 7 * t) * 2);
      const e = Math.min(1, t / 0.2) * Math.min(1, (1.8 - t) / 0.35);
      d[i] = lp.run((s + noise() * 0.25) * rough * e);
    }
    normalize(d, 0.7);
  } },
  whine: { dur: 1.2, variants: 3, fn(d, n) {
    const b = 900 + rand() * 200;
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR, k = i / n;
      const f = b + 300 * Math.sin(Math.PI * k) * (0.6 + 0.4 * Math.sin(TAU * 1.3 * t)) + 25 * Math.sin(TAU * 7 * t);
      ph += (TAU * f) / SR;
      const e = Math.pow(Math.sin(Math.PI * k), 0.8);
      d[i] = (Math.sin(ph) + 0.25 * Math.sin(2 * ph) + 0.1 * Math.sin(3 * ph)) * e + noise() * 0.04 * e;
    }
    normalize(d, 0.45);
  } },
  lick: { dur: 0.35, variants: 2, fn(d, n) {
    const lp = new LP(2200), lp2 = new LP(400);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const e = Math.max(0, Math.sin(TAU * 9 * t)) * Math.sin((Math.PI * i) / n);
      const a = lp.run(noise());
      d[i] = (a - lp2.run(a)) * e;
    }
    darken(d, 1800);
    normalize(d, 0.3);
  } },
  shake: { dur: 0.9, fn(d, n) {
    const lp = new LP(1500);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      d[i] = lp.run(noise()) * (0.5 + 0.5 * Math.sin(TAU * 13 * t)) * Math.sin((Math.PI * i) / n) * 0.8;
    }
    for (let h = 0; h < 6; h++) jingleInto(d, Math.floor(rand() * 0.7 * SR), 0.25);
    darken(d, 2500);
    normalize(d, 0.5);
  } },
  scratch: { dur: 0.7, fn(d) {
    for (let k = 0; k < 4; k++) grassStepInto(d, Math.floor((k * 0.14 + rand() * 0.03) * SR), 0.6 + rand() * 0.4);
    normalize(d, 0.45);
  } },
  land: { dur: 0.15, fn(d, n) {
    const lp = new LP(500);
    for (let i = 0; i < n; i++) { const t = i / SR; d[i] = lp.run(noise()) * Math.exp(-t * 30) + Math.sin(TAU * 90 * t) * Math.exp(-t * 40) * 0.5; }
    normalize(d, 0.5);
  } },
  pee: { dur: 2.4, fn(d, n) {
    const lp = new LP(3000), lp2 = new LP(800);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const e = Math.min(1, t / 0.2) * Math.min(1, (2.4 - t) / 0.5) * (0.7 + 0.3 * Math.sin(TAU * 5 * t + Math.sin(t * 17)));
      const a = lp.run(noise());
      d[i] = (a - lp2.run(a)) * e;
    }
    normalize(d, 0.25);
  } },

  // ---------- Richie ----------
  heart: { dur: 0.7, fn(d, n) {
    for (const [t0, a] of [[0, 1], [0.26, 0.7]]) {
      const s0 = Math.floor(t0 * SR);
      for (let i = s0; i < n; i++) { const u = (i - s0) / SR; d[i] += Math.sin(TAU * (48 + 20 * Math.exp(-u * 30)) * u) * Math.exp(-u * 18) * a; }
    }
    normalize(d, 0.9);
  } },
  breath_in: { dur: 0.8, variants: 2, fn(d, n) {
    const lp = new LP(3000), lp2 = new LP(900);
    for (let i = 0; i < n; i++) { const a = lp.run(noise()); d[i] = (a - lp2.run(a)) * Math.pow(Math.sin((Math.PI * i) / n), 1.2); }
    darken(d, 1800, 2);
    normalize(d, 0.35);
  } },
  breath_out: { dur: 1.0, variants: 2, fn(d, n) {
    const lp = new LP(1400);
    for (let i = 0; i < n; i++) { const t = i / SR; d[i] = lp.run(noise()) * Math.min(1, t / 0.05) * Math.pow(1 - i / n, 1.5); }
    normalize(d, 0.35);
  } },
  cloth: { dur: 0.45, variants: 3, fn(d, n) {
    const lp = new LP(1800), lp2 = new LP(300);
    for (let i = 0; i < n; i++) { const a = lp.run(noise()); d[i] = (a - lp2.run(a)) * Math.pow(Math.sin((Math.PI * i) / n), 2) * (0.6 + 0.4 * rand()); }
    darken(d, 1600);
    normalize(d, 0.3);
  } },
  whistle: { dur: 0.8, fn(d, n) {
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let f = 1900, e = 0;
      if (t < 0.28) { f = 1850 + 50 * Math.sin(TAU * 6 * t); e = Math.sin((Math.PI * t) / 0.28); }
      else if (t > 0.34) { const u = Math.min(1, (t - 0.34) / 0.42); f = 2100 + 500 * Math.min(1, u * 3); e = Math.sin(Math.PI * u); }
      ph += (TAU * f) / SR;
      d[i] = (Math.sin(ph) + noise() * 0.05) * e;
    }
    normalize(d, 0.4);
  } },
  lighter: { dur: 1.0, fn(d, n) {
    const hp = new LP(2000), lp = new LP(600);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let s = 0;
      if (t < 0.1) { const x = noise() * (rand() < 0.4 ? 1 : 0.2); s += (x - hp.run(x)) * 0.8; }
      const u = t - 0.1;
      if (u > 0 && u < 0.02) s += noise() * Math.exp(-u * 300);
      const v = t - 0.12;
      if (v > 0) s += lp.run(noise()) * Math.min(1, v / 0.05) * Math.exp(-v * 3) * 0.8;
      d[i] = s;
    }
    normalize(d, 0.5);
  } },
  lighter_fail: { dur: 0.25, fn(d, n) {
    const hp = new LP(2000);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let s = 0;
      if (t < 0.1) { const x = noise() * (rand() < 0.4 ? 1 : 0.2); s += (x - hp.run(x)) * 0.8; }
      const u = t - 0.1;
      if (u > 0 && u < 0.02) s += noise() * Math.exp(-u * 300);
      d[i] = s;
    }
    normalize(d, 0.45);
  } },
  inhale: { dur: 1.4, fn(d, n) {
    const lp = new LP(2600), lp2 = new LP(800);
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const e = Math.pow(Math.min(1, k * 1.4), 0.8) * Math.min(1, (1 - k) * 6);
      const a = lp.run(noise());
      let s = (a - lp2.run(a)) * e * 0.6;
      if (rand() < 0.004) s += noise() * 0.5 * e;
      d[i] = s;
    }
    darken(d, 2000);
    normalize(d, 0.4);
  } },
  exhale: { dur: 2.0, fn(d, n) {
    const lp = new LP(1200);
    for (let i = 0; i < n; i++) { const t = i / SR; d[i] = lp.run(noise()) * Math.min(1, t / 0.08) * Math.pow(1 - i / n, 1.4); }
    normalize(d, 0.4);
  } },
  crinkle: { dur: 1.1, variants: 3, fn(d, n) {
    const hp = new LP(1800);
    let burst = 0, amp = 0;
    for (let i = 0; i < n; i++) {
      if (burst <= 0 && rand() < 0.006) { burst = Math.floor(30 + rand() * 160); amp = 0.3 + rand(); }
      let s = 0;
      const x = noise();
      const l = hp.run(x);
      if (burst > 0) { burst--; s = (x - l) * amp; }
      d[i] = s * Math.sin((Math.PI * i) / n);
    }
    normalize(d, 0.45);
  } },
  clip: { dur: 0.25, fn(d, n) {
    for (const [t0, a] of [[0, 1], [0.06, 0.8]]) {
      const s0 = Math.floor(t0 * SR);
      for (let i = s0; i < n; i++) {
        const u = (i - s0) / SR;
        d[i] += (noise() * Math.exp(-u * 600) + Math.sin(TAU * 3400 * u) * Math.exp(-u * 80) * 0.4 + Math.sin(TAU * 5200 * u) * Math.exp(-u * 120) * 0.2) * a;
      }
    }
    normalize(d, 0.5);
  } },
  squeak: { dur: 0.3, variants: 3, fn(d, n) {
    const f0 = 1900 + rand() * 600;
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      ph += (TAU * (f0 + 300 * k)) / SR;
      d[i] = Math.sin(ph) * Math.sin(Math.PI * k) * (rand() < 0.5 ? 1 : 0.3);
    }
    normalize(d, 0.22);
  } },
  bulb_on: { dur: 0.7, fn(d, n) {
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      d[i] = noise() * Math.exp(-t * 400) * 0.8 + Math.sin(TAU * 4100 * t) * Math.exp(-t * 90) * 0.3 + Math.sin(TAU * 120 * t) * Math.exp(-t * 5) * 0.25;
    }
    normalize(d, 0.45);
  } },
  knock: { dur: 0.3, variants: 4, fn(d, n) {
    const lp = new LP(900), f1 = 85 + rand() * 15, f2 = 210 + rand() * 30;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      d[i] = Math.sin(TAU * f1 * t) * Math.exp(-t * 26) * 0.9 + Math.sin(TAU * f2 * t) * Math.exp(-t * 40) * 0.5 + lp.run(noise()) * Math.exp(-t * 90) * 1.2;
    }
    normalize(d, 0.9);
  } },

  // ---------- doors, cars, locks ----------
  door_open: { dur: 1.6, variants: 2, fn(d, n) {
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      if (t < 0.08) d[i] += noise() * Math.exp(-t * 220) * 0.8 + Math.sin(TAU * 2100 * t) * Math.exp(-t * 60) * 0.3;
    }
    const r1 = new Res(620 + rand() * 120, 60), r2 = new Res(1350 + rand() * 200, 90), r3 = new Res(2600, 150);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let imp = 0, env = 0;
      if (t > 0.25 && t < 1.45) {
        const u = (t - 0.25) / 1.2;
        ph += (35 + 40 * Math.sin(Math.PI * u) + 15 * Math.sin(TAU * 3 * t)) / SR;
        if (ph >= 1) { ph -= 1; imp = 1 + rand() * 0.5; }
        env = Math.sin(Math.PI * u);
      }
      d[i] += (r1.run(imp) + r2.run(imp) * 0.6 + r3.run(imp) * 0.25) * env * 4;
    }
    normalize(d, 0.55);
  } },
  door_close: { dur: 0.7, fn(d, n) {
    const lp = new LP(400);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      d[i] = Math.sin(TAU * 68 * t) * Math.exp(-t * 16) + lp.run(noise()) * Math.exp(-t * 20) * 1.4;
      const u = t - 0.07;
      if (u > 0) d[i] += noise() * Math.exp(-u * 250) * 0.5 + Math.sin(TAU * 1900 * u) * Math.exp(-u * 70) * 0.2;
    }
    normalize(d, 0.95);
  } },
  deadbolt: { dur: 0.3, fn(d, n) {
    const lp = new LP(2500);
    for (const [t0, a] of [[0, 0.7], [0.07, 1]]) {
      const s0 = Math.floor(t0 * SR);
      for (let i = s0; i < n; i++) { const u = (i - s0) / SR; d[i] += (lp.run(noise()) * Math.exp(-u * 160) + Math.sin(TAU * 1250 * u) * Math.exp(-u * 70) * 0.4) * a; }
    }
    normalize(d, 0.6);
  } },
  chain: { dur: 0.9, fn(d, n) {
    for (let h = 0; h < 9; h++) {
      const s0 = Math.floor((h * 0.08 + rand() * 0.04) * SR);
      const fs = [3200, 4500, 5900].map((f) => f * (0.9 + rand() * 0.2));
      for (let i = s0; i < n; i++) {
        const u = (i - s0) / SR;
        if (u > 0.15) break;
        d[i] += (Math.sin(TAU * fs[0] * u) * Math.exp(-u * 60) + Math.sin(TAU * fs[1] * u) * Math.exp(-u * 80) + Math.sin(TAU * fs[2] * u) * Math.exp(-u * 100)) * 0.4;
      }
    }
    normalize(d, 0.4);
  } },
  car_door_open: { dur: 0.6, fn(d, n) {
    for (const [t0, a] of [[0, 1], [0.05, 0.7]]) {
      const s0 = Math.floor(t0 * SR);
      for (let i = s0; i < n; i++) {
        const u = (i - s0) / SR;
        d[i] += (noise() * Math.exp(-u * 300) + Math.sin(TAU * 1750 * u) * Math.exp(-u * 45) * 0.5 + Math.sin(TAU * 2930 * u) * Math.exp(-u * 60) * 0.3) * a;
      }
    }
    normalize(d, 0.6);
  } },
  car_door_close: { dur: 0.8, fn(d, n) {
    const lp = new LP(300), lp2 = new LP(2500);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let s = Math.sin(TAU * 52 * t) * Math.exp(-t * 12) * 1.2 + lp.run(noise()) * Math.exp(-t * 14) * 2;
      const u = t - 0.03;
      if (u > 0) s += lp2.run(noise()) * Math.exp(-u * 60) * 0.5 * (0.5 + 0.5 * Math.sin(TAU * 60 * u));
      d[i] = s;
    }
    normalize(d, 0.95);
  } },
  engine: { dur: 1.0, loop: true, fn(d, n) {
    const P = 26, L = Math.floor(SR * 0.05);
    const shape = new Float32Array(L);
    for (let j = 0; j < L; j++) { const t = j / SR; shape[j] = (Math.sin(TAU * 60 * t) * 0.8 + noise() * 0.5) * Math.exp(-t * 60); }
    for (let p = 0; p < P; p++) {
      const s0 = Math.floor((p * n) / P);
      const a = 0.8 + rand() * 0.4;
      for (let j = 0; j < L; j++) d[(s0 + j) % n] += shape[j] * a;
    }
    const lp = new LP(500);
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) d[i] = lp.run(d[i]);
    for (let i = 0; i < n; i++) d[i] += Math.sin((TAU * 26 * i) / n) * 0.05;
    normalize(d, 0.6);
  } },
  engine_off: { dur: 1.6, fn(d, n) {
    let rate = 26, next = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      if (t >= next && t < 1.2) {
        next = t + 1 / rate;
        rate *= 0.93;
        const a = Math.max(0, 1 - t / 1.2);
        for (let j = 0; j < SR * 0.06 && i + j < n; j++) { const u = j / SR; d[i + j] += (Math.sin(TAU * 55 * u) * 0.8 + noise() * 0.4) * Math.exp(-u * 45) * a; }
      }
    }
    const lp = new LP(450);
    for (let i = 0; i < n; i++) d[i] = lp.run(d[i]);
    normalize(d, 0.6);
  } },
  key: { dur: 0.35, fn(d, n) {
    for (const t0 of [0, 0.07, 0.15]) {
      const s0 = Math.floor(t0 * SR);
      for (let i = s0; i < n; i++) { const u = (i - s0) / SR; d[i] += noise() * Math.exp(-u * 500) * 0.6 + Math.sin(TAU * 3100 * u) * Math.exp(-u * 90) * 0.3; }
    }
    normalize(d, 0.4);
  } },
  static: { dur: 2.0, loop: true, fn(d, n) {
    const lp = new LP(3000), hp = new LP(300);
    for (let i = 0; i < n; i++) {
      const x = lp.run(noise());
      let s = x - hp.run(x);
      if (rand() < 0.0008) s += noise() * 3;
      d[i] = s;
    }
    normalize(d, 0.3);
  } },
  car_pass: { dur: 5.0, fn(d, n) {
    const lp = new LP(700);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const e = Math.pow(Math.sin(Math.PI * k), 3);
      ph += (TAU * (95 - 25 * k)) / SR;
      d[i] = (lp.run(noise()) * 1.4 + Math.sin(ph) * 0.3) * e;
    }
    normalize(d, 0.5);
  } },

  // ---------- town ----------
  clang: { dur: 1.2, fn(d, n) {
    const parts = [[380, 6], [910, 9], [1470, 12], [2310, 16], [3300, 22]];
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      let s = 0;
      for (const [f, dk] of parts) s += Math.sin(TAU * f * t) * Math.exp(-t * dk);
      d[i] = s * 0.3 + noise() * Math.exp(-t * 60) * 0.6;
    }
    normalize(d, 0.6);
  } },
  thud: { dur: 0.25, fn(d, n) {
    const lp = new LP(500);
    for (let i = 0; i < n; i++) { const t = i / SR; d[i] = lp.run(noise()) * Math.exp(-t * 30) + Math.sin(TAU * 90 * t) * Math.exp(-t * 30) * 0.6; }
    normalize(d, 0.6);
  } },
  zap: { dur: 0.4, variants: 3, fn(d, n) {
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      d[i] = (rand() < 0.25 ? noise() * 1.5 : noise() * 0.2) * Math.exp(-t * 10) + Math.sign(Math.sin(TAU * 120 * t)) * 0.15 * Math.exp(-t * 6);
    }
    normalize(d, 0.6);
  } },
  // the bad streetlight ticking as it tries to restrike (one-shot, not a hum)
  tick: { dur: 0.25, variants: 3, fn(d, n) {
    const lp = new LP(1800);
    for (const t0 of [0, 0.06 + rand() * 0.05]) {
      const s0 = Math.floor(t0 * SR);
      for (let j = 0; s0 + j < n && j < SR * 0.04; j++) d[s0 + j] += lp.run(noise()) * Math.exp((-j / SR) * 140);
    }
    normalize(d, 0.6);
  } },
  pop: { dur: 0.9, fn(d, n) {
    for (let i = 0; i < n; i++) { const t = i / SR; d[i] = noise() * Math.exp(-t * 35) + Math.sin(TAU * 70 * t) * Math.exp(-t * 20) * 0.6; }
    for (let h = 0; h < 10; h++) {
      const s0 = Math.floor((0.05 + rand() * 0.6) * SR), f = 3500 + rand() * 3500, a = 0.15 + rand() * 0.2;
      for (let j = 0; s0 + j < n && j < SR * 0.1; j++) d[s0 + j] += Math.sin((TAU * f * j) / SR) * Math.exp((-j / SR) * 50) * a;
    }
    normalize(d, 0.95);
  } },
  snap: { dur: 0.5, fn(d, n) {
    const lp = new LP(800);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      d[i] = noise() * Math.exp(-t * 80) + lp.run(noise()) * Math.exp(-t * 12) * 0.6 + (t > 0.04 ? noise() * Math.exp(-(t - 0.04) * 120) * 0.5 : 0);
    }
    normalize(d, 0.9);
  } },
  run_steps: { dur: 2.2, fn(d) {
    for (let k = 0; k < 10; k++) grassStepInto(d, Math.floor((k * 0.19 + rand() * 0.02) * SR), 0.4 + 0.6 * Math.sin((Math.PI * k) / 9));
    normalize(d, 0.8);
  } },
  bell: { dur: 1.4, fn(d, n) {
    for (const t0 of [0, 0.22]) {
      const s0 = Math.floor(t0 * SR);
      for (let i = s0; i < n; i++) {
        const u = (i - s0) / SR;
        d[i] += (Math.sin(TAU * 2350 * u) * Math.exp(-u * 5) + Math.sin(TAU * 3640 * u) * Math.exp(-u * 7) * 0.6 + Math.sin(TAU * 5650 * u) * Math.exp(-u * 12) * 0.3) * Math.min(1, u * 800);
      }
    }
    normalize(d, 0.45);
  } },
  freewheel: { dur: 1.6, fn(d, n) {
    let t = 0;
    while (t < 1.5) {
      const s0 = Math.floor(t * SR), a = 1 - t / 1.6;
      for (let j = 0; j < SR * 0.006 && s0 + j < n; j++) d[s0 + j] += noise() * Math.exp((-j / SR) * 900) * a;
      t += (1 / 28) * (1 + t * 0.6);
    }
    normalize(d, 0.35);
  } },
  alarm: { dur: 2.0, loop: true, fn(d, n) {
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      ph += (TAU * (650 + 900 * ((t * 2) % 1))) / SR;
      d[i] = Math.tanh(Math.sin(ph) * 3) * 0.5;
    }
    normalize(d, 0.5);
  } },
  train: { dur: 6.0, fn(d, n) {
    const notes = [311, 370, 415, 494, 622], ph = notes.map(() => 0), lp = new LP(900);
    let e = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const on = (t > 0.1 && t < 2.3) || (t > 2.8 && t < 5.4);
      e += ((on ? 1 : 0) - e) * 0.0015;
      let s = 0;
      for (let k = 0; k < notes.length; k++) {
        ph[k] += (TAU * notes[k] * (1 + 0.003 * Math.sin(TAU * 0.7 * t + k))) / SR;
        s += (Math.sin(ph[k]) + 0.5 * Math.sin(2 * ph[k]) + 0.33 * Math.sin(3 * ph[k])) * 0.2;
      }
      d[i] = lp.run(s * e);
    }
    normalize(d, 0.6);
  } },

  // ---------- ambience ----------
  wind: { dur: 8, loop: true, channels: 2, fn(d, n) {
    const X = Math.floor(SR * 0.6);
    const gen = new Float32Array(n + X);
    const lp = new LP(450);
    let b = 0;
    const m = 1 + Math.floor(rand() * 2);
    for (let i = 0; i < n + X; i++) {
      b = (b + noise() * 0.02) * 0.995;
      const t = i / SR;
      gen[i] = lp.run(b) * (0.55 + 0.45 * Math.sin((TAU * t * m) / 8 + rand() * 0.001));
    }
    d.set(loopify(gen, n, X));
    normalize(d, 0.5);
  } },
  // oscillating lawn sprinkler: a soft spray that swells as the arc sweeps past
  sprinkler: { dur: 6.0, loop: true, fn(d, n) {
    const lp = new LP(2600), lp2 = new LP(700);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const sweep = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin((TAU * t) / 6), 2);
      const a = lp.run(noise());
      d[i] = (a - lp2.run(a)) * sweep * (0.85 + 0.15 * rand());
    }
    normalize(d, 0.4);
  } },
  mower: { dur: 1.0, loop: true, fn(d, n) {
    const P = 32;
    for (let p = 0; p < P; p++) {
      const s0 = Math.floor((p * n) / P);
      for (let j = 0; j < SR * 0.03; j++) { const u = j / SR; d[(s0 + j) % n] += (Math.sign(Math.sin(TAU * 110 * u)) * 0.5 + noise() * 0.6) * Math.exp(-u * 80); }
    }
    const lp = new LP(1200);
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) d[i] = lp.run(d[i]);
    normalize(d, 0.5);
  } },
  cricket_a: cricketLoop(4300, 0.42, 3),
  cricket_b: cricketLoop(4700, 0.33, 4),
  cricket_c: cricketLoop(3900, 0.55, 3),
  cricket_bed: { dur: 4.0, loop: true, channels: 2, fn(d, n) {
    const L = Math.floor(0.02 * SR);
    for (let v = 0; v < 14; v++) {
      const f = 4000 + rand() * 700, m = 6 + Math.floor(rand() * 5), per = 4.0 / m, off = rand() * per;
      const a = 0.45 + rand() * 0.4, pulses = 3;
      for (let k = 0; k < m; k++) {
        for (let p = 0; p < pulses; p++) {
          const s0 = Math.floor((off + k * per + p * 0.03) * SR) % n;
          for (let j = 0; j < L; j++) d[(s0 + j) % n] += Math.sin((TAU * f * j) / SR) * Math.sin((Math.PI * j) / L) * a;
        }
      }
    }
    normalize(d, 0.4);
  } },

  // ---------- birds (day) ----------
  robin: { dur: 1.8, variants: 3, fn(d) {
    let t = 0;
    const syl = 4 + Math.floor(rand() * 3);
    for (let s = 0; s < syl; s++) {
      const len = 0.12 + rand() * 0.1, lo = 1900 + rand() * 600, hi = lo + 700 + rand() * 800;
      if (rand() < 0.5) sweep(d, t, len, lo, hi, 0.6, 150, 30); else sweep(d, t, len, hi, lo, 0.6, 150, 30);
      t += len + 0.05 + rand() * 0.08;
    }
    normalize(d, 0.4);
  } },
  cardinal: { dur: 1.8, variants: 2, fn(d) {
    let t = 0;
    const c = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < c; i++) { sweep(d, t, 0.18, 4200, 1900, 0.7); t += 0.26; }
    normalize(d, 0.4);
  } },
  chickadee: { dur: 1.0, fn(d) { sweep(d, 0, 0.38, 3950, 3900, 0.6); sweep(d, 0.45, 0.38, 3400, 3350, 0.6); normalize(d, 0.35); } },
  sparrow: { dur: 1.3, variants: 2, fn(d) {
    let t = 0;
    for (let i = 0; i < 5; i++) { sweep(d, t, 0.05, 4800, 3800, 0.6); t += 0.07; }
    for (let i = 0; i < 12; i++) { sweep(d, t, 0.03, 5200 - i * 60, 4600 - i * 60, 0.5); t += 0.045; }
    normalize(d, 0.35);
  } },
  dove: { dur: 3.2, fn(d) {
    sweep(d, 0, 0.35, 480, 560, 0.6);
    sweep(d, 0.45, 0.6, 580, 520, 0.8);
    sweep(d, 1.2, 0.5, 520, 470, 0.6);
    sweep(d, 1.85, 0.5, 500, 460, 0.6);
    sweep(d, 2.5, 0.5, 490, 450, 0.5);
    normalize(d, 0.4);
  } },
};
