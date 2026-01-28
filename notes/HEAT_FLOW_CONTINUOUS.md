## Design note: Continuous flow via respawn using `H_face`, `spawnMask`, `sinkMask`

### Objective

Maintain a **visually continuous outward particle flux** from a heat source on a surface-advection visualization where the driving field `U_face = -∇H` is **static** and would otherwise settle (small gradients → apparent stalling). Achieve continuity by adding a **particle lifecycle** mechanism:

* Particles advect under the same Eulerian field `U_face`.
* When particles reach a “sink” region (low heat / peripheral), they are **reseeded** into a “spawn” region (high heat / near source).
* This creates steady-state *flux visualization* without modifying the PDE or recomputing the field per frame.

---

## Data contract changes (MATLAB → Three.js)

### New exported buffers

1. `H_face`

* Type: `float32`
* Shape: `[nF]`
* Semantics: scalar value per face (centroid-averaged vertex heat is acceptable)

2. `spawnMask`

* Type: `uint8`
* Shape: `[nF]`
* Semantics: 1 if face is in *spawn region* (near source); 0 otherwise

3. `sinkMask`

* Type: `uint8`
* Shape: `[nF]`
* Semantics: 1 if face is in *sink region* (peripheral / low heat); 0 otherwise

### Invariants required by the Three.js compute logic

* `faceNeighbors[f, i]` must correspond to the **neighbor across the edge opposite vertex `F[f,i]`** (the “opposite-vertex convention”), because the advection step selects crossed edge from the most negative barycentric component.
* Boundary sentinel must be `-1` on export; Three.js may reinterpret to `0xFFFFFFFF` for fast unsigned comparisons.

---

## Three.js code changes (structured)

### 1) Loader: accept and validate new buffers

**Goal:** ensure the page fails fast if the export is incomplete or mismatched.

**Required edits**

* Extend dtype mapping to include `uint8 → Uint8Array`.
* Add `H_face`, `spawnMask`, `sinkMask` to the required list.
* Optionally, store a typed alias for masks as `Uint32Array` for GPU convenience (not strictly required; can upload `Uint8Array` directly).

**Acceptance checks**

* `buffers.H_face.length === nF`
* `buffers.spawnMask.length === nF`
* `buffers.sinkMask.length === nF`

---

### 2) GPU storage: upload new buffers as storage nodes

**Goal:** make masks and `H_face` accessible in the compute shader each frame.

**Required edits**

* Create three new `StorageBufferAttribute`s:

  * `H_face` itemSize 1
  * `spawnMask` itemSize 1
  * `sinkMask` itemSize 1
* Bind them as `storage(...)` nodes:

  * `HStorage: float`
  * `SpStorage: uint`
  * `SkStorage: uint`

**Why masks should be `uint` on GPU**

* The compute logic uses branch conditions.
* Treating the mask as integer allows cheap `>0` tests.
* `uint8` uploads are fine; the node type controls interpretation.

**Return signature update**

* Update `createStorageNodes()` to return `{..., HStorage, SpStorage, SkStorage }`.

---

### 3) Particle update compute: add lifecycle rule (respawn)

**Goal:** introduce a “recycling” mechanism so particles do not accumulate in low-gradient regions.

#### 3.1 Where to insert the respawn check

Insert near the beginning of the per-particle update (before computing `pNext` is typically best):

* Read particle `faceId`
* Check if it is in sink region via `sinkMask[faceId]`
* If yes, replace `(faceId,bary)` with a random spawn face and new barycentric position

This prevents particles spending cycles moving slowly in sink regions.

#### 3.2 Respawn criteria (two supported modes)

**Mode A (recommended initially): mask-based sink test**

* `if sinkMask[faceId] == 1 → respawn`

This is deterministic given your MATLAB thresholding.

**Mode B (optional later): scalar-based sink test**

* `if H_face[faceId] < threshold → respawn`

This allows runtime control without regenerating masks, but costs one scalar fetch and a comparison.

#### 3.3 Spawn selection (mask-based)

Particles need to be seeded into a face with `spawnMask == 1`.

Two viable approaches:

**Approach 1 (simplest): bounded rejection sampling on GPU**

* Choose random face indices repeatedly (e.g., 16–64 tries)
* Accept the first face where `spawnMask[candidate] == 1`
* If not found after max tries, fall back to a default (e.g., `0` or previous face)

**When this is acceptable**

* Spawn region is not extremely small (e.g., ≥0.5–1% of faces).
* You keep attempts bounded to prevent GPU stalls.

**Approach 2 (more robust): export an explicit `spawnFaces` list**

* MATLAB exports an array of face IDs in spawn region plus its length
* GPU chooses uniformly by indexing into the list

This avoids rejection and guarantees O(1), but adds another buffer and indexing.

**Recommendation**
Start with **Approach 1**. If you later define spawn regions extremely narrowly, switch to `spawnFaces`.

---

### 4) Rendering: optional visual tie-in to the new scalar

The continuous-flow effect does not require any rendering change, but you may want to use the new data for interpretability.

**Option A: keep current speed-based two-color map**

* Color encodes `|U_face|` (current behavior)
* This keeps your “original example” aesthetic.

**Option B: color by heat scalar**

* Color encodes `H_face[faceId]` (high near source, low at sink)
* Useful to show that respawn is aligned with heat topology.

**Option C: combined**

* Keep color by speed, modulate opacity by heat or vice versa.

This is purely aesthetic; do not couple it to the compute logic.

---

### 5) Inspector / GUI: add control flags (recommended)

Expose minimal controls to avoid repeated export iterations:

* `respawnEnabled` (bool)
* `spawnTries` (int, capped; if you expose it)
* `sinkThreshold` (float, only if using Mode B scalar-based respawn)
* `particleLifetime` or `respawnProbability` (optional advanced modes)

If you are using exported masks, you do not need thresholds initially. A single on/off toggle is sufficient.

---

## Execution flow after changes

Per frame (compute pass):

1. For each particle:

   * If `sinkMask[faceId] == 1`, respawn:

     * pick `newFace` from spawn region
     * set `bary = randomBarycentric()`
     * reset `speedBuffer` (optional)
   * Else:

     * sample Eulerian velocity `u = U_face[faceId]`
     * propose `pNext = p + dt*u`
     * compute barycentric coords in current face
     * hop across neighbors until inside or until `MAX_EDGE_HOPS`

Render pass:
2) Build 3D position from `(faceId, bary)`
3) Apply two-color style mapping (speed or heat-based)

Result:

* Particles continually emerge near source and stream outward.
* Particles reaching periphery recycle, maintaining a stable flux.

---

## Failure modes and mitigations

1. **Spawn region too small → rejection fails**

* Symptom: particles respawn to default face or appear clustered incorrectly
* Fix: export `spawnFaces` list or expand `spawnMask` threshold

2. **Neighbor table convention mismatch**

* Symptom: particles “teleport,” stick, or leak to wrong faces near edges
* Fix: ensure MATLAB exports `faceNeighborsOpp0` (opposite-vertex convention)

3. **Particles jump too far per step**

* Symptom: frequent boundary respawns, unstable flow
* Fix: clamp `maxSpeed`, lower `timeScale`, increase `MAX_EDGE_HOPS` modestly

---

## Minimal change checklist (implementation-ready)

* [ ] Export includes `H_face`, `spawnMask`, `sinkMask`
* [ ] Three.js loader requires them and supports `uint8`
* [ ] New `HStorage`, `SpStorage`, `SkStorage` are created and returned
* [ ] Compute update checks `sinkMask` and respawns into `spawnMask` region
* [ ] Keep particle rendering unchanged (unless you choose to color by heat)

This is the full structure of what needs to change to add continuous flow without changing your underlying PDE or recomputing fields every frame.
