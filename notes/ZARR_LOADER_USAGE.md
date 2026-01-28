# BCT Zarr Loader - Usage Examples

## Basic Manifold Loading

```typescript
import { loadManifoldFromZarr } from '@/app/io/loaders/zarr';
import { Manifold, ManifoldMetadata, ManifoldCore, ManifoldTopology } from '@/app/manifold/Manifold';

// Load zarr package
const zarrPath = 'src/app/data/bctbunny.zarr';
const zarrManifold = await loadManifoldFromZarr(zarrPath, {
  loadEdges: true,        // Load edge connectivity
  validateIndices: true,  // Validate index bounds
});

// Create Manifold object
const nV = zarrManifold.vertices.length / 3;
const nF = zarrManifold.faces.length / 3;

const metadata: ManifoldMetadata = {
  id: zarrManifold.metadata.ID || 'bunny',
  name: zarrManifold.metadata.Name || 'bunny',
  createdAt: Date.now(),
  source: zarrPath,
};

const core: ManifoldCore = {
  vertices: zarrManifold.vertices as Float32Array,
  faces: zarrManifold.faces,
  nV,
  nF,
};

const topology: ManifoldTopology = zarrManifold.edges ? {
  edges: zarrManifold.edges,
  nE: zarrManifold.edges.length / 2,
} : {};

const manifold = new Manifold(metadata, core, {}, topology);
```

## Loading All Eigenmodes

```typescript
import { loadEigenmodesFromZarr } from '@/app/io/loaders/zarr';

// Load all eigenmodes
const eigenmodes = await loadEigenmodesFromZarr('src/app/data/bctbunny.zarr');

console.log('Loaded eigenmodes:', {
  numModes: eigenmodes.metadata.numModes,
  solver: eigenmodes.metadata.solver,
  eigenvalues: eigenmodes.eigenvalues,      // [K]
  eigenvectors: eigenmodes.eigenvectors,    // [N, K]
});
```

## Loading First K Eigenmodes

```typescript
import { loadEigenmodesFromZarr } from '@/app/io/loaders/zarr';

// Load only first 10 modes
const eigenmodes = await loadEigenmodesFromZarr('src/app/data/bctbunny.zarr', {
  maxModes: 10,
});

console.log(`Loaded ${eigenmodes.metadata.numModes} modes`); // "Loaded 10 modes"
```

## Loading Specific Eigenmode Range

```typescript
import { loadEigenmodesFromZarr } from '@/app/io/loaders/zarr';

// Load modes 5-15 (exclusive end)
const eigenmodes = await loadEigenmodesFromZarr('src/app/data/bctbunny.zarr', {
  modesRange: [5, 15],
});

console.log(`Loaded modes 5-14: ${eigenmodes.metadata.numModes} modes`); // "Loaded 10 modes"
```

## Loading Single Eigenmode for Visualization

```typescript
import { loadSingleEigenmode } from '@/app/io/loaders/zarr';
import * as renderAPI from '@/app/components/viewerWebGPU/render';

// Load mode 3 (0-indexed)
const eigenmode3 = await loadSingleEigenmode('src/app/data/bctbunny.zarr', 3);

console.log('Eigenmode 3:', {
  length: eigenmode3.length,     // N (number of vertices)
  min: Math.min(...eigenmode3),
  max: Math.max(...eigenmode3),
});

// Visualize on mesh with GPU colormap
const scalarStorage = TSL.storage(scalarAttr, 'float', eigenmode3.length);
renderAPI.setFieldColormap(scalarStorage, 'viridis', minVal, maxVal);
```

## Error Handling

```typescript
import { loadManifoldFromZarr, loadEigenmodesFromZarr } from '@/app/io/loaders/zarr';

try {
  // Load manifold
  const manifold = await loadManifoldFromZarr('src/app/data/bctbunny.zarr');
  console.log('✓ Manifold loaded:', manifold);
  
  // Try to load eigenmodes
  try {
    const eigenmodes = await loadEigenmodesFromZarr('src/app/data/bctbunny.zarr');
    console.log('✓ Eigenmodes loaded:', eigenmodes);
  } catch (error) {
    console.warn('⚠ Eigenmodes not available:', error);
    // Continue without eigenmodes
  }
  
} catch (error) {
  console.error('✗ Failed to load manifold:', error);
  throw error;
}
```

## Checking Group Availability

```typescript
import { openZarrStore, checkGroupExists } from '@/app/io/loaders/zarr';

const rootLoc = await openZarrStore('src/app/data/bctbunny.zarr');

// Check what groups are available
const hasEigenmodes = await checkGroupExists(rootLoc, 'manifold/eigenmodes');
const hasGeometry = await checkGroupExists(rootLoc, 'manifold/geometry');
const hasOperators = await checkGroupExists(rootLoc, 'manifold/operators');
const hasTopology = await checkGroupExists(rootLoc, 'manifold/topology');

console.log('Available groups:', {
  eigenmodes: hasEigenmodes,
  geometry: hasGeometry,
  operators: hasOperators,
  topology: hasTopology,
});
```

## Reading Custom Arrays

```typescript
import { openZarrStore, readArray, readAttrs } from '@/app/io/loaders/zarr';

const rootLoc = await openZarrStore('src/app/data/bctbunny.zarr');

// Read custom array
const customData = await readArray<Float32Array>(rootLoc, 'manifold/geometry/vertexAreas');
console.log('Vertex areas:', customData);

// Read custom attributes
const customAttrs = await readAttrs(rootLoc, 'manifold/geometry');
console.log('Geometry metadata:', customAttrs);
```

## Integration with IOPanel

```typescript
// In your panel component
import { loadManifoldFromZarr } from '@/app/io/loaders/zarr';
import { setManifold } from '@/app/state/manifold';

const handleLoadZarr = async () => {
  const selectedZarr = 'bctbunny'; // From dropdown
  const zarrPath = `src/app/data/${selectedZarr}.zarr`;
  
  // Load manifold
  const zarrManifold = await loadManifoldFromZarr(zarrPath, {
    loadEdges: true,
    validateIndices: true,
  });
  
  // Construct Manifold object
  const manifold = new Manifold(metadata, core, {}, topology);
  
  // Update global state
  setManifold(manifold);
  
  console.log('✓ Zarr loaded and visualized');
};
```

## Eigenmode Slider UI (Future)

```typescript
import { useState } from 'react';
import { loadSingleEigenmode } from '@/app/io/loaders/zarr';
import { Slider } from '@/app/components/ui/slider';

function EigenmodePanel() {
  const [modeIndex, setModeIndex] = useState(0);
  const [numModes, setNumModes] = useState(100); // From metadata
  
  const handleModeChange = async (newIndex: number) => {
    setModeIndex(newIndex);
    
    // Load and visualize eigenmode
    const eigenmode = await loadSingleEigenmode('src/app/data/bctbunny.zarr', newIndex);
    
    // Apply to mesh
    const minVal = Math.min(...eigenmode);
    const maxVal = Math.max(...eigenmode);
    renderAPI.setFieldColormap(scalarStorage, 'viridis', minVal, maxVal);
  };
  
  return (
    <div>
      <Label>Eigenmode: {modeIndex}</Label>
      <Slider
        min={0}
        max={numModes - 1}
        value={[modeIndex]}
        onValueChange={([val]) => handleModeChange(val)}
      />
    </div>
  );
}
```

## Performance Notes

### Chunk Loading
Zarr supports chunked arrays. The loader automatically handles chunks transparently via zarrita.

### Partial Loading
For large eigenvector matrices [N, K], use `modesRange` or `maxModes` to avoid loading all modes:
```typescript
// Only load modes 0-9 (saves memory)
const eigenmodes = await loadEigenmodesFromZarr(path, { maxModes: 10 });
```

### Caching
Consider caching loaded eigenmodes to avoid re-fetching:
```typescript
const eigenmodesCache = new Map<number, Float64Array>();

async function getCachedEigenmode(modeIndex: number): Promise<Float64Array> {
  if (!eigenmodesCache.has(modeIndex)) {
    const mode = await loadSingleEigenmode(path, modeIndex);
    eigenmodesCache.set(modeIndex, mode);
  }
  return eigenmodesCache.get(modeIndex)!;
}
```

## Debugging

### Enable Verbose Logging
```typescript
const zarrManifold = await loadManifoldFromZarr(path, {
  loadEdges: true,
  validateIndices: true, // Will log validation errors
});

console.log('Loaded:', {
  numVertices: zarrManifold.vertices.length / 3,
  numFaces: zarrManifold.faces.length / 3,
  numEdges: zarrManifold.edges?.length / 2,
  metadata: zarrManifold.metadata,
  
  // Check array types
  verticesType: zarrManifold.vertices.constructor.name,
  facesType: zarrManifold.faces.constructor.name,
  edgesType: zarrManifold.edges?.constructor.name,
});
```

### Check Zarr Structure
```bash
# List zarr directory structure
ls -R src/app/data/bctbunny.zarr/

# Check metadata
cat src/app/data/bctbunny.zarr/.zattrs
cat src/app/data/bctbunny.zarr/manifold/.zattrs
cat src/app/data/bctbunny.zarr/manifold/eigenmodes/.zattrs
```

### Common Issues

**Issue:** `Failed to extract data from array at manifold/vertices`
**Fix:** Check that .zarray and data chunks exist in the directory

**Issue:** `Invalid BCT schema: expected "bct.manifold@X.Y"`
**Fix:** Check root .zattrs has correct schema field

**Issue:** `Face index out of bounds`
**Fix:** Verify faces use 1-based indexing in BCT (loader converts automatically)

**Issue:** `Eigenmodes group not found`
**Fix:** Not all manifolds have eigenmodes - use try/catch or check availability first
