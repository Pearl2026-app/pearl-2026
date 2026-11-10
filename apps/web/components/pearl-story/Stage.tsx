'use client';
// The 3D pearl farm and its story (owner, 10 Nov: "real 3D animation"): a sunrise lagoon with rows of floats riding the
// waves and a farm boat; under the surface, ropes and nets of oysters swaying in the current, shafts of light and
// drifting motes; a net lifted through the surface; an oyster floated up and opened on its hinge; its pearl rising and
// settling into the real Filigree Crown ring (its turntable photographs, cut out), which turns as the visitor scrolls.
// One useFrame reads the scroll progress and the chosen version's keyframes. Loaded only after the visitor's first move.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { FARM, SHELL_AT, type StoryVersion, type V3 } from './versions';
import {
  MOTE_FRAG,
  MOTE_VERT,
  PALETTE,
  RAY_FRAG,
  RAY_VERT,
  SEABED_FRAG,
  SEABED_VERT,
  SKY_FRAG,
  SKY_VERT,
  WATER_FRAG,
  WATER_VERT,
  boatHull,
  closedOyster,
  glowTexture,
  mistTexture,
  netTexture,
  oysterValve,
  ridge,
  waveHeight,
  waveSlope,
} from './world';

export interface StageProps {
  version: StoryVersion;
  progress: { current: number };
  frames: string;
  count: number;
  active: boolean;
  small: boolean;
  onReady: () => void;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
const span = (p: number, [a, b]: [number, number]) => smooth((p - a) / (b - a));
const mix = THREE.MathUtils.lerp;
const OYSTER_SCALE = 0.16;
const SCALLOP_SCALE = 0.13;
const PEARL_R = 0.032;
const RING_ASPECT = 720 / 880;
const FOG_ABOVE = new THREE.Color(0xeac3b8);
const FOG_UNDER = new THREE.Color(0x0e6b70);

export default function Stage(props: StageProps) {
  const post = !props.small && !(typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('fx') === '0');
  return (
    <Canvas
      dpr={props.small ? [1, 1.25] : [1, 1.6]}
      frameloop={props.active ? 'always' : 'never'}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      camera={{ fov: 38, near: 0.02, far: 900, position: [-3.6, 1.5, 4] }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      <Environment />
      <Farm {...props} />
      {post && (
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={0.35} luminanceThreshold={1.0} luminanceSmoothing={0.15} />
          <Vignette offset={0.32} darkness={0.5} />
        </EffectComposer>
      )}
    </Canvas>
  );
}

/** Reflections for the floats, the shells and the pearl: a soft generated room, no download. */
function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const env = pm.fromScene(room, 0.04).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      room.dispose();
      pm.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Farm({ version, progress, frames, count, small, onReady }: StageProps) {
  const { camera, scene, size } = useThree();
  const cam = camera as THREE.PerspectiveCamera;

  // ---- everything built once ---------------------------------------------------------------------------------------
  const b = useMemo(() => {
    const rows = small ? FARM.rows.slice(1, 6) : FARM.rows;
    const buoysPerRow = small ? 34 : 60;
    const sunU = { uSun: { value: PALETTE.sun }, uSkyLow: { value: PALETTE.skyLow }, uSkyHigh: { value: PALETTE.skyHigh }, uSunGlow: { value: PALETTE.sunGlow } };
    const sky = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { ...sunU, uUnder: { value: 0 }, uDark: { value: 0 }, uUnderTop: { value: PALETTE.underTop }, uUnderDeep: { value: PALETTE.underDeep } },
    });
    const water = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: {
        ...sunU,
        uTime: { value: 0 },
        uDark: { value: 0 },
        uClear: { value: 0 },
        uClearC: { value: new THREE.Vector2(SHELL_AT[0], SHELL_AT[2]) },
        uSea: { value: PALETTE.sea },
        uSeaDeep: { value: PALETTE.seaDeep },
        uUnderTop: { value: PALETTE.underTop },
        uUnderDeep: { value: PALETTE.underDeep },
      },
    });
    const waterGeo = new THREE.PlaneGeometry(320, 320, small ? 110 : 220, small ? 110 : 220).rotateX(-Math.PI / 2);
    const hills = [
      { geo: ridge(520, 18, 1.3), z: -260, colour: 0xd9b7ad },
      { geo: ridge(420, 13, 4.1), z: -200, colour: 0xa9ab9e },
      { geo: ridge(360, 9, 7.7), z: -160, colour: 0x7d9688 },
    ].map((h) => ({ ...h, mat: new THREE.MeshBasicMaterial({ color: h.colour, fog: true }) }));
    const mistTex = mistTexture();
    const mist = new THREE.MeshBasicMaterial({ map: mistTex, transparent: true, depthWrite: false, fog: false, opacity: 0.55 });

    // floats: white, a little worn, riding the waves
    const buoyGeo = new THREE.SphereGeometry(0.17, small ? 14 : 20, small ? 10 : 14);
    const buoyMat = new THREE.MeshStandardMaterial({ color: 0xf3efe9, roughness: 0.38, metalness: 0, envMapIntensity: 0.8 });
    const buoys = new THREE.InstancedMesh(buoyGeo, buoyMat, rows.length * buoysPerRow);
    buoys.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const buoyAt: Array<[number, number]> = [];
    rows.forEach((x) => {
      for (let k = 0; k < buoysPerRow; k++) buoyAt.push([x, FARM.buoyStart - k * FARM.buoyStep]);
    });
    // the line joining each row's floats, at the surface
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x6f6252, roughness: 0.9 });
    const rowLen = buoysPerRow * FARM.buoyStep;
    const rowRopes = rows.map((x) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, rowLen, 5).rotateX(Math.PI / 2), ropeMat);
      m.position.set(x, 0.02, FARM.buoyStart - rowLen / 2);
      return m;
    });

    // hangers under the floats: a rope down, two nets of oysters on it
    const hangers: Array<{ x: number; z: number; phase: number; hero: boolean }> = [];
    FARM.hangerRows.forEach((ri) => {
      for (let k = 0; k < FARM.hangersPerRow; k++) {
        const buoy = 1 + k * FARM.hangerEvery;
        hangers.push({ x: FARM.rows[ri], z: FARM.buoyStart - buoy * FARM.buoyStep, phase: ri * 1.7 + k * 0.9, hero: ri === FARM.hero.row && buoy === FARM.hero.buoy });
      }
    });
    const lineGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 4).translate(0, -0.5, 0);
    const lines = new THREE.InstancedMesh(lineGeo, ropeMat, hangers.length);
    const netTex = netTexture();
    const netMat = new THREE.MeshStandardMaterial({ map: netTex, transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, roughness: 0.9 });
    const netGeo = new THREE.PlaneGeometry(0.62, 0.82);
    const nets = new THREE.InstancedMesh(netGeo, netMat, hangers.length * 2);
    const oysterGeo = closedOyster(small ? { r: 10, a: 28 } : { r: 16, a: 44 });
    const oysterMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    const oysters = new THREE.InstancedMesh(oysterGeo, oysterMat, hangers.length * 2 * 6);
    [lines, nets, oysters].forEach((m) => m.instanceMatrix.setUsage(THREE.DynamicDrawUsage));

    // the hero oyster: two valves on a hinge, nacre inside, and its pearl
    const outside = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.FrontSide });
    const nacre = new THREE.MeshPhysicalMaterial({
      color: 0xe2cfcc,
      roughness: 0.24,
      metalness: 0.05,
      iridescence: 1,
      iridescenceIOR: 1.6,
      iridescenceThicknessRange: [260, 620],
      clearcoat: 0.6,
      side: THREE.BackSide,
      envMapIntensity: 0.75,
    });
    const topGeo = oysterValve(0.17, { r: 40, a: 110 }, 1.3);
    const botGeo = oysterValve(-0.27, { r: 40, a: 110 }, 2.1);
    const pearlMat = new THREE.MeshPhysicalMaterial({
      color: 0xf8f2ec,
      roughness: 0.1,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      iridescence: 0.45,
      iridescenceIOR: 1.5,
      sheen: 0.6,
      sheenColor: new THREE.Color(0xffd9e1),
      envMapIntensity: 1.5,
      transparent: true,
    });
    const pearlGeo = new THREE.SphereGeometry(1, 48, 32);
    const heroNetGeo = new THREE.PlaneGeometry(0.62, 0.82);

    const boatGeo = boatHull();
    const boatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });

    // under the surface: shafts of light and motes
    const rays = Array.from({ length: small ? 4 : 7 }, (_, i) =>
      new THREE.ShaderMaterial({
        vertexShader: RAY_VERT,
        fragmentShader: RAY_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uSeed: { value: i * 1.37 }, uOpacity: { value: 0 } },
      }),
    );
    const rayGeo = new THREE.PlaneGeometry(1.3, 7).translate(0, -3.5, 0);
    const moteCount = small ? 90 : 220;
    const motePos = new Float32Array(moteCount * 3);
    const moteSeed = new Float32Array(moteCount);
    for (let i = 0; i < moteCount; i++) {
      motePos.set([1.0 + (Math.random() - 0.5) * 6, -Math.random() * 5, -9 + (Math.random() - 0.5) * 8], i * 3);
      moteSeed[i] = Math.random();
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(moteSeed, 1));
    const motes = new THREE.ShaderMaterial({
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSize: { value: small ? 26 : 38 }, uOpacity: { value: 0 } },
    });

    // the ring: a card of its photographs (cut out) facing the camera; a soft light behind it
    const ringTex = new THREE.Texture();
    ringTex.colorSpace = THREE.SRGBColorSpace;
    const ringMat = new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
    const ringGeo = new THREE.PlaneGeometry(RING_ASPECT, 1);
    const glowMat = new THREE.MeshBasicMaterial({
      map: glowTexture([
        [0, 'rgba(255,246,232,0.9)'],
        [0.5, 'rgba(255,240,225,0.35)'],
        [1, 'rgba(255,240,225,0)'],
      ]),
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const glowGeo = new THREE.PlaneGeometry(1, 1);
    const fog = new THREE.FogExp2(new THREE.Color(0xf0dbd4), 0.0065);
    // the shallows' sandy bottom under the scallop, and the scallop's materials (its shape comes from the GLB model)
    const seabed = new THREE.ShaderMaterial({ vertexShader: SEABED_VERT, fragmentShader: SEABED_FRAG, transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uDark: { value: 0 } } });
    const seabedGeo = new THREE.PlaneGeometry(22, 22).rotateX(-Math.PI / 2);
    const shellOut = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0, envMapIntensity: 0.7, side: THREE.FrontSide });
    const shellIn = new THREE.MeshPhysicalMaterial({
      color: 0xf2c3c3,
      roughness: 0.2,
      iridescence: 0.8,
      iridescenceIOR: 1.5,
      iridescenceThicknessRange: [200, 500],
      clearcoat: 0.5,
      side: THREE.BackSide,
      envMapIntensity: 0.8,
    });

    return {
      rows, sky, water, waterGeo, hills, mist, mistTex, buoyGeo, buoyMat, buoys, buoyAt, ropeMat, rowRopes, hangers, lineGeo, lines, netTex, netMat, netGeo, nets,
      oysterGeo, oysterMat, oysters, outside, nacre, topGeo, botGeo, pearlMat, pearlGeo, heroNetGeo, boatGeo, boatMat, rays, rayGeo, moteGeo, motes, ringTex, ringMat, ringGeo, glowMat, glowGeo, fog, seabed, seabedGeo, shellOut, shellIn,
    };
  }, [small]);

  useEffect(() => {
    scene.fog = b.fog;
    return () => {
      scene.fog = null;
      const all: Array<{ dispose: () => void }> = [
        b.sky, b.water, b.waterGeo, b.mist, b.mistTex, b.buoyGeo, b.buoyMat, b.buoys, b.ropeMat, b.lineGeo, b.lines, b.netTex, b.netMat, b.netGeo, b.nets, b.oysterGeo, b.oysterMat, b.oysters,
        b.outside, b.nacre, b.topGeo, b.botGeo, b.pearlMat, b.pearlGeo, b.heroNetGeo, b.boatGeo, b.boatMat, b.rayGeo, b.moteGeo, b.motes, b.ringTex, b.ringMat, b.ringGeo, b.glowMat, b.glowGeo, b.seabed, b.seabedGeo, b.shellOut, b.shellIn,
        ...b.rays, ...b.hills.flatMap((h) => [h.geo, h.mat]), ...b.rowRopes.map((r) => r.geometry),
      ];
      all.forEach((x) => x.dispose());
    };
  }, [b, scene]);

  // ---- the scallop (public/models/scallop.glb, meshopt-compressed), for the Shell & Sea story --------------------
  const scallopStory = version.hero === 'scallop';
  const shell = useRef<{ upper: THREE.BufferGeometry; lower: THREE.BufferGeometry } | null>(null);
  const shellGroup = useRef<THREE.Group>(null);
  const shellTop = useRef<THREE.Group>(null);
  useEffect(() => {
    if (!scallopStory) return;
    let live = true;
    new GLTFLoader()
      .setMeshoptDecoder(MeshoptDecoder)
      .loadAsync('/models/scallop.glb')
      .then((gltf) => {
        gltf.scene.updateMatrixWorld(true);
        // the file stores quantised vertices with a scale/offset on each node: bake that back into plain floats
        const geo = (name: string) => {
          const mesh = gltf.scene.getObjectByName(name) as THREE.Mesh | undefined;
          if (!mesh) return null;
          const g = mesh.geometry;
          for (const key of Object.keys(g.attributes)) {
            const a = g.getAttribute(key) as THREE.BufferAttribute;
            const f = new Float32Array(a.count * a.itemSize);
            const get = [a.getX, a.getY, a.getZ, a.getW]; // these undo the normalised (quantised) storage
            for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = get[k].call(a, i);
            g.setAttribute(key, new THREE.BufferAttribute(f, a.itemSize));
          }
          return g.applyMatrix4(mesh.matrixWorld);
        };
        const upper = geo('upper');
        // the upper valve's faces point inwards in the file: turn them so its painted outside faces out
        if (upper?.index) {
          const ix = upper.index.array as Uint32Array | Uint16Array;
          for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
          upper.index.needsUpdate = true;
          upper.computeVertexNormals();
        }
        const lower = geo('lower');
        if (!live || !upper || !lower || !shellGroup.current || !shellTop.current) return;
        shell.current = { upper, lower };
        const add = (parent: THREE.Object3D, g: THREE.BufferGeometry) => {
          parent.add(new THREE.Mesh(g, b.shellOut), new THREE.Mesh(g, b.shellIn));
        };
        add(shellGroup.current, lower);
        add(shellTop.current, upper);
      })
      .catch(() => {});
    return () => {
      live = false;
      shell.current?.upper.dispose();
      shell.current?.lower.dispose();
    };
  }, [scallopStory, b]);

  // ---- the ring's photographs, fetched when the story nears its end -----------------------------------------------
  const ring = useRef({ imgs: [] as Array<HTMLImageElement | null>, asked: false, shown: -1 });
  const askRing = () => {
    const r = ring.current;
    if (r.asked) return;
    r.asked = true;
    r.imgs = new Array(count).fill(null);
    let next = 0;
    const pump = () => {
      if (next >= count) return;
      const i = next++;
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        r.imgs[i] = img;
        pump();
      };
      img.onerror = () => pump();
      img.src = `${frames}/${String(i).padStart(3, '0')}.webp`;
    };
    for (let k = 0; k < 4; k++) pump();
  };

  // ---- the camera path: a smooth curve through the version's keys ---------------------------------------------------
  const path = useMemo(() => {
    const v = (a: V3) => new THREE.Vector3(...a);
    return {
      keys: version.cam.map((k) => k.p),
      pos: new THREE.CatmullRomCurve3(version.cam.map((k) => v(k.pos)), false, 'centripetal'),
      look: new THREE.CatmullRomCurve3(version.cam.map((k) => v(k.look)), false, 'centripetal'),
    };
  }, [version]);
  const curveT = (p: number) => {
    const k = path.keys;
    let i = 0;
    while (i < k.length - 2 && p > k[i + 1]) i++;
    const local = smooth((p - k[i]) / (k[i + 1] - k[i]));
    return (i + local) / (k.length - 1);
  };

  const refs = {
    hero: useRef<THREE.Group>(null),
    top: useRef<THREE.Group>(null),
    pearl: useRef<THREE.Mesh>(null),
    heroNet: useRef<THREE.Mesh>(null),
    boat: useRef<THREE.Mesh>(null),
    ring: useRef<THREE.Mesh>(null),
    glow: useRef<THREE.Mesh>(null),
    sun: useRef<THREE.DirectionalLight>(null),
    hemi: useRef<THREE.HemisphereLight>(null),
    mist: useRef<THREE.Mesh>(null),
    rays: useRef<THREE.Group>(null),
  };
  const tmp = useMemo(
    () => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), s: new THREE.Vector3(), p: new THREE.Vector3(), a: new THREE.Vector3(), c: new THREE.Vector3(), look: new THREE.Vector3(), fwd: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), target: new THREE.Vector3(), panel: new THREE.Vector3() }),
    [],
  );
  const ready = useRef(false);
  const hills = useRef<Array<THREE.Mesh | null>>([]);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const p = progress.current;
    const V = version;
    const lift = span(p, V.lift);
    const float = span(p, V.float);
    const open = span(p, V.open);
    const rise = span(p, V.rise);
    const land = span(p, V.land);
    const ringIn = span(p, V.ring);
    const turn = clamp01((p - V.turn[0]) / (V.turn[1] - V.turn[0]));
    const dark = span(p, V.dark);
    if (p > V.lift[0] - 0.1) askRing();

    // camera
    const u = curveT(p);
    path.pos.getPoint(u, tmp.p);
    path.look.getPoint(u, tmp.look);
    // a breath of hand-held drift
    tmp.p.x += Math.sin(t * 0.31) * 0.02;
    tmp.p.y += Math.sin(t * 0.47) * 0.012;
    cam.position.copy(tmp.p);
    cam.lookAt(tmp.look);
    cam.aspect = size.width / size.height;
    cam.fov = size.width < size.height ? 52 : 38;
    cam.updateProjectionMatrix();
    const under = clamp01((0.04 - cam.position.y) / 0.12);

    // sky, water, fog and light, above and below
    b.sky.uniforms.uUnder.value = under;
    b.sky.uniforms.uDark.value = dark;
    b.water.uniforms.uTime.value = t;
    b.water.uniforms.uDark.value = dark;
    b.water.uniforms.uClear.value = scallopStory ? 1 : 0;
    b.seabed.uniforms.uTime.value = t;
    b.seabed.uniforms.uDark.value = dark;
    b.fog.color.copy(FOG_ABOVE).lerp(FOG_UNDER, under).multiplyScalar(1 - dark * 0.65);
    b.fog.density = mix(0.0065, 0.16, under);
    if (refs.sun.current) refs.sun.current.intensity = mix(2.4, 1.1, under) * (1 - dark * 0.6);
    if (refs.hemi.current) refs.hemi.current.intensity = mix(0.6, 1.2, under) * (1 - dark * 0.5);
    b.rays.forEach((m, i) => {
      m.uniforms.uTime.value = t;
      m.uniforms.uOpacity.value = under * (0.07 + 0.03 * Math.sin(i));
    });
    b.motes.uniforms.uTime.value = t;
    b.motes.uniforms.uOpacity.value = under * 0.8;
    if (refs.rays.current) {
      refs.rays.current.visible = under > 0.01;
      refs.rays.current.position.set(cam.position.x - 1.0, 0, cam.position.z + 6.5); // the light falls around the camera, wherever it is
    }
    if (refs.mist.current) {
      (refs.mist.current.material as THREE.MeshBasicMaterial).map!.offset.x = t * 0.004;
      refs.mist.current.visible = under < 0.5;
    }
    hills.current.forEach((h) => h && (h.visible = under < 0.5)); // not seen through the surface from below

    // floats riding the waves
    b.buoyAt.forEach(([x, z], i) => {
      const [dx, dz] = waveSlope(x, z, t);
      tmp.e.set(dz * 0.8, 0, -dx * 0.8);
      tmp.q.setFromEuler(tmp.e);
      tmp.m.compose(tmp.a.set(x, waveHeight(x, z, t) + 0.08, z), tmp.q, tmp.s.set(1, 0.92, 1));
      b.buoys.setMatrixAt(i, tmp.m);
    });
    b.buoys.instanceMatrix.needsUpdate = true;

    // hangers swaying in the current; the hero net leaves its rope as it is lifted
    let ni = 0;
    let oi = 0;
    b.hangers.forEach((h, i) => {
      const top = waveHeight(h.x, h.z, t) - 0.05;
      const sway = Math.sin(t * 0.6 + h.phase) * 0.06;
      const swayZ = Math.sin(t * 0.43 + h.phase * 1.3) * 0.04;
      const depth = h.hero ? mix(2.9, 0.4, lift) : 2.9;
      tmp.e.set(swayZ, 0, sway);
      tmp.q.setFromEuler(tmp.e);
      tmp.m.compose(tmp.a.set(h.x, top, h.z), tmp.q, tmp.s.set(1, depth, 1));
      b.lines.setMatrixAt(i, tmp.m);
      FARM.panelDepths.forEach((d, k) => {
        const isHero = h.hero && k === 0;
        const yy = d;
        // the point on the swaying rope at this depth
        tmp.c.set(Math.sin(sway) * -yy, top + yy * Math.cos(sway), Math.sin(swayZ) * yy);
        const px = h.x + tmp.c.x;
        const py = tmp.c.y;
        const pz = h.z + tmp.c.z;
        if (isHero) {
          tmp.panel.set(px, py, pz);
          tmp.m.makeScale(0, 0, 0); // drawn as its own mesh
        } else {
          tmp.e.set(swayZ, 0.25 * Math.sin(h.phase + k), sway);
          tmp.q.setFromEuler(tmp.e);
          tmp.m.compose(tmp.a.set(px, py - 0.41, pz), tmp.q, tmp.s.set(1, 1, 1));
        }
        b.nets.setMatrixAt(ni++, tmp.m);
        for (let j = 0; j < 6; j++) {
          const ox = ((j % 2) - 0.5) * 0.26;
          const oy = -0.16 - Math.floor(j / 2) * 0.24;
          if (isHero) {
            // the hero net's other oysters go up with it; slot 2 is the hero oyster, drawn on its own
            const net = refs.heroNet.current;
            if (j === 2 || !net || !net.visible) tmp.m.makeScale(0, 0, 0);
            else {
              tmp.e.set(Math.PI / 2 + 0.2 * Math.sin(j), 0.3 * j, 0);
              tmp.q.setFromEuler(tmp.e);
              tmp.m.compose(tmp.a.set(net.position.x + ox, net.position.y + 0.41 + oy, net.position.z + 0.04), tmp.q, tmp.s.setScalar(0.1 + 0.015 * Math.sin(j * 3)));
            }
          } else {
            tmp.e.set(Math.PI / 2 + 0.2 * Math.sin(j + h.phase), 0.3 * j, sway);
            tmp.q.setFromEuler(tmp.e);
            tmp.m.compose(tmp.a.set(px + ox, py + oy, pz + 0.04), tmp.q, tmp.s.setScalar(0.1 + 0.015 * Math.sin(j * 3 + h.phase)));
          }
          b.oysters.setMatrixAt(oi++, tmp.m);
        }
      });
    });
    b.lines.instanceMatrix.needsUpdate = true;
    b.nets.instanceMatrix.needsUpdate = true;
    b.oysters.instanceMatrix.needsUpdate = true;

    // the hero net: on its rope, then lifted up through the surface
    const heroX = FARM.rows[FARM.hero.row];
    const heroZ = FARM.buoyStart - FARM.hero.buoy * FARM.buoyStep;
    const surfaceY = waveHeight(heroX, heroZ, t);
    const netY = mix(tmp.panel.y, surfaceY + 0.32, lift);
    if (refs.heroNet.current) {
      refs.heroNet.current.position.set(mix(tmp.panel.x, heroX, lift), netY - 0.41 * (1 - lift) + 0.0 * lift, mix(tmp.panel.z, heroZ, lift));
      refs.heroNet.current.rotation.set(-lift * 0.25, 0, Math.sin(t * 0.6) * 0.05 * (1 - lift));
      refs.heroNet.current.visible = !scallopStory && (float < 0.999 || p < V.float[1]);
    }

    // the hero oyster: in its net, then floated to the surface where it rides the swell and opens
    const hero = refs.hero.current;
    if (hero) {
      // its place in the net: slot 2 (left, middle row)
      const inNet = tmp.a.set((refs.heroNet.current?.position.x ?? heroX) - 0.13, (refs.heroNet.current?.position.y ?? netY) + 0.41 - 0.4, (refs.heroNet.current?.position.z ?? heroZ) + 0.05);
      const fx = FARM.float.x;
      const fz = FARM.float.z;
      const fy = waveHeight(fx, fz, t) + 0.1;
      const arc = Math.sin(Math.PI * float) * 0.35;
      // once the ring takes over, the shell slips back under the water
      hero.position.set(mix(inNet.x, fx, float), mix(inNet.y, fy, float) + arc - ringIn * 0.4, mix(inNet.z, fz, float));
      const [dx, dz] = waveSlope(fx, fz, t);
      // upright against the net, flat on the water; facing the camera's side with its hinge away
      // its lip towards the camera, so the open shell shows its nacre and the pearl
      hero.rotation.set(mix(Math.PI / 2, dz * 0.6, float), mix(0.3, -0.4, float), mix(0, -dx * 0.6, float));
      hero.scale.setScalar(OYSTER_SCALE);
      hero.visible = !scallopStory;
    }
    if (refs.top.current) refs.top.current.rotation.x = -open * 1.15;
    const sg = shellGroup.current;
    if (sg) {
      const [sx, , sz] = SHELL_AT;
      const [dx, dz] = waveSlope(sx, sz, t);
      sg.visible = scallopStory;
      sg.position.set(sx, waveHeight(sx, sz, t) + 0.035, sz);
      sg.rotation.set(dz * 0.7 + 0.04, 0.15 + Math.sin(t * 0.2) * 0.04, -dx * 0.7);
      sg.scale.setScalar(SCALLOP_SCALE);
      if (shellTop.current) shellTop.current.rotation.x = -open * 1.0;
    }

    // the pearl: in the shell, rises, then moves to where the ring's pearl will be
    const pearl = refs.pearl.current;
    if (pearl && hero) {
      hero.updateMatrixWorld();
      const holder = scallopStory && sg ? sg : hero;
      holder.updateMatrixWorld();
      const seat = scallopStory ? tmp.c.set(0, 0.02, 0.95).applyMatrix4(holder.matrixWorld) : tmp.c.set(0, 0.0, 0.55).applyMatrix4(holder.matrixWorld);
      const lifted = tmp.a.copy(seat).add(tmp.up.set(0, (scallopStory ? 0.12 : 0.16) * rise + Math.sin(t * 1.2) * 0.006 * rise, 0));
      if (scallopStory && V.sink) {
        // the pearl slips into the water and sinks, the camera following it down
        const k = span(p, V.sink);
        const [sx, , sz] = SHELL_AT;
        tmp.panel.set(sx, -0.62 + Math.sin(t * 0.9) * 0.01, sz - 0.6);
        lifted.lerp(tmp.panel, k);
      }
      // the ring's card: in front of the camera, to the right on wide screens, above the card on phones
      cam.getWorldDirection(tmp.fwd);
      tmp.right.crossVectors(tmp.fwd, cam.up).normalize();
      tmp.up.crossVectors(tmp.right, tmp.fwd).normalize();
      const d = 1.0;
      const viewH = 2 * d * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const viewW = viewH * cam.aspect;
      const portrait = size.width < size.height;
      const H = portrait ? viewH * 0.36 : viewH * mix(0.56, 0.64, ringIn);
      const offX = portrait ? 0 : viewW * mix(0.14, -0.14, dark);
      const offY = portrait ? viewH * mix(0.02, 0.14, dark) : 0;
      const centre = tmp.target.copy(cam.position).addScaledVector(tmp.fwd, d).addScaledVector(tmp.right, offX).addScaledVector(tmp.up, offY);
      if (refs.ring.current) {
        refs.ring.current.position.copy(centre);
        refs.ring.current.quaternion.copy(cam.quaternion);
        refs.ring.current.scale.setScalar(H);
        b.ringMat.opacity = ringIn;
        refs.ring.current.visible = ringIn > 0.001;
      }
      if (refs.glow.current) {
        refs.glow.current.position.copy(centre).addScaledVector(tmp.fwd, 0.02);
        refs.glow.current.quaternion.copy(cam.quaternion);
        refs.glow.current.scale.setScalar(H * 1.5);
        b.glowMat.opacity = ringIn * 0.55;
      }
      // the ring's pearl in frame 0: 50% across, 58.4% down, 19.5% of the width across
      const ringPearl = tmp.s.copy(centre).addScaledVector(tmp.up, H * (0.5 - 0.584));
      pearl.position.copy(lifted).lerp(ringPearl, land);
      pearl.scale.setScalar(mix(PEARL_R, H * RING_ASPECT * 0.0975, land));
      b.pearlMat.opacity = 1 - smooth((ringIn - 0.5) / 0.5);
      pearl.visible = b.pearlMat.opacity > 0.01 && (open > 0.04 || land > 0); // shut, it is hidden inside
    }

    // the ring's frame for this much turn (the nearest one already here, if that one is still coming)
    const r = ring.current;
    if (r.imgs.length) {
      let idx = Math.min(count - 1, Math.floor(turn * count));
      if (!r.imgs[idx]) {
        let k = 1;
        while (k < count && !r.imgs[(idx + k) % count] && !r.imgs[(idx - k + count) % count]) k++;
        idx = r.imgs[(idx + k) % count] ? (idx + k) % count : (idx - k + count) % count;
      }
      if (r.imgs[idx] && idx !== r.shown) {
        b.ringTex.image = r.imgs[idx];
        b.ringTex.needsUpdate = true;
        r.shown = idx;
      }
    }

    // the boat rocks on the swell
    const boat = refs.boat.current;
    if (boat) {
      const { x, z, yaw } = FARM.boat;
      const [dx, dz] = waveSlope(x, z, t);
      boat.position.set(x, waveHeight(x, z, t) - 0.12, z);
      boat.rotation.set(dz * 0.7, yaw, -dx * 0.9);
    }

    if (!ready.current) {
      ready.current = true;
      requestAnimationFrame(onReady);
    }
    void dt;
  });

  const heroX = FARM.rows[FARM.hero.row];
  const heroZ = FARM.buoyStart - FARM.hero.buoy * FARM.buoyStep;
  return (
    <>
      <hemisphereLight ref={refs.hemi} args={[0xfbe7df, 0x2f8f8a, 0.6]} />
      <directionalLight ref={refs.sun} position={[PALETTE.sun.x * 50, PALETTE.sun.y * 50 + 6, PALETTE.sun.z * 50]} color={0xffe2c4} intensity={2.4} />
      <mesh material={b.sky} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[600, 32, 16]} />
      </mesh>
      {b.hills.map((h, i) => (
        <mesh key={h.z} ref={(m) => void (hills.current[i] = m)} geometry={h.geo} material={h.mat} position={[20, 0, h.z]} />
      ))}
      <mesh ref={refs.mist} material={b.mist} position={[10, 3, -120]}>
        <planeGeometry args={[260, 14]} />
      </mesh>
      <mesh geometry={b.waterGeo} material={b.water} position={[0, 0, -40]} renderOrder={2} frustumCulled={false} />
      <primitive object={b.buoys} />
      {b.rowRopes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
      <primitive object={b.lines} />
      <primitive object={b.nets} />
      <primitive object={b.oysters} />
      <mesh ref={refs.heroNet} geometry={b.heroNetGeo} material={b.netMat} position={[heroX, -1.7, heroZ]} />
      <group ref={refs.hero}>
        <mesh geometry={b.botGeo} material={b.outside} />
        <mesh geometry={b.botGeo} material={b.nacre} />
        <group ref={refs.top}>
          <mesh geometry={b.topGeo} material={b.outside} />
          <mesh geometry={b.topGeo} material={b.nacre} />
        </group>
      </group>
      <mesh ref={refs.pearl} geometry={b.pearlGeo} material={b.pearlMat} renderOrder={10} />
      {scallopStory && <mesh geometry={b.seabedGeo} material={b.seabed} position={[SHELL_AT[0], -1.25, SHELL_AT[2] - 2]} renderOrder={1} />}
      <group ref={shellGroup} visible={false}>
        <group ref={shellTop} />
      </group>
      <mesh ref={refs.boat} geometry={b.boatGeo} material={b.boatMat} />
      <group ref={refs.rays}>
        {b.rays.map((m, i) => (
          <mesh key={i} geometry={b.rayGeo} material={m} position={[-1 + i * 0.9, 0, -9 - (i % 3) * 1.4]} rotation={[0.18, 0.4 * i, 0.22]} />
        ))}
        <points geometry={b.moteGeo} material={b.motes} frustumCulled={false} />
      </group>
      <mesh ref={refs.glow} geometry={b.glowGeo} material={b.glowMat} renderOrder={20} frustumCulled={false} />
      <mesh ref={refs.ring} geometry={b.ringGeo} material={b.ringMat} renderOrder={21} frustumCulled={false} />
    </>
  );
}
