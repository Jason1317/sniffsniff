import * as THREE from 'three';
import { damp } from '../core/util.js';

// Sky, sun/moon, fog, and the night lighting rig: a small pool of real point lights is
// handed to whichever lamps are nearest each frame; distant lamps fake it with halos and
// glowing ground decals. Mist banks drift around the player and catch lamp light.

const SKY_VERT = `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SKY_FRAG = `uniform vec3 top, horizon, bottom; varying vec3 vDir;
void main(){ float h = vDir.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(clamp(h,0.0,1.0), 0.55)) : mix(horizon, bottom, clamp(-h*4.0,0.0,1.0)); gl_FragColor = vec4(c,1.0); }`;

const POOL = 6;

export class Atmosphere {
  constructor(g) {
    this.g = g;
    const scene = (this.scene = g.scene);
    this.mode = 'day';
    this.time = 0;

    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 12), this.skyMat);
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5a6a3a, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -36; sc.right = 36; sc.top = 36; sc.bottom = -36; sc.near = 1; sc.far = 220;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun, this.sun.target);
    this.sunDir = new THREE.Vector3(0.55, 0.75, 0.35).normalize();

    this.fog = new THREE.FogExp2(0xc8d6e2, 0.006);
    scene.fog = this.fog;

    const tex = g.tex;
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: 0xfff4d8, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    this.sunSprite.scale.set(90, 90, 1);
    scene.add(this.sunSprite);
    this.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: 0x8a9ab8, fog: false, depthWrite: false, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending }));
    this.moon.scale.set(70, 70, 1);
    scene.add(this.moon);

    // stars
    const sp = [];
    for (let i = 0; i < 700; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.12, Math.random() - 0.5).normalize().multiplyScalar(550);
      sp.push(v.x, v.y, v.z);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xc8d0e0, size: 1.2, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.35 }));
    scene.add(this.stars);

    this.beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: 0xff2a2a, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    this.beacon.scale.set(5, 5, 1);
    scene.add(this.beacon);

    // point-light pool
    this.pool = [];
    for (let i = 0; i < POOL; i++) {
      const L = new THREE.PointLight(0xffb46a, 0, 24, 2);
      scene.add(L);
      this.pool.push(L);
    }

    // mist sprites
    this.mist = [];
    const mistMat = () => new THREE.SpriteMaterial({ map: tex.mist, color: 0x4a5260, transparent: true, opacity: 0, depthWrite: false, fog: true });
    for (let i = 0; i < 46; i++) {
      const s = new THREE.Sprite(mistMat());
      const sz = 7 + Math.random() * 9;
      s.scale.set(sz, sz * 0.45, 1);
      s.userData = { drift: new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4), y: 0.5 + Math.random() * 1.6 };
      s.visible = false;
      scene.add(s);
      this.mist.push(s);
    }
    this.mistAmount = 0;
    this.tvPhase = 0;
  }

  setMode(mode) {
    this.mode = mode;
    const g = this.g, W = g.world, M = W.mats;
    const night = mode === 'night';
    W.setNight(night);
    if (!night) {
      this.skyMat.uniforms.top.value.set(0x6a9ed8);
      this.skyMat.uniforms.horizon.value.set(0xc8d6e2);
      this.skyMat.uniforms.bottom.value.set(0x8a9a7a);
      this.fog.color.set(0xc8d6e2);
      this.fog.density = 0.0055;
      this.hemi.color.set(0xcfe3ff);
      this.hemi.groundColor.set(0x5a6a3a);
      this.hemi.intensity = 1.25;
      this.sun.intensity = 2.6;
      this.sun.color.set(0xfff1d6);
      this.sun.castShadow = true;
      this.sunDir.set(0.55, 0.75, 0.35).normalize();
      this.sunSprite.visible = true;
      this.moon.visible = false;
      this.stars.visible = false;
      this.beacon.visible = false;
      this.mistAmount = 0;
      for (const h of Object.values(W.houses)) for (const w of h.windows) w.mesh.material = M.glassDay;
      for (const l of W.lamps) l.on = false;
    } else {
      this.skyMat.uniforms.top.value.set(0x05070c);
      this.skyMat.uniforms.horizon.value.set(0x10141b);
      this.skyMat.uniforms.bottom.value.set(0x07080a);
      this.fog.color.set(0x10141b);
      this.fog.density = 0.052;
      this.hemi.color.set(0x3a4a6a);
      this.hemi.groundColor.set(0x0a0a0c);
      this.hemi.intensity = 0.22;
      this.sun.intensity = 0.12;
      this.sun.color.set(0x8aa0d0);
      this.sun.castShadow = false;
      this.sunDir.set(-0.4, 0.8, -0.3).normalize();
      this.sunSprite.visible = false;
      this.moon.visible = true;
      this.stars.visible = true;
      this.beacon.visible = true;
      this.mistAmount = 1;
      for (const l of W.lamps) if (l.kind === 'street') l.on = true;
      for (const h of Object.values(W.houses)) for (const w of h.windows) w.mesh.material = M.glassDark;
    }
    for (const s of this.mist) s.visible = night;
  }

  // Light some windows ('lit' or 'tv') for a house at night.
  setWindows(id, state, floor = null, count = 99) {
    const h = this.g.world.houses[id], M = this.g.world.mats;
    let n = 0;
    for (const w of h.windows) {
      if (floor !== null && w.floor !== floor) continue;
      if (n++ >= count) break;
      w.mesh.material = state === 'lit' ? M.glassLit : state === 'tv' ? M.glassTV : M.glassDark;
    }
  }

  setPorch(id, on) {
    const h = this.g.world.houses[id];
    h.porchLight.on = on;
    h.porchLight.source.on = on;
    h.porchLight.source.level = on ? 1 : 0;
    h.porchLight.bulb.material = on ? this.g.world.mats.bulbOn : this.g.world.mats.bulbOff;
  }

  update(dt) {
    this.time += dt;
    const g = this.g, P = g.player.camera.getWorldPosition(new THREE.Vector3());
    this.sky.position.copy(P);
    this.stars.position.copy(P);
    this.sunSprite.position.copy(P).addScaledVector(this.sunDir, 500);
    this.moon.position.copy(P).add(new THREE.Vector3(-250, 260, -300));
    // shadow camera follows the player, snapped to texels to avoid shimmer
    const snap = 72 / 1024;
    const cx = Math.round(P.x / snap) * snap, cz = Math.round(P.z / snap) * snap;
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx, 0, cz).addScaledVector(this.sunDir, 120);

    const W = g.world;
    if (W.spots.beacon) {
      this.beacon.position.copy(W.spots.beacon);
      this.beacon.material.opacity = Math.sin(this.time * 2.2) > 0.2 ? 0.9 : 0.0;
    }

    // TV glow flicker
    this.tvPhase += dt * (6 + Math.random() * 20);
    const tv = W.mats.glassTV.color;
    const k = 0.55 + 0.25 * Math.sin(this.tvPhase) + (Math.random() < 0.05 ? 0.3 : 0);
    tv.setRGB(0.25 * k, 0.35 * k, 0.9 * k);

    // lamp levels: steady, buzzing, or the bad one on Mill Rd that won't make up its mind
    for (const l of W.lamps) {
      l.t += dt;
      let target = l.on ? 1 : 0;
      if (l.override === 'off') target = 0;
      else if (l.override === 'on') target = 1;
      else if (l.on && l.mode === 'flicker') {
        const cyc = l.t % 9;
        target = cyc > 6.8 ? (Math.random() < 0.5 ? 0.05 : 0.9) : cyc > 6.2 ? 0 : 0.85 + Math.random() * 0.15;
      }
      l.level = l.mode === 'flicker' || l.override ? target : damp(l.level, target, 6, dt);
      if (l.kind === 'street') {
        const c = l.mesh.material.color;
        c.setRGB(0.16, 0.16, 0.16).lerp(l.color, l.level);
        l.halo.material.opacity = 0.75 * l.level;
        l.pool.material.opacity = 0.45 * l.level;
      }
    }

    // assign the point-light pool to the nearest lit lamps
    const lit = W.lamps.filter((l) => l.level > 0.02);
    lit.sort((a, b) => a.pos.distanceToSquared(P) - b.pos.distanceToSquared(P));
    for (let i = 0; i < POOL; i++) {
      const L = this.pool[i], l = lit[i];
      if (!l) { L.intensity = 0; continue; }
      L.position.copy(l.pos);
      L.color.copy(l.color);
      L.intensity = l.power * l.level;
      L.distance = l.range;
    }

    // mist: recycle sprites around the player, tint by nearby lamp light
    if (this.mistAmount > 0) {
      for (const s of this.mist) {
        const u = s.userData;
        s.position.addScaledVector(u.drift, dt);
        const dx = s.position.x - P.x, dz = s.position.z - P.z;
        if (dx * dx + dz * dz > 34 * 34) {
          const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 24;
          s.position.set(P.x + Math.cos(a) * r, u.y, P.z + Math.sin(a) * r);
        }
        let glow = 0;
        for (let i = 0; i < 3 && i < lit.length; i++) {
          const d = lit[i].pos.distanceTo(s.position);
          glow += Math.max(0, 1 - d / 12) * lit[i].level;
        }
        s.material.color.setRGB(0.16 + glow * 0.32, 0.18 + glow * 0.24, 0.22 + glow * 0.14);
        const near = Math.min(1, Math.max(0, (Math.sqrt(dx * dx + dz * dz) - 3) / 8));
        s.material.opacity = 0.3 * this.mistAmount * near;
      }
    }
  }
}
