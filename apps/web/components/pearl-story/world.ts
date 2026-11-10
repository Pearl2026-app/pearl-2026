// The pearl farm, built in code (owner, 10 Nov: "real 3D animation" of the story of a pearl coming out of a farm): the
// sea's waves (one wave function shared by the water shader and the floats that ride it), the sunrise sky and haze,
// far hills, the oysters' shells, a farm boat and the nets' mesh. No downloads: every shape and texture is made here.
import * as THREE from 'three';

// ---- the waves -----------------------------------------------------------------------------------------------------
const W = [
  [0.9, 0.6, 1.1, 0.06],
  [-0.5, 1.3, 1.7, 0.04],
  [1.9, -0.4, 2.3, 0.022],
  [0.3, 2.6, 2.9, 0.012],
] as const;
/** Height of the sea at (x, z) at time t; the GLSL below is the same sum. */
export function waveHeight(x: number, z: number, t: number) {
  let h = 0;
  for (const [kx, kz, w, a] of W) h += a * Math.sin(kx * x + kz * z + w * t);
  return h;
}
/** The slope of the sea at (x, z): used to tip the floats and the boat with the swell. */
export function waveSlope(x: number, z: number, t: number): [number, number] {
  let dx = 0;
  let dz = 0;
  for (const [kx, kz, w, a] of W) {
    const c = a * Math.cos(kx * x + kz * z + w * t);
    dx += c * kx;
    dz += c * kz;
  }
  return [dx, dz];
}
const WAVES_GLSL = /* glsl */ `
  float waveH(vec2 p, float t) {
    return 0.06 * sin(0.9 * p.x + 0.6 * p.y + 1.1 * t) + 0.04 * sin(-0.5 * p.x + 1.3 * p.y + 1.7 * t)
         + 0.022 * sin(1.9 * p.x - 0.4 * p.y + 2.3 * t) + 0.012 * sin(0.3 * p.x + 2.6 * p.y + 2.9 * t);
  }
  vec2 waveD(vec2 p, float t) {
    vec2 d = vec2(0.0);
    d += 0.06 * cos(0.9 * p.x + 0.6 * p.y + 1.1 * t) * vec2(0.9, 0.6);
    d += 0.04 * cos(-0.5 * p.x + 1.3 * p.y + 1.7 * t) * vec2(-0.5, 1.3);
    d += 0.022 * cos(1.9 * p.x - 0.4 * p.y + 2.3 * t) * vec2(1.9, -0.4);
    d += 0.012 * cos(0.3 * p.x + 2.6 * p.y + 2.9 * t) * vec2(0.3, 2.6);
    return d;
  }
`;

const NOISE_GLSL = /* glsl */ `
  vec2 hash2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i).x, hash2(i + vec2(1, 0)).x, u.x), mix(hash2(i + vec2(0, 1)).x, hash2(i + vec2(1, 1)).x, u.x), u.y);
  }
  float cells(vec2 p, float t) {
    vec2 i = floor(p); vec2 f = fract(p); float f1 = 8.0; float f2 = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = 0.5 + 0.42 * sin(t + 6.2831 * hash2(i + g));
      float d = length(g + o - f);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
    return f2 - f1;
  }
`;

// ---- the sky: sunrise above, the water's body below -----------------------------------------------------------------
export const PALETTE = {
  sun: new THREE.Vector3(0.35, 0.16, -1).normalize(),
  skyLow: new THREE.Color(0xeebfb2), // blush at the horizon
  skyHigh: new THREE.Color(0x8fbad6), // soft blue overhead
  sunGlow: new THREE.Color(0xffe6c7),
  sea: new THREE.Color(0x2aa7a0),
  seaDeep: new THREE.Color(0x0b5b62),
  underTop: new THREE.Color(0x5fd0c4),
  underDeep: new THREE.Color(0x053640),
};

const SKY_COMMON = /* glsl */ `
  uniform vec3 uSun, uSkyLow, uSkyHigh, uSunGlow;
  vec3 skyColour(vec3 d) {
    float h = max(d.y, 0.0);
    vec3 c = mix(uSkyLow, uSkyHigh, pow(smoothstep(0.0, 0.6, h), 0.8));
    float s = max(dot(d, uSun), 0.0);
    c += uSunGlow * (pow(s, 8.0) * 0.22 + pow(s, 80.0) * 0.5) + vec3(1.0, 0.95, 0.85) * pow(s, 900.0) * 3.0;
    return c;
  }
`;

export const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
    vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
export const SKY_FRAG = /* glsl */ `
  ${SKY_COMMON}
  uniform float uUnder, uDark;
  uniform vec3 uUnderTop, uUnderDeep;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    vec3 above = skyColour(d);
    vec3 below = mix(uUnderDeep, uUnderTop, smoothstep(-0.8, 0.9, d.y));
    gl_FragColor = vec4(mix(above, below, uUnder) * mix(1.0, 0.35, uDark), 1.0);
  }
`;

// ---- the sea's surface ----------------------------------------------------------------------------------------------
export const WATER_VERT = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormal2;
  ${WAVES_GLSL}
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    w.y += waveH(w.xz, uTime);
    vec2 d = waveD(w.xz, uTime);
    vNormal2 = normalize(vec3(-d.x, 1.0, -d.y));
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
export const WATER_FRAG = /* glsl */ `
  ${SKY_COMMON}
  ${NOISE_GLSL}
  uniform float uTime, uDark, uClear;
  uniform vec2 uClearC;
  uniform vec3 uSea, uSeaDeep, uUnderTop, uUnderDeep;
  varying vec3 vWorld;
  varying vec3 vNormal2;
  void main() {
    vec3 toPix = vWorld - cameraPosition;
    float dist = length(toPix);
    vec3 v = toPix / dist;
    // fine ripples on top of the swell, fading with distance
    float fade = 1.0 - smoothstep(4.0, 40.0, dist);
    vec2 rp = vWorld.xz * 3.0;
    vec3 n = normalize(vNormal2 + vec3(noise(rp + uTime * 0.6) - 0.5, 0.0, noise(rp.yx - uTime * 0.5) - 0.5) * 0.35 * fade);
    bool under = cameraPosition.y < 0.0;
    if (!under) {
      float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-v, n), 0.0), 5.0);
      vec3 r = reflect(v, n);
      r.y = abs(r.y);
      vec3 sky = skyColour(r);
      // the body of the water: lighter and greener where the bottom shows through nearby
      vec3 body = mix(uSea, uSeaDeep * 1.1, smoothstep(1.0, 45.0, dist));
      float cau = (1.0 - smoothstep(0.0, 0.14, cells(vWorld.xz * 3.2 + n.xz * 1.5, uTime * 0.8))) * (1.0 - smoothstep(1.0, 9.0, dist));
      body += vec3(0.5, 0.9, 0.85) * cau * 0.05;
      vec3 col = mix(body, sky, clamp(fres * 0.45, 0.0, 1.0));
      // the sun's path: a field of glints towards the sun
      float spec = pow(max(dot(r, uSun), 0.0), 220.0);
      float glint = pow(noise(vWorld.xz * 6.0 + vec2(uTime * 2.0, -uTime * 1.6)), 8.0);
      col += uSunGlow * spec * (1.5 + 6.0 * glint);
      // haze into the horizon
      col = mix(col, skyColour(normalize(vec3(v.x, 0.02, v.z))), smoothstep(30.0, 160.0, dist));
      // the shallows around the scallop: clear enough to see the sand and its moving light
      float shallow = uClear * (1.0 - smoothstep(3.0, 9.0, length(vWorld.xz - uClearC)));
      col = mix(col, mix(col, vec3(0.62, 0.93, 0.9), 0.25), shallow);
      float alpha = mix(mix(0.93, 1.0, smoothstep(1.0, 8.0, dist)), 0.42 + 0.4 * fres, shallow);
      gl_FragColor = vec4(col * mix(1.0, 0.35, uDark), alpha);
    } else {
      // from below: a bright moving window overhead, mirror-like at grazing angles
      float window = smoothstep(0.55, 0.85, abs(v.y));
      float cau = 1.0 - smoothstep(0.0, 0.1, cells(vWorld.xz * 1.6 + n.xz * 2.0, uTime * 0.9));
      vec3 col = mix(uUnderDeep * 1.6, uUnderTop * 1.35 + vec3(0.25, 0.22, 0.18) * window, window) + vec3(0.7, 1.0, 0.95) * cau * 0.25 * window;
      col = mix(col, mix(uUnderDeep, uUnderTop, 0.47), smoothstep(5.0, 22.0, dist)); // the sky dome's colour at the horizon below
      // far away the surface melts into the water's own colour (no hard line at the horizon)
      gl_FragColor = vec4(col * mix(1.0, 0.35, uDark), 0.96 * (1.0 - smoothstep(10.0, 30.0, dist)));
    }
  }
`;

// ---- shafts of light and drifting motes, under the surface ---------------------------------------------------------
export const RAY_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
export const RAY_FRAG = /* glsl */ `
  uniform float uTime, uSeed, uOpacity;
  varying vec2 vUv;
  void main() {
    float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float flicker = 0.65 + 0.35 * sin(uTime * 1.3 + uSeed * 4.0 + vUv.y * 3.0) * sin(uTime * 0.7 + uSeed);
    gl_FragColor = vec4(vec3(0.85, 1.0, 0.96), pow(across, 2.5) * pow(vUv.y, 1.6) * flicker * uOpacity);
  }
`;
export const MOTE_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime, uSize;
  varying float vTw;
  void main() {
    vec3 p = position;
    p.y = mod(p.y + uTime * (0.08 + aSeed * 0.12) + 5.0, 5.0) - 5.2;
    p.x += sin(uTime * 0.5 + aSeed * 30.0) * 0.1;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (0.5 + aSeed) / -mv.z;
    vTw = 0.5 + 0.5 * sin(uTime * 2.0 + aSeed * 40.0);
  }
`;
export const MOTE_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying float vTw;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    gl_FragColor = vec4(vec3(1.0), smoothstep(0.5, 0.1, d) * (0.4 + 0.6 * vTw) * uOpacity);
  }
`;

// ---- far hills ------------------------------------------------------------------------------------------------------
/** A ridge of hills: a strip whose top edge wanders; drawn in one flat colour that the haze fades into the sky. */
export function ridge(width: number, height: number, seed: number, segs = 120) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const x = (i / segs - 0.5) * width;
    const u = i / segs;
    const h =
      height *
      (0.55 +
        0.25 * Math.sin(u * 6.3 + seed) +
        0.15 * Math.sin(u * 17.1 + seed * 2.1) +
        0.06 * Math.sin(u * 41.7 + seed * 3.3) +
        0.25 * Math.exp(-(((u - 0.3 - seed * 0.05) / 0.12) ** 2)));
    pos.push(x, -2, 0, x, Math.max(0.2, h), 0);
    if (i < segs) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

// ---- shells ---------------------------------------------------------------------------------------------------------
/**
 * One valve of a pearl oyster: a rounded, flattish shell with a straight hinge along its top edge, growth rings and a
 * frilled lip. The hinge lies along the x axis at z = 0; the shell spreads towards +z. cup > 0 bulges up, < 0 down.
 * Outside: browns and olive greys in rings.
 */
export function oysterValve(cup: number, seg = { r: 26, a: 72 }, seed = 1) {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const dark = new THREE.Color(0x4a4339);
  const mid = new THREE.Color(0x7d725f);
  const light = new THREE.Color(0xb3a58b);
  const c = new THREE.Color();
  for (let i = 0; i <= seg.r; i++) {
    const r = i / seg.r;
    for (let j = 0; j <= seg.a; j++) {
      const a = -0.16 * Math.PI + (j / seg.a) * 1.32 * Math.PI; // a rounded shell, wider than a half-disc, from a straight hinge
      // a rounded outline, a little longer than wide, with an irregular frilled lip
      const R = 1 + 0.06 * Math.sin(a * 5 + seed) + 0.04 * Math.sin(a * 11 + seed * 2) + 0.025 * Math.sin(a * 29 + seed * 3);
      const rr = r * R;
      const x = Math.cos(a) * rr * 1.05;
      const z = Math.max(Math.sin(a) * rr * 1.15, -0.12 * r) + 0.04 + 0.25 * r;
      const ring = (Math.sin(r * 22 + seed + Math.sin(a * 3 + seed) * 0.8) * 0.5 + 0.5) * 0.6 + 0.2 * Math.sin(a * 7 + r * 5);
      const lip = r > 0.9 ? Math.sin(a * 48 + seed) * 0.012 * (r - 0.9) * 10 : 0;
      const y = cup * (1 - r * r) * (0.85 + 0.15 * Math.sin(a)) + Math.sign(cup || 1) * (0.008 * ring * r + lip);
      pos.push(x, y, z);
      c.copy(dark).lerp(mid, ring * 0.8).lerp(light, Math.max(0, r - 0.75) * 1.6 * ring);
      col.push(c.r, c.g, c.b);
    }
  }
  const row = seg.a + 1;
  for (let i = 0; i < seg.r; i++)
    for (let j = 0; j < seg.a; j++) {
      const a = i * row + j;
      const b = a + row;
      if (cup < 0) idx.push(a, b, a + 1, b, b + 1, a + 1);
      else idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A closed oyster as one shape (for the many in the nets): two cups back to back. */
export function closedOyster(seg = { r: 10, a: 28 }) {
  const top = oysterValve(0.18, seg, 1.3);
  const bottom = oysterValve(-0.26, seg, 2.1);
  const merged = new THREE.BufferGeometry();
  const p = [...(top.getAttribute('position').array as Float32Array), ...(bottom.getAttribute('position').array as Float32Array)];
  const c = [...(top.getAttribute('color').array as Float32Array), ...(bottom.getAttribute('color').array as Float32Array)];
  const n = top.getAttribute('position').count;
  const i = [...(top.getIndex()!.array as Uint32Array | Uint16Array), ...Array.from(bottom.getIndex()!.array, (k) => k + n)];
  merged.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  merged.setIndex(i);
  merged.computeVertexNormals();
  top.dispose();
  bottom.dispose();
  return merged;
}

// ---- the farm boat ----------------------------------------------------------------------------------------------------
/** A small open wooden boat, about 3.4 long: a hull from cross-sections, painted blush outside, weathered inside. */
export function boatHull() {
  const L = 3.4;
  const nL = 28;
  const nA = 14;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const paint = new THREE.Color(0xe7b9b3);
  const worn = new THREE.Color(0xd7cfc4);
  const keel = new THREE.Color(0x8d6c5a);
  const c = new THREE.Color();
  for (let i = 0; i <= nL; i++) {
    const u = i / nL;
    const z = (u - 0.5) * L;
    const beam = 0.62 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.08)), 0.7) + 0.02; // pointed bow at u→1, square-ish stern
    const sheer = 0.36 + 0.12 * Math.pow(u, 3); // the gunwale rises to the bow
    for (let j = 0; j <= nA; j++) {
      const a = (j / nA) * Math.PI; // from one gunwale, under the keel, to the other
      const x = -Math.cos(a) * beam;
      const y = sheer - Math.sin(a) * (0.36 + sheer * 0.2) * Math.pow(Math.max(0.15, Math.sin(Math.PI * u)), 0.25);
      pos.push(x, y, z);
      const band = Math.abs(Math.cos(a));
      c.copy(keel).lerp(paint, Math.min(1, band * 1.6 + 0.2)).lerp(worn, Math.sin(u * 40 + j) * 0.08 + 0.08);
      col.push(c.r, c.g, c.b);
    }
  }
  const row = nA + 1;
  for (let i = 0; i < nL; i++)
    for (let j = 0; j < nA; j++) {
      const a = i * row + j;
      const b = a + row;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---- textures -------------------------------------------------------------------------------------------------------
/** The nets' mesh: a fine diamond net in a frame, on transparent. */
export function netTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d')!;
  g.clearRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(40,60,58,0.85)';
  g.lineWidth = 1.6;
  for (let k = -256; k < 512; k += 18) {
    g.beginPath();
    g.moveTo(k, 0);
    g.lineTo(k + 256, 256);
    g.stroke();
    g.beginPath();
    g.moveTo(k, 256);
    g.lineTo(k + 256, 0);
    g.stroke();
  }
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(60,78,74,0.95)';
  g.strokeRect(2, 2, 252, 252);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A soft round glow (for the haze and the light behind the ring). */
export function glowTexture(stops: Array<[number, string]>) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const ctx = cv.getContext('2d')!;
  const gr = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([o, c]) => gr.addColorStop(o, c));
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(cv);
}

/** A long soft band of morning mist. */
export function mistTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 128;
  const ctx = cv.getContext('2d')!;
  for (let k = 0; k < 60; k++) {
    const x = Math.random() * 512;
    const y = 50 + Math.random() * 40;
    const r = 30 + Math.random() * 60;
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,245,240,0.22)');
    gr.addColorStop(1, 'rgba(255,245,240,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 512, 128);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// ---- the sandy bottom of the shallows, with the light of the ripples moving on it --------------------------------
export const SEABED_VERT = /* glsl */ `
  varying vec3 vWorld;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
export const SEABED_FRAG = /* glsl */ `
  ${NOISE_GLSL}
  uniform float uTime, uDark;
  varying vec3 vWorld;
  varying vec2 vUv;
  void main() {
    vec2 p = vWorld.xz * 1.6;
    vec2 w = p + 0.25 * vec2(sin(p.y * 1.3 + uTime * 0.6), cos(p.x * 1.1 - uTime * 0.5));
    float a = 1.0 - smoothstep(0.0, 0.07, cells(w, uTime * 0.8));
    float b = 1.0 - smoothstep(0.0, 0.08, cells(w * 1.7 + 4.0, uTime * 1.05));
    // pale sand seen through turquoise water, with the bright web of light moving across it
    vec3 sand = mix(vec3(0.7, 0.78, 0.68), vec3(0.84, 0.88, 0.78), noise(vWorld.xz * 0.8));
    vec3 col = sand * vec3(0.32, 0.72, 0.68) + vec3(0.7, 1.0, 0.94) * (a * 0.32 + b * 0.18);
    // under the water, distance turns it to the water's own colour
    col = mix(col, vec3(0.03, 0.3, 0.32), smoothstep(1.0, 9.0, length(vWorld - cameraPosition)) * step(cameraPosition.y, 0.0));
    float edge = smoothstep(0.5, 0.36, length(vUv - 0.5));
    gl_FragColor = vec4(col * mix(1.0, 0.35, uDark), edge);
  }
`;
