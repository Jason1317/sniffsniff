import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Collects lots of small primitives (with baked vertex colors) and merges them into a
// handful of meshes, one per material. The whole static town is a few draw calls.

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const KEEP = new Set(['position', 'normal', 'uv', 'color']);

export class Builder {
  constructor(uvScale = {}) {
    this.uvScale = uvScale;
    this.parts = new Map();
    this.frame = new THREE.Matrix4();
  }

  setFrame(x = 0, z = 0, yaw = 0, y = 0) {
    this.frame.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(0, yaw, 0)), _s.set(1, 1, 1));
    return this;
  }

  clearFrame() {
    this.frame.identity();
    return this;
  }

  add(geo, color, mat = 'flat', x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)).premultiply(this.frame);
    g.applyMatrix4(_m);
    for (const k of Object.keys(g.attributes)) if (!KEEP.has(k)) g.deleteAttribute(k);
    const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    _c.set(color);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const s = this.uvScale[mat];
    if (s) worldUV(g, s);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return g;
  }

  // Box centered at (x, y, z).
  box(w, h, d, x, y, z, color, mat = 'flat', rx = 0, ry = 0, rz = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, mat, x, y, z, rx, ry, rz);
  }

  // Box resting on y0.
  boxB(w, h, d, x, y0, z, color, mat = 'flat', ry = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), color, mat, x, y0 + h / 2, z, 0, ry, 0);
  }

  cyl(rt, rb, h, seg, x, y0, z, color, mat = 'flat', rx = 0, ry = 0, rz = 0) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, mat, x, y0 + h / 2, z, rx, ry, rz);
  }

  blob(r, x, y, z, color, sx = 1, sy = 1, sz = 1, detail = 0) {
    return this.add(new THREE.IcosahedronGeometry(r, detail), color, 'flat', x, y, z, 0, 0, 0, sx, sy, sz);
  }

  build(materials, shadows = true) {
    const group = new THREE.Group();
    for (const [key, list] of this.parts) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, materials[key] || materials.flat);
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}

// Planar UVs in world meters, picked per triangle from its dominant axis.
function worldUV(g, s) {
  const p = g.attributes.position.array, uv = g.attributes.uv.array;
  const tris = p.length / 9;
  for (let t = 0; t < tris; t++) {
    const i = t * 9;
    const ax = p[i + 3] - p[i], ay = p[i + 4] - p[i + 1], az = p[i + 5] - p[i + 2];
    const bx = p[i + 6] - p[i], by = p[i + 7] - p[i + 1], bz = p[i + 8] - p[i + 2];
    const nx = Math.abs(ay * bz - az * by), ny = Math.abs(az * bx - ax * bz), nz = Math.abs(ax * by - ay * bx);
    for (let v = 0; v < 3; v++) {
      const x = p[i + v * 3], y = p[i + v * 3 + 1], z = p[i + v * 3 + 2], o = (t * 3 + v) * 2;
      if (ny >= nx && ny >= nz) { uv[o] = x / s; uv[o + 1] = z / s; }
      else if (nx >= nz) { uv[o] = z / s; uv[o + 1] = y / s; }
      else { uv[o] = x / s; uv[o + 1] = y / s; }
    }
  }
}

// Triangular prism for gable ends. Ridge runs along x; base spans z in [-d/2, d/2]; apex at y=h.
export function gableGeo(w, d, h) {
  const A = [-w / 2, 0, -d / 2], B = [-w / 2, 0, d / 2], C = [-w / 2, h, 0];
  const D = [w / 2, 0, -d / 2], E = [w / 2, 0, d / 2], F = [w / 2, h, 0];
  const tris = [A, B, C, D, F, E, B, E, F, B, F, C, A, C, F, A, F, D, A, D, E, A, E, B];
  const pos = new Float32Array(tris.length * 3);
  tris.forEach((v, i) => pos.set(v, i * 3));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(tris.length * 2), 2));
  g.computeVertexNormals();
  return g;
}

export function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return c;
}
