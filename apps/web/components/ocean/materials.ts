// Shaders, shapes and textures for the opening ocean scene (owner, 10 Nov brief: water surface, underwater
// distortion, light scattering and atmosphere as custom shaders). No asset downloads: everything is generated here.
import * as THREE from 'three';

export const OCEAN_COLOURS = {
  deep: new THREE.Color(0x0a4b52),
  shallow: new THREE.Color(0x15867f),
  skyHorizon: new THREE.Color(0xf4ece6), // warm ivory haze, close to the site's ground
  skyTop: new THREE.Color(0xbfd6e2),
  underTop: new THREE.Color(0x46bdb4),
  underDeep: new THREE.Color(0x05303a),
};

export const WORLD_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const NOISE = /* glsl */ `
  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash2(i).x, b = hash2(i + vec2(1, 0)).x, c = hash2(i + vec2(0, 1)).x, d = hash2(i + vec2(1, 1)).x;
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  // Moving Voronoi cells; bright where neighbouring cells meet (F2 − F1 small): the web of light under ripples.
  float cells(vec2 p, float t) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float f1 = 8.0;
    float f2 = 8.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec2 o = 0.5 + 0.42 * sin(t + 6.2831 * hash2(i + g));
        float d = length(g + o - f);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
      }
    }
    return f2 - f1;
  }
  float caustics(vec2 p, float t, float blur) {
    vec2 w = p + 0.22 * vec2(sin(p.y * 1.3 + t * 0.7), cos(p.x * 1.1 - t * 0.55));
    float a = cells(w, t * 0.8);
    float b = cells(w * 1.65 + 7.3, t * 1.05);
    return clamp((1.0 - smoothstep(0.0, 0.05 + blur, a)) * 0.7 + (1.0 - smoothstep(0.0, 0.045 + blur, b)) * 0.45, 0.0, 1.0);
  }
`;

/** The sea's surface, from above (caustics, swell, sky reflection, glints, haze) and from below (the bright window). */
export const WATER_FRAG = /* glsl */ `
  uniform float uTime, uUnder, uDark;
  uniform vec3 uCam, uDeep, uShallow, uSkyHorizon, uSkyTop, uUnderTop, uUnderDeep;
  varying vec3 vWorld;
  ${NOISE}
  void main() {
    vec3 toPix = vWorld - uCam;
    float dist = length(toPix);
    vec3 v = toPix / dist;
    float grazing = 1.0 - abs(v.y);
    float t = uTime;
    float blur = clamp(dist * 0.012 + grazing * grazing * 0.25, 0.0, 0.5);
    // from below the surface wobbles: the light is refracted through moving water
    vec2 p = vWorld.xz * 2.6 + uUnder * 0.3 * vec2(sin(vWorld.z * 2.0 + t * 1.3), cos(vWorld.x * 1.7 - t));
    float cau = caustics(p, t, blur * 1.6) * (1.0 - smoothstep(5.0, 30.0, dist));
    float swell = noise(vWorld.xz * 0.35 + t * 0.05);

    vec3 above = mix(uDeep, uShallow, 0.45 + 0.45 * swell) + vec3(0.78, 0.96, 1.0) * cau * 0.6;
    float fres = pow(grazing, 5.0);
    float glint = pow(noise(vWorld.xz * 3.0 + vec2(t * 0.4, -t * 0.3)), 6.0) * fres * 2.5;
    above = mix(above, uSkyHorizon, fres * 0.8) + glint;
    above = mix(above, uSkyHorizon, smoothstep(25.0, 110.0, dist));

    float window = smoothstep(0.55, 0.85, abs(v.y));
    vec3 below = mix(uUnderDeep, uUnderTop * 1.25, window) + vec3(0.75, 1.0, 0.98) * cau * 0.6 * window;
    below = mix(below, uUnderDeep, smoothstep(6.0, 30.0, dist)) * mix(1.0, 0.4, uDark);

    gl_FragColor = vec4(mix(above, below, uUnder), mix(1.0, 0.6, uUnder));
  }
`;

/** Sky above the water; when under it, the water all around, lighter towards the surface, darker as it deepens. */
export const BACKDROP_FRAG = /* glsl */ `
  uniform vec3 uCam, uSkyHorizon, uSkyTop, uUnderTop, uUnderDeep;
  uniform float uUnder, uBright, uDark;
  varying vec3 vWorld;
  void main() {
    vec3 d = normalize(vWorld - uCam);
    vec3 sky = mix(uSkyHorizon, uSkyTop, smoothstep(0.0, 0.55, d.y));
    vec3 deep = mix(uUnderDeep, uUnderDeep * 1.8, uBright);
    vec3 under = mix(deep, uUnderTop * mix(0.9, 1.15, uBright), smoothstep(-0.7, 0.75, d.y)) * mix(1.0, 0.32, uDark);
    gl_FragColor = vec4(mix(sky, under, uUnder), 1.0);
  }
`;

/** Light scattering: a soft shaft of light, brighter near the surface, flickering as the ripples pass over it. */
export const RAY_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
export const RAY_FRAG = /* glsl */ `
  uniform float uTime, uSeed, uOpacity;
  varying vec2 vUv;
  void main() {
    float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
    float shaft = pow(across, 2.5);
    float fall = pow(vUv.y, 1.6); // uv.y = 1 at the surface
    float flicker = 0.65 + 0.35 * sin(uTime * 1.3 + uSeed * 4.0 + vUv.y * 3.0) * sin(uTime * 0.7 + uSeed);
    gl_FragColor = vec4(vec3(0.85, 1.0, 0.97), shaft * fall * flicker * uOpacity);
  }
`;

/** Particles: soft round motes that drift and catch the light. */
export const MOTE_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime, uSize, uPixelRatio;
  varying float vTwinkle;
  void main() {
    vec3 p = position;
    float t = uTime * (0.15 + aSeed * 0.2);
    p.y = mod(p.y + t + 6.0, 6.0) - 4.5; // rise and wrap
    p.x += sin(uTime * 0.6 + aSeed * 30.0) * 0.08;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (0.6 + aSeed) / -mv.z;
    vTwinkle = 0.5 + 0.5 * sin(uTime * 2.0 + aSeed * 40.0);
  }
`;
export const MOTE_FRAG = /* glsl */ `
  uniform float uOpacity;
  varying float vTwinkle;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.1, d) * (0.45 + 0.55 * vTwinkle);
    gl_FragColor = vec4(vec3(1.0), a * uOpacity);
  }
`;

/** The ring film: multiplies onto the scene; the cut below the ring and the fade-in mix towards white (no effect). */
export const FILM_VERT = RAY_VERT;
export const FILM_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform float cutV, fade, uTime, uUnder;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv + vec2(sin(vUv.y * 22.0 + uTime * 1.6), 0.0) * 0.0018 * uUnder; // a breath of refraction
    vec4 c = texture2D(map, uv);
    float f = smoothstep(cutV + 0.004, cutV - 0.02, uv.y);
    gl_FragColor = mix(vec4(1.0), mix(c, vec4(1.0), f), fade);
  }
`;

// ---- the scallop -------------------------------------------------------------------------------------------------------
export const SHELL = { span: THREE.MathUtils.degToRad(82), rx: 1.18, rz: 1.95, ribs: 19, cup: 0.34, dome: 0.3 };

/** One valve of a scallop: a ribbed fan from the hinge with a scalloped lip. dome > 0 bulges up, < 0 cups down. */
export function scallopValve(dome: number, seg = { s: 56, t: 160 }) {
  const { span, rx, rz, ribs } = SHELL;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const crest = new THREE.Color(0xf7b9b6);
  const body = new THREE.Color(0xeb8f97);
  const groove = new THREE.Color(0xd8707c);
  const c = new THREE.Color();
  for (let i = 0; i <= seg.s; i++) {
    const s = i / seg.s;
    for (let j = 0; j <= seg.t; j++) {
      const a = -span + (2 * span * j) / seg.t;
      const rib = Math.pow(Math.abs(Math.cos((a / span) * (ribs / 2) * Math.PI)), 1.4);
      const r = s * (1 + 0.03 * (rib - 0.5) * s);
      const x = Math.sin(a) * rx * 1.12 * r;
      const z = Math.cos(a) * rz * r * (0.92 + 0.08 * Math.cos(a));
      const bulge = Math.sin(Math.PI * Math.pow(s, 0.8) * 0.5 + Math.PI * 0.5 * s) * (1 - 0.3 * (a / span) ** 2);
      const y = dome * bulge * (1 - 0.6 * s * s) + Math.sign(dome || 1) * 0.03 * rib * s * s;
      pos.push(x, y, z);
      c.copy(groove).lerp(body, 0.35 + 0.65 * rib).lerp(crest, Math.max(0, rib - 0.55) * 1.2 * (0.3 + 0.7 * s));
      col.push(c.r, c.g, c.b);
    }
  }
  const row = seg.t + 1;
  for (let i = 0; i < seg.s; i++)
    for (let j = 0; j < seg.t; j++) {
      const a = i * row + j;
      const b = a + row;
      if (dome < 0) idx.push(a, b, a + 1, b, b + 1, a + 1);
      else idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function radialTexture(stops: Array<[number, string]>) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const ctx = cv.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(cv);
}
