# Spectral Heat Brush Implementation

This folder contains the spectral heat brush implementation for bioctree mesh analysis.

## Overview

The spectral heat brush uses eigenmode decomposition to compute heat diffusion on triangle meshes. When a user selects a vertex, the system:

1. **Loads spectral data** - Precomputed eigenmodes (λ, ψ, ∇ψ) from `data/bunny_spectral.bin`
2. **Computes coefficients** - For each mode k: `coeff[k] = exp(-λ_k * t) * ψ_k(s)` where s is selected vertex
3. **Synthesizes velocity field** - Face velocities: `U_f = -Σ coeff[k] * ∇ψ_k|_f`
4. **Advects particles** - Surface particles flow along velocity field using barycentric navigation

## File Structure

```
spectral/
├── dataLoader.ts          # Load bunny_spectral.json/.bin (DONE)
├── SpectralDataTest.tsx   # Test component to verify data loading (DONE)
├── coeffCompute.ts        # Compute spectral coefficients (TODO)
├── velocityField.ts       # Synthesize face velocity field (TODO)
├── SpectralParticles.tsx  # Particle advection component (TODO)
└── README.md              # This file
```

## Implementation Status

### ✅ Phase 1: Data Loading (COMPLETE)
- [x] `dataLoader.ts` - Loads and validates spectral data
  - Fetches JSON manifest + binary buffer
  - Creates typed array views (no copy)
  - Validates shapes match metadata
  - Provides helper functions: `getPsi()`, `getGradPsi()`
  
- [x] `SpectralDataTest.tsx` - Verification component
  - Displays metadata (nV, nF, K)
  - Shows eigenvalue statistics (min, max, mean)
  - Samples eigenvector and gradient values
  - Lists array sizes and data layouts
  
**Test Status**: Navigate to Experimental page → "Spectral Test" button to verify data loads correctly

### ⏳ Phase 2: Coefficient Computation (TODO)
Create `coeffCompute.ts` with:
- WebGPU compute shader for `coeff[k] = exp(-λ_k * t) * ψ_k(s)`
- Inputs: lambda buffer, psiKV buffer, selectedVertex uniform, diffusionTime uniform
- Output: coeffBuffer [K] for active modes
- Support for Kactive < K to reduce computation

### ⏳ Phase 3: Velocity Synthesis (TODO)
Create `velocityField.ts` with:
- WebGPU compute shader for `U_f = -Σ coeff[k] * ∇ψ_k|_f`
- Inputs: coeffBuffer, gradPsi_CKF buffer, Kactive uniform
- Output: UStorage [nF] vec3 face velocities
- Accumulate gradient contributions from active modes

### ⏳ Phase 4: Particle Advection (TODO)
Create `SpectralParticles.tsx` with:
- Reuse `SurfaceEulerianFlow` pattern
- Use spectral velocity field instead of precomputed data
- Barycentric navigation (same as Eulerian flow)
- Optional: lifecycle with respawn from selected vertex region

### ⏳ Phase 5: GUI Controls (TODO)
Add to BrushCard or create SpectralControls:
- Diffusion time `t` slider
- Active modes `Kactive` slider
- Particle count slider
- Toggle continuous respawn
- Visualization mode (heat/flow/both)

## Data Format

### Spectral Package Schema
```typescript
{
  schema: "bct.spectral.v1",
  nV: number,        // Number of vertices
  nF: number,        // Number of faces
  K: number,         // Number of eigenmodes
  layouts: {
    psiKV: "K_nV",           // Row-major: psi[k,v] = psiKV[k + K*v]
    gradPsi_CKF: "C_K_nF"    // Row-major: grad[c,k,f] = gradPsi[c + 3*(k + K*f)]
  }
}
```

### Buffer Definitions
| Buffer | Type | Shape | Description |
|--------|------|-------|-------------|
| `V` | float32 | [nV, 3] | Vertex positions |
| `F` | uint32 | [nF, 3] | Face indices |
| `centroids` | float32 | [nF, 3] | Face centroids |
| `faceNormals` | float32 | [nF, 3] | Face normals |
| `faceNeighbors` | int32 | [nF, 3] | Neighbor face indices (-1 = boundary) |
| `neighborEdge` | uint8 | [nF, 3] | Corresponding edge in neighbor |
| `lambda` | float32 | [K] | Eigenvalues (sorted ascending) |
| `psiKV` | float32 | [K, nV] | Eigenvectors (row-major) |
| `gradPsi_CKF` | float32 | [3, K, nF] | Gradient basis (row-major) |

### Indexing Examples
```typescript
// Access eigenvector value
const psi_kv = psiKV[k + K * v];

// Access gradient component (c=0,1,2 for x,y,z)
const gradPsi_ckf = gradPsi_CKF[c + 3 * (k + K * f)];
```

## Mathematical Background

### Heat Equation on Surfaces
The heat equation on a triangle mesh is:
```
∂u/∂t = -Δu
```

where Δ is the Laplace-Beltrami operator.

### Spectral Decomposition
The eigenmodes satisfy:
```
Δψ_k = λ_k ψ_k
```

Heat diffusion from vertex s at time t:
```
u(x,t) = Σ exp(-λ_k * t) * ψ_k(s) * ψ_k(x)
```

### Gradient Flow
The gradient of the heat function drives particle flow:
```
U(x,t) = -∇u(x,t) = -Σ exp(-λ_k * t) * ψ_k(s) * ∇ψ_k(x)
```

For face-based velocity:
```
U_f = -Σ coeff[k] * ∇ψ_k|_f
where coeff[k] = exp(-λ_k * t) * ψ_k(s)
```

## Testing Instructions

### Test Data Loading
1. Switch to **Experimental** page in app
2. Click **"Spectral Test"** button
3. Verify data loads without errors
4. Check console for validation logs

Expected output:
- Metadata: nV, nF, K values
- Eigenvalue statistics (min, max, mean)
- Sample eigenvector and gradient values
- All buffer sizes match expected shapes

### Test Coefficient Computation (TODO)
Once `coeffCompute.ts` is implemented:
1. Select a vertex in viewer
2. Verify coefficients update in real-time
3. Check coefficient magnitude vs eigenvalue
4. Vary diffusion time `t` slider

### Test Velocity Field (TODO)
Once `velocityField.ts` is implemented:
1. Visualize velocity field as arrows on mesh
2. Verify flow radiates outward from selected vertex
3. Check boundary handling (should be tangent to surface)

### Test Particle Flow (TODO)
Once `SpectralParticles.tsx` is implemented:
1. Select vertex, enable particle flow
2. Verify particles emanate from selected region
3. Test barycentric navigation across faces
4. Verify particles stay on surface

## Performance Notes

### Storage Buffer Limits
WebGPU has 8 storage buffers per shader stage. Current usage:
- `lambda` - 1 buffer
- `psiKV` - 1 buffer
- `gradPsi_CKF` - 1 buffer
- `faceNeighbors` - 1 buffer
- `UStorage` - 1 buffer
- Particle state - 3 buffers (position, velocity, lifecycle)
- **Total: 9 buffers** ❌ EXCEEDS LIMIT!

**Solution**: Pack related data (e.g., faceNeighbors + neighborEdge) or use vertex attributes for geometry.

### Computation Cost
For K=100 modes, nF=10000 faces:
- Coefficient compute: K operations (cheap)
- Velocity synthesis: K * nF = 1M operations (moderate)
- Particle advection: nP * nF lookups (expensive if many particles)

**Optimization**: Use Kactive < K to reduce active modes (e.g., Kactive=20 for real-time).

## References

- [BUNNY_SPECTRAL.md](../../../notes/BUNNY_SPECTRAL.md) - Full design specification
- [SurfaceEulerianFlow.tsx](../SurfaceEulerianFlow.tsx) - Particle advection pattern
- External: [geometry-processing-js](../../../external/geometry-processing-js) - Eigenmode computation (MATLAB/C++)
