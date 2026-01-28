# Surface Particles Integration Status

## Overview
Integrating the WebGPU particle system from `experimental/surfaceAttractorParticles.html` into React `ExperimentalPage`.

## Current Status: ⚠️ PARTIAL IMPLEMENTATION

The React component wrapper is complete, but the **TSL compute shader code** (300+ lines) needs to be fully ported.

## What's Implemented ✅
- React component wrapper (`SurfaceParticles.tsx`)
- Data loading (JSON + binary buffers)
- Three.js WebGPU renderer initialization
- Surface mesh rendering with proper lighting
- Camera controls (OrbitControls)
- GPU storage buffer creation for mesh data
- Attractor objects with TransformControls
- Status overlay UI

## What's Missing ❌
The core TSL compute shader functions need to be ported from the HTML file (lines 370-650):

### Required TSL Functions

1. **`randomBarycentric(seed)`** - Generate random barycentric coordinates
2. **`faceBaryToPos(faceId, bary)`** - Convert (face, barycentric) → 3D position
3. **`pointToBary(faceId, p)`** - Project 3D point → barycentric coords
4. **`pickEdgeIndex(bary)`** - Find which edge was crossed (based on negative bary component)
5. **`getNeighborFace(faceId, edgeIndex)`** - Read neighbor face from topology
6. **`transportVel2(faceId, edgeIndex, v2)`** - Apply parallel transport matrix to 2D velocity

### Required Compute Shaders

1. **Init Compute** - Spawn particles on random faces with random velocities
2. **Update Compute** - Physics simulation with:
   - Gravitational attraction to attractor points
   - "Spinning" force (tangent to rotation axes)
   - Surface-constrained integration via edge crossing
   - Parallel transport of velocities across edges
   - Boundary handling (respawn on mesh boundary)

### Material Nodes

1. **Position Node** - Reconstruct particle 3D positions from (faceId, bary) buffers
2. **Color Node** - Map velocity magnitude to color gradient
3. **Scale Node** - Per-particle size based on mass multiplier

## File Structure

```
src/app/
├── pages/
│   └── ExperimentalPage.tsx          ✅ Updated to use SurfaceParticles
├── components/
    └── experimental/
        └── SurfaceParticles.tsx      ⚠️ Needs full TSL shader implementation
```

## Data Files

- `data/particle_vis.json` - Mesh metadata (2503 vertices, 4968 faces)
- `data/particle_vis.bin` - Binary mesh data (428 KB)
  - Vertex positions (V)
  - Face indices (F)
  - Tangent basis (t1, t2)
  - Face normals, areas, centroids
  - Topology (faceNeighbors)
  - Transport matrices (2x2 per edge, for parallel transport)

## Integration Strategy

### Option 1: Direct TSL Port (Recommended)
Copy the TSL shader code from `experimental/surfaceAttractorParticles.html` lines 370-650 into the `createSurfaceParticlesSystem` function. This preserves all physics behavior.

**Pros:**
- Full feature parity
- Proven to work
- No behavioral changes

**Cons:**
- TSL code is complex
- Hard to debug if import issues arise

### Option 2: Simplified Physics
Implement a simpler particle system without edge crossing:
- Particles move on sphere/surface approximation
- No parallel transport
- Easier to debug

**Pros:**
- Faster to implement
- Easier to understand

**Cons:**
- Particles won't stay constrained to mesh surface
- Visual artifacts

## Next Steps

1. **Copy TSL shader functions** from HTML lines 370-650
2. **Test init compute** - Verify particles spawn correctly
3. **Test update compute** - Verify physics simulation runs
4. **Test material nodes** - Verify particles render with correct positions/colors
5. **Add UI controls** - Expose parameters (maxSpeed, damping, etc.)

## Known Issues

- Three.js import path needs verification (`three/webgpu` vs `three`)
- TSL imports may need adjustment for React/Vite environment
- WebGPU support required (not all browsers)

## Testing Checklist

- [ ] Page loads without errors
- [ ] Mesh renders correctly
- [ ] Particles spawn on mesh surface
- [ ] Attractors are visible and draggable
- [ ] Particles move in response to attractors
- [ ] Particles stay constrained to mesh (edge crossing works)
- [ ] Color gradient shows velocity
- [ ] Camera controls work (orbit, zoom)
- [ ] Resize handling works

## References

- Original HTML: `experimental/surfaceAttractorParticles.html`
- Three.js TSL docs: https://threejs.org/docs/#api/en/nodes/TSL
- WebGPU renderer: https://threejs.org/docs/#api/en/renderers/WebGPURenderer
