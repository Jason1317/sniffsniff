// HTML overlay: prompts, subtitles, choices, objective, VHS timestamp, black cards, notes.

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.el = {
      prompt: $('prompt'), subtitle: $('subtitle'), subName: $('sub-name'), subText: $('sub-text'),
      choices: $('choices'), objective: $('objective'),
      vhs: $('vhs'), vhsTime: $('vhs-time'), card: $('card'), cardText: $('card-text'),
      note: $('note'), noteBody: $('note-body'), dot: $('dot'),
    };
    this.choice = null; // { resolve, sel, count }
    this.noteResolve = null;
    this.subText = '';
    this.objTimer = 0;
  }

  prompt(text) {
    if (text === this._prompt) return;
    this._prompt = text;
    this.el.prompt.textContent = text || '';
    this.el.prompt.classList.toggle('hidden', !text);
  }

  subtitle(name, color, text) {
    this.subText = text;
    this.el.subName.textContent = name;
    this.el.subName.style.color = color;
    this.el.subText.textContent = text;
    this.el.subtitle.classList.remove('hidden');
  }

  clearSubtitle(text) {
    if (text && text !== this.subText) return;
    this.subText = '';
    this.el.subtitle.classList.add('hidden');
  }

  // Task list: [{ id, text, done, optional, progress (0..1 or undefined), progressLabel }]
  tasks(list, hint = '') {
    const o = this.el.objective;
    if (!list || !list.length) { o.classList.add('hidden'); this._taskSig = ''; return; }
    o.classList.remove('hidden');
    const sig = list.map((t) => `${t.id}|${t.text}|${t.done}|${t.progress !== undefined}`).join(';') + hint;
    if (sig !== this._taskSig) {
      const fresh = this._taskSig !== undefined;
      this._taskSig = sig;
      const box = $('tasks');
      box.innerHTML = '';
      this.bars = {};
      for (const t of list) {
        const row = document.createElement('div');
        row.className = 'task' + (t.done ? ' done' : '') + (t.optional ? ' optional' : '');
        row.innerHTML = `<span class="box"></span><span>${t.text}</span>`;
        box.appendChild(row);
        if (t.progress !== undefined && !t.done) {
          const bar = document.createElement('div');
          bar.className = 'bar';
          bar.innerHTML = '<div></div>';
          box.appendChild(bar);
          const lab = document.createElement('div');
          lab.className = 'bar-label';
          box.appendChild(lab);
          this.bars[t.id] = { fill: bar.firstChild, lab };
        }
      }
      $('hint').textContent = hint;
      o.classList.remove('dim');
      clearTimeout(this.objTimer);
      this.objTimer = setTimeout(() => o.classList.add('dim'), fresh ? 9000 : 12000);
    }
    for (const t of list) {
      const b = this.bars && this.bars[t.id];
      if (!b) continue;
      b.fill.style.width = `${Math.round(t.progress * 100)}%`;
      b.lab.textContent = t.progressLabel || '';
    }
  }

  // Direction pointer at the top of the screen. angle: radians, 0 = straight ahead, + = right.
  pointer(angle, label) {
    const p = $('pointer');
    if (angle === null) { p.classList.add('hidden'); return; }
    p.classList.remove('hidden');
    $('pointer-arrow').style.transform = `rotate(${angle}rad)`;
    $('pointer-label').textContent = label;
  }

  vhs(text) {
    this.el.vhs.classList.toggle('hidden', !text);
    if (text) this.el.vhsTime.innerHTML = text;
  }

  // Black card with text. Resolves after it fades in, holds, (optionally) fades out.
  async card(html, hold = 2.5, fadeOut = true) {
    this.el.cardText.innerHTML = html;
    this.el.card.classList.add('show');
    await sleep(1400 + hold * 1000);
    if (fadeOut) {
      this.el.card.classList.remove('show');
      await sleep(1200);
    }
  }

  hideCard() { this.el.card.classList.remove('show'); }

  choose(options) {
    return new Promise((resolve) => {
      const box = this.el.choices;
      box.innerHTML = '';
      options.forEach((txt, i) => {
        const d = document.createElement('div');
        d.className = 'choice' + (i === 0 ? ' sel' : '');
        d.innerHTML = `<span class="num">${i + 1}.</span>${txt}`;
        d.onclick = () => this._pick(i);
        d.onmouseenter = () => this._select(i);
        box.appendChild(d);
      });
      box.classList.remove('hidden');
      this.choice = { resolve, sel: 0, count: options.length, acc: 0 };
    });
  }

  _select(i) {
    if (!this.choice) return;
    this.choice.sel = (i + this.choice.count) % this.choice.count;
    [...this.el.choices.children].forEach((c, j) => c.classList.toggle('sel', j === this.choice.sel));
  }

  _pick(i) {
    if (!this.choice) return;
    const r = this.choice.resolve;
    this.choice = null;
    this.el.choices.classList.add('hidden');
    r(i);
  }

  note(html) {
    this.el.noteBody.innerHTML = html;
    this.el.note.classList.remove('hidden');
    return new Promise((r) => (this.noteResolve = r));
  }

  // Returns true if the UI swallowed the key.
  key(code) {
    if (this.choice) {
      if (/^Digit[1-9]$/.test(code)) {
        const i = +code.slice(5) - 1;
        if (i < this.choice.count) this._pick(i);
      } else if (code === 'KeyW' || code === 'ArrowUp') this._select(this.choice.sel - 1);
      else if (code === 'KeyS' || code === 'ArrowDown') this._select(this.choice.sel + 1);
      else if (code === 'KeyE' || code === 'Enter' || code === 'Space') this._pick(this.choice.sel);
      return true;
    }
    if (this.noteResolve) {
      if (code === 'KeyE' || code === 'Enter' || code === 'Space' || code === 'Escape') {
        this.el.note.classList.add('hidden');
        const r = this.noteResolve;
        this.noteResolve = null;
        r();
      }
      return true;
    }
    return false;
  }

  click() {
    if (this.choice) { this._pick(this.choice.sel); return true; }
    if (this.noteResolve) return this.key('KeyE');
    return false;
  }

  // Mouse movement scrolls through choices while the pointer is locked.
  mouse(dy) {
    if (!this.choice) return false;
    this.choice.acc += dy;
    if (Math.abs(this.choice.acc) > 60) {
      this._select(this.choice.sel + Math.sign(this.choice.acc));
      this.choice.acc = 0;
    }
    return true;
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
