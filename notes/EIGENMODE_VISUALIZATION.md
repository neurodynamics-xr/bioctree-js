# Eigenmode Visualization Implementation

## Overview

Simple, efficient eigenmode visualization using direct GPU sampling in shaders. No spectral reconstruction needed - eigenvectors are already spatial patterns!

## Architecture

### Key Insight
**Eigenvectors are spatial patterns**, not spectral data. Each eigenvector is a scalar field on mesh vertices:
- `eigenvector[k][v]` = value of mode k at vertex v
- Visualization = colormap(eigenvector[selectedMode][vertexId])

### Components Created

1. **`eigenmodeVisualization.ts`** - Core visualization logic
   - Uploads eigenvectors as GPU storage buffer
   - Creates TSL material that samples eigenvector[modeIndex][vertexId]
   - Applies colormap (using existing colormapTSL)
   - Changing mode index is **instant** - just updates a uniform!

2. **Storage Buffer Management** - Enhanced GPUResourceManager
   - `registerStorageBuffer()` - Register named storage buffers
   - `getStorageBuffer()` - Get buffer descriptor by key
   - `releaseStorageBuffer()` - Release with ref counting
   - Lifecycle management for compute pipelines

3. **Operator Loader** - Load operators from zarr
   - `loadOperatorFromZarr()` - Load any operator
   - `loadMassMatrix()` - Convenience for mass matrix
   - `extractDiagonalFromCOO()` - Extract diagonal from sparse COO
   - Supports both dense (diagonal) and sparse (COO) formats

### Render Layer Integration

**render.ts** exports:
- `enableEigenmodeVisualization(manifold, modeIndex)` - Initialize visualization
- `setEigenmodeVisualizationParams({ modeIndex, amplitude })` - Update parameters
- `disableEigenmodeVisualization()` - Cleanup and restore default material

### UI Integration

**Home.tsx**:
- Handles `onEigenmodeSelected` callback from ManifoldPanel
- First selection enables visualization
- Subsequent selections update mode index instantly
- Shows current mode in status overlay

**ManifoldPanel.tsx** (already existed):
- Eigenmodes tab with chart showing eigenvalue spectrum
- Click chart to select mode → triggers `onEigenmodeSelected(modeIndex)`

## Data Flow

```
User clicks eigenmode chart (ManifoldPanel)
    ↓
onEigenmodeSelected(modeIndex) → Home
    ↓
renderAPI.enableEigenmodeVisualization(manifold, modeIndex)  [First time]
  OR
renderAPI.setEigenmodeVisualizationParams({ modeIndex })     [Subsequent]
    ↓
GPU: Upload eigenvectors [K×nV] as storage buffer (one-time)
    ↓
Material shader: Sample eigenvectors[modeIndex, vertexId]
    ↓
Apply colormap → mesh colors updated
```

## GPU Shader Logic

```glsl
// Per-vertex shader sampling
vertexId = attribute('vertexId')  // 0-based vertex index
modeIndex = uniform(selectedMode)

// Sample eigenmode value
idx = modeIndex + K * vertexId  // Row-major layout
value = eigenvectorsStorage[idx]

// Normalize and apply colormap
normalized = (value + 1.0) / 2.0  // Assumes [-1, 1] range
rgb = colormap(normalized)
```

## Performance

- **Upload**: One-time upload of eigenvectors (O(K×nV) memory)
- **Mode switching**: Instant! Just updates uniform (O(1))
- **Rendering**: Per-vertex sampling in shader (GPU-parallel)
- No compute passes needed for simple eigenmode visualization
- Storage buffer size: ~56 MB for K=500, nV=14290 (Float32)

## Comparison: Eigenmode vs Heat Kernel

| Feature | Eigenmode Viz | Heat Kernel (HeatKernelTSL) |
|---------|---------------|------------------------------|
| Purpose | Show single eigenmode | Localized heat diffusion |
| Computation | None (direct sampling) | Two-stage compute (forward + inverse) |
| GPU Work | Shader sampling only | Compute: O(K) + O(K×nV) per frame |
| Mode change | Instant (uniform update) | Requires recompute |
| Use case | Inspect basis functions | Interactive brush/localization |

## Future Enhancements

1. **Dynamic colormap switching** - Rebuild material with different colormap
2. **Per-mode range normalization** - Compute min/max for each mode
3. **Multi-mode combination** - Weighted sum of multiple modes (needs compute)
4. **2D texture storage** - Alternative to storage buffer (may be faster on some GPUs)

## Files Modified/Created

**Created**:
- `src/app/compute/spectral/eigenmodeVisualization.ts` - Core viz logic
- `src/app/compute/spectral/EigenmodeVisualizer.ts` - Old complex version (can be removed)
- `src/app/components/panels/EigenmodePanel.tsx` - Standalone control panel (not needed - use ManifoldPanel)
- `src/app/io/loaders/zarr/operators.ts` - Operator loader

**Modified**:
- `src/app/gpu/GPUResourceManager.ts` - Added storage buffer lifecycle
- `src/app/gpu/types.ts` - Added StorageBufferDescriptor
- `src/app/io/loaders/zarr/types.ts` - Added operator types
- `src/app/io/loaders/zarr/index.ts` - Exported operator loaders
- `src/app/components/viewerWebGPU/render.ts` - Integrated eigenmode viz
- `src/app/pages/Home.tsx` - Wired up eigenmode selection

## Testing

1. Load bctbunny.zarr (has eigenmodes)
2. Open Manifold panel → Eigenmodes tab
3. Click on eigenmode chart
4. Mesh should update with colormap of selected eigenmode
5. Click different modes → instant updates!

## Notes

- **EigenmodeVisualizer.ts** was the old complex approach with compute - can be removed
- **EigenmodePanel.tsx** is redundant - ManifoldPanel already has the UI
- Mass matrix loading implemented but not required for simple eigenmode viz
- Heat kernel visualization (HeatKernelTSL) is separate - uses spectral reconstruction
