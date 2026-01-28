/**
 * @file geometryProcessingBridge.js
 * Bridge between Three.js BufferGeometry and geometry-processing-js Mesh/Geometry
 * 
 * Responsibilities:
 * - Convert Three.js geometry to geometry-processing-js polygon soup format
 * - Build halfedge mesh from Three.js data
 * - Provide utility functions for data conversion
 */

/**
 * Convert Three.js BufferGeometry to geometry-processing-js polygon soup format
 * @param {THREE.BufferGeometry} geometry - Three.js geometry
 * @returns {Object|null} Polygon soup {v: Vector[], f: number[]} or null if invalid
 */
export function threeGeometryToPolygonSoup(geometry) {
  if (!geometry || !geometry.attributes.position) {
    console.error('[Bridge] Invalid geometry - missing position attribute');
    return null;
  }

  const positions = geometry.attributes.position;
  const indices = geometry.index;

  if (!indices) {
    console.error('[Bridge] Geometry must be indexed');
    return null;
  }

  // Import Vector from geometry-processing-js
  // Note: We'll need to load the library first
  if (typeof Vector === 'undefined') {
    console.error('[Bridge] geometry-processing-js Vector not loaded');
    return null;
  }

  // Convert positions to Vector array
  const vertices = [];
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    vertices.push(new Vector(x, y, z));
  }

  // Convert indices to flat array
  const faces = [];
  for (let i = 0; i < indices.count; i++) {
    faces.push(indices.getX(i));
  }

  return {
    v: vertices,
    f: faces
  };
}

/**
 * Build geometry-processing-js Mesh and Geometry from Three.js geometry
 * @param {THREE.BufferGeometry} threeGeometry - Three.js geometry
 * @returns {Object|null} {mesh: Mesh, geometry: Geometry} or null if build fails
 */
export function buildProcessingMesh(threeGeometry) {
  // Check dependencies
  if (typeof Mesh === 'undefined' || typeof Geometry === 'undefined') {
    console.error('[Bridge] geometry-processing-js core classes not loaded');
    console.error('[Bridge] Missing: Mesh=%s, Geometry=%s', typeof Mesh, typeof Geometry);
    return null;
  }

  if (typeof memoryManager === 'undefined') {
    console.error('[Bridge] Global memoryManager not initialized');
    return null;
  }

  const polygonSoup = threeGeometryToPolygonSoup(threeGeometry);
  if (!polygonSoup) {
    return null;
  }

  // Build halfedge mesh
  let mesh;
  try {
    mesh = new Mesh();
  } catch (error) {
    console.error('[Bridge] Failed to create Mesh instance:', error);
    return null;
  }

  const success = mesh.build(polygonSoup);

  if (!success) {
    console.error('[Bridge] Failed to build halfedge mesh - non-manifold or isolated vertices/faces');
    console.error('[Bridge] Mesh statistics: vertices=%d, faces=%d', polygonSoup.v.length, polygonSoup.f.length / 3);
    console.error('[Bridge] This usually indicates:');
    console.error('[Bridge]   - Non-manifold edges (shared by >2 faces)');
    console.error('[Bridge]   - Boundary issues or holes in the mesh');
    console.error('[Bridge]   - Duplicate/degenerate faces');
    console.error('[Bridge] Try cleaning the mesh in MATLAB with: Manifold = Manifold.clean()');
    return null;
  }

  // Build geometry (DEC operators)
  let geometry;
  try {
    geometry = new Geometry(mesh, polygonSoup.v, false); // Don't normalize for now
  } catch (error) {
    console.error('[Bridge] Failed to create Geometry instance:', error);
    return null;
  }

  console.log(`[Bridge] Built mesh: ${mesh.vertices.length} vertices, ${mesh.faces.length} faces, ${mesh.edges.length} edges`);

  return { mesh, geometry };
}

/**
 * Create vertex index mapping (required for DEC operators)
 * @param {Mesh} mesh - geometry-processing-js Mesh
 * @returns {Map} Map from Vertex -> index
 */
export function indexElements(vertices) {
  const index = {};
  let i = 0;
  for (let v of vertices) {
    index[v] = i;
    v.index = i; // Store index on vertex for convenience
    i++;
  }
  return index;
}

/**
 * Convert DenseMatrix (scalar field) to Three.js color array
 * @param {DenseMatrix} scalarField - Column vector of scalar values
 * @param {Function} colormapFn - Colormap function (value, min, max, colormap) -> {x, y, z}
 * @param {Array} colormap - Colormap array
 * @returns {Float32Array} RGB color array (3 * nVertices)
 */
export function scalarFieldToColors(scalarField, colormapFn, colormap) {
  const nVertices = scalarField.nRows();
  const colors = new Float32Array(nVertices * 3);

  // Find min/max for normalization
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < nVertices; i++) {
    const val = scalarField.get(i, 0);
    min = Math.min(min, val);
    max = Math.max(max, val);
  }

  // Map to colors
  for (let i = 0; i < nVertices; i++) {
    const val = scalarField.get(i, 0);
    const color = colormapFn(max - val, 0, max, colormap); // Invert for distance (hot = close)

    colors[3 * i + 0] = color.x;
    colors[3 * i + 1] = color.y;
    colors[3 * i + 2] = color.z;
  }

  return colors;
}

/**
 * Check if geometry-processing-js library is loaded
 * @returns {boolean}
 */
export function isGeometryProcessingLoaded() {
  return (
    typeof Mesh !== 'undefined' &&
    typeof Geometry !== 'undefined' &&
    typeof Vector !== 'undefined' &&
    typeof DenseMatrix !== 'undefined' &&
    typeof EmscriptenMemoryManager !== 'undefined'
  );
}
