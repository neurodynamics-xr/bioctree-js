# Spectral Heat Kernel Compute (WebGPU)

GPU-accelerated heat kernel localization on spectral basis for interactive mesh analysis.

## Overview

This module implements localized heat kernel computation at selected vertices using the spectral decomposition from BCT (Biologically-inspired Computational Toolkit) packages.

### Algorithm

**Step 1: Forward Transform + Heat Filter**
```
For each eigenmode k:
  coeff[k] = exp(-λ[k] * τ) * ψ_k(s) * mass_s
```
- Projects delta function at vertex `s` to eigenmode coefficients
- Applies exponential heat filter: `exp(-λ * τ)`
- Uses mass-weighted inner product (Psi' * Mass)

**Step 2: Inverse Transform (Reconstruction)**
```
For each vertex v:
  H(v) = Σ(k=0 to Kactive-1) coeff[k] * ψ_k(v)
```
- Reconstructs filtered field on all vertices
- Truncates to `Kactive` eigenmodes for frequency control

## Architecture

### Files
- `heatKernel.ts` - Main compute class with WebGPU pipelines
- `index.ts` - Public API exports

### Data Flow
```
BCT Package → Initialize GPU Buffers
                    ↓
User Picks Vertex → Compute Pass 1 (Coefficients)
                    ↓
              Compute Pass 2 (Reconstruction)
                    ↓
              Read Back Result
                    ↓
              Visualize on Mesh
```

## Usage

### Initialization
```typescript
import { HeatKernelCompute } from '@/app/compute/spectral';

const heatKernel = new HeatKernelCompute();
await heatKernel.initialize(bctData);
```

### Compute Heat Field
```typescript
const result = await heatKernel.compute({
  selectedVertex: 42,     // 0-based vertex index
  tau: 0.1,              // Heat diffusion time
  Kactive: 50            // Number of eigenmodes to use
});

// Result contains:
// - field: Float32Array[nV] - Heat values at each vertex
// - range: [min, max]
// - params: Input parameters
```

### Visualization
```typescript
// Apply to viewer using existing scalar field system
setScalarData({
  action: 'update',
  name: `Heat Kernel (v=${vertex}, τ=${tau})`,
  data: result.field
});
```

## Parameters

### `selectedVertex` (integer)
- **Description**: Vertex index where heat source is placed
- **Range**: 0 to nV-1 (0-based indexing)
- **Effect**: Location of peak heat concentration

### `tau` (float)
- **Description**: Heat diffusion time parameter
- **Range**: 0.001 to 1.0 (typical)
- **Effect**: Controls spread of heat
  - Small τ: Sharp, localized heat
  - Large τ: Smooth, diffuse heat
- **UI Control**: "Heat Parameter (t)" slider in Brush panel

### `Kactive` (integer)
- **Description**: Number of active eigenmodes
- **Range**: 1 to K (total eigenmodes available)
- **Effect**: Frequency truncation
  - Low K: Smooth, low-frequency features only
  - High K: Detailed, high-frequency features preserved
- **UI Control**: "Eigenmode Truncation (k)" slider in Brush panel

## Integration Points

### Spectral Brush Flow
1. User selects **Brush Tool** → **Patch Family** → **Spectral Type**
2. UI shows tau and Kactive sliders
3. User clicks vertex on mesh → Vertex picking activates
4. Picker returns vertex index
5. Heat kernel compute triggers automatically
6. Result visualized as scalar field with colormap

### State Dependencies
- `bctData !== null` - BCT package loaded
- `brushFamily === 'patch'` - Patch brush active
- `patchType === 'spectral'` - Spectral mode selected
- `viewerState.mesh.status === 'loaded'` - Mesh ready
- `selectedVertexIndex !== undefined` - Vertex picked

### Performance
- **GPU Compute**: ~1-5ms for typical meshes (5K-50K vertices)
- **Readback**: ~1-2ms (async, doesn't block UI)
- **Total Latency**: <10ms for real-time interaction

## WebGPU Shaders

### Compute Shader 1: Coefficient Calculation
```wgsl
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let k = global_id.x;
  let s = params.selectedVertex;
  let mass_s = massV[s];
  let psi_s = psiKV[k + K * s];
  coeff[k] = exp(-lambda[k] * params.tau) * psi_s * mass_s;
}
```

### Compute Shader 2: Field Reconstruction
```wgsl
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let v = global_id.x;
  var sum: f32 = 0.0;
  for (var k: u32 = 0u; k < Kactive; k = k + 1u) {
    let psi_v = psiKV[k + K * v];
    sum = sum + coeff[k] * psi_v;
  }
  H_vertex[v] = sum;
}
```

## BCT Data Requirements

### Required Buffers
- `lambda[K]` - Eigenvalues (float32)
- `psiKV[K*nV]` - Eigenvectors, row-major (float32)
- `massV[nV]` - Vertex masses (float32, defaults to 1.0 if unavailable)

### Index Layout
```
psiKV is row-major (K × nV):
  psi_k(v) = psiKV[k + K*v]
  
Each row is one eigenmode's values across all vertices.
```

## Future Enhancements

- [ ] **Anisotropic Diffusion**: Use gradient basis for directional heat flow
- [ ] **Multi-Source**: Support multiple selected vertices
- [ ] **Time Animation**: Animate τ parameter for temporal visualization
- [ ] **Custom Filters**: Beyond exponential (Gaussian, wave equation, etc.)
- [ ] **GPU Material**: Direct GPU-to-shader without CPU readback
- [ ] **Colormap Selection**: UI control for diverging/sequential colormaps

## Troubleshooting

### "WebGPU not supported"
- **Solution**: Use Chrome/Edge 113+ or Firefox 118+ with WebGPU enabled
- **Check**: `navigator.gpu` should exist

### Computation slow/freezes
- **Cause**: Too many eigenmodes (Kactive > 500)
- **Solution**: Reduce Kactive or increase workgroup size

### Field looks wrong
- **Check Indexing**: Verify psiKV uses row-major K×nV layout
- **Check Mass**: Ensure massV is not all zeros
- **Check Range**: Field values should be positive and finite

## References

- **Heat Method**: Crane et al. "Geodesics in Heat" (SIGGRAPH 2012)
- **Spectral Geometry**: Vallet & Lévy "Spectral Geometry Processing with Manifold Harmonics" (2008)
- **WebGPU Compute**: [WebGPU Specification](https://gpuweb.github.io/gpuweb/)
