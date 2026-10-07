import * as THREE from 'three';

// "Look at it and press E." Picks the interactable nearest the center of view.

const _c = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3();

export class Interact {
  constructor(g) {
    this.g = g;
    this.items = [];
    this.current = null;
  }

  add(item) {
    this.items.push(item);
    return item;
  }

  update() {
    const g = this.g;
    let best = null, bestScore = Infinity;
    if (g.player.control && !g.busy && !g.ui.choice && !g.ui.noteResolve) {
      const cam = g.player.camera;
      cam.getWorldPosition(_c);
      cam.getWorldDirection(_d);
      for (const it of this.items) {
        if (it.enabled && !it.enabled()) continue;
        const p = typeof it.pos === 'function' ? it.pos() : it.pos;
        _p.subVectors(p, _c);
        const dist = _p.length();
        if (dist > (it.radius || 2)) continue;
        const ang = Math.acos(Math.min(1, _d.dot(_p.divideScalar(dist || 1))));
        if (ang > (it.aim || 0.45)) continue;
        const score = ang + dist * 0.15;
        if (score < bestScore) { bestScore = score; best = it; }
      }
    }
    this.current = best;
    g.ui.prompt(best ? `[E]  ${best.label}` : null);
  }

  press() {
    const it = this.current;
    if (!it || this.g.busy) return;
    this.current = null;
    this.g.ui.prompt(null);
    it.action();
  }
}
