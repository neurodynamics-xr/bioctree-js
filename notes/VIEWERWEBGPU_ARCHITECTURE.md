# ViewerWebGPU Modular Architecture

## Overview
Modular WebGPU viewer architecture matching the existing `viewer/` structure pattern. This design separates concerns into reusable modules for maintainability and testability.

## Folder Structure

```
src/app/components/viewerWebGPU/
├── main.ts              # Entry point, public API
├── render.ts            # Core orchestrator (renderer, scene, camera, controls)
├── loader.ts            # BCT file loading (binary + JSON)
└── core/
    ├── scene.ts         # Scene factory with root groups
    ├── camera.ts        # Camera creation and resizing
    └── lighting.ts      # View-locked lighting rig
```

## Module Responsibilities

### `main.ts`
- **Entry point** for viewerWebGPU
- Exports `initViewer()` function
- Returns `ViewerWebGPUAPI` interface for React integration
- Re-exports types from other modules

**API:**
```typescript
interface ViewerWebGPUAPI {
  loadMesh: (basePath: string) => Promise<void>;
  loadSpectralMesh: (basePath: string) => Promise<BCTSpectralData>;
  setMeshFromData: (meshData: BCTMeshData) => void;
  getMesh: () => THREE.Mesh | null;
  getRenderer: () => THREE.WebGPURenderer | null;
  getCamera: () => THREE.Camera | null;
  getScene: () => THREE.Scene | null;
  getRoots: () => { world, overlay, debug } | null;
  dispose: () => void;
}
```

### `render.ts`
- **Main orchestrator** - manages all core components
- Initializes WebGPU renderer, scene, camera, controls
- Handles animation loop
- Manages mesh loading and lifecycle
- Provides getter functions for subsystems

**Key Functions:**
- `init(canvas, config)` - Initialize viewer
- `loadMesh(basePath)` - Load BCT mesh from file
- `loadSpectralMesh(basePath)` - Load BCT mesh with spectral data
- `setMeshFromData(meshData)` - Set mesh from raw data
- `dispose()` - Cleanup all resources

### `loader.ts`
- **BCT file loading** - Loads binary vertex/face data + JSON metadata
- Supports spectral data (lambda, psiKV, massV)
- Handles binary parsing and validation

**Binary Format:**
```
[vertices (nV * 3 floats)]
[faces (nF * 3 uints)]
[lambda (K floats)]           // spectral only
[psiKV (K * nV floats)]       // spectral only
[massV (nV floats)]           // spectral only
```

**Functions:**
- `loadBCTMesh(basePath)` - Load basic mesh
- `loadBCTSpectral(basePath)` - Load mesh with spectral data

### `core/scene.ts`
- **Scene factory** - Creates Three.js scene with organized root groups
- Simplified structure (no MATLAB/threejs frame split)
- Root groups: `world` (mesh), `overlay` (UI), `debug` (helpers)

**Usage:**
```typescript
const { scene, roots } = createScene(backgroundColor);
roots.world.add(mesh);
```

### `core/camera.ts`
- **Camera factory** - Creates and configures cameras
- Supports perspective and orthographic cameras
- Handles aspect ratio updates on window resize

**Usage:**
```typescript
const camera = createCamera({
  type: 'perspective',
  fov: 45,
  near: 0.1,
  far: 10000,
  position: [0, 0, 300],
  up: [0, 1, 0]
}, aspect);

// On resize:
resizeCamera(camera, newAspect);
```

### `core/lighting.ts`
- **View-locked lighting rig** - Camera-attached 3-point lighting
- Moves with camera for consistent illumination
- Lights: ambient, key (front-right), fill (front-left), rim (back)

**Usage:**
```typescript
const lightRig = createLightingRig(camera);
// Lights are now attached to camera and move with it
```

## Integration with React

### ViewerWebGPU.tsx
Thin React wrapper that uses the modular structure:

```typescript
import { initViewer, type ViewerWebGPUAPI } from './viewerWebGPU/main';

const api = await initViewer(canvas, {
  backgroundColor: 0x000000,
  cameraConfig: { /* ... */ }
});

// Expose API
window.__viewerWebGPU = api;
```

### ViewerWebGPUTestPage.tsx
Example usage with heat kernel:

```typescript
const handleViewerReady = async (api: ViewerWebGPUAPI) => {
  // Load spectral mesh
  const spectralData = await api.loadSpectralMesh('/src/app/data/bct/bunny_spectral');
  
  // Initialize heat kernel
  const heatKernel = new HeatKernelTSL(
    spectralData.nV,
    spectralData.K,
    spectralData.lambda,
    spectralData.psiKV,
    spectralData.massV,
    api.getRenderer()
  );
  
  // Compute
  heatKernel.compute(api.getRenderer());
};
```

## Key Differences from `viewer/`

1. **TypeScript** - All modules use TypeScript for type safety
2. **WebGPU-only** - No WebGL fallback
3. **StorageBufferAttribute** - All geometry uses compute-compatible buffers
4. **Simplified scene** - No MATLAB/threejs coordinate frame split (BCT data is Y-up)
5. **Async renderer** - WebGPU renderer initialization is async
6. **BCT loader** - Custom loader for bioctree binary format
7. **No state machine** - Simpler state management (viewer/ has StateManager)

## Benefits

✅ **Modular** - Easy to test and maintain individual modules  
✅ **Reusable** - Core modules can be shared with other viewers  
✅ **Type-safe** - TypeScript provides compile-time safety  
✅ **WebGPU-native** - Optimized for compute workflows  
✅ **Consistent** - Matches team's existing viewer/ pattern  
✅ **Swappable** - Can replace viewer in ViewerCanvas with minimal changes  

## Next Steps

1. **Colormap TSL Node** - Create colormap lookup for scalar visualization
2. **Material Binding** - Bind heat field storage to material.colorNode
3. **Vertex Picking** - Add raycasting for vertex selection
4. **State Management** - Add optional StateManager for complex workflows
5. **Error Handling** - Improve error messages and fallbacks
6. **Testing** - Unit tests for loader, scene factory, camera

## File Paths

- Main: `src/app/components/viewerWebGPU/main.ts`
- Render: `src/app/components/viewerWebGPU/render.ts`
- Loader: `src/app/components/viewerWebGPU/loader.ts`
- Scene: `src/app/components/viewerWebGPU/scene.ts`
- Camera: `src/app/components/viewerWebGPU/camera.ts`
- Lighting: `src/app/components/viewerWebGPU/lighting.ts`
- React wrapper: `src/app/components/ViewerWebGPU.tsx`
- Test page: `src/app/pages/ViewerWebGPUTestPage.tsx`
