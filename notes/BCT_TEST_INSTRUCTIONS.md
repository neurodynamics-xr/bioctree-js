# BCT Loading Test Instructions

## Quick Test

1. **Open Browser**: Navigate to http://localhost:5174/

2. **Go to Viewer Page**: Click "Viewer" button in top-right (should already be active)

3. **Open IO Panel**: 
   - Look at left sidebar
   - Click the **IO** tool icon (file/folder icon at the top)
   - Panel should open with 3 tabs: Manifolds, Fields, BCT

4. **Select BCT Tab**:
   - Click on the **BCT** tab
   - Dropdown should show "bunny" option

5. **Load BCT Package**:
   - Select "bunny" from dropdown
   - Click **"Load BCT Package"** button
   - Button text changes to "Loading..."

6. **Watch Console** (F12 → Console tab):
   ```
   [IOPanel] Loading BCT package: /src/app/data/bct/bunny_spectral.json
   [BCTSpectralLoader] Loading manifest: ...
   [BCTSpectralLoader] Binary data loaded: { bytes: 94329208 }
   [BCTSpectralLoader] Load complete: { duration: '156.3ms', warnings: 0 }
   [IOPanel] BCT package loaded: { nV: 14290, nF: 28576, K: 256 }
   [IOPanel] Mesh data: { vertexCount: 14290, faceCount: 28576 }
   [setMeshFromData] Loading mesh from buffers...
   [IOPanel] BCT mesh loaded into viewer successfully
   ```

7. **Success Alert**:
   - Alert dialog appears:
     ```
     ✓ BCT package loaded successfully!
     
     Mesh: 14290 vertices, 28576 faces
     Eigenmodes: 256 modes
     ```
   - Click OK

8. **Verify Mesh in Viewer**:
   - Stanford bunny mesh should appear in the 3D canvas (center area)
   - Gray/white material with shading
   - Can rotate with left mouse drag
   - Can zoom with mouse wheel
   - Can pan with right mouse drag

9. **Check Manifold Panel**:
   - Click **Manifold** tool in left sidebar (below IO)
   - **Geometry** tab should show:
     - Vertices: 14290
     - Faces: 28576
     - Bounding box dimensions
   - **Eigenmodes** tab should show:
     - Eigenvalue chart (if implemented)
     - Mode selector

## Expected Visual Result

```
┌─────────────────────────────────────────────────────┐
│  [Viewer] [Experimental]                            │
├──────┬──────────────────────────────────┬───────────┤
│ IO   │                                  │ Manifold  │
│ ✓    │                                  │ Panel     │
│      │                                  │           │
│Manifo│         🐰 Bunny Mesh           │ Geometry: │
│lds  │                                  │ V: 14290  │
│      │     (3D Stanford Bunny)          │ F: 28576  │
│Fields│                                  │           │
│      │                                  │ Eigenmodes│
│Filter│                                  │ K: 256    │
│      │                                  │           │
└──────┴──────────────────────────────────┴───────────┘
```

## Troubleshooting

### Dropdown is Empty
- Check console for errors
- Verify files exist: `src/app/data/bct/bunny_spectral.json` and `.bin`
- Refresh page (Ctrl+R)

### Loading Fails
- Check console for error messages
- Common issues:
  - Binary file missing → "Failed to fetch binary data"
  - Invalid schema → Check manifest `schema` field
  - Buffer mismatch → Check manifest `buffers` array

### Mesh Doesn't Appear
- Check console for "setMeshFromData" logs
- Camera might need manual adjustment
- Try zooming out (scroll wheel)
- Check if viewer canvas is visible (not overlapped by UI)

### No Eigenmodes in Panel
- This is expected for Phase 1 - only mesh loading is implemented
- Eigenmode visualization coming in Phase 2

## Test Variations

**Test 1**: Load BCT, then load GLB manifold
- Old bunny mesh should be cleared
- New GLB mesh should replace it
- Only ONE mesh visible at a time

**Test 2**: Reload same BCT package
- Should clear and reload successfully
- No memory leaks or errors

**Test 3**: Switch between BCT packages (if multiple exist)
- Each load should clear previous mesh
- Statistics should update correctly

## Success Criteria

✅ Dropdown populates with "bunny" option
✅ Loading shows progress indicator
✅ No console errors during load
✅ Success alert with correct statistics
✅ Bunny mesh visible in 3D viewer
✅ Can interact with mesh (rotate, zoom, pan)
✅ Manifold panel shows correct vertex/face counts
✅ Single-manifold policy enforced (old mesh cleared)

## Performance Metrics

**Expected Load Times** (bunny_spectral):
- Manifest fetch: ~10-50ms
- Binary fetch: ~100-300ms (94 MB file)
- Data parsing: ~50-100ms
- Mesh construction: ~20-50ms
- **Total**: ~200-500ms

**Memory Usage**:
- Binary data: 94 MB
- Typed arrays: 94 MB (zero-copy views)
- Three.js geometry: ~10-20 MB
- **Total**: ~100-120 MB

## Next Steps After Successful Test

1. **Phase 2**: Implement eigenmode visualization
   - Color mesh by psi[k] values
   - Add mode selector in Manifold panel
   - Show eigenvalue spectrum chart

2. **Phase 3**: Spectral tools
   - Use gradPsi for velocity synthesis
   - Implement spectral brush painting
   - Heat diffusion simulation

3. **Phase 4**: Multiple BCT packages
   - Add more test datasets
   - Implement package switching
   - Compare eigenmodes across meshes
