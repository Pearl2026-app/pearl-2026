// The 3D scene behind <RingBox>: a navy velvet ring box modelled in three.js. As the visitor scrolls, the lid opens,
// the client's Filigree Crown ring rises out of the ivory cushion, the camera moves in and the ring turns a full
// 360°. The ring is the client's own turntable film (120 stills on white), drawn on a plane that multiplies onto the
// scene, so the white of the film disappears into the cushion and the ivory ground. Loaded on demand (dynamic import),
// so three.js never weighs on the first screen. Renders only when the scroll moves.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const IVORY = 0xf7f3e9;
const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** 0 → 1 between two points of the scroll, eased. */
const span = (p: number, from: number, to: number) => ease(clamp((p - from) / (to - from)));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

// The scroll script (0 = section pinned, 1 = section leaving).
export const STAGES = { open: [0.04, 0.28], rise: [0.14, 0.34], closeIn: [0.34, 0.52], turn: [0.52, 0.96] } as const;

export interface RingBoxScene {
  update(progress: number): void;
  resize(): void;
  dispose(): void;
}

export function createRingBoxScene(host: HTMLElement, opts: { frames: string; count: number }): RingBoxScene {
  const { frames, count } = opts;
  const src = (i: number) => `${frames}/${String(i).padStart(3, '0')}.webp`;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(IVORY, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  const key = new THREE.DirectionalLight(0xfff0d8, 1.7);
  key.position.set(2.5, 5, 4);
  const rim = new THREE.DirectionalLight(0xdce4ff, 0.7);
  rim.position.set(-4, 3, -3);
  scene.add(key, rim, new THREE.HemisphereLight(0xfffaf0, 0xd9cdb3, 0.45));

  // ---- the box -------------------------------------------------------------------------------------------------
  const W = 2.0; // width
  const D = 1.9; // depth
  const BH = 0.95; // base height
  const LH = 0.5; // lid height
  const R = 0.12; // corner radius
  const IN = 0.05; // lining inset: thin navy rims, so the ring rises past light satin

  const velvet = new THREE.MeshPhysicalMaterial({
    // darker than the brand navy (#070E4D) because the lights lift it: lit, it reads as that navy
    color: 0x040838,
    roughness: 0.95,
    envMapIntensity: 0.2,
    sheen: 0.55,
    sheenColor: new THREE.Color(0x1a2766),
    sheenRoughness: 0.5,
  });
  const satin = new THREE.MeshPhysicalMaterial({ color: 0xe6d9c1, roughness: 0.62, envMapIntensity: 0.45, sheen: 0.6, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.3 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xcaa253, metalness: 1, roughness: 0.26 });

  const box = new THREE.Group();
  scene.add(box);
  const geos: THREE.BufferGeometry[] = [];
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
    geos.push(g);
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    return o;
  };

  box.add(mesh(new RoundedBoxGeometry(W, BH, D, 4, R), velvet, 0, BH / 2, 0));
  // a fine gold line at the seam
  box.add(mesh(new RoundedBoxGeometry(W + 0.008, 0.02, D + 0.008, 2, 0.01), gold, 0, BH - R - 0.05, 0)); // on the wall, below the rounded edge
  // the lining and the two cushion rolls, with the ring's slit between them
  box.add(mesh(new RoundedBoxGeometry(W - IN * 2, 0.04, D - IN * 2, 2, 0.02), satin, 0, BH + 0.002, 0));
  const rollR = 0.2;
  const rollGeo = new THREE.CapsuleGeometry(rollR, W - IN * 2 - rollR * 2 - 0.02, 8, 28);
  rollGeo.rotateZ(Math.PI / 2);
  box.add(mesh(rollGeo, satin, 0, BH + 0.05, rollR + 0.004));
  box.add(mesh(rollGeo, satin, 0, BH + 0.05, -rollR - 0.004));

  // the lid, hinged at the back edge
  const hinge = new THREE.Group();
  hinge.position.set(0, BH, -D / 2);
  box.add(hinge);
  hinge.add(mesh(new RoundedBoxGeometry(W, LH, D, 4, R), velvet, 0, LH / 2, D / 2));
  hinge.add(mesh(new RoundedBoxGeometry(W - IN * 2, 0.04, D - IN * 2, 2, 0.02), satin, 0, -0.004, D / 2));
  hinge.add(mesh(new RoundedBoxGeometry(W + 0.008, 0.02, D + 0.008, 2, 0.01), gold, 0, R + 0.05, D / 2));
  hinge.add(mesh(new RoundedBoxGeometry(0.22, 0.1, 0.05, 2, 0.02), gold, 0, 0.07, D + 0.005)); // the clasp

  // a soft shadow under the box
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const sc = shadowCanvas.getContext('2d')!;
  const grad = sc.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(40,30,20,0.42)');
  grad.addColorStop(1, 'rgba(40,30,20,0)');
  sc.fillStyle = grad;
  sc.fillRect(0, 0, 128, 128);
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  const shadow = mesh(
    new THREE.PlaneGeometry(W * 2.1, D * 2.1),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }),
    0,
    0.002,
    0,
  );
  shadow.rotation.x = -Math.PI / 2;
  box.add(shadow);

  // ---- the ring: the film on a plane ---------------------------------------------------------------------------
  // In the stills (720 × 880) the ring spans about 32–70 % of the height and 20–80 % of the width.
  const RW = 1.1;
  const RH = (RW * 880) / 720;
  const ringBottom = RH * (0.5 - 0.7); // plane-space y of the bottom of the shank
  const yIn = BH + 0.14 - ringBottom; // seated: shank down in the slit
  const yHidden = yIn - 0.78; // below the lining, before the lid opens
  const yOut = yIn + 0.62; // lifted clear of the cushion
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const ringMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    blending: THREE.MultiplyBlending,
    premultipliedAlpha: true,
    depthWrite: false,
    toneMapped: false,
  });
  const ring = mesh(new THREE.PlaneGeometry(RW, RH), ringMat, 0, yHidden, 0);
  ring.renderOrder = 2;
  box.add(ring);

  // An ivory veil just behind the ring: it rises as the box goes, so the turning ring is left on the ivory ground
  // and never passes over navy (the film multiplies onto what is behind it).
  const veilMat = new THREE.MeshBasicMaterial({ color: IVORY, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const veil = mesh(new THREE.PlaneGeometry(40, 40), veilMat);
  veil.renderOrder = 1;
  scene.add(veil);

  const imgs: HTMLImageElement[] = [];
  let progress = 0;
  const nearest = (i: number) => {
    for (let d = 0; d < count; d++) {
      for (const k of [i - d, i + d]) {
        const img = imgs[(k + count) % count];
        if (img?.complete && img.naturalWidth) return img;
      }
    }
    return null;
  };
  const load = (i: number) => {
    if (imgs[i]) return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => render();
    img.src = src(i);
    imgs[i] = img;
  };
  load(0);
  // The rest, coarse to fine, once the box has started to open.
  let loadingAll = false;
  const loadAll = () => {
    if (loadingAll) return;
    loadingAll = true;
    for (const step of [8, 4, 2, 1]) for (let i = step; i < count; i += step) load(i);
  };

  // ---- camera ----------------------------------------------------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const tanV = Math.tan(THREE.MathUtils.degToRad(15));
  let dBox = 5;
  let dRing = 2.3;
  const target = new THREE.Vector3();

  function resize() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const tanH = tanV * camera.aspect;
    // the open box (about 2.6 high, 2.6 wide with air) fits; then the ring fills ~42 % of the height or ~72 % of
    // the width, whichever is smaller on this screen
    dBox = Math.max(1.9 / tanV, (W * 1.45) / 2 / tanH);
    // (side-on, the ring spans ~80 % of the still's width: 0.88 wide, 0.51 high)
    dRing = Math.max(0.51 / 0.42 / 2 / tanV, 0.92 / 0.78 / 2 / tanH);
    render();
  }

  function render() {
    const p = progress;
    const open = span(p, ...STAGES.open);
    const rise = span(p, ...STAGES.rise);
    const lift = span(p, STAGES.rise[1] - 0.04, STAGES.closeIn[0] + 0.06); // up out of the cushion, before the box goes
    const close = span(p, ...STAGES.closeIn);
    if (open > 0.05) loadAll();

    hinge.rotation.x = -open * 1.9; // about 109°
    box.rotation.y = mix(-0.55, 0, span(p, 0, STAGES.open[1]));
    // once the ring is out, the box sinks away below and the ring is left on the ivory ground
    const sink = span(p, STAGES.closeIn[0] + 0.05, STAGES.closeIn[1] - 0.02) * 3.8;
    box.position.y = -sink;
    ring.position.y = mix(mix(yHidden, yIn, rise), yOut, lift) + sink;
    // the ring always faces the viewer (the film was shot from the front)
    ring.rotation.y = -box.rotation.y;

    // camera: from three-quarters above the box to eye level with the ring
    const elev = THREE.MathUtils.degToRad(mix(24, 5, close));
    const dist = mix(dBox * (1 + 0.18 * open), dRing, close);
    const ringCentre = ring.position.y - sink + RH * (0.5 - 0.51);
    // as the lid opens, the view rises with it so the open lid stays in frame
    target.set(0, mix(mix(BH * 0.85, BH + 0.85, open), ringCentre, close), 0);
    camera.position.set(0, target.y + Math.sin(elev) * dist, Math.cos(elev) * dist);
    camera.lookAt(target);

    // the turn
    const turn = clamp((p - STAGES.turn[0]) / (STAGES.turn[1] - STAGES.turn[0]));
    const frame = Math.min(count - 1, Math.floor(turn * count));
    const img = imgs[frame]?.complete && imgs[frame].naturalWidth ? imgs[frame] : nearest(frame);
    if (img && img !== tex.image) {
      tex.image = img;
      tex.needsUpdate = true;
    }
    ring.visible = !!tex.image;

    veilMat.opacity = span(p, STAGES.closeIn[0] + 0.01, STAGES.closeIn[0] + 0.1);
    veil.visible = veilMat.opacity > 0.001;
    veil.position.set(0, ring.position.y - sink, -0.08);
    veil.quaternion.copy(camera.quaternion);
    renderer.render(scene, camera);
  }

  return {
    update(p: number) {
      progress = p;
      render();
    },
    resize,
    dispose() {
      geos.forEach((g) => g.dispose());
      [velvet, satin, gold, ringMat, veilMat, shadow.material as THREE.Material].forEach((m) => m.dispose());
      tex.dispose();
      shadowTex.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
