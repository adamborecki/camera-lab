// WebGL2 imaging engine. Three passes:
//
//  1. DOF   (only when focus/aperture/sensor change): each scene layer is
//           blurred by its own circle of confusion (thin-lens math from
//           camera-model.derive) into a cached texture-array slice.
//  2. IMAGE (every video frame): composite the cached layers back-to-front in
//           linear light, integrating moving layers over the time the shutter
//           is open (real motion blur), then run the "sensor": exposure →
//           shot + read noise → per-channel clipping → gain (ISO) → white
//           balance → camera tone curve → sRGB. Output: an 8-bit frame.
//  3. PRESENT: draw that frame to the screen with monitoring overlays
//           (zebras, focus peaking). Scopes read the frame from pass 2, never
//           the overlays, so they always agree with the picture.
import { SCENE_W, SCENE_H, SENSOR_SAT } from "../sim/camera-model.js";
import { kelvinToLinearRgb, srgbToLinear, linearToSrgb } from "../sim/color.js";

const MAX_LAYERS = 10;
const MAX_MOVERS = 4;
const MAX_MOTION_SAMPLES = 48;
const SCOPE_W = 256;
const SCOPE_H = 144;
const TIME_WRAP = 600;

const VERT = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const DOF_FRAG = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec2 vUv;
out vec4 outColor;
uniform sampler2DArray uSrc;
uniform float uLayer;
uniform vec4 uDepth;      // farDepth(m), nearDepth(m), vFar, vNear
uniform float uCocScale;  // blur-circle diameter (px) per |d-S|/d
uniform float uFocusMm;
const int TAPS = 36;
const float GOLDEN = 2.39996323;

float depthAt(float v) {
  float k = clamp((v - uDepth.z) / max(uDepth.w - uDepth.z, 1e-4), 0.0, 1.0);
  // perspective: 1/depth is what varies linearly down the screen
  return 1.0 / mix(1.0 / uDepth.x, 1.0 / uDepth.y, k);
}

void main() {
  float d = depthAt(vUv.y) * 1000.0;
  float r = 0.5 * uCocScale * abs(d - uFocusMm) / d;
  if (r < 0.35) { outColor = texture(uSrc, vec3(vUv, uLayer)); return; }
  vec2 px = 1.0 / vec2(${SCENE_W}.0, ${SCENE_H}.0);
  float spacing = r * 1.77 / sqrt(float(TAPS));
  float lod = log2(max(spacing, 1.0));
  vec4 sum = vec4(0.0);
  for (int i = 0; i < TAPS; i++) {
    float fi = float(i) + 0.5;
    float rr = r * sqrt(fi / float(TAPS));
    float a = fi * GOLDEN;
    sum += textureLod(uSrc, vec3(vUv + vec2(cos(a), sin(a)) * rr * px, uLayer), lod);
  }
  outColor = sum / float(TAPS);
}`;

const IMAGE_FRAG = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;
in vec2 vUv;
out vec4 outColor;
uniform sampler2DArray uLayers;
uniform int uLayerCount;
uniform vec3 uLayerLight[${MAX_LAYERS}];
uniform float uLayerAdd[${MAX_LAYERS}];
uniform int uLayerMover[${MAX_LAYERS}];
uniform vec4 uMotA[${MAX_MOVERS}];   // pivot.xy, rotBase, rotAmp
uniform vec4 uMotB[${MAX_MOVERS}];   // rotFreq, rotPhase, spin, bounce
uniform vec4 uMotC[${MAX_MOVERS}];   // txAmp, tyAmp, tFreq, tPhase
uniform vec4 uMotBound[${MAX_MOVERS}]; // center.xy, radius
uniform int uMotSamples[${MAX_MOVERS}];
uniform float uTime0;
uniform float uShutter;
uniform vec3 uView;        // center uv (scene, v down), zoom
uniform float uRawScale;
uniform float uGain;
uniform vec3 uWb;
uniform float uShotK;
uniform float uReadSigma;
uniform uint uFrame;
uniform int uNoiseOn;
const float PI = 3.14159265;
const float SAT = ${SENSOR_SAT.toFixed(3)};
const vec2 SCENE = vec2(${SCENE_W}.0, ${SCENE_H}.0);

uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
vec3 gauss3(uvec2 p, uint f) {
  vec3 u1 = vec3(pcg3d(uvec3(p, f))) / 4294967295.0;
  vec3 u2 = vec3(pcg3d(uvec3(p, f + 7919u))) / 4294967295.0;
  return sqrt(-2.0 * log(max(u1, 1e-7))) * cos(2.0 * PI * u2);
}

vec4 sampleMover(int i, int m, vec2 p) {
  vec4 bound = uMotBound[m];
  if (distance(p, bound.xy) > bound.z) return vec4(0.0);
  vec4 A = uMotA[m]; vec4 B = uMotB[m]; vec4 C = uMotC[m];
  int K = uMotSamples[m];
  vec4 sum = vec4(0.0);
  for (int k = 0; k < ${MAX_MOTION_SAMPLES}; k++) {
    if (k >= K) break;
    float t = uTime0 + (float(k) + 0.5) / float(K) * uShutter;
    float th = A.z + A.w * sin(2.0 * PI * B.x * t + B.y) + B.z * t;
    float tx = C.x * sin(2.0 * PI * C.z * t + C.w);
    float ty = B.w > 0.5 ? -C.y * abs(sin(PI * C.z * t + C.w)) : C.y * cos(2.0 * PI * C.z * t + C.w);
    vec2 q = p - A.xy - vec2(tx, ty);
    float c = cos(-th), s = sin(-th);
    q = vec2(c * q.x - s * q.y, s * q.x + c * q.y) + A.xy;
    sum += texture(uLayers, vec3(q / SCENE, float(i)));
  }
  return sum / float(K);
}

float tone(float x) {
  // Rec.709-ish camera response: linear up to a knee, then a smooth
  // shoulder that reaches white ~2.8 stops above mid grey and clips.
  const float k = 0.7;
  const float w = 1.3;
  if (x < k) return x;
  float t = min((x - k) / (w - k), 1.0);
  return k + (1.0 - k) * (1.0 - (1.0 - t) * (1.0 - t));
}
float oetf(float v) {
  return v <= 0.0031308 ? v * 12.92 : 1.055 * pow(v, 1.0 / 2.4) - 0.055;
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);          // scene space, v down
  uv = uView.xy + (uv - 0.5) / uView.z;
  vec2 p = uv * SCENE;
  vec3 col = vec3(0.0);
  for (int i = 0; i < ${MAX_LAYERS}; i++) {
    if (i >= uLayerCount) break;
    int m = uLayerMover[i];
    vec4 s = m < 0 ? texture(uLayers, vec3(uv, float(i))) : sampleMover(i, m, p);
    vec3 rad = s.rgb * uLayerLight[i];
    col = uLayerAdd[i] > 0.5 ? col + rad : rad + col * (1.0 - s.a);
  }

  // --- sensor ---
  vec3 raw = col * uRawScale;
  if (uNoiseOn == 1) {
    vec3 sigma = sqrt(max(raw, 0.0) * uShotK + uReadSigma * uReadSigma);
    raw += sigma * gauss3(uvec2(gl_FragCoord.xy), uFrame);
  }
  raw = clamp(raw, 0.0, SAT);
  float clipK = smoothstep(0.75 * SAT, SAT, max(raw.r, max(raw.g, raw.b)));
  vec3 x = raw * uGain * uWb;
  // Clipped sensor channels can't hold color — fade them toward white the
  // way real cameras desaturate blown highlights.
  x = mix(x, vec3(max(x.r, max(x.g, x.b))), clipK);
  vec3 y = vec3(tone(x.r), tone(x.g), tone(x.b));
  outColor = vec4(oetf(y.r), oetf(y.g), oetf(y.b), 1.0);
}`;

const PRESENT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uFrameTex;
uniform vec2 uTexel;
uniform float uZebra;      // 0 = off, else luma threshold (0..1)
uniform float uPeaking;    // 0/1
uniform float uTime;
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
  vec3 c = texture(uFrameTex, vUv).rgb;
  if (uZebra > 0.0 && luma(c) >= uZebra) {
    float stripe = mod(gl_FragCoord.x + gl_FragCoord.y + uTime * 40.0, 12.0);
    c = stripe < 6.0 ? vec3(0.05) : vec3(1.0);
  }
  if (uPeaking > 0.5) {
    float l = luma(texture(uFrameTex, vUv - vec2(uTexel.x, 0.0)).rgb);
    float r = luma(texture(uFrameTex, vUv + vec2(uTexel.x, 0.0)).rgb);
    float d = luma(texture(uFrameTex, vUv - vec2(0.0, uTexel.y)).rgb);
    float u = luma(texture(uFrameTex, vUv + vec2(0.0, uTexel.y)).rgb);
    float g = length(vec2(r - l, u - d));
    if (g > 0.2) c = mix(c, vec3(1.0, 0.15, 0.35), 0.85);
  }
  outColor = vec4(c, 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) + "\n" + src.split("\n").map((l, i) => `${i + 1}: ${l}`).join("\n"));
  }
  return sh;
}

function program(gl, fragSrc) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const cache = {};
  return {
    p,
    u(name) {
      if (!(name in cache)) cache[name] = gl.getUniformLocation(p, name);
      return cache[name];
    },
  };
}

// sRGB byte → linear, and linear (12-bit) → sRGB byte lookup tables for the
// one-time layer conversion.
const TO_LIN = new Float32Array(256).map((_, i) => srgbToLinear(i / 255));
const TO_SRGB = new Uint8Array(4096).map((_, i) => Math.round(linearToSrgb(i / 4095) * 255));

// Motion shared by CPU (sample counts, bounds) and GPU (the IMAGE shader).
export function motionAt(m, t) {
  const TAU = Math.PI * 2;
  const th =
    (m.rotBase || 0) + (m.rotAmp || 0) * Math.sin(TAU * (m.rotFreq || 0) * t + (m.rotPhase || 0)) + (m.spin || 0) * t;
  const tf = m.tFreq || 0;
  const tx = (m.txAmp || 0) * Math.sin(TAU * tf * t + (m.tPhase || 0));
  const ty = m.bounce
    ? -(m.tyAmp || 0) * Math.abs(Math.sin(Math.PI * tf * t + (m.tPhase || 0)))
    : (m.tyAmp || 0) * Math.cos(TAU * tf * t + (m.tPhase || 0));
  return { th, tx, ty };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      depth: false,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 is not available in this browser.");
    this.gl = gl;
    this.dofProg = program(gl, DOF_FRAG);
    this.imageProg = program(gl, IMAGE_FRAG);
    this.presentProg = program(gl, PRESENT_FRAG);
    this.vao = gl.createVertexArray();
    this.scene = null;
    this.dofKey = "";
    this.outW = 0;
    this.outH = 0;
    this.scopeFbo = this.makeTarget(SCOPE_W, SCOPE_H);
    this.scopePixels = new Uint8Array(SCOPE_W * SCOPE_H * 4);
    this.stats = { dofMs: 0, imageMs: 0, samples: 0 };
  }

  makeTarget(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, w, h };
  }

  resize(w, h) {
    if (w === this.outW && h === this.outH) return;
    const gl = this.gl;
    this.canvas.width = w;
    this.canvas.height = h;
    if (this.frame) {
      gl.deleteTexture(this.frame.tex);
      gl.deleteFramebuffer(this.frame.fbo);
    }
    this.frame = this.makeTarget(w, h);
    this.outW = w;
    this.outH = h;
  }

  // Draw every layer with Canvas2D, convert to linear premultiplied (stored
  // sRGB-encoded so 8 bits keep shadow precision), upload as a mipmapped
  // texture array. Also keeps a small alpha map per layer for tap-to-focus.
  setScene(scene) {
    const gl = this.gl;
    const layers = scene.layers.slice(0, MAX_LAYERS);
    const n = layers.length;
    if (this.srcTex) gl.deleteTexture(this.srcTex);
    if (this.blurTex) gl.deleteTexture(this.blurTex);
    if (this.blurFbos) this.blurFbos.forEach((f) => gl.deleteFramebuffer(f));

    const levels = Math.floor(Math.log2(Math.max(SCENE_W, SCENE_H))) + 1;
    this.srcTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.srcTex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.SRGB8_ALPHA8, SCENE_W, SCENE_H, n);

    const cnv = document.createElement("canvas");
    cnv.width = SCENE_W;
    cnv.height = SCENE_H;
    const ctx = cnv.getContext("2d", { willReadFrequently: true });
    const bytes = new Uint8Array(SCENE_W * SCENE_H * 4);
    const PICK = 4;
    this.pickW = SCENE_W / PICK;
    this.pickH = SCENE_H / PICK;
    this.pickMaps = [];
    layers.forEach((layer, i) => {
      ctx.clearRect(0, 0, SCENE_W, SCENE_H);
      ctx.save();
      layer.draw(ctx, SCENE_W, SCENE_H);
      ctx.restore();
      const src = ctx.getImageData(0, 0, SCENE_W, SCENE_H).data;
      for (let p = 0; p < src.length; p += 4) {
        const a = src[p + 3] / 255;
        bytes[p] = TO_SRGB[Math.round(TO_LIN[src[p]] * a * 4095)];
        bytes[p + 1] = TO_SRGB[Math.round(TO_LIN[src[p + 1]] * a * 4095)];
        bytes[p + 2] = TO_SRGB[Math.round(TO_LIN[src[p + 2]] * a * 4095)];
        bytes[p + 3] = src[p + 3];
      }
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, SCENE_W, SCENE_H, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      const pick = new Uint8Array(this.pickW * this.pickH);
      if (!layer.add && !layer.noFocus) {
        for (let y = 0; y < this.pickH; y++)
          for (let x = 0; x < this.pickW; x++) pick[y * this.pickW + x] = src[((y * PICK + 2) * SCENE_W + x * PICK + 2) * 4 + 3];
      }
      this.pickMaps.push(pick);
    });
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);

    this.blurTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.blurTex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.SRGB8_ALPHA8, SCENE_W, SCENE_H, n);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.blurFbos = layers.map((_, i) => {
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, this.blurTex, 0, i);
      return fbo;
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Static per-layer uniforms.
    const movers = [];
    this.layerMover = new Int32Array(MAX_LAYERS).fill(-1);
    this.layerAdd = new Float32Array(MAX_LAYERS);
    this.layerLight = new Float32Array(MAX_LAYERS * 3);
    layers.forEach((layer, i) => {
      const light = scene.lights[layer.light || "key"];
      const rgb = kelvinToLinearRgb(light.kelvin);
      const tint = light.tint || [1, 1, 1];
      const k = light.intensity * (layer.intensity ?? 1);
      for (let c = 0; c < 3; c++) this.layerLight[i * 3 + c] = rgb[c] * tint[c] * k;
      this.layerAdd[i] = layer.add ? 1 : 0;
      if (layer.motion && movers.length < MAX_MOVERS) {
        this.layerMover[i] = movers.length;
        movers.push(layer.motion);
      }
    });
    this.movers = movers;
    this.scene = scene;
    this.layers = layers;
    this.dofKey = "";
  }

  // Topmost opaque layer under a point (uv in scene space, v down), for
  // tap-to-focus. Moving layers are tested at rest.
  pickDepth(u, v) {
    const x = Math.min(this.pickW - 1, Math.max(0, Math.floor(u * this.pickW)));
    const y = Math.min(this.pickH - 1, Math.max(0, Math.floor(v * this.pickH)));
    for (let i = this.layers.length - 1; i >= 0; i--) {
      if (this.pickMaps[i][y * this.pickW + x] > 100) {
        return { depth: layerDepthAt(this.layers[i], v), layer: this.layers[i] };
      }
    }
    return null;
  }

  runDof(derived) {
    // Blur is applied to the drawn scene image, which the view may then
    // magnify — so this pass works in scene pixels, not displayed ones.
    const key = `${derived.cocScenePx.toFixed(4)}|${derived.focusMm.toFixed(1)}`;
    if (key === this.dofKey) return;
    this.dofKey = key;
    const gl = this.gl;
    const t0 = performance.now();
    const P = this.dofProg;
    gl.useProgram(P.p);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, SCENE_W, SCENE_H);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.srcTex);
    gl.uniform1i(P.u("uSrc"), 0);
    gl.uniform1f(P.u("uCocScale"), derived.cocScenePx);
    gl.uniform1f(P.u("uFocusMm"), derived.focusMm);
    this.layers.forEach((layer, i) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFbos[i]);
      gl.uniform1f(P.u("uLayer"), i);
      const r = layer.depthRange;
      if (r) gl.uniform4f(P.u("uDepth"), r.far, r.near, r.vFar, r.vNear);
      else gl.uniform4f(P.u("uDepth"), layer.depth, layer.depth, 0, 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.stats.dofMs = performance.now() - t0;
  }

  // How many sub-frame samples a mover needs so its streak has no gaps:
  // about one per pixel travelled while the shutter is open.
  motionSamples(m, t0, shutter, zoom = 1) {
    const steps = 8;
    let len = 0;
    let prev = motionAt(m, t0);
    for (let s = 1; s <= steps; s++) {
      const cur = motionAt(m, t0 + (shutter * s) / steps);
      len += Math.abs(cur.th - prev.th) * (m.radius || 100) + Math.hypot(cur.tx - prev.tx, cur.ty - prev.ty);
      prev = cur;
    }
    return Math.max(1, Math.min(MAX_MOTION_SAMPLES, Math.ceil(len * zoom)));
  }

  // opts: { settings, derived, time, frameIndex, view:{x,y,zoom}, zebra,
  //         peaking, noise, wantScopes }
  render(opts) {
    const gl = this.gl;
    const { derived } = opts;
    this.runDof(derived);
    const t0 = performance.now();

    // ---- IMAGE pass → frame texture ----
    const P = this.imageProg;
    gl.useProgram(P.p);
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.frame.fbo);
    gl.viewport(0, 0, this.outW, this.outH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.blurTex);
    gl.uniform1i(P.u("uLayers"), 0);
    gl.uniform1i(P.u("uLayerCount"), this.layers.length);
    gl.uniform3fv(P.u("uLayerLight"), this.layerLight);
    gl.uniform1fv(P.u("uLayerAdd"), this.layerAdd);
    gl.uniform1iv(P.u("uLayerMover"), this.layerMover);

    const time = opts.time % TIME_WRAP;
    const view = opts.view || { x: 0.5, y: 0.5, zoom: 1 };
    const A = new Float32Array(MAX_MOVERS * 4);
    const B = new Float32Array(MAX_MOVERS * 4);
    const C = new Float32Array(MAX_MOVERS * 4);
    const D = new Float32Array(MAX_MOVERS * 4);
    const K = new Int32Array(MAX_MOVERS);
    let totalSamples = 0;
    this.movers.forEach((m, j) => {
      A.set([m.pivot[0], m.pivot[1], m.rotBase || 0, m.rotAmp || 0], j * 4);
      B.set([m.rotFreq || 0, m.rotPhase || 0, m.spin || 0, m.bounce ? 1 : 0], j * 4);
      C.set([m.txAmp || 0, m.tyAmp || 0, m.tFreq || 0, m.tPhase || 0], j * 4);
      D.set([m.pivot[0], m.pivot[1], (m.radius || 100) + Math.abs(m.txAmp || 0) + Math.abs(m.tyAmp || 0) + 6, 0], j * 4);
      K[j] = this.motionSamples(m, time, derived.t, view.zoom);
      totalSamples += K[j];
    });
    this.stats.samples = totalSamples;
    gl.uniform4fv(P.u("uMotA"), A);
    gl.uniform4fv(P.u("uMotB"), B);
    gl.uniform4fv(P.u("uMotC"), C);
    gl.uniform4fv(P.u("uMotBound"), D);
    gl.uniform1iv(P.u("uMotSamples"), K);
    gl.uniform1f(P.u("uTime0"), time);
    gl.uniform1f(P.u("uShutter"), derived.t);
    gl.uniform3f(P.u("uView"), view.x, view.y, view.zoom);
    gl.uniform1f(P.u("uRawScale"), derived.rawScale);
    gl.uniform1f(P.u("uGain"), derived.gain);
    gl.uniform3fv(P.u("uWb"), derived.wbGains);
    gl.uniform1f(P.u("uShotK"), derived.shotK);
    gl.uniform1f(P.u("uReadSigma"), derived.readSigma);
    gl.uniform1ui(P.u("uFrame"), (opts.frameIndex >>> 0) % 1000003);
    gl.uniform1i(P.u("uNoiseOn"), opts.noise === false ? 0 : 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // ---- scopes read the un-overlaid frame ----
    let scope = null;
    if (opts.wantScopes) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.frame.fbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.scopeFbo.fbo);
      gl.blitFramebuffer(0, 0, this.outW, this.outH, 0, 0, SCOPE_W, SCOPE_H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.scopeFbo.fbo);
      gl.readPixels(0, 0, SCOPE_W, SCOPE_H, gl.RGBA, gl.UNSIGNED_BYTE, this.scopePixels);
      scope = { pixels: this.scopePixels, width: SCOPE_W, height: SCOPE_H };
    }

    // ---- PRESENT pass → screen ----
    const Q = this.presentProg;
    gl.useProgram(Q.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.outW, this.outH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.frame.tex);
    gl.uniform1i(Q.u("uFrameTex"), 0);
    gl.uniform2f(Q.u("uTexel"), 1 / this.outW, 1 / this.outH);
    gl.uniform1f(Q.u("uZebra"), opts.zebra || 0);
    gl.uniform1f(Q.u("uPeaking"), opts.peaking ? 1 : 0);
    gl.uniform1f(Q.u("uTime"), performance.now() / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.stats.imageMs = performance.now() - t0;
    return scope;
  }

  // Re-run only the PRESENT pass (e.g. zebra stripes animating between
  // video frames) without rendering a new frame.
  represent(opts) {
    const gl = this.gl;
    if (!this.frame) return;
    const Q = this.presentProg;
    gl.useProgram(Q.p);
    gl.bindVertexArray(this.vao);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.outW, this.outH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.frame.tex);
    gl.uniform1f(Q.u("uZebra"), opts.zebra || 0);
    gl.uniform1f(Q.u("uPeaking"), opts.peaking ? 1 : 0);
    gl.uniform1f(Q.u("uTime"), performance.now() / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose() {
    const ext = this.gl.getExtension("WEBGL_lose_context");
    if (ext) ext.loseContext();
  }
}

export function layerDepthAt(layer, v) {
  const r = layer.depthRange;
  if (!r) return layer.depth;
  const k = Math.min(1, Math.max(0, (v - r.vFar) / (r.vNear - r.vFar)));
  return 1 / (1 / r.far + (1 / r.near - 1 / r.far) * k);
}
