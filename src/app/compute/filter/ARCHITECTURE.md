# Spectral Filter System - Refactored Architecture

## Overview

The filter system has been **refactored into three distinct layers** with clear separation of concerns, eliminating the lifecycle mixing that made the original `design.ts` brittle.

## Three-Layer Architecture

### Layer A: Resource Factory (CPU → GPU)
**Purpose**: One-time upload of spectral basis data to GPU  
**File**: `gpuBasis.ts`  
**When to use**: Once per dataset/manifold change

```typescript
const basis = GpuBasis.fromEigenpairs({
  psi: eigenvectors,    // Float32Array (K×nV)
  lambda: eigenvalues,  // Float32Array (K)
  mass: massVector,     // Float32Array (nV)
  nV: 1889,
  K: 300,
  layout: 'kMajor',     // or 'vMajor'
  storage: 'buffer',    // or 'texture' (future)
});
```

**Responsibilities**:
- Validate input dimensions and correctness
- Choose GPU storage representation (buffer vs texture)
- Upload once and retain handles
- **NOT** repeated on parameter changes

**Key types**: `GpuBasisHandle`, `EigenpairData`, `MatrixLayout`

---

### Layer B: Operator (Compute Graph + Parameters)
**Purpose**: Define compute passes and manage filter parameters  
**File**: `spectralImpulseKernel.ts`  
**When to use**: Once per "operator graph" (rarely changes)

```typescript
const operator = new SpectralImpulseKernelOperator(basis, {
  kernelType: 'heat',
  sourceVertex: 0,
  params: { tau: 0.01 },
});

// Get compute passes (cached, reused)
const passes = operator.getComputePasses();

// Update parameters (lightweight, no reallocation)
operator.updateParams({ sourceVertex: 42, params: { tau: 0.02 } });
```

**Responsibilities**:
- Own spectral coefficients and output field buffers
- Compute kernel weights g(λ) on CPU
- Determine Kactive (adaptive truncation)
- Build TSL compute nodes (coeff + field reconstruction)
- Update uniforms on parameter changes
- **NOT** recreate GPU resources or compute graph

**Key types**: `SpectralOperator`, `ImpulseKernelParams`, `ComputePass`, `OperatorOutput`

---

### Layer C: Render Binding (Field → Material)
**Purpose**: Visualize scalar field with colormaps  
**File**: `scalarFieldMaterial.ts`  
**When to use**: Once per visualization style

```typescript
const material = createScalarFieldMaterial({
  field: operator.output.field,
  colormap: 'viridis',
  range: 'auto', // or { min: 0, max: 1 }
});
mesh.material = material.material;

// Update visualization (lightweight)
material.updateConfig({ colormap: 'inferno', range: { min: 0, max: 0.5 } });
```

**Responsibilities**:
- Map field values → colormap colors
- Handle normalization (auto, symmetric, explicit)
- Integrate with lighting (MeshStandardNodeMaterial)
- **NOT** aware of how field was computed

**Key types**: `ScalarFieldMaterialAdapter`, `ScalarFieldMaterialConfig`, `ColormapType`

---

## Complete Usage Example

```typescript
// ========== SETUP (one-time) ==========

// Layer A: Create basis from manifold
const basis = GpuBasis.fromEigenpairs({
  psi: manifold.spectral.psi,
  lambda: manifold.spectral.lambda,
  mass: manifold.core.mass,
  nV: manifold.vertexCount,
  K: manifold.modeCount,
});

// Layer B: Create heat kernel operator
const heatOperator = new SpectralImpulseKernelOperator(basis, {
  kernelType: 'heat',
  sourceVertex: 0,
  params: { tau: 0.01 },
});

// Layer C: Create visualization material
const materialAdapter = createScalarFieldMaterial({
  field: heatOperator.output.field,
  colormap: 'viridis',
  range: 'auto',
});
mesh.material = materialAdapter.material;

// ========== RENDER LOOP ==========

function animate() {
  // Dispatch compute passes (only if params changed)
  const passes = heatOperator.getComputePasses();
  for (const pass of passes) {
    renderer.compute(pass.node);
  }
  
  // Render scene
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// ========== INTERACTIVITY ==========

// On vertex pick:
heatOperator.updateParams({ sourceVertex: pickedVertexIdx });

// On tau slider change:
heatOperator.updateParams({ params: { tau: newTau } });

// On colormap change:
materialAdapter.updateConfig({ colormap: 'inferno' });

// ========== CLEANUP ==========

materialAdapter.dispose();
heatOperator.dispose();
basis.dispose();
```

---

## Convenience API (All-in-One)

For simple cases, use the `createSpectralFilterPipeline()` helper:

```typescript
const pipeline = createSpectralFilterPipeline({
  eigenpairs: {
    psi: eigenvectors,
    lambda: eigenvalues,
    mass: massVector,
    nV, K,
  },
  kernelType: 'heat',
  sourceVertex: 0,
  params: { tau: 0.01 },
  colormap: 'viridis',
  range: 'auto',
});

// Access individual layers:
pipeline.basis;
pipeline.operator;
pipeline.materialAdapter;

// Shortcuts:
pipeline.getComputePasses();
pipeline.updateParams({ sourceVertex: 42 });
pipeline.updateMaterial({ colormap: 'inferno' });
pipeline.dispose();
```

---

## What This Solves

### Original Problem: `design.ts` Mixed Three Lifecycles

| Concern | Old (Mixed) | New (Separated) |
|---------|-------------|-----------------|
| GPU upload | Every `applyFilter()` call | Once in `GpuBasis.fromEigenpairs()` |
| Kernel weights | Recomputed in `applyFilter()` | Recomputed in `updateParams()` only |
| Compute graph | Rebuilt on every call | Built once in constructor |
| Material/colormap | Not handled | Separate `ScalarFieldMaterial` |

### Benefits

✅ **Correctness**: No accidental CPU reads or stale resources  
✅ **Performance**: GPU upload once, parameter updates are O(K) CPU-only  
✅ **Extensibility**: Add kernels by only adding g(λ) logic  
✅ **Testability**: Test kernel math without GPU  
✅ **Clarity**: Each layer has one responsibility

---

## File Structure

```
src/app/compute/filter/
├── types/                          # Type definitions (boundaries)
│   ├── gpuResources.ts            # Layer A types
│   ├── operators.ts               # Layer B types
│   ├── materials.ts               # Layer C types
│   └── index.ts                   # Central export
├── gpuBasis.ts                    # Layer A implementation
├── spectralImpulseKernel.ts       # Layer B implementation
├── scalarFieldMaterial.ts         # Layer C implementation
├── index.ts                       # Public API + convenience helpers
├── kernels/                        # Pure math (no GPU)
│   ├── heat.ts                    # Heat kernel: g(λ) = exp(-τλ)
│   └── design.ts                  # CPU parameter exploration (FilterParameters)
├── design.ts                      # [LEGACY] Old monolithic class
└── apply.ts                       # [LEGACY] General field filtering
```

---

## Migration from Legacy `FilterDesign`

### Old Code (Mixed Responsibilities)

```typescript
const filterDesign = new FilterDesign({
  lambdas: manifold.spectral.lambda,
  psi: manifold.spectral.psi,
  mass: manifold.core.mass,
});

filterDesign.applyFilter(heatKernel, { tau: 0.01 }, sourceVertex);

const { coeffCompute, fieldCompute } = filterDesign.getComputeNodes();
renderer.compute(coeffCompute);
renderer.compute(fieldCompute);

const outputStorage = filterDesign.getOutputStorage();
```

### New Code (Separated Layers)

```typescript
// Layer A: Create basis (once)
const basis = GpuBasis.fromEigenpairs({
  psi: manifold.spectral.psi,
  lambda: manifold.spectral.lambda,
  mass: manifold.core.mass,
  nV: manifold.vertexCount,
  K: manifold.modeCount,
});

// Layer B: Create operator (once)
const operator = new SpectralImpulseKernelOperator(basis, {
  kernelType: 'heat',
  sourceVertex: sourceVertex,
  params: { tau: 0.01 },
});

// Layer C: Create material (once)
const material = createScalarFieldMaterial({
  field: operator.output.field,
  colormap: 'viridis',
  range: 'auto',
});
mesh.material = material.material;

// Render loop
const passes = operator.getComputePasses();
passes.forEach(pass => renderer.compute(pass.node));
renderer.render(scene, camera);

// Update parameters (lightweight)
operator.updateParams({ sourceVertex: newVertex, params: { tau: 0.02 } });
```

---

## Future Extensions

### Add New Kernels

Just define `g(λ)` and register in kernel library:

```typescript
// kernels/gaussian.ts
export const gaussianKernel: FilterKernel = {
  name: 'gaussian',
  g: (lambda, params) => Math.exp(-params.sigma * lambda * lambda),
  parameters: {
    sigma: { min: 0, max: 1, default: 0.1 },
  },
};
```

No changes needed to GPU layers!

### Support General Field Filtering

Create a different operator (not impulse-based):

```typescript
class SpectralFieldFilterOperator implements SpectralOperator {
  // Takes arbitrary input field, filters, outputs
}
```

Reuses same `GpuBasis` and `ScalarFieldMaterial`!

### Add GPU Min/Max Reduction

Implement in `ScalarFieldMaterial.recomputeRange()`:

```typescript
async recomputeRange(): Promise<{ min: number; max: number }> {
  // Parallel reduction compute pass
  const reduction = buildReductionPass(this.config.field);
  await renderer.computeAsync(reduction);
  return { min: reduction.min.value, max: reduction.max.value };
}
```

No changes to operator layer!

---

## Design Principles

1. **Separation of Concerns**: Each layer has one job
2. **Single Responsibility**: Change rates match layer boundaries
3. **Explicit Dependencies**: Types define layer interfaces
4. **Zero-Copy GPU**: Data uploaded once, reused across layers
5. **Parameter Updates Are Cheap**: Uniforms + CPU weights only
6. **Compute Graph Is Static**: Built once, dispatched many times

---

## Questions?

See [`index.ts`](./index.ts) for the public API surface and usage examples.
