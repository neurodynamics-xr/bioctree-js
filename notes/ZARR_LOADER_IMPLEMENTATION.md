# BCT Zarr Loader Package - Implementation Summary

## Overview
Created a structured, modular package for loading BCT Zarr manifold data in `src/app/io/loaders/zarr/`. This replaces the monolithic `zarrLoader.ts` with a well-organized package that supports the full BCT Zarr schema v1.1.

## Package Structure

```
src/app/io/loaders/zarr/
├── index.ts          # Public API exports
├── types.ts          # TypeScript interfaces for BCT schema
├── store.ts          # Zarrita utility functions
├── manifold.ts       # Core manifold loader (Phase 1)
└── eigenmodes.ts     # Eigenmodes loader (Phase 2)
```

## Implemented Phases

### Phase 1: Manifold Loader ✅ COMPLETE

**File:** `manifold.ts`

**Functionality:**
- Loads vertices [N, 3] from `manifold/vertices`
- Loads faces [M, 3] from `manifold/faces`
- Loads edges [E, 2] from `manifold/edges` (optional)
- Validates BCT schema version (`bct.manifold@X.Y`)
- Converts 1-based indices to 0-based (BCT → Three.js)
- Validates index bounds

**API:**
```typescript
await loadManifoldFromZarr(path: string, options?: LoadManifoldOptions): Promise<ZarrManifold>

interface LoadManifoldOptions {
  loadEdges?: boolean;         // Default: true
  validateIndices?: boolean;   // Default: true
}

interface ZarrManifold {
  vertices: Float32Array | Float64Array;    // [N, 3]
  faces: Uint32Array;                        // [M, 3]
  edges?: Uint32Array;                       // [E, 2]
  metadata: BCTManifoldAttrs;
}
```

### Phase 2: Eigenmodes Loader ✅ COMPLETE

**File:** `eigenmodes.ts`

**Functionality:**
- Loads eigenvalues [K] from `manifold/eigenmodes/eigenvalues`
- Loads eigenvectors [N, K] from `manifold/eigenmodes/eigenvectors`
- Supports partial loading (first K modes, or specific range)
- Reads eigenmodes metadata (solver, numModes, computed_utc)

**API:**
```typescript
await loadEigenmodesFromZarr(path: string, options?: LoadEigenmodesOptions): Promise<ZarrEigenmodes>

interface LoadEigenmodesOptions {
  maxModes?: number;           // Load only first K modes
  modesRange?: [number, number]; // Load specific range [start, end)
}

interface ZarrEigenmodes {
  eigenvalues: Float32Array | Float64Array; // [K]
  eigenvectors: Float32Array | Float64Array; // [N, K]
  metadata: BCTEigenmodesAttrs;
}

// Helper for single mode
await loadSingleEigenmode(path: string, modeIndex: number): Promise<TypedArray>
```

## Supporting Files

### `types.ts`
Defines TypeScript interfaces for:
- **Root attributes:** `BCTRootAttrs` (schema, format, zarr_version, created_utc)
- **Group attributes:** `BCTManifoldAttrs`, `BCTEigenmodesAttrs`, `BCTGeometryAttrs`, etc.
- **Data structures:** `ZarrManifold`, `ZarrEigenmodes`, `ZarrGeometry`, etc.
- **Loader options:** `LoadManifoldOptions`, `LoadEigenmodesOptions`

### `store.ts`
Utility functions for zarrita operations:
- `openZarrStore(path)` - Open FetchStore and return root location
- `checkGroupExists(loc, groupPath)` - Check if group exists
- `readArray<T>(loc, arrayPath)` - Read array and extract TypedArray data
- `readAttrs<T>(loc, groupPath)` - Read group/array attributes

### `index.ts`
Public API exports - single entry point for package

## Integration

### Updated `IOPanel.tsx`

**Before:** Used monolithic `loadZarrFromData()`

**After:** Uses structured loader
```typescript
import { loadManifoldFromZarr } from '@/app/io/loaders/zarr';

// Load zarr
const zarrManifold = await loadManifoldFromZarr(zarrPath, {
  loadEdges: true,
  validateIndices: true,
});

// Create Manifold object
const manifold = new Manifold(metadata, core, {}, topology);
setManifold(manifold);
```

## Key Design Decisions

### 1. Lowercase Paths
BCT Zarr schema documentation shows uppercase (`Vertices`, `Faces`) but actual implementation uses lowercase (`vertices`, `faces`). Confirmed via directory listing of `bctbunny.zarr`.

### 2. Index Conversion
BCT uses 1-based indexing (MATLAB convention), Three.js uses 0-based. Loader automatically converts during load:
```typescript
for (let i = 0; i < faces.length; i++) {
  faces[i] -= 1; // 1-based → 0-based
}
```

### 3. TypedArray Extraction
Zarrita returns `ndarray` objects. Loader extracts `.data` property:
```typescript
const ndarray = await zarr.get(array);
const data = (ndarray as any).data; // Extract TypedArray
```

### 4. Modular Architecture
Each BCT schema group gets its own loader file:
- `manifold.ts` - Core mesh (vertices, faces, edges)
- `eigenmodes.ts` - Spectral data (eigenvalues, eigenvectors)
- Future: `geometry.ts`, `operators.ts`, `topology.ts`

## Testing

### Test File
`src/app/data/bctbunny.zarr` - Full BCT v1.1 schema with:
- 14,290 vertices
- 28,576 faces
- 42,864 edges
- Eigenmodes group (ready for Phase 2 testing)
- Geometry, operators, topology groups

### Expected Results
```
[IOPanel] Zarr manifold loaded: {
  numVertices: 14290,
  numFaces: 28576,
  numEdges: 42864,
  metadata: {
    Name: "bunny",
    Source: "...bunny.obj",
    CreatedBy: "diell",
    ...
  }
}
```

## Next Steps (Phase 3)

### 1. Geometry Loader
**File:** `geometry.ts`
- Load vertex areas, face areas
- Load vertex normals, face normals
- Load edge lengths

### 2. Operators Loader
**File:** `operators.ts`
- Load sparse Laplacian (COO format: row, col, data)
- Load sparse mass matrix
- Load other operators (gradient, divergence, etc.)

### 3. Topology Loader
**File:** `topology.ts`
- Load vertex degrees
- Load adjacency lists
- Load boundary information

### 4. Integrate with Eigenmodes Visualization
- Load eigenmode with `loadSingleEigenmode(path, modeIdx)`
- Apply to mesh as scalar field
- Visualize with GPU colormap shader
- Create UI for mode selection (slider 0 to K-1)

## Migration Notes

### Old Code Pattern
```typescript
// Old monolithic approach
import { loadZarrFromData } from '@/app/io/loaders/zarrLoader';
await loadZarrFromData(selectedZarr);
```

### New Code Pattern
```typescript
// New structured approach
import { loadManifoldFromZarr } from '@/app/io/loaders/zarr';

const zarrManifold = await loadManifoldFromZarr(`src/app/data/${name}.zarr`, {
  loadEdges: true,
  validateIndices: true,
});

// Construct Manifold object
const manifold = new Manifold(metadata, core, {}, topology);
```

### Backward Compatibility
Old `zarrLoader.ts` remains in codebase but is now superseded. Can be safely removed after full migration and testing.

## Dependencies

### Runtime
- `zarrita@0.5.4` - Zarr v2 reader for TypeScript
- `three@latest` - For Three.js types (Uint32Array, Float32Array)

### Development
- TypeScript strict mode compatible
- All interfaces properly typed
- No `any` types except for zarrita's ndarray extraction

## File Locations

```
src/app/io/loaders/zarr/
├── index.ts          (39 lines)
├── types.ts          (128 lines)
├── store.ts          (77 lines)
├── manifold.ts       (157 lines)
└── eigenmodes.ts     (147 lines)

Total: ~548 lines (well-documented, typed)
```

## Success Criteria

- [x] Package structure created
- [x] TypeScript interfaces for BCT schema
- [x] Zarrita utility functions
- [x] Manifold loader (vertices, faces, edges)
- [x] Eigenmodes loader (eigenvalues, eigenvectors)
- [x] IOPanel integration
- [x] No TypeScript errors
- [ ] Browser test with bctbunny.zarr (next: verify in console)
- [ ] Eigenmodes visualization demo (Phase 3)

## Documentation

Each loader function includes:
- JSDoc comments explaining purpose
- Parameter descriptions
- Return type documentation
- Error handling notes

Example:
```typescript
/**
 * Load a manifold from a BCT Zarr package
 * @param path - Path to .zarr directory (e.g., 'src/app/data/bctbunny.zarr')
 * @param options - Loading options
 * @returns ZarrManifold containing vertices, faces, edges, and metadata
 */
export async function loadManifoldFromZarr(...)
```

## Credits
- BCT Zarr Schema v1.1 specification
- Zarrita library for Zarr v2 support
- Three.js WebGPU for GPU compute integration
