import { SR } from './synth.js';

// The car radio: two original instrumentals composed and performed by code at load
// time (drums, plucked-string bass and guitars, organ, a lead line), mixed, given a
// little room, then squeezed through a small car speaker. Seeded, so they never change.

const TAU = Math.PI * 2;
const lpk = (fc) => 1 - Math.exp((-TAU * fc) / SR);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function parseChord(name) {
  let pc = PC[name[0]], i = 1;
  if (name[1] === '#') { pc++; i++; } else if (name[1] === 'b') { pc--; i++; }
  const minor = name.slice(i) === 'm';
  return { pc: (pc + 12) % 12, minor, tones: minor ? [0, 3, 7] : [0, 4, 7] };
}

// Two songs. Chord lists repeat to fill a section.
export const SONGS = {
  // "Saturday Morning": bright jangle-pop in G
  a: {
    seed: 7, bpm: 116, key: 7, minor: false, leadBase: 67,
    sections: [
      { bars: 4, chords: ['G', 'D', 'Em', 'C'], gtr: 'arp', drums: 'hats' },
      { bars: 8, chords: ['G', 'D', 'Em', 'C'], gtr: 'strum', drums: 'verse', bass: 1 },
      { bars: 8, chords: ['C', 'D', 'G', 'Em', 'C', 'D', 'G', 'G'], gtr: 'strum', drums: 'chorus', bass: 2, lead: 1, keys: 1 },
      { bars: 8, chords: ['G', 'D', 'Em', 'C'], gtr: 'arp', drums: 'verse', bass: 1 },
      { bars: 8, chords: ['C', 'D', 'G', 'Em', 'C', 'D', 'G', 'G'], gtr: 'strum', drums: 'chorus', bass: 2, lead: 1, keys: 1 },
    ],
  },
  // "Lake Effect": a slower, rainier one in A minor
  b: {
    seed: 31, bpm: 94, key: 9, minor: true, leadBase: 69,
    sections: [
      { bars: 4, chords: ['Am', 'F', 'C', 'G'], gtr: 'arp', drums: 'none' },
      { bars: 8, chords: ['Am', 'F', 'C', 'G'], gtr: 'arp', drums: 'verse', bass: 1 },
      { bars: 8, chords: ['F', 'G', 'Am', 'Am', 'F', 'G', 'C', 'E'], gtr: 'strum', drums: 'chorus', bass: 2, lead: 1, keys: 1 },
      { bars: 8, chords: ['Am', 'F', 'C', 'G'], gtr: 'arp', drums: 'verse', bass: 1, keys: 1 },
      { bars: 8, chords: ['F', 'G', 'Am', 'Am', 'F', 'G', 'C', 'E'], gtr: 'strum', drums: 'chorus', bass: 2, lead: 1, keys: 1 },
    ],
  },
};

export function songLength(song) {
  const bars = song.sections.reduce((a, s) => a + s.bars, 0);
  return (bars * 4 * 60) / song.bpm;
}

// ---------------------------------------------------------------- instruments

// Karplus-Strong plucked string with a fractional delay, so it stays in tune at 22 kHz.
function pluck(d, t, freq, dur, amp, r, bright = 0.5, decay = 0.996) {
  const s0 = Math.floor(t * SR), n = Math.min(Math.floor(dur * SR), d.length - s0);
  if (n <= 0 || s0 < 0) return;
  const N = SR / freq - 0.5, Ni = Math.ceil(N), L = Ni + 3;
  const buf = new Float32Array(L);
  let lp = 0, mean = 0;
  for (let i = 0; i < Ni; i++) { lp += (r() * 2 - 1 - lp) * bright; buf[i] = lp; mean += lp; }
  mean /= Ni;
  for (let i = 0; i < Ni; i++) buf[i] -= mean;
  const rel = Math.min(n, Math.floor(0.03 * SR)), relStart = n - rel;
  // read taps trail the write head by N samples; the fraction never changes
  let w = Ni % L, ia = (((Ni + Math.floor(-N)) % L) + L) % L; // floor(j - N) at j = Ni
  const frac = -N - Math.floor(-N);
  let ib = ia + 1 === L ? 0 : ia + 1, ic = ia === 0 ? L - 1 : ia - 1;
  const k = decay * 0.5;
  for (let j = 0; j < Math.min(Ni, n); j++) d[s0 + j] += buf[j] * amp * (j > relStart ? (n - j) / rel : 1);
  for (let j = Ni; j < n; j++) {
    const a = buf[ia], b = buf[ib], c = buf[ic];
    const y = k * (a + (b - a) * frac + c + (a - c) * frac);
    buf[w] = y;
    d[s0 + j] += y * (j > relStart ? amp * (n - j) / rel : amp);
    if (++w === L) w = 0;
    if (++ia === L) ia = 0;
    if (++ib === L) ib = 0;
    if (++ic === L) ic = 0;
  }
}

function kick(d, t, amp, r) {
  const s0 = Math.floor(t * SR), n = Math.floor(0.32 * SR);
  let ph = 0;
  for (let j = 0; j < n && s0 + j < d.length; j++) {
    const tt = j / SR;
    ph += (TAU * (46 + 75 * Math.exp(-tt * 32))) / SR;
    d[s0 + j] += (Math.sin(ph) * Math.exp(-tt * 8) + (j < 50 ? (r() * 2 - 1) * 0.25 * (1 - j / 50) : 0)) * amp;
  }
}

function snare(d, t, amp, r) {
  const s0 = Math.floor(t * SR), n = Math.floor(0.25 * SR), k1 = lpk(900), k2 = lpk(6500);
  let l1 = 0, l2 = 0;
  for (let j = 0; j < n && s0 + j < d.length; j++) {
    const tt = j / SR, x = r() * 2 - 1;
    l1 += (x - l1) * k1;
    l2 += (x - l1 - l2) * k2;
    const tone = (Math.sin(TAU * 182 * tt) + 0.5 * Math.sin(TAU * 324 * tt)) * Math.exp(-tt * 28);
    d[s0 + j] += (l2 * Math.exp(-tt * 15) * 1.1 + tone * 0.45) * amp;
  }
}

function hat(d, t, amp, r, open = false) {
  const s0 = Math.floor(t * SR), n = Math.floor((open ? 0.35 : 0.06) * SR), k = lpk(6500);
  let l = 0;
  for (let j = 0; j < n && s0 + j < d.length; j++) {
    const x = r() * 2 - 1;
    l += (x - l) * k;
    d[s0 + j] += (x - l) * Math.exp(-(j / SR) * (open ? 9 : 55)) * amp;
  }
}

function crash(d, t, amp, r) {
  const s0 = Math.floor(t * SR), n = Math.floor(1.8 * SR), k = lpk(4200);
  let l = 0;
  for (let j = 0; j < n && s0 + j < d.length; j++) {
    const x = r() * 2 - 1;
    l += (x - l) * k;
    d[s0 + j] += (x - l) * Math.exp(-(j / SR) * 2.2) * amp;
  }
}

// Each drum is rendered a few times up front; a hit just mixes one of those in.
function makeKit(r) {
  const one = (sec, fn) => { const b = new Float32Array(Math.floor(sec * SR)); fn(b); return b; };
  const many = (k, sec, fn) => Array.from({ length: k }, () => one(sec, fn));
  return {
    kick: many(2, 0.32, (b) => kick(b, 0, 1, r)),
    snare: many(3, 0.25, (b) => snare(b, 0, 1, r)),
    hat: many(4, 0.06, (b) => hat(b, 0, 1, r)),
    open: many(2, 0.35, (b) => hat(b, 0, 1, r, true)),
    crash: many(1, 1.8, (b) => crash(b, 0, 1, r)),
  };
}

function hit(d, t, list, amp, r) {
  const b = list[Math.floor(r() * list.length)], s0 = Math.floor(t * SR);
  if (s0 < 0) return;
  const n = Math.min(b.length, d.length - s0);
  for (let j = 0; j < n; j++) d[s0 + j] += b[j] * amp;
}

// Drawbar-ish organ: a few harmonics, slow swell, a little tremolo.
const ORGAN = (() => {
  const T = new Float32Array(2048);
  for (let i = 0; i < 2048; i++) {
    const p = (TAU * i) / 2048;
    T[i] = Math.sin(p) + 0.45 * Math.sin(2 * p) + 0.25 * Math.sin(3 * p) + 0.1 * Math.sin(4 * p);
  }
  return T;
})();

function organ(d, t, dur, midis, amp) {
  const s0 = Math.floor(t * SR), n = Math.min(Math.floor(dur * SR), d.length - s0);
  const env = new Float32Array(n), att = 0.08 * SR, rel = 0.1 * SR;
  for (let j = 0; j < n; j++) env[j] = amp * Math.min(1, j / att, (n - j) / rel) * (1 + 0.18 * Math.sin((TAU * 5.6 * j) / SR));
  for (const m of midis) {
    const inc = (mtof(m) * 2048) / SR;
    let ph = 0;
    for (let j = 0; j < n; j++) {
      d[s0 + j] += ORGAN[ph | 0] * env[j];
      ph += inc;
      if (ph >= 2048) ph -= 2048;
    }
  }
}

// ---------------------------------------------------------------- composition

const SCALE = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const RHYTHMS = [
  [[0, 1], [1, 0.5], [1.5, 0.5], [2, 1.5], [4, 1], [5, 0.5], [5.5, 0.5], [6, 2]],
  [[0.5, 0.5], [1, 1], [2, 0.5], [2.5, 1.5], [4, 0.5], [4.5, 0.5], [5, 1], [6, 1.5]],
  [[0, 1.5], [1.5, 0.5], [2, 1], [3, 1], [4, 1.5], [5.5, 0.5], [6, 2]],
];

// A two-bar phrase over the given chords, moving mostly by step, landing on chord tones.
function phrase(song, chords, rhythm, r, start, endTonic) {
  const scale = SCALE[song.minor ? 'minor' : 'major'].map((x) => (x + song.key) % 12);
  const lo = song.leadBase - 3, hi = song.leadBase + 12;
  const out = [];
  let prev = start;
  rhythm.forEach(([beat, len], i) => {
    const ch = chords[Math.floor(beat / 4)];
    const strong = beat % 2 === 0;
    const last = i === rhythm.length - 1;
    let best = prev, bs = Infinity;
    for (let m = lo; m <= hi; m++) {
      const pc = m % 12, rel = (pc - ch.pc + 12) % 12;
      const chordTone = ch.tones.includes(rel);
      if (!scale.includes(pc) && !chordTone) continue;
      if ((strong || last) && !chordTone) continue;
      if (last && endTonic && pc !== song.key) continue;
      const leap = Math.abs(m - prev);
      const s = leap + (leap === 0 ? 1.5 : 0) + (leap > 4 ? 3 : 0) + r() * 2.5;
      if (s < bs) { bs = s; best = m; }
    }
    out.push([beat, len, best]);
    prev = best;
  });
  return out;
}

export function renderSong(song) {
  const r = rng(song.seed);
  const spb = 60 / song.bpm, bar = spb * 4, e8 = spb / 2;
  const total = songLength(song);
  const n = Math.floor((total + 2) * SR);
  const drums = new Float32Array(n), mel = new Float32Array(n), lead = new Float32Array(n);
  const hum = () => (r() - 0.5) * 0.012;
  const kit = makeKit(r);

  let b0 = 0;
  for (const sec of song.sections) {
    const chords = [];
    for (let i = 0; i < sec.bars; i++) chords.push(parseChord(sec.chords[i % sec.chords.length]));
    // melody for the section: phrases A B A B', each two bars
    let leadNotes = [];
    if (sec.lead) {
      const rA = RHYTHMS[Math.floor(r() * RHYTHMS.length)], rB = RHYTHMS[Math.floor(r() * RHYTHMS.length)];
      const seedA = Math.floor(r() * 1e6), seedB = Math.floor(r() * 1e6);
      for (let p = 0; p < sec.bars / 2; p++) {
        const isA = p % 2 === 0;
        const pr = phrase(song, chords.slice(p * 2, p * 2 + 2), isA ? rA : rB, rng(isA ? seedA : seedB), song.leadBase + 4, p === sec.bars / 2 - 1);
        for (const [beat, len, m] of pr) leadNotes.push([b0 + p * 2, beat, len, m]);
      }
    }
    for (let i = 0; i < sec.bars; i++) {
      const t0 = (b0 + i) * bar, ch = chords[i], next = chords[(i + 1) % chords.length];
      const lastBar = i === sec.bars - 1;
      // ---- drums
      if (sec.drums !== 'none') {
        if (sec.drums === 'chorus' && i === 0) hit(drums, t0, kit.crash, 0.35, r);
        for (let e = 0; e < 8; e++) {
          const t = t0 + e * e8 + hum();
          if (sec.drums === 'hats') { if (i >= 2) hit(drums, t, kit.hat, e % 2 ? 0.12 : 0.18, r); continue; }
          const chorus = sec.drums === 'chorus';
          hit(drums, t, chorus && e === 7 ? kit.open : kit.hat, (e % 2 ? 0.14 : 0.22) * (chorus ? 1.25 : 1), r);
          if (e === 0 || e === 4 || (chorus && e === 5) || (!chorus && e === 5 && r() < 0.35)) hit(drums, t, kit.kick, 0.9, r);
          if (e === 2 || e === 6) hit(drums, t, kit.snare, 0.55, r);
          if (lastBar && e >= 6) { hit(drums, t + e8 / 2, kit.snare, 0.3, r); if (e === 7) hit(drums, t + e8 * 0.75, kit.snare, 0.38, r); }
        }
      }
      // ---- bass (plucked, root-heavy, walks into the next chord)
      if (sec.bass) {
        const root = 28 + ((ch.pc - 4 + 12) % 12);
        const nroot = 28 + ((next.pc - 4 + 12) % 12);
        const pat = sec.bass === 2 ? [0, 0, 0, 7, 12, 7, 0, null] : [0, 0, 0, 0, 0, 0, 0, null];
        for (let e = 0; e < 8; e++) {
          let m = pat[e] === null ? nroot + (nroot > root ? -2 : 2) : root + pat[e];
          if (pat[e] === null && nroot === root) m = root + 7;
          pluck(mel, t0 + e * e8 + hum(), mtof(m), e8 * 1.05, e % 2 ? 0.55 : 0.75, r, 0.14, 0.998);
        }
      }
      // ---- rhythm guitar: open-ish voicing, strummed or picked
      const base = 52 + ((ch.pc - 4 + 12) % 12);
      const voicing = [0, 7, 12, ch.minor ? 15 : 16, 19].map((x) => base + x);
      if (sec.gtr === 'strum') {
        const strums = [[0, 1], [2, 1], [3, -1], [5, -1], [6, 1], [7, -1]];
        strums.forEach(([e, dir], k) => {
          const t = t0 + e * e8 + hum();
          const nextE = k + 1 < strums.length ? strums[k + 1][0] : 8;
          const dur = (nextE - e) * e8 + 0.05;
          const strings = dir > 0 ? voicing : voicing.slice(2).reverse();
          strings.forEach((m, j) => pluck(mel, t + j * 0.011, mtof(m), dur, dir > 0 ? 0.2 : 0.13, r, dir > 0 ? 0.45 : 0.6, 0.994));
        });
      } else if (sec.gtr === 'arp') {
        const order = [0, 2, 3, 4, 3, 2, 1, 2];
        for (let e = 0; e < 8; e++) {
          const m = voicing[order[e]], t = t0 + e * e8 + hum();
          pluck(mel, t, mtof(m), 0.7, 0.2, r, 0.55, 0.996);
          pluck(mel, t + 0.004, mtof(m + 12) * 1.002, 0.5, 0.06, r, 0.7, 0.994); // 12-string shimmer
        }
      }
      // ---- organ pad
      if (sec.keys) {
        const kb = 57 + ((ch.pc - 9 + 12) % 12);
        organ(mel, t0, bar, ch.tones.map((x) => kb + x), 0.022);
      }
    }
    // ---- lead (doubled, slightly detuned: a clean electric with chorus)
    for (const [barN, beat, len, m] of leadNotes) {
      const t = barN * bar + beat * spb + hum();
      pluck(lead, t, mtof(m), len * spb + 0.15, 0.32, r, 0.7, 0.997);
      pluck(lead, t + 0.006, mtof(m) * 1.003, len * spb + 0.15, 0.16, r, 0.6, 0.997);
    }
    b0 += sec.bars;
  }

  // mix: lead gets a touch of drive, then a small room, then the car speaker
  const mix = new Float32Array(n);
  for (let i = 0; i < n; i++) mix[i] = drums[i] * 0.85 + mel[i] * 0.7 + sat(lead[i] * 1.6) * 0.5;
  room(mix, 0.14);
  speaker(mix, r);
  // fade the very end so a loop doesn't click
  const f = Math.floor(0.05 * SR);
  for (let i = 0; i < f; i++) mix[n - 1 - i] *= i / f;
  return mix;
}

// Small Schroeder reverb: four damped combs into two allpasses.
function room(d, wet) {
  const L = [557, 593, 641, 677], A = [113, 277];
  const c0 = new Float32Array(L[0]), c1 = new Float32Array(L[1]), c2 = new Float32Array(L[2]), c3 = new Float32Array(L[3]);
  const a0 = new Float32Array(A[0]), a1 = new Float32Array(A[1]);
  let i0 = 0, i1 = 0, i2 = 0, i3 = 0, j0 = 0, j1 = 0, p0 = 0, p1 = 0, p2 = 0, p3 = 0;
  const fb = 0.74, dmp = 0.6;
  for (let n = 0; n < d.length; n++) {
    const x = d[n];
    const o0 = c0[i0], o1 = c1[i1], o2 = c2[i2], o3 = c3[i3];
    p0 += (o0 - p0) * dmp; p1 += (o1 - p1) * dmp; p2 += (o2 - p2) * dmp; p3 += (o3 - p3) * dmp;
    c0[i0] = x + p0 * fb; c1[i1] = x + p1 * fb; c2[i2] = x + p2 * fb; c3[i3] = x + p3 * fb;
    if (++i0 === L[0]) i0 = 0;
    if (++i1 === L[1]) i1 = 0;
    if (++i2 === L[2]) i2 = 0;
    if (++i3 === L[3]) i3 = 0;
    let y = (o0 + o1 + o2 + o3) * 0.25;
    let o = a0[j0], v = y + o * 0.5;
    a0[j0] = v; if (++j0 === A[0]) j0 = 0; y = o - v * 0.5;
    o = a1[j1]; v = y + o * 0.5;
    a1[j1] = v; if (++j1 === A[1]) j1 = 0; y = o - v * 0.5;
    d[n] = x + y * wet;
  }
}

// soft clip, close to tanh for the range we use
const sat = (x) => (x > 3 ? 1 : x < -3 ? -1 : (x * (27 + x * x)) / (27 + 9 * x * x));

// A car door speaker: no deep bass, no air, a honk around 1.4 kHz, a little grit and hiss.
function speaker(d, r) {
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const g = peak > 0 ? 0.8 / peak : 1;
  const kh = lpk(140), kl = lpk(5200), norm = 1 / sat(1.4);
  let h1 = 0, h2 = 0, l1 = 0, l2 = 0, nz = 0, flut = 1;
  // resonant band-pass for the honk
  const f0 = 1400, bw = 900, rr = Math.exp((-Math.PI * bw) / SR);
  const a1 = 2 * rr * Math.cos((TAU * f0) / SR), a2 = -rr * rr;
  let y1 = 0, y2 = 0;
  for (let i = 0; i < d.length; i++) {
    let x = d[i] * g;
    h1 += (x - h1) * kh; x -= h1;
    h2 += (x - h2) * kh; x -= h2;
    l1 += (x - l1) * kl; l2 += (l1 - l2) * kl; x = l2;
    const bp = (1 - rr) * x + a1 * y1 + a2 * y2;
    y2 = y1; y1 = bp;
    x = sat((x + bp * 0.6) * 1.4) * norm;
    if ((i & 255) === 0) flut = 1 - 0.04 * (0.5 + 0.5 * Math.sin((TAU * 0.11 * i) / SR));
    nz += (r() * 2 - 1 - nz) * 0.3;
    d[i] = x * flut + nz * 0.006;
  }
}
