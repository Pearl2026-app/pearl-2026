// Builds the opening scene's 3D models as compressed GLB files (owner's brief, 10 Nov: "use actual 3D models in GLB
// format", "compressed GLB models"). Run from apps/web:  node scripts/ocean-models.mjs
//
// public/models/scallop.glb holds three meshes: "upper" and "lower" (the two valves of a scallop, each a ribbed fan
// with a scalloped lip and the two small "ears" at the hinge, with pink vertex colours) and "pearl". The scene keeps
// its own materials (nacre, iridescence, lustre) in code and takes only the shapes from the file. Shapes come from the
// same scallopValve() the scene falls back to, so the file and the fallback always match.
//
// Compression: vertices welded, positions/normals/colours quantised (KHR_mesh_quantization), then meshopt
// (EXT_meshopt_compression); drei/three decode it in the browser with no extra download.
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SHELL, scallopValve } from '../components/ocean/materials.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../public/models/scallop.glb');

/** The two small wings either side of the hinge, ridged across, in the valve's colours; they follow its dome. */
function ears(dome, side) {
  const nu = 14;
  const nv = 10;
  const pos = [];
  const col = [];
  const idx = [];
  const light = new THREE.Color(0xf2aeb0);
  const dark = new THREE.Color(0xd8707c);
  const c = new THREE.Color();
  for (let i = 0; i <= nu; i++) {
    const u = i / nu; // 0 at the hinge line, 1 at the wing's outer edge
    for (let j = 0; j <= nv; j++) {
      const v = j / nv; // along the hinge, away from the valve's centre
      const len = 0.46 * (1 - 0.35 * u); // the wing narrows towards its tip
      const x = side * (0.02 + v * len);
      const z = -0.04 + u * (0.3 + 0.12 * v);
      const ridge = Math.pow(Math.abs(Math.cos(u * 4.5 * Math.PI)), 2);
      const y = Math.sign(dome || 1) * (0.012 * ridge + 0.02 * (1 - v)) + dome * 0.06 * u;
      pos.push(x, y, z);
      c.copy(dark).lerp(light, 0.4 + 0.6 * ridge);
      col.push(c.r, c.g, c.b);
    }
  }
  const row = nv + 1;
  const flip = (dome < 0) !== (side < 0);
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < nv; j++) {
      const a = i * row + j;
      const b = a + row;
      if (flip) idx.push(a, b, a + 1, b, b + 1, a + 1);
      else idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function valve(dome) {
  const fan = scallopValve(dome, { s: 44, t: 132 });
  return mergeGeometries([fan, ears(dome, 1), ears(dome, -1)]);
}

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene('scallop');

function addMesh(name, geo) {
  const prim = doc.createPrimitive();
  for (const [attr, key] of [
    ['position', 'POSITION'],
    ['normal', 'NORMAL'],
    ['color', 'COLOR_0'],
  ]) {
    const a = geo.getAttribute(attr);
    if (!a) continue;
    prim.setAttribute(key, doc.createAccessor(`${name}-${key}`).setType('VEC3').setArray(new Float32Array(a.array)).setBuffer(buffer));
  }
  const index = geo.getIndex();
  prim.setIndices(doc.createAccessor(`${name}-index`).setType('SCALAR').setArray(new Uint32Array(index.array)).setBuffer(buffer));
  prim.setMaterial(doc.createMaterial(name).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.4).setMetallicFactor(0));
  const mesh = doc.createMesh(name).addPrimitive(prim);
  scene.addChild(doc.createNode(name).setMesh(mesh));
}

addMesh('lower', valve(-SHELL.cup));
addMesh('upper', valve(SHELL.dome));
addMesh('pearl', new THREE.SphereGeometry(1, 48, 32).deleteAttribute('uv'));

await MeshoptEncoder.ready;
doc.createExtension(KHRMeshQuantization).setRequired(true);
await doc.transform(weld(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));

mkdirSync(dirname(out), { recursive: true });
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await io.write(out, doc);
console.log(`wrote ${out} (${(statSync(out).size / 1024).toFixed(1)} KB)`);
