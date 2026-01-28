# Geodesic Distance Integration

## Overview
Successfully integrated the `geometry-processing-js` library as a computational backend for geodesic distance computations in the Bioctree UI viewer.

## What's Been Implemented

### 1. Library Integration (`index.html`)
Added geometry-processing-js scripts to the main HTML file:
- Core linear algebra (Emscripten-compiled Eigen)
- Halfedge mesh data structures
- DEC (Discrete Exterior Calculus) operators
- HeatMethod for geodesic distance computation
- Colormap utilities

### 2. Bridge Layer (`src/app/components/viewer/compute/geometryProcessingBridge.js`)
Converts between Three.js and geometry-processing-js formats:
- `threeGeometryToPolygonSoup()` - Convert BufferGeometry → polygon soup {v: Vector[], f: number[]}
- `buildProcessingMesh()` - Build halfedge Mesh + Geometry from Three.js geometry
- `indexElements()` - Create vertex index mapping (required for DEC operators)
- `scalarFieldToColors()` - Convert scalar field (DenseMatrix) → Three.js color array
- `isGeometryProcessingLoaded()` - Check library availability

### 3. Geodesic Service (`src/app/components/viewer/compute/geodesicDistanceService.js`)
High-level service wrapping HeatMethod:
- `initialize(threeGeometry)` - Build halfedge mesh and initialize HeatMethod
- `addSourceVertex(index)` - Add source vertex for geodesic computation
- `removeSourceVertex(index)` - Remove source vertex (Shift+click)
- `compute()` - Run heat method and return distances + range
- `getColors(colormapFn, colormap)` - Generate vertex colors from distances
- `clearSources()` - Reset all sources
- `getState()` - Get current state (vertex count, source count, etc.)

### 4. Viewer Integration (`src/app/components/viewer/render.js`)
Integrated with existing viewer infrastructure:
- **Auto-initialization**: Geodesic service initializes when mesh loads (via `meshLoaded` event)
- **Picking integration**: Vertex clicks trigger geodesic computation in geodesic mode
- **Shift-click support**: Hold Shift to remove source vertices
- **Visualization**: Applies "hot" colormap to mesh vertex colors
- **Mode toggle**: `setGeodesicMode(enabled)` to enable/disable
- **State export**: `getGeodesicState()` for UI integration

### 5. Public API
New functions exported from [render.js](src/app/components/viewer/render.js):
```javascript
// Enable/disable geodesic mode
setGeodesicMode(enabled: boolean)

// Get geodesic service state
getGeodesicState(): {
  initialized: boolean,
  vertexCount: number,
  sourceCount: number,
  sources: number[],
  hasResult: boolean,
  range: [number, number] | null
}
```

## How It Works

### Computational Pipeline

1. **Mesh Load** → `initializeGeodesicService()` automatically called
   - Extract Three.js BufferGeometry
   - Convert to polygon soup format
   - Build halfedge mesh (validates manifoldness)
   - Create DEC operators (Laplacian, mass matrix)
   - Initialize HeatMethod class

2. **User Clicks Vertex** (in geodesic mode)
   - Picking system detects vertex under mouse
   - `handleGeodesicVertexClick()` called with vertex index
   - Add/remove vertex as source
   - Trigger computation if sources changed

3. **Geodesic Computation** (`HeatMethod.compute()`)
   - **Step 1**: Integrate heat flow (solve `(M + tΔ)u = δ`)
   - **Step 2**: Compute unit vector field `X = -∇u / |∇u|`
   - **Step 3**: Solve Poisson equation `Δφ = ∇·X`
   - **Step 4**: Shift φ so minimum distance = 0
   - Returns DenseMatrix of geodesic distances

4. **Visualization**
   - Map distances to colors using "hot" colormap
   - Invert distance (hot = close, cool = far)
   - Apply to mesh vertex colors
   - Enable `vertexColors` on material

### Keyboard/Mouse Controls (To Be Implemented in UI)

**Current Behavior** (when geodesic mode enabled):
- **Click vertex** → Add as source + compute
- **Shift+Click vertex** → Remove source + recompute
- **Disable mode** → Clear sources + visualization

**Suggested UI Controls**:
- **'G' key** → Toggle geodesic mode on/off
- **Status panel** → Show source count, distance range
- **Clear button** → Reset sources
- **Colormap selector** → Switch between colormaps

## Next Steps (Not Yet Implemented)

### 1. UI Panel for Geodesic Controls
Create `GeodesicPanel.tsx` in [src/app/components/panels/](src/app/components/panels/):
```tsx
interface GeodesicPanelProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  sourceCount: number;
  onClear: () => void;
  distanceRange: [number, number] | null;
}
```

### 2. Keyboard Shortcut
Add to [ViewerPage.tsx](src/app/pages/ViewerPage.tsx) `useEffect`:
```tsx
if (key === 'g') {
  setGeodesicMode(!geodesicMode);
  setGeodesicMode(!geodesicMode); // Call viewer API
}
```

### 3. Visual Source Markers
- Display small spheres at source vertices (like geodesic-distance demo)
- Color-code spheres
- Update on source add/remove

### 4. Isolines Rendering (Advanced)
Port the isolines rendering from `geometry-processing-js` geodesic-distance project:
- Extract isoline contours from distance field
- Render as line segments on mesh surface
- Configurable number of levels

### 5. Multiple Colormaps
- Add colormap selector to UI panel
- Support `hot`, `viridis`, `plasma`, `cool`, etc.
- Update visualization on change

### 6. Performance Optimization
- Cache halfedge mesh (don't rebuild on every compute)
- Debounce rapid clicks
- Show loading indicator for large meshes
- Consider WASM/WebGPU acceleration for very large meshes

## Testing

### Quick Test (Manual)
1. Start dev server: `npm run dev`
2. Open browser console
3. Load a mesh (e.g., `fsaverage.glb` from assets)
4. In console:
   ```javascript
   setGeodesicMode(true);  // Enable geodesic mode
   setPickMode('vertex');   // Set picking to vertex mode
   setPickingEnabled(true); // Enable picking
   ```
5. Click on mesh vertices → should see "hot" colormap visualization
6. Shift+click to remove sources
7. Check console for logs: `[GeodesicService]` messages
8. Verify state: `getGeodesicState()`

### Expected Console Output
```
[Viewer] Initializing geodesic service...
[Bridge] Built mesh: 163842 vertices, 327680 faces, 491520 edges
[GeodesicService] HeatMethod initialized successfully
[GeodesicService] Ready - 163842 vertices
[GeodesicService] Added source vertex 12345 (1 total)
[GeodesicService] Computing geodesic distances from 1 sources...
[GeodesicService] Computed distances - range: [0.000000, 45.234567]
[Viewer] Geodesic visualization updated
```

## Known Limitations

1. **Manifold meshes only**: Non-manifold geometry will fail mesh.build()
2. **Triangle meshes only**: Quads/n-gons not supported
3. **Memory usage**: Large meshes (>500k vertices) may be slow
4. **Browser support**: Requires modern browser with WebAssembly support
5. **No isolines yet**: Only vertex color visualization implemented

## Architecture Benefits

### Clean Separation of Concerns
- **Bridge layer**: Converts data formats (no computation logic)
- **Service layer**: Encapsulates HeatMethod (no Three.js dependencies)
- **Viewer layer**: Handles visualization (no DEC knowledge)

### Extensible Design
Easy to add more geometry-processing-js algorithms:
- Harmonic bases (spectral analysis)
- Vector field decomposition
- Discrete curvatures
- Parameterization (flattening)
- Mean curvature flow (smoothing)

### Type Safety (Future)
Can add TypeScript declarations for geometry-processing-js:
```typescript
declare class Mesh {
  vertices: Vertex[];
  faces: Face[];
  edges: Edge[];
  build(polygonSoup: PolygonSoup): boolean;
}
```

## References

- **geometry-processing-js**: https://github.com/geometrycollective/geometry-processing-js
- **Heat Method Paper**: [Crane et al. 2013] - "Geodesics in Heat"
- **DEC Tutorial**: [Discrete Exterior Calculus](https://www.cs.cmu.edu/~kmcrane/Projects/DDG/)
- **Existing Demo**: [external/geometry-processing-js/projects/geodesic-distance/](external/geometry-processing-js/projects/geodesic-distance/)

## Files Modified/Created

### Created
- `src/app/components/viewer/compute/geometryProcessingBridge.js`
- `src/app/components/viewer/compute/geodesicDistanceService.js`
- `GEODESIC_INTEGRATION.md` (this file)

### Modified
- `index.html` - Added geometry-processing-js script tags
- `src/app/components/viewer/render.js` - Added geodesic integration

### External (Cloned)
- `external/geometry-processing-js/` - Full library (480+ files)

## License Note
`geometry-processing-js` is MIT licensed (same as this project).
