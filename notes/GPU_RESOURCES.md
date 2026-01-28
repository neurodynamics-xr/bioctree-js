Below is a consolidated design document for refactoring BioctreeApp’s WebGPU viewer so that:

1. **All field → colormap mapping is GPU-only** (no GPU→CPU readback, no CPU color loops, no CPU→GPU re-upload of colors).
2. A new **`GPUResourceManager`** (in `src/app/gpu/`) becomes the single authority for GPU buffers/textures and compute outputs.
3. React/UI, CPU-side domain objects (Manifold/Field), rendering, and compute each have **clear, non-overlapping responsibilities**.

This is written to fit your current structure where `Home.tsx` orchestrates state → viewer updates and `ViewerWebGPU.tsx` wraps the low-level viewer API.

---

## 1. Scope and goals

### Goals

* **One-time upload** of mesh core buffers (positions, indices) to GPU.
* **GPU-native scalar visualization**: scalar buffer → colormap in shader (TSL nodes), not via CPU-side color attributes.
* **GPU-native spectral visualization**: eigenvectors/eigenvalues and “inverse transform” executed on GPU, producing a GPU-resident scalar buffer for rendering.
* Introduce a **`GPUResourceManager`** that:

  * owns GPU allocations (buffers/textures),
  * deduplicates shared resources,
  * tracks lifetime/ref-counting,
  * centralizes layout/typing metadata (stride, dtype, element counts, usage flags),
  * provides stable “handles” to rendering and compute code.

### Non-goals (for now)

* Chunking/multiresolution streaming (you explicitly deferred this).
* Perfect “zero CPU copy” (WebGPU does not allow true shared-memory zero-copy).
* Full GPU picking implementation (we will reduce CPU work drastically now; full GPU picking can follow).

---

## 2. Current implementation summary and key issues

### Current flow (as you described)

Disk (Zarr) → CPU TypedArrays → `Manifold` core → Three.js `StorageBufferAttribute` → first `renderer.render()` uploads.

This is acceptable for **mesh upload**.

### The major inefficiencies to remove

1. **Colormap roundtrip** (GPU compute → CPU readback → CPU color mapping → GPU upload of colors).

   * This is the largest “self-inflicted” bandwidth + CPU cost.
2. **CPU-side scalar range computation** in `ViewerWebGPU.tsx` for every visualization update (min/max loop over scalar arrays). This becomes significant at scale.
3. **Picking is O(nV)** in `interaction.ts` (looping over all vertices to find closest vertex). This will become unusable as vertex count grows.

### Existing good direction already in your code

You already have a GPU-side colormap path in `render.ts`:

* `setFieldColormap(scalarStorage, colormap, minValue, maxValue)` builds a TSL colormap node and assigns it to `MeshStandardNodeMaterial.colorNode`, which is the correct “no CPU colors” approach.

So the design here is to **make this path the only path** and delete/retire any CPU colormap pipeline.

---

## 3. Target architecture (layers and responsibilities)

### Layer A — React/UI orchestration (Home, panels, state)

**Files:** `Home.tsx`, panels, `app/state/*`
**Responsibilities:**

* Owns app state (current manifold, current field, selected vertex, UI parameters like tau/Kactive/colormap).
* Calls viewer API methods to apply changes (load mesh, set visualization parameters).
* Does **not** build Three.js objects, does **not** allocate GPU resources directly.

This matches your current pattern where `Home.tsx` listens to manifold changes and pushes to the viewer via `viewerAPI.current.setMeshFromManifold(manifold)`.

---

### Layer B — CPU domain objects (Manifold, Field)

**Files:** `src/app/manifold/Manifold.ts`, `src/app/field/Field.ts`
**Responsibilities:**

* Provide canonical typed arrays and metadata.
* Provide descriptors for GPU upload (dtype, layout, index base).
* Provide stable resource IDs (e.g., manifold ID, field ID, eigenbasis ID).

**Important policy change:**

* CPU objects should not decide *when* to upload; they expose data; the GPU layer decides residency and lifetime.

---

### Layer C — GPU resource authority (NEW)

**Folder:** `src/app/gpu/`
**Core class:** `GPUResourceManager`

**Responsibilities:**

* Create/destroy GPU buffers and textures.
* Deduplicate buffers by key (manifold vertices reused across visualizations).
* Provide typed “handles” to GPU resources (not raw Three.js attributes everywhere).
* Provide staging/upload utilities and usage flags.
* Coordinate compute outputs (e.g., a scalar buffer produced by inverse transform).

---

### Layer D — Viewer / renderer boundary

**Files:** `viewerWebGPU/main.ts`, `viewerWebGPU/render.ts`, `viewerWebGPU/scene.ts`, `camera.ts`, `lighting.ts`, `interaction.ts`
**Responsibilities:**

* Own Three.js `WebGPURenderer`, scene graph, camera, controls.
* Request GPU resources from `GPUResourceManager` and attach them to geometry/material.
* Run the render loop.
* Run compute passes **before** rendering when needed.

Note: Three.js recommends structuring render loops around WebGPU’s async initialization patterns (e.g., `setAnimationLoop()`), though `await renderer.init()` is also valid if you control initialization explicitly. ([threejs.org][1])

---

### Layer E — GPU compute pipelines (spectral transforms, operators)

**Folder:** recommend `src/app/gpu/pipelines/` (or `src/app/compute/webgpu/` if you prefer)
**Responsibilities:**

* Build TSL compute nodes/passes for:

  * inverse transform (spectral → vertex scalar),
  * optional filtering (heat filter in spectral domain),
  * operator application (later).
* Execute via the viewer loop on demand.

---

## 4. GPUResourceManager design

### 4.1 File layout

Create:

* `src/app/gpu/GPUResourceManager.ts`
* `src/app/gpu/types.ts`
* `src/app/gpu/keys.ts`
* `src/app/gpu/pipelines/InverseTransform.ts`
* `src/app/gpu/pipelines/ColormapMaterial.ts` (optional helper)
* `src/app/gpu/pipelines/index.ts`

### 4.2 Resource identity and keys

Every GPU resource must have a stable key. Examples:

* `manifold:{manifoldId}:positions`
* `manifold:{manifoldId}:indices`
* `manifold:{manifoldId}:eigenvectors:{K}:{layout}`
* `field:{fieldId}:vertexScalar`
* `compute:{manifoldId}:inverseTransform:{Kactive}:{source}`

A key implies:

* dtype (float32/uint32),
* element count,
* usage flags,
* layout/stride,
* ownership/lifetime policy.

### 4.3 Resource handles

Define opaque handles:

* `GPUBufferHandle { key, bufferNode, byteLength, elementCount, dtype, usage, refCount }`
* `GPUTextureHandle { ... }`

Where `bufferNode` is whatever you standardize on for Three.js WebGPU/TSL interop (e.g., a TSL “storage buffer node” or a Three.js wrapper object).

### 4.4 Public API (minimum)

* `getOrCreateManifoldGeometry(manifold: Manifold): { positionAttr, indexAttr, geometry }`
* `getOrCreateStorageBuffer(key, typedArray, usage, layout): GPUBufferHandle`
* `getOrCreateEmptyStorageBuffer(key, byteLength, usage, layout): GPUBufferHandle`
* `release(key)` / `releaseHandle(handle)`
* `disposeAll()`

### 4.5 Upload policy

* Mesh buffers upload once per manifold load.
* Eigenvectors/eigenvalues upload once per manifold load (if present).
* Dynamic compute outputs allocate once and are reused; only content changes.

### 4.6 CPU memory release policy (optional but recommended)

After GPU upload, you may want to drop CPU copies for very large arrays. Three.js typically retains typed arrays for convenience (raycasting, bounds). Make this a **configurable mode**:

* `retainCpuGeometry = true` for dev/debug/picking.
* `retainCpuGeometry = false` for large production datasets (requires alternative picking strategy).

---

## 5. Definitive fix for the colormap roundtrip (GPU-only policy)

### 5.1 New rule

**No visualization path is allowed to write per-vertex RGB colors on the CPU.**
That means:

* No `ScalarMapper.applyToMesh()` loops.
* No `geometry.attributes.color = ...` updates per frame.
* No “readback scalar → CPU colormap → upload color attribute”.

### 5.2 Enforced implementation

All scalar visualization must be:

1. Scalar buffer is **GPU-resident** (storage buffer).
2. Material uses a **TSL colormap node** reading scalar by vertex index.
3. Render uses that node (`material.colorNode = colormapNode`).

You already have the correct entrypoint in `render.ts`:

* `setFieldColormap(scalarStorage, colormap, minValue, maxValue)` sets `material.colorNode` and `material.needsUpdate = true`.

**Action items:**

* Delete/retire any CPU-side code that:

  * reads back scalar values from GPU,
  * computes colors on CPU,
  * updates `geometry.attributes.color`.

### 5.3 Fix the remaining CPU cost: min/max

Right now `ViewerWebGPU.tsx` computes min/max by iterating the CPU array when `minVal/maxVal` are not provided.

Replace with one of these policies:

**Policy A (fastest to implement):** require the caller to provide min/max (from MATLAB export, or precomputed statistics in field metadata).

* Put min/max in Field metadata at load time.
* Viewer never scans arrays.

**Policy B (GPU-native reduction):** implement a compute reduction pass for min/max (later).

* This is the long-term scalable solution.

Given your immediate goal (“remove any existing CPU precomputations”), I recommend **Policy A now**, and add GPU reduction later.

---

## 6. Spectral visualization baseline: “render an eigenvector” pipeline (GPU)

You stated the fundamental pipeline is:

> inverse transform a single eigenvector and render it via colormap (GPU-based system).

### 6.1 Data involved

* `E`: eigenvectors matrix on GPU (shape `[nV, K]` or `[K, nV]`, but you must standardize).
* `c`: spectral coefficients on GPU (length `Kactive`). For “single eigenvector i”, `c[i]=1`, others 0.
* Output `s`: vertex scalar field on GPU (length `nV`).

### 6.2 Compute pass: inverse transform

Compute shader (conceptually):

For each vertex `v`:

```
s[v] = sum_{k=0..Kactive-1} E[v,k] * c[k]
```

This is a straightforward dot product per vertex. It is ideal for GPU.

### 6.3 Where it lives

* Implement as `src/app/gpu/pipelines/InverseTransform.ts`
* It receives handles:

  * eigenvectors buffer handle
  * coefficients buffer handle
  * output scalar buffer handle
  * Kactive, nV

### 6.4 How it runs in your viewer loop

Your `render.ts` already has placeholders:

* `spectralComputePasses: any[]`
* `needsSpectralCompute = false`
* `setSpectralVisualization(materialAdapter, computePasses)` sets those fields
* `triggerSpectralCompute()` toggles the flag

But **animate() never executes the compute passes**, so currently the compute pipeline cannot work as intended.

**Action items in `render.ts`:**

* In `animate()`, before `renderer.render(scene,camera)`:

  * If `needsSpectralCompute`:

    * execute compute passes
    * set `needsSpectralCompute = false`

Three.js WebGPU/TSL supports compute execution (e.g., via renderer compute methods; the ecosystem commonly references `computeAsync` for TSL compute dispatch). ([three.js forum][2])
Even if your exact call differs by revision, the architectural requirement is the same: compute dispatch must occur inside the render loop (or a controlled “compute tick”) before the draw.

### 6.5 Rendering: scalar → colormap node

Once `s` is updated (GPU buffer):

* Call `setFieldColormap(s, colormapType, min, max)`
* No CPU touch.

---

## 7. Mesh upload and geometry policy (WebGPU-ready)

### 7.1 Data types (enforced)

* Positions: `Float32Array` (3 * nV)
* Indices (faces): `Uint32Array` (3 * nF) for large meshes; `Uint16Array` if `nV < 65536`
* Edges: not needed for rendering; keep CPU-side unless you explicitly need them in GPU compute.

### 7.2 Geometry creation responsibility

Move mesh buffer creation responsibility out of `ViewerWebGPU.tsx` and out of ad-hoc viewer code; it should be done by:

* `GPUResourceManager.getOrCreateManifoldGeometry(manifold)`

Then `render.ts` should accept a “ready geometry + material” or accept a `Manifold` and ask the GPUResourceManager for GPU buffers/attributes.

---

## 8. Picking: immediate performance fix (remove O(nV) scan)

Your current picking code:

* Raycast to mesh triangle
* Then scans all vertices to find closest vertex (`for i in 0..nV-1`) in `findClosestVertex()`

This is not viable.

### Immediate fix (low complexity)

When raycasting hits a face, you can get the face/triangle indices and choose among the **3 vertices of that face** instead of all vertices:

1. Retrieve face index from intersection (or triangle indices).
2. Get the 3 vertex indices from the index buffer.
3. Compare distances to those 3 vertices only.
4. Pick the closest.

That changes picking from **O(nV)** per click to **O(1)** per click.

Do this before any GPU picking work. It is a major practical improvement with minimal code change.

---

## 9. Resize and lifecycle cleanup

Right now:

* `render.ts` registers a `window.resize` listener and resizes internally.
* `ViewerWebGPU.tsx` also uses a `ResizeObserver` and calls `renderer.setSize()` and modifies camera aspect.

This is redundant and can cause subtle sizing bugs.

### Policy

* React wrapper owns sizing (because the canvas lives in a React layout).
* The viewer exposes `resize(width,height)` and does **not** attach a global window listener.

**Action items:**

* Remove `window.addEventListener('resize', handleResize)` from `render.ts`.
* Add `export function resize(width,height)` to viewer API and call it from `ViewerWebGPU.tsx`’s ResizeObserver.

Also consider using `renderer.setAnimationLoop()` for WebGPU correctness in the long term, per Three.js guidance. ([threejs.org][1])

---

## 10. Concrete refactor plan (step-by-step)

### Step 1 — Introduce `GPUResourceManager`

1. Create `src/app/gpu/GPUResourceManager.ts`
2. Instantiate it in `viewerWebGPU/render.ts` after `renderer.init()` (it needs renderer/device context).
3. Add a getter in the viewer API: `getGPU()` returning the manager or a restricted facade.

### Step 2 — Convert mesh setup to use GPUResourceManager

* Replace direct `new THREE.StorageBufferAttribute(vertices,3)` calls in `setMeshFromData()` with `gpu.getOrCreateManifoldGeometry(...)`.
* Ensure keys are stable per manifold.

### Step 3 — Enforce GPU-only colormap

* Remove any remaining CPU colormap code paths (including old “scalar to vertex color attribute” mechanisms).
* Require min/max from Field metadata (for now) to avoid CPU loops.

### Step 4 — Make compute actually run

* Implement compute dispatch inside `animate()` when `needsSpectralCompute` is true.
* Wire `SpectralBrushPanel` parameter changes to call `triggerSpectralCompute()` (or a higher-level “invalidate visualization” call).

### Step 5 — Fix picking complexity

* Update `interaction.ts` to pick among the 3 triangle vertices from the raycast intersection.
* Keep the callback API unchanged.

### Step 6 — Resize cleanup

* Remove window resize listener from `render.ts`.
* Add viewer `resize()` function.
* Let React’s ResizeObserver call it.

---

## 11. Component responsibility matrix (final)

### `Home.tsx` (orchestrator)

* Listens to state and calls viewer API:

  * `setMeshFromManifold(manifold)`
  * `setSpectralVisualization(...)` / `triggerSpectralCompute()`
  * `setFieldVisualization(field, colormap, min/max)`
* Owns UI state only.

### `ViewerWebGPU.tsx` (React wrapper)

* Creates canvas.
* Initializes viewer.
* Handles resizing via ResizeObserver.
* Routes picking callback to global state (`setCurrentVertex`) (already done).

### `viewerWebGPU/render.ts` (viewer runtime)

* Owns renderer/scene/camera/controls.
* Owns animation loop.
* Owns compute execution scheduling.
* Requests resources from `GPUResourceManager`.
* Never scans CPU arrays for visualization.

### `src/app/gpu/GPUResourceManager.ts` (new)

* Owns GPU allocations and lifetime.
* Returns handles for:

  * mesh geometry buffers,
  * eigenvectors/eigenvalues buffers,
  * scalar output buffers,
  * intermediate operator buffers.

### `src/app/gpu/pipelines/*` (new)

* Encapsulate compute pipelines:

  * inverse transform
  * heat filter in spectral domain (later)
  * gradients/operators (later)

---

## 12. What you should delete/retire immediately

* Any CPU-side “colormap mapping” module that:

  * reads back GPU buffers to CPU,
  * maps to RGB on CPU,
  * updates `geometry.attributes.color`.
* Any per-frame CPU loops over all vertices for visualization.
* The O(nV) picking scan (replace with triangle-local picking).

---


[1]: https://threejs.org/manual/en/webgpurenderer.html "WebGPURenderer"
[2]: https://discourse.threejs.org/t/computeasync-method-for-webgpurenderer/78280?utm_source=chatgpt.com "computeAsync method for WebGpuRenderer - Questions - three.js forum"
