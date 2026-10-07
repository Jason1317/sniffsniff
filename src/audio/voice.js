// Voice acting through the browser's built-in speech synthesis.
// Each character gets a preferred voice, pitch and rate; subtitles always show.

export const CAST = {
  richie: { name: 'Richie', color: '#efe3b8', want: ['Microsoft Mark', 'Microsoft Guy', 'Microsoft Eric', 'Microsoft David', 'Google US English', 'Alex', 'Daniel'], pitch: 1.2, rate: 1.05 },
  dorothy: { name: 'Mrs. Kessler', color: '#f0bfe0', want: ['Microsoft Zira', 'Microsoft Aria', 'Microsoft Jenny', 'Google US English', 'Samantha', 'Victoria'], pitch: 1.3, rate: 0.9 },
  walt: { name: 'Walt Brenner', color: '#c9dc9c', want: ['Microsoft David', 'Microsoft Guy', 'Microsoft Christopher', 'Google UK English Male', 'Fred', 'Daniel'], pitch: 0.55, rate: 0.86 },
  lindqvist: { name: 'Mr. Lindqvist', color: '#b6dcef', want: ['Google UK English Male', 'Microsoft George', 'Microsoft Ryan', 'Microsoft David', 'Daniel'], pitch: 0.72, rate: 0.72 },
  jogger: { name: 'Jogger', color: '#ffc680', want: ['Microsoft David', 'Microsoft Guy', 'Google US English'], pitch: 1.05, rate: 1.18 },
  dj: { name: 'WLKR 98.1 FM', color: '#a9c8f5', want: ['Google US English', 'Microsoft Zira', 'Microsoft Aria', 'Samantha'], pitch: 1.1, rate: 1.12 },
};

export class Voice {
  constructor(ui) {
    this.ui = ui;
    this.voices = [];
    this.volume = 1;
    this.assigned = {};
    this.current = null;
    this.supported = 'speechSynthesis' in window;
    if (this.supported) {
      const load = () => {
        this.voices = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
        this.assigned = {};
      };
      load();
      speechSynthesis.addEventListener('voiceschanged', load);
    }
  }

  voiceFor(who) {
    if (this.assigned[who] !== undefined) return this.assigned[who];
    const c = CAST[who];
    let v = null;
    for (const w of c.want) {
      v = this.voices.find((x) => x.name.includes(w));
      if (v) break;
    }
    this.assigned[who] = v || this.voices[0] || null;
    return this.assigned[who];
  }

  // Speak a line. Resolves when finished (with a timeout in case the browser never says so).
  speak(who, text, opts = {}) {
    const c = CAST[who];
    if (!opts.noSub) this.ui.subtitle(c.name, c.color, text);
    const est = 0.8 + text.length / (13.5 * c.rate);
    return new Promise((resolve) => {
      let done = false, timer = 0;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (opts.onEnd) opts.onEnd();
        if (!opts.noSub) this.ui.clearSubtitle(text);
        resolve();
      };
      if (opts.onStart) opts.onStart();
      const vol = this.volume * (opts.vol ?? 1);
      if (!this.supported || vol <= 0.001) {
        // no speech: hold the subtitle for a reading time measured in game time
        if (this.tw) this.tw.wait(est).then(finish);
        else timer = setTimeout(finish, est * 1000);
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      const v = this.voiceFor(who);
      if (v) u.voice = v;
      u.pitch = c.pitch;
      u.rate = c.rate;
      u.volume = Math.min(1, vol);
      u.onend = finish;
      u.onerror = finish;
      this.current = u; // keep a reference: Chrome can garbage-collect it and never fire onend
      if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
      speechSynthesis.speak(u);
      timer = setTimeout(finish, (est * 1.8 + 3) * 1000);
    });
  }

  cancel() { if (this.supported) speechSynthesis.cancel(); }
  pause() { if (this.supported) speechSynthesis.pause(); }
  resume() { if (this.supported) speechSynthesis.resume(); }
}
