import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { MeshBasicNodeMaterial, texture, attribute, float, clamp, vec2, vec3 } from "three/tsl";

// 1) Inputs you already have
// geometry: cortical mesh geometry (positions + index)
// eigenvector: Float32Array length N (one value per vertex)
const geometry = /* your BufferGeometry */;
const eigenvector = /* Float32Array(N) */;

// 2) Add a per-vertex vertexId attribute (needed to index your eigenvector texture)
const N = geometry.attributes.position.count;
const vertexId = new Float32Array(N);
for (let i = 0; i < N; i++) vertexId[i] = i;
geometry.setAttribute("vertexId", new THREE.BufferAttribute(vertexId, 1));

// 3) Upload eigenvector as a 1D texture (N × 1), sampled with nearest
//    Store as float RGBA for simplicity; put value in R channel.
const evRGBA = new Float32Array(N * 4);
for (let i = 0; i < N; i++) {
  evRGBA[4 * i + 0] = eigenvector[i];
  evRGBA[4 * i + 1] = 0;
  evRGBA[4 * i + 2] = 0;
  evRGBA[4 * i + 3] = 1;
}
const evTex = new THREE.DataTexture(evRGBA, N, 1, THREE.RGBAFormat, THREE.FloatType);
evTex.needsUpdate = true;
evTex.magFilter = THREE.NearestFilter;
evTex.minFilter = THREE.NearestFilter;
evTex.wrapS = THREE.ClampToEdgeWrapping;
evTex.wrapT = THREE.ClampToEdgeWrapping;

// 4) Build a coolwarm LUT texture (256 × 1). (Simple hardcoded approximation.)
function coolwarm(t) {
  // t in [0,1]; returns [r,g,b]
  // Simple smooth diverging ramp (not a perfect scientific coolwarm, but sufficient for minimal demo).
  const x = 2 * t - 1;              // [-1,1]
  const a = Math.abs(x);
  const r = x > 0 ? 1 : 1 - a;
  const b = x < 0 ? 1 : 1 - a;
  const g = 1 - 0.6 * a;
  return [r, g, b];
}
const LUTW = 256;
const lutRGBA = new Float32Array(LUTW * 4);
for (let i = 0; i < LUTW; i++) {
  const t = i / (LUTW - 1);
  const [r, g, b] = coolwarm(t);
  lutRGBA[4 * i + 0] = r;
  lutRGBA[4 * i + 1] = g;
  lutRGBA[4 * i + 2] = b;
  lutRGBA[4 * i + 3] = 1;
}
const lutTex = new THREE.DataTexture(lutRGBA, LUTW, 1, THREE.RGBAFormat, THREE.FloatType);
lutTex.needsUpdate = true;
lutTex.magFilter = THREE.LinearFilter;
lutTex.minFilter = THREE.LinearFilter;
lutTex.wrapS = THREE.ClampToEdgeWrapping;
lutTex.wrapT = THREE.ClampToEdgeWrapping;

// 5) Min/max for normalization (one-time CPU pass; simplest possible)
let vmin = Infinity, vmax = -Infinity;
for (let i = 0; i < N; i++) {
  const v = eigenvector[i];
  if (v < vmin) vmin = v;
  if (v > vmax) vmax = v;
}
const denom = Math.max(vmax - vmin, 1e-12);

// 6) TSL material: read eigenvector at this vertex, normalize, then sample LUT
const mat = new MeshBasicNodeMaterial();

// vertexId attribute as float
const vid = attribute("vertexId");

// sample eigenvector texture at u = (vertexId + 0.5)/N
const uEV = (vid.add(0.5)).div(float(N));
const evSample = texture(evTex, vec2(uEV, 0.5)).r;

// normalize to [0,1]
const tNorm = clamp(evSample.sub(float(vmin)).div(float(denom)), 0.0, 1.0);

// sample coolwarm LUT
const rgb = texture(lutTex, vec2(tNorm, 0.5)).rgb;

// output color
mat.colorNode = vec3(rgb);

// 7) Standard three.js setup (WebGPU renderer)
const renderer = new WebGPURenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 1000);
camera.position.set(0, 0, 3);

const mesh = new THREE.Mesh(geometry, mat);
scene.add(mesh);

function animate() {
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
