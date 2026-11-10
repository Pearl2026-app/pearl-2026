'use client';
// The opening scene's 3D (React Three Fiber). Loaded only after the page has painted (dynamic import from
// OceanHero), so three.js, R3F and GSAP cost the first screen nothing. One useFrame reads the scroll timeline's values
// and places everything: camera, shell, pearl, the ring film, rays and motes, so they always move together.
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerformanceMonitor } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {
  BACKDROP_FRAG,
  FILM_FRAG,
  FILM_VERT,
  MOTE_FRAG,
  MOTE_VERT,
  OCEAN_COLOURS as C,
  RAY_FRAG,
  RAY_VERT,
  SHELL,
  WATER_FRAG,
  WORLD_VERT,
  radialTexture,
  scallopValve,
} from './materials';
import type { OceanState } from './timeline';

export { createOceanTimeline, createOceanState, syncWithLenis } from './timeline';

const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ramp = (x: number, a: number, b: number) => clamp((x - a) / (b - a));

export interface OceanStageProps {
  state: OceanState;
  frames: string;
  count: number;
  cuts?: number[];
  active: boolean;
  small: boolean;
  onReady: () => void;
}

export default function OceanStage(props: OceanStageProps) {
  const max = props.small ? 1.5 : 2;
  const [dpr, setDpr] = useState(Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, props.small ? 1.25 : 1.75));
  return (
    <Canvas
      dpr={dpr}
      frameloop={props.active ? 'always' : 'never'}
      gl={{ antialias: !props.small, powerPreference: 'high-performance' }}
      camera={{ fov: 32, near: 0.05, far: 400, position: [0, 6, 4] }}
      onCreated={() => props.onReady()}
    >
      {/* Adaptive quality: lower the resolution when frames drop, raise it again when there is headroom. */}
      <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(1, d - 0.25))} onIncline={() => setDpr((d) => Math.min(max, d + 0.25))} />
      <Environment />
      <Scene {...props} />
    </Canvas>
  );
}

/** Soft studio reflections for the shell and the pearl, generated (no HDR download). */
function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Scene({ state: s, frames, count, cuts, small }: OceanStageProps) {
  const { camera, size } = useThree();
  const cam = camera as THREE.PerspectiveCamera;

  // ---- objects (built once, disposed on unmount) -------------------------------------------------------------------
  const built = useMemo(() => {
    const uniforms = {
      uCam: { value: new THREE.Vector3() },
      uUnder: { value: 0 },
      uDark: { value: 0 },
      uBright: { value: 0 },
      uTime: { value: 0 },
      uSkyHorizon: { value: C.skyHorizon },
      uSkyTop: { value: C.skyTop },
      uUnderTop: { value: C.underTop },
      uUnderDeep: { value: C.underDeep },
      uDeep: { value: C.deep },
      uShallow: { value: C.shallow },
    };
    const water = new THREE.ShaderMaterial({ uniforms, vertexShader: WORLD_VERT, fragmentShader: WATER_FRAG, side: THREE.DoubleSide, transparent: true, toneMapped: false });
    const backdrop = new THREE.ShaderMaterial({ uniforms, vertexShader: WORLD_VERT, fragmentShader: BACKDROP_FRAG, side: THREE.BackSide, depthWrite: false, toneMapped: false });
    const seg = small ? { s: 40, t: 110 } : { s: 56, t: 160 };
    const lower = scallopValve(-SHELL.cup, seg);
    const upper = scallopValve(SHELL.dome, seg);
    const outside = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, sheen: 0.5, sheenColor: new THREE.Color(0xffd0cc), clearcoat: 0.35, clearcoatRoughness: 0.4, envMapIntensity: 0.6, side: THREE.BackSide });
    const inside = new THREE.MeshPhysicalMaterial({
      color: 0xeea7a8,
      roughness: 0.18,
      envMapIntensity: 0.55,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      iridescence: 0.7,
      iridescenceIOR: 1.5,
      iridescenceThicknessRange: [300, 700],
      sheen: 0.6,
      sheenColor: new THREE.Color(0xffe6e4),
    });
    const pearl = new THREE.MeshPhysicalMaterial({
      color: 0xf6efe8,
      roughness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      iridescence: 0.55,
      iridescenceIOR: 1.45,
      iridescenceThicknessRange: [220, 520],
      sheen: 1,
      sheenColor: new THREE.Color(0xffd9d6),
      sheenRoughness: 0.35,
      envMapIntensity: 1.6,
      transparent: true,
    });
    const filmTex = new THREE.Texture();
    filmTex.colorSpace = THREE.NoColorSpace;
    filmTex.anisotropy = 4;
    const film = new THREE.ShaderMaterial({
      uniforms: { map: { value: filmTex }, cutV: { value: 0 }, fade: { value: 0 }, uTime: uniforms.uTime, uUnder: uniforms.uUnder },
      vertexShader: FILM_VERT,
      fragmentShader: FILM_FRAG,
      transparent: true,
      blending: THREE.MultiplyBlending,
      premultipliedAlpha: true,
      depthWrite: false,
      toneMapped: false,
    });
    // opaque across the ring's width (it multiplies onto light, not teal), then a short soft edge
    const glowTex = radialTexture([[0, 'rgba(255,253,248,1)'], [0.62, 'rgba(250,247,240,0.97)'], [0.84, 'rgba(236,247,244,0.38)'], [1, 'rgba(236,247,244,0)']]);
    const glow = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const rays = Array.from({ length: small ? 4 : 7 }, (_, k) => new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.uTime, uSeed: { value: k * 1.7 }, uOpacity: { value: 0 } },
      vertexShader: RAY_VERT,
      fragmentShader: RAY_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }));
    const n = small ? 70 : 170;
    const moteGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      pos.set([(Math.random() - 0.5) * 6, Math.random() * 6 - 4.5, (Math.random() - 0.4) * 4], k * 3);
      seed[k] = Math.random();
    }
    moteGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const motes = new THREE.ShaderMaterial({
      uniforms: { uTime: uniforms.uTime, uSize: { value: small ? 34 : 42 }, uPixelRatio: { value: 1 }, uOpacity: { value: 0 } },
      vertexShader: MOTE_VERT,
      fragmentShader: MOTE_FRAG,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    const geos = { plane: new THREE.PlaneGeometry(400, 400), sphere: new THREE.SphereGeometry(180, 32, 16), pearl: new THREE.SphereGeometry(1, small ? 40 : 64, small ? 30 : 48), quad: new THREE.PlaneGeometry(1, 1), ray: new THREE.PlaneGeometry(0.9, 7), lower, upper, moteGeo };
    return { uniforms, water, backdrop, outside, inside, pearl, film, filmTex, glow, glowTex, rays, motes, geos };
  }, [small]);
  // The shell and the pearl as 3D models (public/models/scallop.glb, built by scripts/ocean-models.mjs, meshopt-compressed).
  // Until the file arrives, or if it cannot be read, the same shapes are drawn from code.
  const [models, setModels] = useState<{ upper: THREE.BufferGeometry; lower: THREE.BufferGeometry; pearl: THREE.BufferGeometry } | null>(null);
  useEffect(() => {
    let live = true;
    let got: THREE.BufferGeometry[] = [];
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    loader
      .loadAsync('/models/scallop.glb')
      .then((gltf) => {
        gltf.scene.updateMatrixWorld(true);
        // The file stores quantised vertices with a scale/offset on each node: bake that back into plain floats.
        const geo = (name: string) => {
          const mesh = gltf.scene.getObjectByName(name) as THREE.Mesh | undefined;
          if (!mesh) return undefined;
          const g = mesh.geometry;
          for (const key of Object.keys(g.attributes)) {
            const a = g.getAttribute(key) as THREE.BufferAttribute;
            const f = new Float32Array(a.count * a.itemSize);
            for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k);
            g.setAttribute(key, new THREE.BufferAttribute(f, a.itemSize));
          }
          return g.applyMatrix4(mesh.matrixWorld);
        };
        const upper = geo('upper');
        const lower = geo('lower');
        const pearl = geo('pearl');
        gltf.scene.traverse((o) => {
          const m = (o as THREE.Mesh).material as THREE.Material | undefined;
          m?.dispose(); // the scene uses its own materials
        });
        if (!upper || !lower || !pearl) return;
        got = [upper, lower, pearl];
        if (live) setModels({ upper, lower, pearl });
        else got.forEach((g) => g.dispose());
      })
      .catch(() => {}); // keep the shapes drawn from code
    return () => {
      live = false;
      got.forEach((g) => g.dispose());
    };
  }, []);
  const shapes = { upper: models?.upper ?? built.geos.upper, lower: models?.lower ?? built.geos.lower, pearl: models?.pearl ?? built.geos.pearl };

  useEffect(
    () => () => {
      Object.values(built.geos).forEach((g) => g.dispose());
      [built.water, built.backdrop, built.outside, built.inside, built.pearl, built.film, built.glow, built.motes, ...built.rays].forEach((m) => m.dispose());
      built.filmTex.dispose();
      built.glowTex.dispose();
    },
    [built],
  );

  // ---- the ring film: 120 stills, loaded coarse to fine once the view starts to lower --------------------------------
  const imgs = useRef<HTMLImageElement[]>([]);
  const loadingAll = useRef(false);
  const load = (i: number) => {
    if (imgs.current[i]) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = `${frames}/${String(i).padStart(3, '0')}.webp`;
    imgs.current[i] = img;
  };
  useEffect(() => load(0), []); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = (img?: HTMLImageElement) => !!img && img.complete && img.naturalWidth > 0;

  // ---- refs ----------------------------------------------------------------------------------------------------------
  const shell = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const lowerValve = useRef<THREE.Group>(null);
  const hinge = useRef<THREE.Group>(null);
  const pearl = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const glow = useRef<THREE.Mesh>(null);
  const backdrop = useRef<THREE.Mesh>(null);
  const rays = useRef<THREE.Group>(null);
  const motes = useRef<THREE.Points>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const v = useMemo(() => ({ seat: new THREE.Vector3(), target: new THREE.Vector3(), tmp: new THREE.Vector3(), dir: new THREE.Vector3(), look: new THREE.Vector3() }), []);

  // Sizes, in world units. In the front still (frame 0) the pearl's centre is at 50 % across and 58.4 % down, and it is
  // ~19.5 % of the width across: the film is placed so its own pearl lands exactly on the 3D pearl.
  const PEARL_R = 0.3;
  const RW = 0.95;
  const RH = (RW * 880) / 720;
  const FILM_PEARL = { y: RH * (0.5 - 0.584), r: RW * 0.0975 };
  const SEAT_Z = SHELL.rz * 0.52;

  useFrame((st, delta) => {
    const t = st.clock.elapsedTime;
    const portrait = size.width / size.height < 0.9;
    const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const tanH = tanV * (size.width / size.height);
    const fit = (hw: number, hh: number) => Math.max(hh / tanV, hw / (tanH * (portrait ? 1 : 0.78)));
    if (s.horizon > 0.02 && !loadingAll.current) {
      loadingAll.current = true;
      for (const step of [8, 4, 2, 1]) for (let i = step; i < count; i += step) load(i);
    }

    // shell: floats and rocks; opens; its halves part
    const bob = Math.sin(t * 1.1) * 0.025 * (1 - s.dive * 0.6);
    shell.current!.position.set(0, SHELL.cup * 0.55 + 0.032 + bob, 0);
    shell.current!.rotation.set(Math.sin(t * 0.7) * 0.018, Math.sin(t * 0.5) * 0.02, Math.sin(t * 0.9) * 0.02);
    hinge.current!.rotation.x = -(s.open * 1.5 + s.part * 0.3);
    lowerValve.current!.position.y = -s.part * 0.06;
    shell.current!.updateMatrixWorld(true);

    // pearl: in the cup → out of the shell → down into the water, shrinking to the size of the ring's pearl
    // while the shell is shut the pearl sits a little lower and smaller, wholly inside it, and is not drawn at all
    const shut = 1 - ramp(s.open, 0, 0.5);
    v.seat.set(0, -SHELL.cup * 0.42 + PEARL_R * 0.92 - shut * 0.12, SEAT_Z).applyMatrix4(body.current!.matrixWorld);
    const yUnder = -1.5;
    const toFilm = Math.max(ramp(s.dive, 0.55, 1), s.settle);
    const p = pearl.current!;
    p.position.set(v.seat.x * (1 - s.dive), mix(v.seat.y + s.rise * 0.6, yUnder, s.dive) + Math.sin(t * 1.3) * 0.02 * s.rise * (1 - s.settle), mix(v.seat.z + s.rise * 0.2, 0.35, s.dive));
    p.scale.setScalar(mix(PEARL_R * (1 - 0.2 * shut), FILM_PEARL.r, toFilm));
    p.rotation.y = t * 0.15 + s.orbit;
    // the pearl hands over to the ring film's own pearl; if no frame of the film has arrived yet it simply stays
    built.pearl.opacity = built.filmTex.image ? 1 - ramp(s.settle, 0.4, 1) : 1;
    p.visible = built.pearl.opacity > 0.01 && s.open > 0.05;

    // the ring film, around the pearl
    const r = ring.current!;
    r.position.set(p.position.x, p.position.y - FILM_PEARL.y, p.position.z - 0.01);
    built.film.uniforms.fade.value = s.settle;
    const frame = Math.min(count - 1, Math.floor(s.turn * count));
    let img: HTMLImageElement | undefined = imgs.current[frame];
    if (!ready(img)) for (let d = 1; d < count && !ready(img); d++) img = [imgs.current[frame - d], imgs.current[frame + d]].find(ready);
    if (img && built.filmTex.image !== img) {
      built.filmTex.image = img;
      built.filmTex.needsUpdate = true;
      const k = imgs.current.indexOf(img);
      built.film.uniforms.cutV.value = cuts?.[k] ? 1 - cuts[k] / 880 : 0;
    }
    r.visible = !!built.filmTex.image && s.settle > 0.001;

    // camera: from high above, circling the shell, down to the horizon, under the surface, close to the ring
    const ringCentreY = r.position.y + RH * (0.5 - 0.51);
    // the open shell's top half stands up behind: frame its full height
    const dTop = fit(SHELL.rx * 1.55, mix(SHELL.rz * 0.95, SHELL.rz * 1.25, s.open)) * (1.35 - 0.3 * s.approach);
    const dSide = fit(SHELL.rx * 1.5, 1.35);
    const dRing = fit(0.95, 0.75) * (1 - 0.16 * s.forward);
    const dist = mix(mix(dTop, dSide, s.horizon), dRing, ramp(s.dive, 0.3, 1));
    const elev = THREE.MathUtils.degToRad(mix(mix(64, 4, s.horizon), -3, s.dive));
    const az = mix(-0.45, 0.3, s.orbit) * (1 - s.horizon);
    const ty = mix(mix(mix(0.05, 0.45, s.open), 0.75, s.horizon), ringCentreY, s.dive);
    // layout: words on the left (wide) or top (phones) → scene right / lower; card on the right / bottom at the end
    const shiftX = portrait ? 0 : mix(-0.26, 0.3, s.dark) * dist * tanH;
    const shiftY = portrait ? mix(0.12, -0.2, s.dark) * dist * tanV : 0;
    v.target.set(shiftX, ty + shiftY, mix(0, 0.35, s.dive));
    const px = st.pointer.x * 0.06 * (portrait ? 0 : 1);
    const py = st.pointer.y * 0.04 * (portrait ? 0 : 1);
    cam.position.set(v.target.x + Math.sin(az) * Math.cos(elev) * dist + px, v.target.y + Math.sin(elev) * dist + py, v.target.z + Math.cos(az) * Math.cos(elev) * dist);
    cam.lookAt(v.target);
    const under = clamp((0.08 - cam.position.y) / 0.16);

    // the film and its glow face the viewer
    r.lookAt(v.look.copy(cam.position).setY(r.position.y));
    const g = glow.current!;
    cam.getWorldDirection(v.dir);
    g.position.set(r.position.x, ringCentreY, r.position.z).addScaledVector(v.dir, 0.06);
    g.quaternion.copy(cam.quaternion);
    g.scale.setScalar(1.35);
    built.glow.opacity = ramp(s.dive, 0.4, 1) * 0.92;
    g.visible = built.glow.opacity > 0.001;

    // under the water: light shafts and motes; the light cools; the water brightens, then darkens for the close
    built.rays.forEach((m) => (m.uniforms.uOpacity.value = under * 0.6 * (1 - s.dark * 0.4)));
    rays.current!.visible = under > 0.01;
    rays.current!.children.forEach((m) => (m.rotation.y = Math.atan2(cam.position.x - m.position.x, cam.position.z - m.position.z)));
    built.motes.uniforms.uOpacity.value = s.light * mix(0.35, 0.9, under);
    built.motes.uniforms.uPixelRatio.value = st.gl.getPixelRatio();
    motes.current!.position.y = mix(1.2, 0, under);
    sun.current!.intensity = mix(1.8, 1.1, under);

    const u = built.uniforms;
    u.uTime.value = t;
    u.uCam.value.copy(cam.position);
    u.uUnder.value = under;
    u.uBright.value = s.bright * (1 - s.dark);
    u.uDark.value = s.dark;
    backdrop.current!.position.copy(cam.position);
    void delta;
  });

  const ray = (k: number) => ({ x: (k - (built.rays.length - 1) / 2) * 0.95 + Math.sin(k * 7.1) * 0.4, z: -1.2 - (k % 3) * 0.9 });
  return (
    <>
      <directionalLight ref={sun} position={[3, 6, 4]} intensity={1.8} color={0xfff3e2} />
      <hemisphereLight args={[0xeaf6ff, 0x0f5a5a, 0.7]} />
      <mesh ref={backdrop} geometry={built.geos.sphere} material={built.backdrop} renderOrder={-1} />
      <mesh geometry={built.geos.plane} material={built.water} rotation-x={-Math.PI / 2} renderOrder={1} />
      <group ref={shell}>
        <group ref={body} position-z={-SHELL.rz * 0.5}>
          <group ref={lowerValve}>
            <mesh geometry={shapes.lower} material={built.outside} />
            <mesh geometry={shapes.lower} material={built.inside} />
          </group>
          <group ref={hinge}>
            <mesh geometry={shapes.upper} material={built.outside} />
            <mesh geometry={shapes.upper} material={built.inside} />
          </group>
        </group>
      </group>
      <mesh ref={pearl} geometry={shapes.pearl} material={built.pearl} renderOrder={5} />
      <mesh ref={glow} geometry={built.geos.quad} material={built.glow} renderOrder={3} />
      <mesh ref={ring} material={built.film} renderOrder={4} scale={[RW, RH, 1]} geometry={built.geos.quad} />
      <group ref={rays}>
        {built.rays.map((m, k) => (
          <mesh key={k} geometry={built.geos.ray} material={m} position={[ray(k).x, -3.4, ray(k).z]} rotation-z={(k - 3) * 0.06} />
        ))}
      </group>
      <points ref={motes} geometry={built.geos.moteGeo} material={built.motes} />
    </>
  );
}
