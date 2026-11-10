// The animated photograph behind the home page's opening (owner, 10 Nov: "I want this to be animated" — the ChatGPT
// picture of a pink scallop with a pearl on turquoise water). One WebGL shader brings the still to life, a cinemagraph:
// the water ripples and its light patterns move while the shell stays put and gently rides the swell; the pearl's lustre
// slides as the light changes. Scrolling then moves a camera through the picture (towards the pearl), takes it under the
// surface into sunlit water with rays and rising bubbles, and shows the real Filigree Crown ring turning in a pool of
// light. No libraries: plain WebGL 1 so it starts fast and runs on older phones; the scroll timeline is GSAP.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/** Where things are in the photograph (pixels of the 1672 × 941 picture). */
export const PHOTO = { w: 1672, h: 941, pearl: { x: 1258, y: 513, r: 73 } };

export interface FilmState {
  open: number; // the shell opens on the pearl
  push: number; // the camera moves in on the pearl
  dive: number; // the surface rises past the lens
  bright: number; // the water under the surface brightens
  ring: number; // the ring appears in its pool of light
  turn: number; // the ring turns 360°
  dark: number; // the water darkens for the call to action
  exit: number; // hand-over to the page below
}
export const createFilmState = (): FilmState => ({ open: 0, push: 0, dive: 0, bright: 0, ring: 0, turn: 0, dark: 0, exit: 0 });

/** The words' chapters, by scroll progress: intro, the pearl, the surface, the ring, the call to action. */
export const CHAPTERS = [
  [0.0, 0.07],
  [0.2, 0.34],
  [0.37, 0.46],
  [0.62, 0.8],
  [0.85, 1.01],
] as const;
export const chapterAt = (p: number) => CHAPTERS.findIndex(([a, b]) => p >= a && p < b);

export function createFilmTimeline(trigger: HTMLElement, s: FilmState, onProgress: (p: number) => void) {
  gsap.registerPlugin(ScrollTrigger);
  const tl = gsap.timeline({
    defaults: { ease: 'power2.inOut' },
    scrollTrigger: { trigger, start: 'top top', end: 'bottom bottom', scrub: 1, onUpdate: (st) => onProgress(st.progress) },
  });
  const at = (k: keyof FilmState, a: number, b: number, ease = 'power2.inOut') => tl.to(s, { [k]: 1, duration: b - a, ease }, a);
  at('open', 6, 20, 'power2.inOut');
  at('push', 16, 44, 'sine.inOut');
  at('dive', 44, 58, 'power2.in');
  at('bright', 54, 66, 'sine.inOut');
  at('ring', 58, 70, 'power2.out');
  at('turn', 62, 95, 'none');
  at('dark', 82, 94, 'sine.inOut');
  at('exit', 95, 100, 'power1.in');
  return tl;
}

/** Keeps ScrollTrigger in step with the site's smooth scrolling (Lenis), when it runs. */
export function syncWithLenis() {
  const lenis = (window as unknown as { __lenis?: { on: (e: string, cb: () => void) => void; off: (e: string, cb: () => void) => void } }).__lenis;
  if (!lenis) return () => {};
  const update = () => ScrollTrigger.update();
  lenis.on('scroll', update);
  return () => lenis.off('scroll', update);
}

const VERT = `
attribute vec2 aPos;
varying vec2 vScreen;
void main() { vScreen = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
varying vec2 vScreen;
uniform sampler2D uPhoto, uMask, uRing, uClosed, uUnder;
uniform vec2 uRes, uImg, uFocus, uScreenFocus, uPearl, uRingC;
uniform float uTime, uScale, uPearlR, uOpen, uDive, uBright, uDark, uRingH, uRingFade, uRingCut, uRingAspect, uRingReady, uSmall;

vec2 hash2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i).x, hash2(i + vec2(1, 0)).x, u.x), mix(hash2(i + vec2(0, 1)).x, hash2(i + vec2(1, 1)).x, u.x), u.y);
}
// the web of light under ripples: moving cells, bright where neighbours meet
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
float caustic(vec2 p, float t) {
  vec2 w = p + 0.25 * vec2(sin(p.y * 1.3 + t * 0.6), cos(p.x * 1.1 - t * 0.5));
  return 1.0 - smoothstep(0.0, 0.16, cells(w, t * 0.7));
}

// the photograph, alive: rippling water, the shell riding the swell, the pearl's lustre moving
vec3 surface(vec2 px, float t) {
  vec2 uv = px / uImg;
  vec4 mk = texture2D(uMask, uv);
  float rigid = max(mk.r, mk.b); // both shells (open and shut) stay rigid while the water moves
  // ripples: a slow flow field bends the picture of the water a few pixels this way and that
  vec2 q = px / 140.0;
  vec2 flow = vec2(noise(q + vec2(t * 0.22, t * 0.1)), noise(q + vec2(5.2 - t * 0.13, 1.3 + t * 0.2))) - 0.5;
  vec2 fine = vec2(noise(px / 38.0 + t * 0.6), noise(px / 38.0 + 9.1 - t * 0.55)) - 0.5;
  vec2 bend = (flow * 7.0 + fine * 2.2) * (1.0 - rigid);
  // the shell bobs on the swell (a pixel or two)
  vec2 bob = vec2(sin(t * 0.7) * 1.2, sin(t * 0.9 + 0.6) * 2.4) * rigid;
  vec2 suv = (px + bend - bob) / uImg;
  // the shell opens: the shut picture gives way to the open one in a soft, rippling dissolve
  float n = noise(px / 26.0 + t * 0.3) * 0.5 + noise(px / 9.0) * 0.5;
  float k = smoothstep(0.0, 1.0, clamp(uOpen * 1.35 - 0.35 * n, 0.0, 1.0));
  vec3 col = mix(texture2D(uClosed, suv).rgb, texture2D(uPhoto, suv).rgb, k);
  float shell = mix(mk.b, mk.r, k);
  // moving light on the water, strongest where the picture is already bright, and sun glitter
  float lum = dot(col, vec3(0.3, 0.55, 0.15));
  float cau = caustic(px / 95.0, t);
  col += vec3(0.75, 1.0, 0.96) * cau * 0.025 * (0.4 + lum) * (1.0 - shell);
  float glit = pow(noise(px / 6.0 + vec2(t * 2.1, -t * 1.7)), 14.0) * smoothstep(0.45, 0.8, lum);
  col += vec3(1.0) * glit * 2.2 * (1.0 - shell);
  // the pearl: a soft highlight that drifts as the light moves, a cool-pink sheen at its edge, and a glow as it is revealed
  vec2 d = (px - uPearl) / uPearlR;
  float pearl = mk.g * k;
  vec2 hl = vec2(-0.25 + 0.18 * sin(t * 0.5), 0.3 + 0.12 * cos(t * 0.37));
  col += vec3(1.0, 0.98, 0.96) * exp(-dot(d - hl, d - hl) * 9.0) * 0.28 * pearl;
  col += vec3(0.06, 0.02, 0.08) * smoothstep(0.55, 1.0, length(d)) * (0.5 + 0.5 * sin(t * 0.6 + d.x * 3.0)) * pearl;
  col += vec3(1.0, 0.97, 0.94) * exp(-dot(d, d) * 0.6) * sin(3.14159 * clamp(uOpen, 0.0, 1.0)) * 0.22;
  return col;
}

// under the surface: the underwater photograph, gently refracting, with moving rays and rising bubbles
vec3 under(vec2 sp, float t) {
  float aspect = uRes.x / uRes.y;
  // cover-fit the picture, a touch larger while the camera settles after the dive
  float ia = uImg.x / uImg.y;
  vec2 fit = aspect > ia ? vec2(1.0, ia / aspect) : vec2(aspect / ia, 1.0);
  vec2 focus = uSmall > 0.5 ? vec2(0.6, 0.45) : vec2(0.5, 0.5);
  float z = mix(1.12, 1.0, uBright);
  vec2 uv = focus + (vec2(sp.x, 1.0 - sp.y) - 0.5) * fit / z;
  uv += 0.003 * vec2(sin(uv.y * 24.0 + t * 1.3), cos(uv.x * 19.0 - t * 1.1)) * smoothstep(0.55, 0.0, uv.y);
  uv.y += 0.004 * sin(t * 0.4);
  vec3 col = texture2D(uUnder, clamp(uv, 0.001, 0.999)).rgb * mix(0.85, 1.05, uBright);
  vec2 p = vec2(sp.x * aspect, sp.y);
  // the ripples overhead keep moving
  float ceil = caustic(vec2(p.x * 4.0, p.y * 9.0 + t * 0.1), t) * smoothstep(0.78, 1.0, sp.y);
  col += vec3(0.8, 1.0, 0.95) * ceil * 0.18;
  // the rays sway and breathe
  float rays = 0.0;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float x = p.x + (1.0 - sp.y) * 0.32 - (0.45 + fi * 0.3 + 0.04 * sin(t * 0.21 + fi * 2.0)) * aspect;
    float w = 0.03 + 0.025 * fract(fi * 0.618);
    rays += exp(-x * x / (w * w)) * (0.5 + 0.5 * sin(t * (0.7 + fi * 0.13) + fi)) * smoothstep(0.1, 1.0, sp.y);
  }
  col += vec3(0.75, 1.0, 0.96) * rays * 0.07;
  // small bubbles rising and wobbling
  vec2 bp = vec2(p.x * 11.0, sp.y * 11.0 - t * 0.6);
  vec2 cell = floor(bp);
  vec2 h = hash2(cell);
  if (h.x > 0.8) {
    vec2 c = cell + vec2(0.5 + 0.25 * sin(t * 1.5 + h.y * 20.0), 0.5);
    float r = 0.04 + 0.08 * h.y;
    float dd = length(bp - c);
    col += vec3(0.9, 1.0, 1.0) * (smoothstep(r, r * 0.6, dd) - smoothstep(r * 0.7, r * 0.2, dd) * 0.6) * 0.45;
  }
  return col;
}

void main() {
  vec2 sp = vScreen;
  vec2 spx = sp * uRes;
  float t = uTime;
  // camera: screen pixel -> photo pixel (y down in the photo)
  vec2 rel = vec2(spx.x - uScreenFocus.x, (uRes.y - spx.y) - uScreenFocus.y) / uScale;
  vec2 px = uFocus + rel;
  vec3 above = surface(px, t);
  vec3 below = under(sp, t);
  // the dive: the water line rises up the screen with a moving, wavy edge and a bright meniscus
  float line = mix(-0.15, 1.2, uDive) + 0.025 * sin(sp.x * 9.0 + t * 1.8) + 0.012 * sin(sp.x * 23.0 - t * 2.6);
  float inWater = smoothstep(line + 0.01, line - 0.01, sp.y);
  float edge = exp(-pow((sp.y - line) / 0.012, 2.0));
  vec3 col = mix(above * mix(1.0, 0.75, uDive), below, inWater) + vec3(0.9, 1.0, 0.97) * edge * 0.6 * step(0.001, uDive) * step(uDive, 0.999);
  col *= mix(1.0, 0.34, uDark);
  // the ring, set into the water: cut-out frames of its turntable (transparent around it), over a soft warm light
  if (uRingFade > 0.001) {
    vec2 r = (vec2(spx.x, uRes.y - spx.y) - uRingC) / (uRingH * uRes.y);
    float glow = exp(-dot(r, r) * 7.0);
    col += vec3(1.0, 0.96, 0.9) * glow * 0.2 * uRingFade;
    vec2 ruv = vec2(r.x / uRingAspect + 0.5, r.y + 0.5);
    if (uRingReady > 0.5 && ruv.x > 0.0 && ruv.x < 1.0 && ruv.y > 0.0 && ruv.y < 1.0) {
      vec4 c = texture2D(uRing, ruv);
      // a little of the water's colour on the metal, as if seen through it
      vec3 fg = mix(c.rgb, c.rgb * vec3(0.9, 1.0, 1.0), 0.35);
      col = mix(col, fg, c.a * uRingFade);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface Film {
  setActive(on: boolean): void;
  dispose(): void;
}

/**
 * Starts the film on `canvas`. `frames` is the ring's turntable folder (NNN.webp), `cuts` the bottom row of the ring in
 * each frame (the floor reflection below is faded out). Calls onReady after the first frame is drawn.
 */
export function startFilm(
  canvas: HTMLCanvasElement,
  s: FilmState,
  opts: { frames: string; count: number; cuts?: number[]; small: boolean; onReady: () => void },
): Film | null {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  const sh = (type: number, src: string) => {
    const o = gl.createShader(type)!;
    gl.shaderSource(o, src);
    gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) ?? 'shader');
    return o;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const U: Record<string, WebGLUniformLocation | null> = {};
  const u = (n: string) => (U[n] ??= gl.getUniformLocation(prog, n));

  const texture = (unit: number, name: string) => {
    const tex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 120, 125, 255]));
    gl.uniform1i(u(name), unit);
    return tex;
  };
  const upload = (unit: number, tex: WebGLTexture, img: TexImageSource) => {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  };
  const tPhoto = texture(0, 'uPhoto');
  const tMask = texture(1, 'uMask');
  const tRing = texture(2, 'uRing');
  const tClosed = texture(3, 'uClosed');
  const tUnder = texture(4, 'uUnder');
  gl.activeTexture(gl.TEXTURE1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

  let disposed = false;
  let photoReady = false;
  const load = (src: string) =>
    new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });
  // the shut shell (the first picture) and the masks first; the open shell and the underwater picture right after
  Promise.all([load('/pearl-film/closed.webp'), load('/pearl-film/mask.png'), load('/pearl-film/photo.webp')])
    .then(([closed, mask, open]) => {
      if (disposed) return;
      upload(3, tClosed, closed);
      upload(1, tMask, mask);
      upload(0, tPhoto, open);
      photoReady = true;
      return load('/pearl-film/under.webp').then((u) => !disposed && upload(4, tUnder, u));
    })
    .catch(() => {});

  // the ring's turntable: fetched once the dive begins, drawn frame by frame as the scroll turns it
  const ringImgs: Array<HTMLImageElement | null> = new Array(opts.count).fill(null);
  let ringRequested = false;
  let ringShown = -1;
  const requestRing = () => {
    if (ringRequested) return;
    ringRequested = true;
    const order = Array.from({ length: opts.count }, (_, i) => i);
    let next = 0;
    const pump = () => {
      if (disposed || next >= order.length) return;
      const i = order[next++];
      load(`${opts.frames}/${String(i).padStart(3, '0')}.webp`)
        .then((img) => (ringImgs[i] = img))
        .catch(() => {})
        .finally(pump);
    };
    for (let k = 0; k < 4; k++) pump();
  };

  // adaptive sharpness: start at up to 1.5× (phones 1.25×) and step down if frames run slow
  let quality = Math.min(window.devicePixelRatio || 1, opts.small ? 1.25 : 1.5);
  let slow = 0;
  const resize = () => {
    const w = Math.max(1, Math.round(canvas.clientWidth * quality));
    const h = Math.max(1, Math.round(canvas.clientHeight * quality));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  };

  let raf = 0;
  let active = true;
  let readySent = false;
  let last = performance.now();
  const t0 = last;
  const mix = (a: number, b: number, k: number) => a + (b - a) * k;

  const frame = (now: number) => {
    raf = 0;
    if (!active || disposed) return;
    const dt = now - last;
    last = now;
    if (dt > 34 && dt < 200) slow++;
    else slow = Math.max(0, slow - 1);
    if (slow > 40 && quality > 0.6) {
      quality = Math.max(0.6, quality * 0.8);
      slow = 0;
    }
    resize();
    const W = canvas.width;
    const H = canvas.height;
    const small = W < H; // portrait screens: the shell in the middle, the words above, the card below

    // camera: "cover" fit, then in towards the pearl as `push` runs
    const cover = Math.max(W / PHOTO.w, H / PHOTO.h);
    const zoom = mix(1.0, small ? 1.45 : 1.75, s.push);
    const scale = cover * zoom;
    const start = small ? { x: PHOTO.pearl.x - 20, y: PHOTO.pearl.y } : { x: PHOTO.w / 2, y: PHOTO.h / 2 };
    const fx = mix(start.x, PHOTO.pearl.x, s.push);
    const fy = mix(start.y, PHOTO.pearl.y, s.push);
    const sfx = small ? W * 0.5 : mix(W * 0.5, W * 0.64, s.push);
    const sfy = small ? H * mix(0.6, 0.55, s.push) : H * 0.5;
    // keep the picture covering the screen
    const halfW = W / 2 / scale;
    const halfH = H / 2 / scale;
    const ox = (sfx - W / 2) / scale;
    const oy = (sfy - H / 2) / scale;
    const cfx = Math.min(Math.max(fx, halfW + ox), PHOTO.w - halfW + ox);
    const cfy = Math.min(Math.max(fy, halfH + oy), PHOTO.h - halfH + oy);

    if (s.dive > 0.01 || s.push > 0.6) requestRing();
    const ringH = small ? mix(0.34, 0.4, s.ring) : mix(0.52, 0.66, s.ring);
    const ringC = small ? { x: W * 0.5, y: H * mix(0.5, 0.4, s.dark) } : { x: W * mix(0.62, 0.36, s.dark), y: H * 0.5 };
    // the ring's frame for this much turn; the nearest one already loaded if that one is still on its way
    let idx = Math.min(opts.count - 1, Math.floor(s.turn * opts.count));
    if (!ringImgs[idx]) {
      let k = 1;
      while (k < opts.count && !ringImgs[(idx + k) % opts.count] && !ringImgs[(idx - k + opts.count) % opts.count]) k++;
      idx = ringImgs[(idx + k) % opts.count] ? (idx + k) % opts.count : (idx - k + opts.count) % opts.count;
    }
    if (ringImgs[idx] && idx !== ringShown) {
      upload(2, tRing, ringImgs[idx]!);
      ringShown = idx;
    }
    const cut = opts.cuts?.[ringShown] ?? 880;

    gl.uniform2f(u('uRes'), W, H);
    gl.uniform2f(u('uImg'), PHOTO.w, PHOTO.h);
    gl.uniform2f(u('uFocus'), cfx, cfy);
    gl.uniform2f(u('uScreenFocus'), sfx, sfy);
    gl.uniform1f(u('uScale'), scale);
    gl.uniform2f(u('uPearl'), PHOTO.pearl.x, PHOTO.pearl.y);
    gl.uniform1f(u('uPearlR'), PHOTO.pearl.r);
    gl.uniform1f(u('uTime'), (now - t0) / 1000);
    gl.uniform1f(u('uOpen'), s.open);
    gl.uniform1f(u('uDive'), s.dive);
    gl.uniform1f(u('uBright'), s.bright);
    gl.uniform1f(u('uDark'), s.dark);
    gl.uniform2f(u('uRingC'), ringC.x, ringC.y);
    gl.uniform1f(u('uRingH'), ringH);
    gl.uniform1f(u('uRingFade'), s.ring);
    gl.uniform1f(u('uRingAspect'), 720 / 880);
    gl.uniform1f(u('uRingCut'), cut / 880);
    gl.uniform1f(u('uRingReady'), ringShown >= 0 ? 1 : 0);
    gl.uniform1f(u('uSmall'), small ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (photoReady && !readySent) {
      readySent = true;
      opts.onReady();
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    setActive(on) {
      active = on;
      if (on && !raf && !disposed) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      [tPhoto, tMask, tRing, tClosed, tUnder].forEach((t) => gl.deleteTexture(t));
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
