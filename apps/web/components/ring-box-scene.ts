// The 3D scene behind <RingBox>: a pearl oyster modelled in three.js (owner, 10 Nov: an oyster rather than a box,
// like the shell in the logo). As the visitor scrolls, the shell opens on its hinge, the client's Filigree Crown ring
// rises out of the mother-of-pearl, the camera moves in and the ring turns a full 360°. The ring is the client's own
// turntable film (120 stills on white), drawn on a plane that multiplies onto the scene, so the white of the film
// disappears into the nacre and the ivory ground. Loaded on demand (dynamic import), so three.js never weighs on the
// first screen. Renders only when the scroll moves.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

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

/**
 * Per frame, the row (of 880) just below the ring. The film was shot on a glossy white floor: a faint reflection sits
 * under the ring, invisible on white but grey on the mother-of-pearl, so everything below this row is left out.
 * Measured from the stills (lowest row with gold in it, + 3 px).
 */
const RING_BOTTOM_ROW: Record<string, number[]> = {
  '/turntable/sp-jrp-01': [624,623,624,624,623,623,623,622,620,619,618,617,615,613,612,610,609,607,604,602,600,597,595,591,589,586,583,581,579,576,573,570,572,574,575,579,580,582,584,587,589,591,595,597,598,599,602,605,606,608,611,613,614,616,618,620,621,623,625,626,628,629,631,632,633,634,636,637,638,639,640,640,641,642,643,643,643,644,644,644,644,644,644,644,644,644,643,643,643,642,641,640,640,639,637,636,636,635,633,632,631,628,627,625,624,623,620,618,617,616,613,611,609,607,605,602,600,598,597,595],
};

// ---- the oyster's shape ------------------------------------------------------------------------------------------
const SPAN = THREE.MathUtils.degToRad(104); // half the fan angle either side of straight ahead
const RX = 1.12; // half-width
const RZ = 2.25; // hinge to front lip
const RIBS = 12;

/**
 * One valve of the shell as a surface over (s: hinge → lip, t: left → right). The outline is a rounded fan with a
 * gently scalloped lip; radial ribs run out from the hinge, fine growth lines run round it. `dome` > 0 bulges up
 * (the top valve), < 0 cups down (the bottom valve). Vertex colours carry the growth bands of the outside.
 */
function valve(dome: number, seg = { s: 48, t: 96 }) {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const light = new THREE.Color(0xa8998a);
  const dark = new THREE.Color(0x6e6153);
  const c = new THREE.Color();
  for (let i = 0; i <= seg.s; i++) {
    const s = i / seg.s;
    for (let j = 0; j <= seg.t; j++) {
      const t = j / seg.t;
      const a = mix(-SPAN, SPAN, t);
      const rib = Math.cos(a * RIBS * 1.25);
      const lip = 1 + 0.022 * rib * s; // gently scalloped edge
      const r = s * lip;
      // a rounded fan: widest a little forward of the middle
      const x = Math.sin(a) * RX * r * (1.02 - 0.12 * s);
      const z = Math.cos(a) * RZ * 0.5 * r + RZ * 0.5 * r * (1 - Math.abs(Math.sin(a)) * 0.15) - 0.02;
      const bulge = Math.sin(Math.PI * Math.pow(s, 0.85)) * (1 - 0.35 * (a / SPAN) ** 2);
      const y = dome * bulge + 0.016 * rib * s * Math.sign(dome || 1);
      pos.push(x, y, z);
      const band = 0.5 + 0.5 * Math.sin(s * 46 + Math.sin(a * 3) * 0.6);
      c.copy(dark).lerp(light, 0.35 + 0.45 * band * 0.8 + 0.2 * (0.5 + 0.5 * rib));
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
  const key = new THREE.DirectionalLight(0xfff0d8, 1.6);
  key.position.set(2.5, 5, 4);
  const rim = new THREE.DirectionalLight(0xdce4ff, 0.7);
  rim.position.set(-4, 3, -3);
  scene.add(key, rim, new THREE.HemisphereLight(0xfffaf0, 0xd9cdb3, 0.5));

  // ---- the oyster ----------------------------------------------------------------------------------------------
  const CUP = 0.42; // depth of the bottom valve
  const DOME = 0.3; // height of the top valve
  const LIFT = CUP + 0.05; // the shell rests just above its shadow (the ribs dip below the cup's depth)
  const outsideMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.5, side: THREE.BackSide });
  const insideMat = new THREE.MeshPhysicalMaterial({
    color: 0xe4ddd3,
    roughness: 0.12,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    iridescence: 1,
    iridescenceIOR: 1.7,
    iridescenceThicknessRange: [320, 880],
    sheen: 0.4,
    sheenColor: new THREE.Color(0xe9ddff),
    envMapIntensity: 1.1,
    side: THREE.FrontSide,
  });

  const shell = new THREE.Group();
  shell.position.set(0, LIFT, -RZ * 0.45);
  scene.add(shell);
  const geos: THREE.BufferGeometry[] = [];
  /** A valve: the same surface drawn twice, rough shell on one face and mother-of-pearl on the other. */
  const valveMesh = (dome: number) => {
    const g = valve(dome);
    geos.push(g);
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(g, outsideMat), new THREE.Mesh(g, insideMat));
    return grp;
  };
  shell.add(valveMesh(-CUP));
  // the top valve, hinged at the back point
  const hinge = new THREE.Group();
  shell.add(hinge);
  hinge.add(valveMesh(DOME));

  // a soft shadow under the shell
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 128;
  const sc = shadowCanvas.getContext('2d')!;
  const grad = sc.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(40,30,20,0.4)');
  grad.addColorStop(1, 'rgba(40,30,20,0)');
  sc.fillStyle = grad;
  sc.fillRect(0, 0, 128, 128);
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false });
  const shadowGeo = new THREE.PlaneGeometry(RX * 3.4, RZ * 1.6);
  geos.push(shadowGeo);
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, -LIFT + 0.002, RZ * 0.5);
  shell.add(shadow);

  // ---- the ring: the film on a plane ---------------------------------------------------------------------------
  // In the stills (720 × 880) the ring spans about 32–70 % of the height and 20–80 % of the width.
  const RW = 1.1;
  const RH = (RW * 880) / 720;
  const ringBottom = RH * (0.5 - 0.7); // plane-space y of the bottom of the shank
  const seatZ = RZ * 0.5; // the middle of the cup
  const yIn = -CUP * 0.55 - ringBottom; // seated in the cup
  const yHidden = yIn - 0.85; // down in the closed shell, out of sight
  const yOut = yIn + 0.95; // lifted clear of the lip
  // The film is used as it is (sRGB values straight to the screen) and multiplies onto what is behind it.
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  const cuts = RING_BOTTOM_ROW[frames];
  const ringMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, cutV: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    // fades to white (no effect) over ~18 px below the ring, so no edge shows where the floor reflection is cut
    fragmentShader: 'uniform sampler2D map; uniform float cutV; varying vec2 vUv; void main() { vec4 c = texture2D(map, vUv); float f = smoothstep(cutV + 0.004, cutV - 0.02, vUv.y); gl_FragColor = mix(c, vec4(1.0), f); }',
    transparent: true,
    blending: THREE.MultiplyBlending,
    premultipliedAlpha: true,
    depthWrite: false,
    toneMapped: false,
  });
  const ringGeo = new THREE.PlaneGeometry(RW, RH);
  geos.push(ringGeo);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(0, yHidden, seatZ);
  ring.renderOrder = 2;
  shell.add(ring);

  // An ivory veil just behind the ring: it rises as the shell goes, so the turning ring is left on the ivory ground.
  const veilMat = new THREE.MeshBasicMaterial({ color: IVORY, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const veilGeo = new THREE.PlaneGeometry(40, 40);
  geos.push(veilGeo);
  const veil = new THREE.Mesh(veilGeo, veilMat);
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
  // The rest, coarse to fine, once the shell has started to open.
  let loadingAll = false;
  const loadAll = () => {
    if (loadingAll) return;
    loadingAll = true;
    for (const step of [8, 4, 2, 1]) for (let i = step; i < count; i += step) load(i);
  };

  // ---- camera ----------------------------------------------------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  const tanV = Math.tan(THREE.MathUtils.degToRad(15));
  let dShell = 5;
  let dRing = 2.3;
  const target = new THREE.Vector3();
  const world = new THREE.Vector3();

  function resize() {
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const tanH = tanV * camera.aspect;
    // the open shell fits with air; then the ring fills ~42 % of the height or ~78 % of the width, whichever is
    // smaller on this screen (side-on, the ring spans ~80 % of the still's width: 0.92 wide, 0.51 high)
    dShell = Math.max(1.75 / tanV, (RX * 2 * 1.45) / 2 / tanH);
    dRing = Math.max(0.51 / 0.42 / 2 / tanV, 0.92 / 0.78 / 2 / tanH);
    render();
  }

  function render() {
    const p = progress;
    const open = span(p, ...STAGES.open);
    const rise = span(p, ...STAGES.rise);
    const lift = span(p, STAGES.rise[1] - 0.04, STAGES.closeIn[0] + 0.06); // up out of the shell, before it goes
    const close = span(p, ...STAGES.closeIn);
    if (open > 0.05) loadAll();

    hinge.rotation.x = -open * 1.15; // about 66°, as an oyster gapes
    shell.rotation.y = mix(-0.5, 0, span(p, 0, STAGES.open[1]));
    // once the ring is out, the shell sinks away below and the ring is left on the ivory ground
    const sink = span(p, STAGES.closeIn[0] + 0.05, STAGES.closeIn[1] - 0.02) * 3.4;
    shell.position.y = LIFT - sink;
    ring.position.y = mix(mix(yHidden, yIn, rise), yOut, lift) + sink;
    // the ring always faces the viewer (the film was shot from the front)
    ring.rotation.y = -shell.rotation.y;

    // camera: from three-quarters above the shell to eye level with the ring
    ring.updateWorldMatrix(true, false);
    ring.getWorldPosition(world);
    const ringCentre = world.y + RH * (0.5 - 0.51);
    const elev = THREE.MathUtils.degToRad(mix(28, 5, close));
    const dist = mix(dShell * (1 + 0.12 * open), dRing, close);
    target.set(mix(0, world.x, close), mix(mix(LIFT * 0.6, LIFT + 0.55, open), ringCentre, close), mix(0.1, world.z, close));
    camera.position.set(target.x, target.y + Math.sin(elev) * dist, target.z + Math.cos(elev) * dist);
    camera.lookAt(target);

    // the turn
    const turn = clamp((p - STAGES.turn[0]) / (STAGES.turn[1] - STAGES.turn[0]));
    const frame = Math.min(count - 1, Math.floor(turn * count));
    const img = imgs[frame]?.complete && imgs[frame].naturalWidth ? imgs[frame] : nearest(frame);
    if (img && img !== tex.image) {
      tex.image = img;
      tex.needsUpdate = true;
      const k = imgs.indexOf(img);
      ringMat.uniforms.cutV.value = cuts?.[k] ? 1 - cuts[k] / 880 : 0;
    }
    // out of sight until the shell opens (on a tall phone screen it could show below the closed shell)
    ring.visible = !!tex.image && open > 0.12;

    veilMat.opacity = span(p, STAGES.closeIn[0] + 0.01, STAGES.closeIn[0] + 0.1);
    veil.visible = veilMat.opacity > 0.001;
    veil.position.set(world.x, ringCentre, world.z - 0.08);
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
      [outsideMat, insideMat, ringMat, veilMat, shadowMat].forEach((m) => m.dispose());
      tex.dispose();
      shadowTex.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
