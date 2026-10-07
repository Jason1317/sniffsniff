import * as THREE from 'three';
import { rng } from '../core/util.js';

// All textures are tiny canvases painted at startup (chunky, nearest-filtered).

const R = rng(1995);

export function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  draw(x, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat !== false) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = opts.smooth ? THREE.LinearFilter : THREE.NearestFilter;
  t.userData.canvas = c;
  return t;
}

function speckle(x, w, h, base, palette, count, size = 1) {
  x.fillStyle = base;
  x.fillRect(0, 0, w, h);
  for (let i = 0; i < count; i++) {
    x.fillStyle = palette[Math.floor(R() * palette.length)];
    x.fillRect(Math.floor(R() * w), Math.floor(R() * h), size + (R() < 0.3 ? 1 : 0), size + (R() < 0.3 ? 1 : 0));
  }
}

function softBlob(size, fn) {
  return canvasTex(size, size, (x, w, h) => {
    const img = x.createImageData(w, h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const [r, g, b, a] = fn(i / (w - 1) * 2 - 1, j / (h - 1) * 2 - 1);
      const o = (j * w + i) * 4;
      img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = a;
    }
    x.putImageData(img, 0, 0);
  }, { repeat: false, smooth: true });
}

// Value noise for the mist sprites.
function vnoise(seed) {
  const r = rng(seed), G = 8, grid = [];
  for (let i = 0; i < (G + 1) * (G + 1); i++) grid.push(r());
  return (u, v) => {
    const x = (u * 0.5 + 0.5) * G, y = (v * 0.5 + 0.5) * G;
    const xi = Math.min(G - 1, Math.floor(x)), yi = Math.min(G - 1, Math.floor(y));
    const fx = x - xi, fy = y - yi, s = (t) => t * t * (3 - 2 * t);
    const a = grid[yi * (G + 1) + xi], b = grid[yi * (G + 1) + xi + 1], c = grid[(yi + 1) * (G + 1) + xi], d = grid[(yi + 1) * (G + 1) + xi + 1];
    return (a + (b - a) * s(fx)) * (1 - s(fy)) + (c + (d - c) * s(fx)) * s(fy);
  };
}

export function makeTextures() {
  const T = {};
  T.grass = canvasTex(64, 64, (x, w, h) => speckle(x, w, h, '#6d8d3e', ['#5d7d33', '#7e9f49', '#86a852', '#56762f', '#8da95a', '#9aa456'], 1400));
  T.asphalt = canvasTex(64, 64, (x, w, h) => {
    speckle(x, w, h, '#47474a', ['#3e3e41', '#525256', '#5c5c60', '#38383b', '#66666a'], 1700);
    x.strokeStyle = '#2e2e30';
    x.beginPath(); x.moveTo(5, 40); x.lineTo(20, 36); x.lineTo(31, 44); x.stroke();
  });
  T.concrete = canvasTex(32, 32, (x, w, h) => {
    speckle(x, w, h, '#b9b5ad', ['#aeaaa2', '#c4c0b8', '#a5a199', '#cbc7bf'], 260);
    x.fillStyle = '#8b877f';
    x.fillRect(0, 0, w, 1);
    x.fillRect(0, 0, 1, h);
  });
  T.siding = canvasTex(16, 32, (x, w, h) => {
    x.fillStyle = '#f2f2f2'; x.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 8) { x.fillStyle = '#c7c7c7'; x.fillRect(0, y + 7, w, 1); x.fillStyle = '#ffffff'; x.fillRect(0, y, w, 1); }
  });
  T.shingle = canvasTex(32, 32, (x, w, h) => {
    x.fillStyle = '#7d7d7d'; x.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++) for (let col = -1; col < 5; col++) {
      const v = 100 + Math.floor(R() * 40);
      x.fillStyle = `rgb(${v},${v},${v})`;
      x.fillRect(col * 8 + (row % 2) * 4, row * 8, 7, 7);
    }
  });
  T.wood = canvasTex(32, 32, (x, w, h) => {
    speckle(x, w, h, '#a8a8a8', ['#9a9a9a', '#b5b5b5'], 120);
    x.fillStyle = '#6f6f6f';
    for (let i = 0; i < w; i += 8) x.fillRect(i, 0, 1, h);
  });
  T.brick = canvasTex(32, 32, (x, w, h) => {
    x.fillStyle = '#cfc6b8'; x.fillRect(0, 0, w, h);
    for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
      const v = R();
      x.fillStyle = `rgb(${140 + v * 30},${60 + v * 20},${48 + v * 15})`;
      x.fillRect(col * 8 + (row % 2) * 4, row * 4, 7, 3);
    }
  });
  T.dirt = canvasTex(32, 32, (x, w, h) => speckle(x, w, h, '#5b4330', ['#4a3424', '#6d523b', '#3f2c1e'], 300));
  T.garage = canvasTex(32, 32, (x, w, h) => {
    x.fillStyle = '#e8e6e0'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#b8b6b0';
    for (let y = 7; y < h; y += 8) x.fillRect(0, y, w, 1);
  });
  T.wallpaper = canvasTex(32, 32, (x, w, h) => {
    x.fillStyle = '#d9cfae'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#c4b893';
    for (let i = 0; i < w; i += 8) x.fillRect(i, 0, 2, h);
    x.fillStyle = '#9b5a52';
    for (let j = 4; j < h; j += 16) for (let i = 3; i < w; i += 16) { x.fillRect(i, j, 3, 3); x.fillRect(i + 8, j + 8, 3, 3); }
  });
  T.flannel = canvasTex(32, 32, (x, w, h) => {
    x.fillStyle = '#7d2b2b'; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(20,30,25,0.65)';
    x.fillRect(0, 10, w, 6); x.fillRect(10, 0, 6, h);
    x.fillStyle = 'rgba(230,200,120,0.35)';
    x.fillRect(0, 26, w, 1); x.fillRect(26, 0, 1, h);
  });
  T.velour = canvasTex(16, 16, (x, w, h) => speckle(x, w, h, '#8a6e52', ['#7c624a', '#967a5c', '#6f573f'], 120));
  T.chainlink = canvasTex(16, 16, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.strokeStyle = '#9aa0a4';
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(0, 8); x.lineTo(8, 0); x.lineTo(16, 8); x.lineTo(8, 16); x.closePath();
    x.stroke();
  });
  T.plate = canvasTex(64, 32, (x, w, h) => {
    x.fillStyle = '#f2f0e6'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#1b3a6b'; x.font = 'bold 7px Arial'; x.textAlign = 'center';
    x.fillText('WISCONSIN', w / 2, 8);
    x.font = 'bold 13px Arial'; x.fillText('RCH 412', w / 2, 22);
    x.font = '5px Arial'; x.fillText("AMERICA'S DAIRYLAND", w / 2, 29);
  }, { repeat: false });
  T.calendar = canvasTex(32, 40, (x, w, h) => {
    x.fillStyle = '#f4f1e8'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#3a6a3a'; x.fillRect(0, 0, w, 16);
    x.fillStyle = '#fff'; x.font = 'bold 7px Arial'; x.textAlign = 'center'; x.fillText('JUNE 1995', w / 2, 11);
    x.fillStyle = '#555';
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) x.fillRect(2 + c * 5, 19 + r * 5, 3, 3);
    x.fillStyle = '#c33'; x.fillRect(27, 29, 3, 3);
  }, { repeat: false });
  T.glow = softBlob(64, (u, v) => {
    const d = Math.sqrt(u * u + v * v);
    const a = Math.max(0, 1 - d);
    return [255, 255, 255, Math.round(Math.pow(a, 2.2) * 255)];
  });
  const vn = vnoise(77), vn2 = vnoise(78);
  T.mist = softBlob(64, (u, v) => {
    const d2 = u * u + v * v;
    const n = 0.5 * vn(u * 0.8, v * 0.8) + 0.5 * vn2(u * 1.3, v * 1.3);
    const a = Math.exp(-d2 * 3.2) * (0.55 + 0.45 * n) * Math.max(0, 1 - d2);
    return [255, 255, 255, Math.round(a * 235)];
  });
  T.smoke = softBlob(32, (u, v) => {
    const d = Math.sqrt(u * u + v * v);
    return [230, 230, 230, Math.round(Math.pow(Math.max(0, 1 - d), 1.5) * 200 * (0.6 + 0.4 * vn(u, v)))];
  });
  T.waterTower = canvasTex(256, 32, (x, w, h) => {
    x.fillStyle = '#c9d4d8'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#20406a'; x.font = 'bold 26px Arial'; x.textAlign = 'center';
    x.fillText('WILLET', 64, 26); x.fillText('WILLET', 192, 26);
  });
  T.truck = canvasTex(128, 48, (x, w, h) => {
    x.fillStyle = '#efe9dc'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#d0601e'; x.fillRect(0, 0, w, 14); x.fillRect(0, h - 8, w, 8);
    x.fillStyle = '#d0601e'; x.font = 'bold 18px Arial'; x.textAlign = 'center'; x.fillText('MOVE-IT', w / 2, 34);
    x.fillStyle = '#444'; x.font = '7px Arial'; x.fillText('ONE-WAY · LOCAL · $19.95', w / 2, 43);
  }, { repeat: false });
  T.sold = canvasTex(64, 48, (x, w, h) => {
    x.fillStyle = '#f2f0ea'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#b8261e'; x.fillRect(0, 0, w, 14);
    x.fillStyle = '#fff'; x.font = 'bold 11px Arial'; x.textAlign = 'center'; x.fillText('SOLD', w / 2, 11);
    x.fillStyle = '#222'; x.font = 'bold 9px Arial'; x.fillText('LUND REALTY', w / 2, 28);
    x.font = '8px Arial'; x.fillText('555-0118', w / 2, 40);
  }, { repeat: false });
  T.stop = canvasTex(64, 64, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = '#b3161b';
    x.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      x.lineTo(w / 2 + Math.cos(a) * 31, h / 2 + Math.sin(a) * 31);
    }
    x.closePath(); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 2; x.stroke();
    x.fillStyle = '#fff'; x.font = 'bold 17px Arial'; x.textAlign = 'center'; x.fillText('STOP', w / 2, h / 2 + 6);
  }, { repeat: false });
  T.cigpack = canvasTex(16, 16, (x, w, h) => {
    x.fillStyle = '#f2f0ea'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#b8261e'; x.fillRect(0, 0, w, 7);
    x.beginPath(); x.moveTo(0, 7); x.lineTo(8, 11); x.lineTo(16, 7); x.fill();
  }, { repeat: false });
  T.breadbag = canvasTex(16, 16, (x, w, h) => {
    x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#d62b2b'; x.fillRect(2, 3, 4, 4);
    x.fillStyle = '#2b6ad6'; x.fillRect(8, 6, 5, 4);
    x.fillStyle = '#e8c220'; x.fillRect(4, 10, 4, 4);
  }, { repeat: false });
  return T;
}

export function streetSignTex(text) {
  return canvasTex(96, 20, (x, w, h) => {
    x.fillStyle = '#1f5a34'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#e8efe8'; x.strokeRect(1, 1, w - 2, h - 2);
    x.fillStyle = '#f2f6f2'; x.font = 'bold 13px Arial'; x.textAlign = 'center'; x.fillText(text, w / 2, 15);
  }, { repeat: false });
}

// Lost-pet poster. Draws a crude photocopied dog or cat.
export function posterTex(p) {
  return canvasTex(64, 84, (x, w, h) => {
    x.fillStyle = p.paper || '#efece2'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#111'; x.textAlign = 'center';
    x.font = 'bold 11px Arial'; x.fillText(p.title, w / 2, 12);
    x.fillStyle = '#8a8a8a'; x.fillRect(10, 16, 44, 30);
    x.fillStyle = '#2a2a2a';
    if (p.cat) {
      x.fillRect(24, 26, 16, 14); x.fillRect(25, 22, 3, 5); x.fillRect(36, 22, 3, 5);
    } else {
      x.fillRect(20, 30, 22, 10); x.fillRect(38, 24, 10, 10); x.fillRect(46, 28, 4, 4);
      x.fillRect(21, 40, 3, 5); x.fillRect(37, 40, 3, 5); x.fillRect(17, 28, 4, 3);
    }
    x.fillStyle = '#111'; x.font = 'bold 9px Arial'; x.fillText(p.name, w / 2, 56);
    x.font = '6px Arial';
    (p.short || []).forEach((l, i) => x.fillText(l, w / 2, 65 + i * 7));
    x.font = 'bold 7px Arial'; x.fillText(p.phone, w / 2, 81);
  }, { repeat: false });
}

// Faces are 32x32 pixel paintings on the front of a box head.
export function faceTex(f) {
  return canvasTex(32, 32, (x) => {
    x.fillStyle = f.skin; x.fillRect(0, 0, 32, 32);
    const shade = f.shade || 'rgba(0,0,0,0.12)';
    x.fillStyle = shade; x.fillRect(15, 15, 2, 5); // nose
    x.fillRect(0, 28, 32, 4); // jaw shadow
    if (f.blush) { x.fillStyle = 'rgba(220,90,110,0.35)'; x.fillRect(5, 18, 4, 3); x.fillRect(23, 18, 4, 3); }
    if (f.wrinkles) { x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(8, 6, 16, 1); x.fillRect(5, 15, 2, 1); x.fillRect(25, 15, 2, 1); x.fillRect(10, 22, 1, 3); x.fillRect(21, 22, 1, 3); }
    const ey = 13;
    if (f.wide) {
      x.fillStyle = '#f4f4f0'; x.fillRect(7, ey - 2, 6, 5); x.fillRect(19, ey - 2, 6, 5);
      x.fillStyle = f.eye || '#3a5a7a'; x.fillRect(9, ey - 1, 2, 3); x.fillRect(21, ey - 1, 2, 3);
      x.fillStyle = '#000'; x.fillRect(9, ey, 1, 1); x.fillRect(21, ey, 1, 1);
    } else {
      x.fillStyle = '#f0ede6'; x.fillRect(8, ey, 4, 2); x.fillRect(20, ey, 4, 2);
      x.fillStyle = f.eye || '#2a2420'; x.fillRect(9, ey, 2, 2); x.fillRect(21, ey, 2, 2);
    }
    if (f.brow) { x.fillStyle = f.brow; x.fillRect(7, ey - 3, 6, 1); x.fillRect(19, ey - 3, 6, 1); }
    if (f.mustache) { x.fillStyle = f.mustache; x.fillRect(10, 21, 12, 2); x.fillRect(9, 22, 2, 2); x.fillRect(21, 22, 2, 2); }
    if (f.glasses) {
      x.strokeStyle = f.glasses; x.lineWidth = 1;
      x.strokeRect(6.5, ey - 3.5, 7, 6); x.strokeRect(18.5, ey - 3.5, 7, 6);
      x.fillStyle = f.glasses; x.fillRect(14, ey - 1, 4, 1);
    }
    if (f.stubble) { x.fillStyle = 'rgba(60,40,30,0.18)'; x.fillRect(6, 22, 20, 7); }
  }, { repeat: false });
}
