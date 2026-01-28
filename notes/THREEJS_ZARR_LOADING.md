# Loading BCT Zarr Manifolds in Three.js

## Overview

This guide explains how to load manifold data exported by `bct.file.manifold.write.zarr()` in Three.js using the [zarrita](https://github.com/manzt/zarrita.js) JavaScript package.

**Key Benefits of BCT Zarr Format**:
- ✅ GPU-optimized C-order layout (no transpose needed)
- ✅ Float32 vertices (native GPU precision)
- ✅ 0-based indexing (direct WebGL/WebGPU usage)
- ✅ Rich metadata (axis labels, units, provenance)
- ✅ HTTP-friendly (cloud/CDN delivery)

---

## Prerequisites

### Install zarrita

```bash
npm install zarrita
```

### Import Dependencies

```javascript
import * as zarr from 'zarrita';
import * as THREE from 'three';
```

---

## Basic Loading Pattern

### 1. Open Zarr Store (HTTP)

```javascript
// Open Zarr store from HTTP endpoint
const store = new zarr.FetchStore('https://example.com/manifolds/brain.zarr');
const root = await zarr.open(store, { kind: 'group' });

// Navigate to manifold group
const manifoldGroup = await zarr.open(store, { 
  path: 'manifold',
  kind: 'group' 
});
```

### 2. Load Vertices

```javascript
// Open vertices array
const verticesArray = await zarr.open(store, { 
  path: 'manifold/vertices',
  kind: 'array' 
});

// Read metadata
const vertexMeta = verticesArray.meta;
console.log('Vertex shape:', vertexMeta.shape);      // [N, 3]
console.log('Vertex dtype:', vertexMeta.dtype);      // '<f4' (float32)
console.log('Vertex order:', vertexMeta.order);      // 'C' (row-major)

// Read attributes
const vertexAttrs = await zarr.getAttrs(store, 'manifold/vertices');
console.log('Vertex axis:', vertexAttrs.axis);       // ["vertex", "xyz"]
console.log('Units:', vertexAttrs.units);            // "m"

// Read data (single chunk for manifold topology)
const vertexData = await verticesArray.get();        // Float32Array

// Data is ALREADY in interleaved format: [x1,y1,z1, x2,y2,z2, ...]
// NO transpose or reordering needed!
```

### 3. Load Faces (Triangle Indices)

```javascript
// Open faces array
const facesArray = await zarr.open(store, { 
  path: 'manifold/faces',
  kind: 'array' 
});

// Read metadata
const faceMeta = facesArray.meta;
console.log('Face shape:', faceMeta.shape);          // [F, 3]
console.log('Face dtype:', faceMeta.dtype);          // '<u4' (uint32)

// Read attributes
const faceAttrs = await zarr.getAttrs(store, 'manifold/faces');
console.log('Index base:', faceAttrs.index_base);    // 0 (0-based)
console.log('Primitive:', faceAttrs.primitive);      // "triangles"

// Read data
const faceData = await facesArray.get();             // Uint32Array

// Data is ALREADY 0-based: [v1,v2,v3, v4,v5,v6, ...]
// Direct WebGL/WebGPU indexing!
```

### 4. Create Three.js Geometry

```javascript
// Create BufferGeometry
const geometry = new THREE.BufferGeometry();

// Set vertex positions (direct assignment, no conversion needed)
geometry.setAttribute('position', 
  new THREE.BufferAttribute(vertexData, 3));

// Set triangle indices (direct assignment)
geometry.setIndex(
  new THREE.BufferAttribute(faceData, 1));

// Optional: Compute normals for lighting
geometry.computeVertexNormals();

// Create mesh
const material = new THREE.MeshStandardMaterial({ 
  color: 0x888888,
  side: THREE.DoubleSide 
});
const mesh = new THREE.Mesh(geometry, material);
```

---

## Complete Example: Load Brain Mesh

```javascript
import * as zarr from 'zarrita';
import * as THREE from 'three';

async function loadBCTManifold(zarrUrl) {
  try {
    // Open store
    const store = new zarr.FetchStore(zarrUrl);
    
    // Load metadata from root
    const rootAttrs = await zarr.getAttrs(store, '');
    console.log('Schema:', rootAttrs.schema);         // "bct.manifold@1"
    
    // Load manifold metadata
    const manifoldAttrs = await zarr.getAttrs(store, 'manifold');
    console.log('Manifold ID:', manifoldAttrs.id);
    console.log('Name:', manifoldAttrs.name);
    console.log('Coordinate system:', manifoldAttrs.coordinate_system);
    console.log('Face winding:', manifoldAttrs.face_winding);
    console.log('Units:', manifoldAttrs.metric.unit);
    
    // Load vertices
    const verticesArray = await zarr.open(store, { 
      path: 'manifold/vertices',
      kind: 'array' 
    });
    const vertices = await verticesArray.get();
    
    // Load faces
    const facesArray = await zarr.open(store, { 
      path: 'manifold/faces',
      kind: 'array' 
    });
    const faces = await facesArray.get();
    
    // Validate data
    const numVertices = verticesArray.meta.shape[0];
    const numFaces = facesArray.meta.shape[0];
    console.log(`Loaded ${numVertices} vertices, ${numFaces} faces`);
    
    // Check index bounds (for debugging)
    const maxIndex = Math.max(...faces);
    if (maxIndex >= numVertices) {
      console.warn(`Invalid face index: ${maxIndex} >= ${numVertices}`);
    }
    
    // Create Three.js geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', 
      new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(
      new THREE.BufferAttribute(faces, 1));
    geometry.computeVertexNormals();
    
    // Apply coordinate system transform if needed
    if (manifoldAttrs.coordinate_system === 'RAS') {
      // RAS to Three.js coordinate system
      geometry.rotateX(-Math.PI / 2);
    }
    
    return {
      geometry,
      metadata: manifoldAttrs
    };
    
  } catch (error) {
    console.error('Failed to load BCT manifold:', error);
    throw error;
  }
}

// Usage
const { geometry, metadata } = await loadBCTManifold(
  'https://cdn.example.com/brain_lh_pial.zarr'
);

const material = new THREE.MeshStandardMaterial({ 
  color: 0xcccccc,
  metalness: 0.2,
  roughness: 0.8
});
const mesh = new THREE.Mesh(geometry, material);
scene.add(mesh);
```

---

## Advanced: Loading Edges

```javascript
// Load edges for wireframe visualization
const edgesArray = await zarr.open(store, { 
  path: 'manifold/edges',
  kind: 'array' 
});
const edges = await edgesArray.get();  // Uint32Array

// Create wireframe geometry
const edgeGeometry = new THREE.BufferGeometry();
edgeGeometry.setAttribute('position', 
  new THREE.BufferAttribute(vertices, 3));
edgeGeometry.setIndex(
  new THREE.BufferAttribute(edges, 1));

const wireframe = new THREE.LineSegments(
  edgeGeometry,
  new THREE.LineBasicMaterial({ color: 0x000000 })
);
```

---

## WebGPU-Specific Optimizations

### Using WebGPU Backend

```javascript
import WebGPU from 'three/addons/capabilities/WebGPU.js';
import WebGPURenderer from 'three/addons/renderers/webgpu/WebGPURenderer.js';

// Check WebGPU support
if (!await WebGPU.isAvailable()) {
  console.warn('WebGPU not supported, falling back to WebGL');
}

// Create WebGPU renderer
const renderer = new WebGPURenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Load manifold (same code as above)
const { geometry, metadata } = await loadBCTManifold(zarrUrl);

// WebGPU automatically benefits from:
// ✓ Float32 vertices (native GPU format)
// ✓ Interleaved C-order layout (optimal for GPU cache)
// ✓ Uint32 indices (WebGPU supports up to 4B vertices)
```

### TSL Material (Three.js Shading Language)

```javascript
import { MeshStandardNodeMaterial } from 'three/nodes';
import { attribute, color, positionLocal } from 'three/nodes';

// Create TSL material with custom shading
const material = new MeshStandardNodeMaterial();

// Access vertex attributes in TSL
material.colorNode = color(0xcccccc);

// Optional: Add custom vertex shader logic
material.positionNode = positionLocal.add(
  attribute('normal').mul(0.01)  // Inflate mesh slightly
);

const mesh = new THREE.Mesh(geometry, material);
```

---

## Handling Metadata

### Parse Metric Information

```javascript
const manifoldAttrs = await zarr.getAttrs(store, 'manifold');

// Parse metric
const metric = manifoldAttrs.metric;
console.log('Unit:', metric.unit);               // "m", "mm", etc.

// Check if rescaling was applied
if (metric.rescale.applied) {
  console.log('Rescaled from:', metric.rescale.from_unit);
  console.log('Factor:', metric.rescale.factor);
  console.log('Timestamp:', metric.rescale.timestamp);
}

// Scale geometry if needed
if (metric.unit === 'mm') {
  geometry.scale(0.001, 0.001, 0.001);  // Convert mm to m
}
```

### Handle Coordinate Systems

```javascript
// BCT coordinate systems: "RAS", "LPS", "scanner", "unknown"
const coordSys = manifoldAttrs.coordinate_system;

if (coordSys === 'RAS') {
  // RAS (Right-Anterior-Superior) to Three.js (+X right, +Y up, +Z forward)
  geometry.rotateX(-Math.PI / 2);  // Flip Y/Z
}

if (coordSys === 'LPS') {
  // LPS (Left-Posterior-Superior) to Three.js
  geometry.scale(-1, 1, 1);         // Flip X (Left → Right)
  geometry.rotateX(-Math.PI / 2);   // Flip Y/Z
}
```

### Validate Face Winding

```javascript
const winding = manifoldAttrs.face_winding;  // "CCW" or "CW"

if (winding === 'CCW') {
  // Counter-clockwise (BCT default, Three.js default)
  material.side = THREE.FrontSide;
} else if (winding === 'CW') {
  // Clockwise (flip normals)
  material.side = THREE.BackSide;
}
```

---

## Performance Considerations

### 1. Progressive Loading (Future: Multi-Chunk)

When BCT implements chunking for large meshes:

```javascript
// Hypothetical: Load mesh progressively
const verticesArray = await zarr.open(store, { 
  path: 'manifold/vertices',
  kind: 'array' 
});

// Load first chunk only
const chunkSize = verticesArray.meta.chunks;  // [16384, 3]
const firstChunk = await verticesArray.getRaw([0, 0]);

// Display partial mesh immediately
const partialGeometry = new THREE.BufferGeometry();
partialGeometry.setAttribute('position', 
  new THREE.BufferAttribute(firstChunk, 3));

// Load remaining chunks asynchronously
// ...
```

### 2. Caching Strategies

```javascript
// Cache Zarr arrays in IndexedDB for offline access
import { openDB } from 'idb';

async function loadManifoldWithCache(zarrUrl, cacheKey) {
  const db = await openDB('bct-manifolds', 1, {
    upgrade(db) {
      db.createObjectStore('arrays');
    }
  });
  
  // Check cache first
  const cached = await db.get('arrays', cacheKey);
  if (cached) {
    console.log('Loading from cache');
    return cached;
  }
  
  // Load from HTTP
  const store = new zarr.FetchStore(zarrUrl);
  const verticesArray = await zarr.open(store, { 
    path: 'manifold/vertices',
    kind: 'array' 
  });
  const vertices = await verticesArray.get();
  
  // Cache for next time
  await db.put('arrays', vertices, cacheKey);
  
  return vertices;
}
```

### 3. Web Workers

```javascript
// main.js
const worker = new Worker('zarr-loader.worker.js');

worker.postMessage({ 
  type: 'load',
  url: 'https://cdn.example.com/brain.zarr' 
});

worker.onmessage = (e) => {
  if (e.data.type === 'geometry') {
    const { vertices, faces } = e.data;
    
    // Create geometry on main thread
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', 
      new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(
      new THREE.BufferAttribute(faces, 1));
    
    // Add to scene
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
  }
};

// zarr-loader.worker.js
importScripts('zarrita.umd.js');

self.onmessage = async (e) => {
  if (e.data.type === 'load') {
    const store = new zarr.FetchStore(e.data.url);
    
    // Load arrays
    const verticesArray = await zarr.open(store, { 
      path: 'manifold/vertices', kind: 'array' 
    });
    const facesArray = await zarr.open(store, { 
      path: 'manifold/faces', kind: 'array' 
    });
    
    const vertices = await verticesArray.get();
    const faces = await facesArray.get();
    
    // Send back to main thread (transferable)
    self.postMessage({
      type: 'geometry',
      vertices: vertices,
      faces: faces
    }, [vertices.buffer, faces.buffer]);
  }
};
```

---

## Error Handling

```javascript
async function loadManifoldSafe(zarrUrl) {
  try {
    const store = new zarr.FetchStore(zarrUrl);
    
    // Validate schema version
    const rootAttrs = await zarr.getAttrs(store, '');
    if (!rootAttrs.schema || !rootAttrs.schema.startsWith('bct.manifold@')) {
      throw new Error(`Invalid BCT schema: ${rootAttrs.schema}`);
    }
    
    // Check manifold group exists
    const manifoldAttrs = await zarr.getAttrs(store, 'manifold');
    if (!manifoldAttrs) {
      throw new Error('Missing manifold group');
    }
    
    // Load arrays with validation
    const verticesArray = await zarr.open(store, { 
      path: 'manifold/vertices',
      kind: 'array' 
    });
    
    // Check dtype
    if (verticesArray.meta.dtype !== '<f4') {
      console.warn(`Expected float32, got ${verticesArray.meta.dtype}`);
    }
    
    // Check order
    if (verticesArray.meta.order !== 'C') {
      console.warn(`Expected C-order, got ${verticesArray.meta.order}`);
    }
    
    const vertices = await verticesArray.get();
    const facesArray = await zarr.open(store, { 
      path: 'manifold/faces',
      kind: 'array' 
    });
    const faces = await facesArray.get();
    
    // Validate index bounds
    const numVertices = verticesArray.meta.shape[0];
    const maxIndex = Math.max(...faces);
    if (maxIndex >= numVertices) {
      throw new Error(`Invalid face index: ${maxIndex} >= ${numVertices}`);
    }
    
    return { vertices, faces, metadata: manifoldAttrs };
    
  } catch (error) {
    if (error.message.includes('404')) {
      console.error('Manifold not found:', zarrUrl);
    } else if (error.message.includes('network')) {
      console.error('Network error loading manifold');
    } else {
      console.error('Failed to load manifold:', error);
    }
    throw error;
  }
}
```

---

## Local File System (Node.js or Browser File API)

### Node.js

```javascript
import { FSStore } from 'zarrita';
import * as zarr from 'zarrita';

const store = new FSStore('./brain.zarr');
const verticesArray = await zarr.open(store, { 
  path: 'manifold/vertices',
  kind: 'array' 
});
const vertices = await verticesArray.get();
```

### Browser File API

```javascript
// User selects directory
const dirHandle = await window.showDirectoryPicker();

// Custom store implementation for File System Access API
class BrowserFSStore {
  constructor(dirHandle) {
    this.dirHandle = dirHandle;
  }
  
  async get(key) {
    const parts = key.split('/');
    let handle = this.dirHandle;
    
    // Navigate to file
    for (let i = 0; i < parts.length - 1; i++) {
      handle = await handle.getDirectoryHandle(parts[i]);
    }
    
    const fileHandle = await handle.getFileHandle(parts[parts.length - 1]);
    const file = await fileHandle.getFile();
    
    if (key.endsWith('.zarray') || key.endsWith('.zattrs') || key.endsWith('.zgroup')) {
      // JSON files
      return new TextDecoder().decode(await file.arrayBuffer());
    } else {
      // Binary chunk
      return new Uint8Array(await file.arrayBuffer());
    }
  }
}

const store = new BrowserFSStore(dirHandle);
const verticesArray = await zarr.open(store, { 
  path: 'manifold/vertices',
  kind: 'array' 
});
```

---

## Summary: Why BCT Zarr Format is GPU-Ready

| Feature | BCT Export | Benefit |
|---------|------------|---------|
| **Memory order** | C-order (row-major) | Direct GPU buffer upload |
| **Vertex dtype** | `<f4` (float32) | Native GPU precision, 50% memory savings |
| **Index dtype** | `<u4` (uint32) | WebGPU supports up to 4B vertices |
| **Index base** | 0-based | Direct WebGL/WebGPU indexing |
| **Interleaving** | `[x,y,z, x,y,z, ...]` | Optimal GPU cache locality |
| **Chunking** | Single chunk (manifold) | One HTTP request per dataset |
| **Metadata** | Rich attributes | Units, coordinate systems, provenance |

**Result**: Load manifold data with **zero client-side transformation** — no transpose, no reordering, no type conversion. Ready for immediate GPU rendering in Three.js.

---

## References

- [zarrita.js Documentation](https://github.com/manzt/zarrita.js)
- [Three.js BufferGeometry](https://threejs.org/docs/#api/en/core/BufferGeometry)
- [Three.js WebGPU Renderer](https://threejs.org/docs/#api/en/renderers/WebGPURenderer)
- [Zarr v2 Specification](https://zarr.readthedocs.io/en/stable/spec/v2.html)
- BCT Zarr Schema: `notes/ZARR_GPU_OPTIMIZATION.md`
