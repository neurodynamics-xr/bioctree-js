# IO Module - Data Loading Architecture

Clean separation of concerns for data loading in Bioctreeapp.

## Architecture Overview

```
UI Layer (ManifoldPanel)
    ↓ triggers load requests
App Layer (ViewerPage, hooks)
    ↓ coordinates IO → Viewer
IO Layer (src/app/io)
    ↓ loads & validates data
    ├─→ Viewer Layer (ViewerCanvas) - rendering only
    └─→ App State (React state)
```

## Directory Structure

```
src/app/
├── io/
│   ├── loaders/
│   │   ├── types.ts              # Common type definitions
│   │   ├── manifoldLoader.ts     # Load GLB/GLTF/OBJ/JSON geometry
│   │   ├── fieldLoader.ts        # Load scalar/vector fields
│   │   └── bctSpectralLoader.ts  # Load BCT spectral packages
│   ├── validators/               # Data validation (future)
│   └── index.ts                  # Public API exports
│
├── data/                         # Test datasets
│   ├── manifolds/                # 3D geometry files
│   │   ├── bunny.glb
│   │   ├── fsaverage.glb
│   │   └── cube.json
│   ├── fields/                   # Scalar/vector fields
│   │   ├── test_scalar_gaussian.json
│   │   └── gaussian_163842.bin
│   └── bct/                      # BCT processed data
│       ├── bunny_spectral.json   # Eigenmode manifest
│       └── bunny_spectral.bin    # Packed binary data
│
└── hooks/
    ├── useMeshLoader.ts          # React hook for manifold loading
    └── useBCTSpectral.ts         # React hook for spectral loading
```

## Usage Examples

### Loading Manifold Geometry

```typescript
import { loadManifold } from '@/app/io';

// Auto-detect format from extension
const result = await loadManifold('/data/manifolds/bunny.glb');
console.log('Vertices:', result.data.statistics.vertexCount);
console.log('Faces:', result.data.statistics.faceCount);

// With progress tracking
const result = await loadManifold('/data/manifolds/fsaverage.glb', undefined, {
  onProgress: (progress) => {
    console.log(`Loading: ${progress.percentage}%`);
  }
});

// Access Three.js geometry
const geometry = result.data.geometry;  // BufferGeometry
const scene = result.data.scene;        // Group (for GLB/GLTF)
```

### Loading BCT Spectral Data

```typescript
import { loadBCTSpectral, getPsi, getGradPsi } from '@/app/io';

// Load spectral package
const result = await loadBCTSpectral('/data/bct/bunny_spectral.json');
const spectral = result.data;

console.log('Eigenmodes:', spectral.K);
console.log('Vertices:', spectral.nV);

// Access eigenvalues
const lambda0 = spectral.lambda[0];  // First eigenvalue

// Access eigenvectors (using helper)
const psi_k_v = getPsi(spectral.psi, spectral.K, k, v);

// Access gradient basis (using helper)
const grad_c_k_f = getGradPsi(spectral.gradPsi, spectral.K, c, k, f);
```

### Loading Scalar Fields

```typescript
import { loadScalarField, validateFieldManifoldMatch } from '@/app/io';

// Load field data
const fieldResult = await loadScalarField('/data/fields/test_scalar_gaussian.json');
const field = fieldResult.data;

console.log('Field name:', field.name);
console.log('Value range:', field.range);

// Validate against manifold
const validation = validateFieldManifoldMatch(field, manifold.statistics.vertexCount);
if (!validation.valid) {
  console.error(validation.error);
}
```

### Using React Hooks

```typescript
import { useMeshLoader, useBCTSpectral } from '@/app/hooks';

function MyComponent() {
  const { state: meshState, loadMesh } = useMeshLoader();
  const { state: spectralState, loadSpectral } = useBCTSpectral();

  const handleLoad = async () => {
    await loadMesh('/data/manifolds/bunny.glb');
    await loadSpectral('/data/bct/bunny_spectral.json');
  };

  if (meshState.loading) return <div>Loading mesh...</div>;
  if (meshState.error) return <div>Error: {meshState.error.message}</div>;
  
  return <ViewerCanvas mesh={meshState.data} spectral={spectralState.data} />;
}
```

## Data Format Specifications

### Manifold Formats

**GLB/GLTF**: Standard glTF 2.0 binary/text format
- Preserves scene graph, materials, animations
- Y-up coordinate system (Three.js native)

**OBJ**: Wavefront OBJ format
- Vertices, faces, normals, UVs
- Multiple objects supported

**JSON**: Custom format
```json
{
  "vertices": [x1, y1, z1, x2, y2, z2, ...],
  "faces": [i0, i1, i2, ...],
  "normals": [...],         // Optional
  "indexBase": 0,           // 0 or 1
  "coordinateFrame": "matlab"  // "matlab" (Z-up) or "threejs" (Y-up)
}
```

### BCT Spectral Format

**Manifest** (`bunny_spectral.json`):
```json
{
  "schema": "bct.spectral.v1",
  "nV": 1889,
  "nF": 3774,
  "K": 100,
  "layouts": {
    "psi": "K_nV",        // Row-major: psi[k,v] = psi[k + K*v]
    "gradPsi": "C_K_nF"   // Row-major: grad[c,k,f] = gradPsi[c + 3*(k + K*f)]
  },
  "buffers": [
    {
      "name": "lambda",
      "dtype": "float32",
      "shape": [100],
      "count": 100,
      "byteOffset": 0
    },
    // ... more buffers
  ]
}
```

**Binary Data** (`bunny_spectral.bin`):
Packed binary array with buffers defined in manifest.

### Field Format

**JSON** (simple):
```json
{
  "name": "gaussian_field",
  "values": [0.1, 0.2, 0.3, ...],
  "colormap": "viridis"
}
```

**Manifest + Binary** (for large fields):
```json
{
  "name": "gaussian_field",
  "type": "scalar",
  "vertexCount": 163842,
  "dataFile": "gaussian_163842.bin",
  "dtype": "float32",
  "colormap": "viridis"
}
```

## Design Principles

### 1. **Separation of Concerns**
- **IO Layer**: Only loads and validates data
- **Viewer Layer**: Only renders (receives pre-loaded data)
- **App Layer**: Coordinates data flow

### 2. **Type Safety**
- All data structures have explicit TypeScript interfaces
- No `any` types in public APIs
- Runtime validation in loaders

### 3. **Zero-Copy Where Possible**
- Typed array views over ArrayBuffers
- No unnecessary data copying
- Efficient memory usage

### 4. **Error Handling**
- All loaders throw on fatal errors
- Non-fatal issues collected as warnings
- Optional error callbacks via `LoadOptions`

### 5. **Progressive Loading**
- Optional progress callbacks
- Async/await for all operations
- Cancellable (future enhancement)

## Migration Notes

### For Existing Code

**Old** (loading in viewer):
```typescript
import { loadModel } from '../viewer/render.js';
await loadModel('/src/app/components/viewer/assets/bunny.glb');
```

**New** (loading in app layer):
```typescript
import { loadManifold } from '@/app/io';
const result = await loadManifold('/data/manifolds/bunny.glb');
// Pass result.data to viewer as prop
```

### Path Changes

| Old Path | New Path |
|----------|----------|
| `/src/app/components/viewer/assets/*.glb` | `/data/manifolds/*.glb` |
| `/data/bunny_spectral.json` | `/data/bct/bunny_spectral.json` |
| Field files in assets | `/data/fields/*.json` |

## Future Enhancements

- **Caching**: Cache loaded data by URL
- **Validation**: Comprehensive geometry validation
- **Streaming**: Stream large files with partial loading
- **Cancellation**: Abort ongoing loads
- **Compression**: Support compressed formats
- **Conversion**: Auto-convert between formats
