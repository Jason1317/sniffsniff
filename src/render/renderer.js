import * as THREE from 'three';

// Renders the scene at a low internal resolution into a float target, then a post pass
// adds the look: sRGB conversion, chromatic fringe, vignette, grain, ordered dithering and
// color quantization (late-90s console / VHS feel). Fades and "nerves" also live here.

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uTime, uFade, uNerves, uLevels, uFlash;
varying vec2 vUv;
const float B[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
vec3 toSRGB(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = vUv;
  float w = uNerves * 0.0018;
  uv += vec2(sin(uv.y * 17.0 + uTime * 2.3), cos(uv.x * 13.0 + uTime * 1.9)) * w;
  float ca = 0.0007 + uNerves * 0.0032;
  vec3 col = vec3(texture2D(tDiffuse, uv + vec2(ca, 0.0)).r,
                  texture2D(tDiffuse, uv).g,
                  texture2D(tDiffuse, uv - vec2(ca, 0.0)).b);
  col = toSRGB(col);
  vec2 d = vUv - 0.5;
  d.x *= 1.3;
  float vig = 1.0 - smoothstep(0.32 - uNerves * 0.12, 0.95, length(d));
  col *= mix(1.0, vig, 0.7 + uNerves * 0.3);
  col += (hash(gl_FragCoord.xy + fract(uTime * 7.13) * 91.0) - 0.5) * 0.045;
  col += uFlash;
  col *= 1.0 - uFade;
  int idx = int(mod(gl_FragCoord.x, 4.0)) + int(mod(gl_FragCoord.y, 4.0)) * 4;
  float b = B[idx] / 16.0 - 0.5;
  col = floor(col * uLevels + 0.5 + b) / uLevels;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export class Renderer {
  constructor(container) {
    const gl = (this.gl = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }));
    gl.setPixelRatio(1);
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFShadowMap;
    gl.domElement.id = 'screen';
    container.appendChild(gl.domElement);

    this.internalHeight = 400;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    this.post = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.rt.texture },
        uTime: { value: 0 },
        uFade: { value: 1 },
        uNerves: { value: 0 },
        uLevels: { value: 26 },
        uFlash: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.postScene = new THREE.Scene();
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    this.fade = 1; // 1 = black
    this.nerves = 0;
    this.flash = 0;
    this.camera = null;
    window.addEventListener('resize', () => this.resize());
  }

  setCamera(camera) {
    this.camera = camera;
    this.resize();
  }

  setInternalHeight(h) {
    this.internalHeight = h;
    this.resize();
  }

  resize() {
    const W = Math.max(1, window.innerWidth), H = Math.max(1, window.innerHeight);
    const h = Math.max(2, Math.min(this.internalHeight, H));
    const w = Math.max(2, Math.round((h * W) / H));
    this.gl.setSize(w, h, false);
    this.rt.setSize(w, h);
    if (this.camera) {
      this.camera.aspect = W / H;
      this.camera.updateProjectionMatrix();
    }
  }

  render(scene, time) {
    const u = this.post.uniforms;
    u.uTime.value = time;
    u.uFade.value = this.fade;
    u.uNerves.value = this.nerves;
    u.uFlash.value = this.flash;
    this.gl.setRenderTarget(this.rt);
    this.gl.render(scene, this.camera);
    this.gl.setRenderTarget(null);
    this.gl.render(this.postScene, this.postCam);
  }
}
