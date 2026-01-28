
# Design Document: Spectral Heat + Surface Advection Viewer (Three.js WebGPU)

**Data source:** `data/bunny_spectral.json` + `data/bunny_spectral.bin`
**Goal:** Integrate an interactive “spectral heat” and “Eulerian surface advection” particle visualization into an existing Three.js viewer (lighting, camera, orbit controls, picking already present).

## 1) Scope and non-goals

### In scope

* Load MATLAB-exported spectral package (`.json` manifest + `.bin` packed arrays).
* Create WebGPU buffers for mesh and spectral bases.
* Implement compute pipeline to:

  1. compute spectral coefficients from a selected vertex + diffusion time,
  2. synthesize face velocity field from gradient basis,
  3. advect particles over the surface using face-walk.
* Render mesh + particles with two-color styling similar to the Three.js attractor demo.
* Provide GUI controls for: source vertex, diffusion time, speed, particle count, K modes (active), pause.

### Non-goals (for this phase)

* Zarr/HDF5 selective reading.
* Multiple meshes / dataset switching.
* Helmholtz–Hodge decomposition or vortices.
* Parallel transport transport operators (you are using Eulerian face sampling).

---

## 2) Data contract (what comes from MATLAB export)

The loader must treat the manifest as authoritative. Each entry has: `name`, `dtype`, `shape`, `count`, `byteOffset`.

### Required buffers

* `V` float32, shape `[nV, 3]` — vertex positions.
* `F` uint32, shape `[nF, 3]` — triangle indices (0-based).
* `centroids` float32, shape `[nF, 3]` — face centroids (precomputed).
* `faceNormals` float32, shape `[nF, 3]` — unit face normals (precomputed).
* `faceNeighbors` int32, shape `[nF, 3]` — neighbor face ids (0-based), `-1` for boundary.
* `neighborEdge` uint8, shape `[nF, 3]` — neighbor edge index in neighbor face (0..2).
* `lambda` float32, shape `[K, 1]` — eigenvalues.
* `psiKV` float32, shape `[K, nV]` — eigenvectors, mode-major.
* `gradPsi_CKF` float32, shape `[3, K, nF]` — gradient basis, component-major (x,y,z), mode-major within face.

### Indexing conventions (MUST be coded once and never changed)

Let `K` and `nV`, `nF` come from manifest.

#### psiKV: shape [K x nV], stored column-major in MATLAB, but exported flattened

Your exporter explicitly documents:

* `psi(k,v) = psiKV[k + K*v]` (k in 0..K-1, v in 0..nV-1)

#### gradPsi_CKF: shape [3 x K x nF], exported as a flat float32 vector

Your exporter explicitly documents:

* `grad(c,k,f) = gradPsi_CKF[c + 3*(k + K*f)]`

  * `c=0` → x, `c=1` → y, `c=2` → z
  * `k` in 0..K-1
  * `f` in 0..nF-1

### Tangent projection flag

Manifest includes:

* `flags.gradPsiTangentProjected` (boolean).
  If true: you may assume grad basis is tangent to each face. If false: you must project on GPU or accept drift.

---

## 3) Runtime mathematics (compute model)

### 3.1 Coefficients for a selected source vertex

Given selected vertex `s` and diffusion time `t`:
[
coeff[k] = \exp(-\lambda_k , t), \psi_k(s)
]
We will compute `coeff[k]` on GPU each time `(s,t,Kactive)` changes.

### 3.2 Face velocity field synthesis from gradient basis

Velocity per face:
[
U_f = -\sum_{k=1}^{Kactive} coeff[k] , \nabla \psi_k \big|_f
]
Where `∇ψ_k|_f` comes from `gradPsi_CKF`.

You will synthesize `U_face[f]` each time `coeff` changes (or at a throttled rate).

### 3.3 Particle advection (Eulerian sampling + face-walk)

Particle state:

* `faceId` (uint32)
* barycentric coordinates (b1,b2) float32; b0 = 1 - b1 - b2
* optionally `age` float32 for respawn and styling

At each step:

1. sample `U = U_face[faceId]` (world-space tangent vector)
2. convert world-space vector to barycentric coordinate rates inside current face
3. update barycentric by `dt * speed * rates`
4. if barycentric leaves triangle, cross the appropriate edge into neighbor face using `faceNeighbors` + `neighborEdge`, and remap barycentric accordingly
5. write updated state and optionally compute world position for rendering

This preserves surface adherence without needing parallel transport.

---

## 4) Integration architecture (flat src/, not overly modular)

To match your preference:

* Keep code files flat: `src/`
* Keep one compute implementation file with multiple functions.
* Keep one data loader function.
* Keep one integration entrypoint used by your existing viewer.

### Minimal file set

1. `src/loadBctSpectralPackage.js`
2. `src/bctCompute.js`  (all compute pipeline creation + dispatch functions)
3. `src/bctParticlesRender.js` (particle render object + styling updates)
4. `src/initBctSpectralFlow.js` (wires loader + compute + render into existing viewer)

Optionally:
5) `src/bctGui.js` (if you want GUI separate; otherwise embed in init file)

This is “not too modular” while still separating responsibilities.

---

## 5) Detailed implementation instructions

## 5.1 `loadBctSpectralPackage.js`

### Responsibilities

* `fetch()` JSON manifest.
* `fetch()` BIN as `ArrayBuffer`.
* Create typed array views for each dataset using `byteOffset`, `count`, `dtype`.
* Validate that required datasets exist and shapes match.
* Return a single object with:

  * `meta` (schema, nV, nF, K, flags)
  * `arrays` (TypedArrays keyed by dataset name)
  * `shapes` (shape arrays keyed by dataset name)

### Required loader behavior

* Treat offsets as bytes from start of `.bin`
* Do not copy large buffers unnecessarily (create views)
* `uint8` arrays can be unaligned in file; your exporter aligns to 4 bytes anyway

### Pseudocode outline

* map dtype to TypedArray constructor
* for each manifest buffer:

  * compute `byteLength = count * bytesPerElement(dtype)`
  * create typed array view on the shared ArrayBuffer

### Output example

```js
{
  meta: { schema, nV, nF, K, flags, layouts },
  arrays: { V, F, centroids, faceNormals, faceNeighbors, neighborEdge, lambda, psiKV, gradPsi_CKF },
  shapes: { V:[nV,3], ... }
}
```

---

## 5.2 `bctCompute.js` (single compute file with multiple functions)

This file contains:

* `createBctGpuResources(renderer, pkg, params)`
* `createComputePipelines(device, resources)`
* `dispatchComputeFrame(renderer, resources, pipelines, params, dt)`

### 5.2.1 GPU buffers (resource creation)

Create GPU buffers for:

* `V`, `F` (for rendering; can remain as Three.js geometry buffers)
* storage buffers:

  * `lambda` (float32[K])
  * `psiKV` (float32[K*nV])
  * `gradPsi` (float32[3*K*nF])
  * `faceNeighbors` (int32[nF*3]) + `neighborEdge` (uint32 packed) OR separate
  * `U_face` (float32[nF*4]) store as vec4 for alignment (xyz + padding)
  * `coeff` (float32[K]) (can be packed after lambda in one buffer)
  * `particleState` (struct array)
  * `particlePos` (float32[nP*4]) vec4

#### Binding count constraints

You previously hit a storage buffer limit. To reduce bindings:

* Pack small arrays:

  * **Pack `lambda` + `coeff`** into a single buffer:

    * first K floats = lambda
    * next K floats = coeff
  * **Pack `faceNeighbors` + `neighborEdge`** into one buffer using uint32 encoding:

    * store 3 neighbors in int32 and 3 edge indices in uint32; or pack (neighbor<<2 | edge) if you can fit.

**Recommendation:** pack topology as:

* `topoPack`: uint32[nF*3] where each entry packs:

  * neighbor face id in 30 bits (or 31 with sign), edge index in 2 bits
  * boundary encoded as 0xFFFFFFFF
    This avoids separate int32+uint8 buffers.

If you prefer readability over packing right now, keep them separate but ensure total storage buffers per compute stage ≤ 8.

### 5.2.2 Compute pipelines (WGSL recommended)

Use raw WGSL compute for explicitness and easier debugging.

Create three compute shaders:

#### Shader A: `coeffKernel`

Workgroup size: 64 or 128.
For k < Kactive:

* read `lambda[k]`
* read `psi = psiKV[k + K*sourceVertex]`
* write `coeff[k] = exp(-lambda[k]*t) * psi`
  For k >= Kactive: set coeff = 0

Inputs:

* packed `lambdaCoeff` buffer
* `psiKV` buffer
* uniform `params` (t, K, Kactive, sourceVertex)

Outputs:

* writes into `lambdaCoeff` buffer (coeff region)

#### Shader B: `uFaceKernel`

Workgroup size: 64.
For face f < nF:

* sum over k=0..Kactive-1:

  * coeff[k]
  * grad components from `gradPsi_CKF[c + 3*(k + K*f)]`
* write `U_face[f] = -sum` (xyz, w=0)

Inputs:

* `lambdaCoeff` buffer (coeff)
* `gradPsi` buffer
* uniform `params` (K, Kactive)
  Outputs:
* `U_face` buffer

#### Shader C: `particleKernel`

Workgroup size: 128 or 256.
For particle p < nP:

* read particle state (faceId, b1, b2, age)
* sample U = U_face[faceId]
* compute barycentric rates and update
* handle edge crossing using topology (neighbors + edge mapping)
* write updated state
* compute world pos from face vertices (requires F + V) OR from centroid + barycentric (requires V anyway)
* write `particlePos[p]` for rendering

Inputs:

* `U_face`
* `V` + `F` (if computing position precisely)
* topology neighbor tables
  Outputs:
* `particleState`, `particlePos`

**Note:** If your existing render path already has mesh geometry on CPU, you can avoid uploading `V` and `F` as storage buffers by:

* computing particle positions approximately using face centroids only (less accurate), OR
* uploading `V` and `F` as storage buffers anyway (recommended for correctness).

Given your goal is scientific visualization, upload `V` and `F` for correct barycentric position.

### 5.2.3 Dispatch strategy (performance + determinism)

On each frame:

* If `params.dirtyCoeff` → dispatch `coeffKernel`
* If `params.dirtyUFace` → dispatch `uFaceKernel`
* Always dispatch `particleKernel` when running

To avoid needless U synthesis at 60 fps:

* Recompute `U_face` only when (sourceVertex, t, Kactive) changes OR at a set interval (e.g., 10 Hz)
* Particle step can run every frame using last `U_face`.

### 5.2.4 CPU readback debugging (optional but recommended)

Add a function in `bctCompute.js`:

* `readBackBuffer(device, buffer, byteLength)` using `mapAsync`
  Use it for:
* verifying a few coeff values match MATLAB for a given source/t
* verifying `|U_face|` is non-zero

---

## 5.3 `bctParticlesRender.js`

### Responsibilities

* Create a particle render object that can display `particlePos` updated by GPU.
* Match the “two color” look from the attractor demo:

  * two particle groups or per-particle color attribute based on index parity
  * additive blending
  * circular sprite/point shape (alpha falloff)
  * optional trails (defer; can be done later)

### Rendering approach

Use `THREE.Points` with a custom shader material **or** Instanced billboard quads.

For simplicity and similarity to the attractor demo:

* Use `THREE.Points` + custom `ShaderMaterial`
* Keep two colors in uniforms: `colorA`, `colorB`
* In vertex shader, choose color based on `gl_VertexID & 1`.

### GPU → render data path

Three.js WebGPU can bind storage buffers to materials in some workflows, but the most robust approach initially is:

* use WebGPU compute to write into a GPUBuffer
* copy into a `StorageBufferAttribute` or use Three.js’s WebGPU node system if already in that paradigm

**Instruction:** choose one of these based on your current viewer:

1. If you are already using Three.js WebGPU + TSL nodes, integrate particle position buffer as a storage attribute.
2. If not, simplest immediate method is to:

   * run compute through the WebGPU device you already have (Three.js renderer),
   * then each frame copy particle positions into a `BufferAttribute` (CPU readback) — NOT recommended long term.

Given you already have WebGPU running, you want **GPU-native rendering**. For that, the best compromise is to use `StorageBufferAttribute` if available in your Three.js version. If not available, we will use an InstancedMesh where the per-instance matrix is updated via compute is harder.

**Action item:** confirm your Three.js revision supports GPU storage attributes. If unsure, we implement particles using TSL like the official example does (it already demonstrates compute feeding render).

---

## 5.4 `initBctSpectralFlow.js` (integration entrypoint)

### Responsibilities

* Called once after your viewer initializes.
* Loads `data/bunny_spectral.json` + `.bin`.
* Creates mesh object (if your viewer doesn’t already load bunny mesh).
* Sets up compute resources and particle renderer.
* Hooks into:

  * your render loop (`viewer.onFrame` or equivalent),
  * your vertex picking callback.

### Required integration points from the existing viewer

You should expose (or pass in) a `viewerContext` object that includes:

* `scene`
* `renderer` (WebGPU renderer)
* `camera`, `controls` (already handled by viewer)
* `gui` (lil-gui instance) OR ability to create one
* `onVertexPicked(callback)` (or event emitter)

### Parameters state (single object)

Maintain a single params object:

```js
const params = {
  sourceVertex: 0,
  t: 0.1,
  dt: 1/60,
  speed: 0.5,
  Kactive: 64,
  particles: 200000,
  running: true,
  ufaceUpdateHz: 15,
  dirtyCoeff: true,
  dirtyUFace: true
};
```

When GUI or picking changes any of:

* `sourceVertex`, `t`, `Kactive`
  set `dirtyCoeff=true`, `dirtyUFace=true`.

---

## 6) GUI controls (minimal set)

In `initBctSpectralFlow.js` or `bctGui.js`:

* `t` (diffusion time) slider (log-scale preferred)
* `speed` slider
* `Kactive` slider (1..K)
* `particles` (re-init button; changes require realloc particle buffers)
* `running` toggle
* `ufaceUpdateHz` slider (1..60)
* optional “Random source” button

**Important:** when `particles` changes, recreate particle buffers and re-seed particle states.

---

## 7) Seeding particles (avoid respawn complexity)

For your oscillating-source direction, you may not need respawn. For now:

* seed particles uniformly over faces at init
* keep them in motion as long as U_face is non-zero
* if particles get stuck near equilibrium (small |U|), inject small tangential noise

### Initialization data needed

You need a face sampling distribution. For correct uniform sampling on surface:

* use face areas.
  You already export `faceAreas` optionally. If you export it, use it.
  If not, you can approximate uniform face sampling by uniform face index (less correct but acceptable for bunny).

**Recommendation:** include `faceAreas` in the spectral export for better initialization.

---

## 8) “Two-color styling” requirement

Implement two-color in particle render:

* `colorA`, `colorB` uniforms
* `color = (id & 1) ? colorA : colorB`

Optionally:

* use alpha based on `age` (if you store age) to mimic the attractor demo’s fading.

---

## 9) Implementation checklist (ordered)

1. **Loader**: implement `loadBctSpectralPackage(baseUrl)`

   * validate required arrays
   * print summary: nV, nF, K, flags
2. **Mesh render**:

   * create `BufferGeometry` from `V` and `F`
   * add mesh to scene with your existing material/lighting
3. **GPU buffers**:

   * create storage buffers for `lambdaCoeff`, `psiKV`, `gradPsi`, topology, `U_face`, particle state, particle pos
4. **Compute shaders**:

   * `coeffKernel` works and writes non-zero coeff
   * `uFaceKernel` works and writes non-zero U_face
   * debug: render `|U_face|` on mesh faces (optional step, but very helpful)
5. **Particles**:

   * seed particles and run `particleKernel`
   * render points from `particlePos`
6. **Picking integration**:

   * on click, update `sourceVertex`, set dirty flags
7. **GUI integration**:

   * wire controls and dirty flags
8. **Throttle U_face updates**:

   * run uFaceKernel at `ufaceUpdateHz`, particles every frame

---

## 10) Common failure modes and how to diagnose

1. **All particles static**

   * `coeff` all zeros: verify `psiKV` indexing (`k + K*v`)
   * `U_face` all zeros: verify `gradPsi_CKF` indexing (`c + 3*(k + K*f)`)
   * verify `Kactive` > 0
2. **Exploding particles**

   * speed too high
   * dt too high
   * barycentric edge-walk bug
3. **Particles stuck on a few streamlines**

   * too few particles
   * face seeding not area-weighted
   * field near equilibrium; consider oscillating sources or adding noise
4. **WebGPU binding limit**

   * pack buffers or reduce number of storage buffers in compute bind group
   * reuse one bind group for all passes if possible

---

## 11) Concrete integration target: `data/bunny_spectral.*`

### Loading call

Your init file should do:

```js
const pkg = await loadBctSpectralPackage('data/bunny_spectral');
```

This should fetch:

* `data/bunny_spectral.json`
* `data/bunny_spectral.bin`

---

## 12) Deliverable coding plan (what you implement next)

You will implement, in order:

1. `loadBctSpectralPackage.js` (complete, with dtype mapping and validation)
2. `bctCompute.js` with:

   * buffer creation
   * WGSL strings for coeffKernel + uFaceKernel (particles later)
   * dispatch logic with dirty flags
3. `bctParticlesRender.js` with Points shader (two-color)
4. `initBctSpectralFlow.js` to wire into viewer

Once coeff+U_face is verified (non-zero), add the particle kernel.

---

## 13) Notes on “not too modular”

This design intentionally keeps:

* one loader file
* one compute file with multiple functions (coeff + U_face + particle passes)
* one renderer helper file
* one init/integration file

It avoids deep folder hierarchies while maintaining separations that materially improve debugging.

---
