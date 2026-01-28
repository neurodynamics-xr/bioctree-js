/**
 * Manifold.ts
 * 
 * Core manifold object containing all mesh data.
 * Represents a 2D manifold embedded in 3D space.
 * 
 * Core properties (required): vertices, faces
 * Optional properties: geometry, topology, eigenmodes
 */

/**
 * Core manifold data (required)
 */
export interface ManifoldCore {
  vertices: Float32Array; // nV × 3 positions
  faces: Uint32Array; // nF × 3 triangle indices
  nV: number; // vertex count
  nF: number; // face count
}

/**
 * Geometric properties (optional)
 */
export interface ManifoldGeometry {
  normals?: Float32Array; // nV × 3 vertex normals
  faceNormals?: Float32Array; // nF × 3 face normals
  massV?: Float32Array; // nV vertex areas (Voronoi/mixed)
  massF?: Float32Array; // nF face areas
  bounds?: {
    min: [number, number, number];
    max: [number, number, number];
    center: [number, number, number];
    radius: number;
  };
}

/**
 * Topological properties (optional)
 */
export interface ManifoldTopology {
  edges?: Uint32Array; // nE × 2 edge indices
  nE?: number; // edge count
  // Future: halfedges, vertex-face adjacency, etc.
}

/**
 * Spectral properties (optional)
 */
export interface ManifoldEigenmodes {
  eigenvalues: Float32Array; // K eigenvalues (λ)
  eigenfunctions: Float32Array; // K × nV eigenfunctions (Ψ)
  K: number; // number of eigenmodes
  massV?: Float32Array; // Mass matrix (if different from geometry.massV)
}

/**
 * Manifold metadata
 */
export interface ManifoldMetadata {
  id: string;
  name: string;
  createdAt: number;
  source?: string; // e.g., file path
  description?: string;
  transform?: Float32Array; // 4x4 transform matrix (column-major) for coordinate system conversion
}

/**
 * Manifold availability flags
 */
export interface ManifoldAvailability {
  hasGeometry: boolean;
  hasTopology: boolean;
  hasEigenmodes: boolean;
}

/**
 * Manifold class - owns all mesh data
 */
export class Manifold {
  readonly metadata: ManifoldMetadata;
  readonly core: ManifoldCore;
  readonly geometry: ManifoldGeometry;
  readonly topology: ManifoldTopology;
  readonly eigenmodes: ManifoldEigenmodes | null;

  constructor(
    metadata: ManifoldMetadata,
    core: ManifoldCore,
    geometry?: ManifoldGeometry,
    topology?: ManifoldTopology,
    eigenmodes?: ManifoldEigenmodes
  ) {
    this.metadata = metadata;
    this.core = core;
    this.geometry = geometry || {};
    this.topology = topology || {};
    this.eigenmodes = eigenmodes || null;
  }

  /**
   * Get vertex count
   */
  get nV(): number {
    return this.core.nV;
  }

  /**
   * Get face count
   */
  get nF(): number {
    return this.core.nF;
  }

  /**
   * Get edge count (if topology available)
   */
  get nE(): number | null {
    return this.topology.nE || null;
  }

  /**
   * Get eigenmode count (if spectral data available)
   */
  get K(): number | null {
    return this.eigenmodes?.K || null;
  }

  /**
   * Check what optional data is available
   */
  getAvailability(): ManifoldAvailability {
    return {
      hasGeometry: this.hasGeometry(),
      hasTopology: this.hasTopology(),
      hasEigenmodes: this.hasEigenmodes()
    };
  }

  /**
   * Check if geometry data is available
   */
  hasGeometry(): boolean {
    return !!(this.geometry.normals || this.geometry.massV || this.geometry.bounds);
  }

  /**
   * Check if topology data is available
   */
  hasTopology(): boolean {
    return !!(this.topology.edges && this.topology.nE);
  }

  /**
   * Check if eigenmode data is available
   */
  hasEigenmodes(): boolean {
    return !!(this.eigenmodes && this.eigenmodes.K > 0);
  }

  /**
   * Validate vertex index
   */
  isValidVertexIndex(idx: number): boolean {
    return Number.isInteger(idx) && idx >= 0 && idx < this.core.nV;
  }

  /**
   * Validate face index
   */
  isValidFaceIndex(idx: number): boolean {
    return Number.isInteger(idx) && idx >= 0 && idx < this.core.nF;
  }

  /**
   * Validate edge index (if topology available)
   */
  isValidEdgeIndex(idx: number): boolean {
    if (!this.topology.nE) return false;
    return Number.isInteger(idx) && idx >= 0 && idx < this.topology.nE;
  }

  /**
   * Get vertex position
   */
  getVertexPosition(idx: number): [number, number, number] | null {
    if (!this.isValidVertexIndex(idx)) return null;
    const i = idx * 3;
    return [
      this.core.vertices[i],
      this.core.vertices[i + 1],
      this.core.vertices[i + 2]
    ];
  }

  /**
   * Get face vertices
   */
  getFaceVertices(idx: number): [number, number, number] | null {
    if (!this.isValidFaceIndex(idx)) return null;
    const i = idx * 3;
    return [
      this.core.faces[i],
      this.core.faces[i + 1],
      this.core.faces[i + 2]
    ];
  }

  /**
   * Get manifold summary for display
   */
  getSummary(): string {
    const { name, source } = this.metadata;
    const { nV, nF } = this.core;
    const { hasGeometry, hasTopology, hasEigenmodes } = this.getAvailability();
    const extras = [
      hasGeometry ? 'geometry' : null,
      hasTopology ? 'topology' : null,
      hasEigenmodes ? `${this.K} eigenmodes` : null
    ].filter(Boolean).join(', ');
    
    return `${name} (${nV} vertices, ${nF} faces${extras ? ', ' + extras : ''})`;
  }

  /**
   * Dispose manifold resources
   */
  dispose(): void {
    // TypedArrays don't need explicit disposal, but this is here for completeness
  }
}

/**
 * Manifold creation options
 */
export interface ManifoldCreateOptions {
  id?: string;
  name: string;
  source?: string;
  description?: string;
  transform?: Float32Array; // 4x4 transformation matrix
  geometry?: ManifoldGeometry;
  topology?: ManifoldTopology;
  eigenmodes?: ManifoldEigenmodes;
}

/**
 * Generate unique manifold ID
 */
export function generateManifoldId(): string {
  return `manifold_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Compute bounds from vertices
 */
export function computeBounds(vertices: Float32Array, nV: number): ManifoldGeometry['bounds'] {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let v = 0; v < nV; v++) {
    const i = v * 3;
    const x = vertices[i];
    const y = vertices[i + 1];
    const z = vertices[i + 2];

    if (x < min[0]) min[0] = x;
    if (y < min[1]) min[1] = y;
    if (z < min[2]) min[2] = z;
    if (x > max[0]) max[0] = x;
    if (y > max[1]) max[1] = y;
    if (z > max[2]) max[2] = z;
  }

  const center: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2
  ];

  const radius = Math.sqrt(
    Math.pow(max[0] - min[0], 2) +
    Math.pow(max[1] - min[1], 2) +
    Math.pow(max[2] - min[2], 2)
  ) / 2;

  return { min, max, center, radius };
}

/**
 * Create a Manifold object
 * 
 * @param vertices - nV × 3 Float32Array of vertex positions
 * @param faces - nF × 3 Uint32Array of triangle indices
 * @param options - Manifold creation options
 * @returns Manifold instance
 */
export function createManifold(
  vertices: Float32Array,
  faces: Uint32Array,
  options: ManifoldCreateOptions
): Manifold {
  const {
    id = generateManifoldId(),
    name,
    source,
    description,
    geometry,
    topology,
    eigenmodes
  } = options;

  // Validate inputs
  if (vertices.length % 3 !== 0) {
    throw new Error('Vertices must be nV × 3 (length divisible by 3)');
  }
  if (faces.length % 3 !== 0) {
    throw new Error('Faces must be nF × 3 (length divisible by 3)');
  }

  const nV = vertices.length / 3;
  const nF = faces.length / 3;
  // Build core data
  const core: ManifoldCore = {
    vertices,
    faces,
    nV,
    nF
  };

  // Compute bounds if not provided
  const fullGeometry: ManifoldGeometry = {
    ...geometry,
    bounds: geometry?.bounds || computeBounds(vertices, nV)
  };

  // Build metadata
  const metadata: ManifoldMetadata = {
    id,
    name,
    source,
    description,
    transform: options.transform, // Include transform matrix if provided
    createdAt: Date.now()
  };

  return new Manifold(metadata, core, fullGeometry, topology, eigenmodes);
}

/**
 * Create manifold from BCT data
 */
export function createManifoldFromBCT(
  bctData: {
    vertices: Float32Array;
    faces: Uint32Array;
    nV: number;
    nF: number;
    eigenvalues?: Float32Array;
    eigenfunctions?: Float32Array;
    K?: number;
    massV?: Float32Array;
  },
  name: string,
  source?: string
): Manifold {
  const eigenmodes: ManifoldEigenmodes | undefined = 
    bctData.eigenvalues && bctData.eigenfunctions && bctData.K
      ? {
          eigenvalues: bctData.eigenvalues,
          eigenfunctions: bctData.eigenfunctions,
          K: bctData.K,
          massV: bctData.massV
        }
      : undefined;

  const geometry: ManifoldGeometry | undefined = bctData.massV
    ? { massV: bctData.massV }
    : undefined;

  return createManifold(bctData.vertices, bctData.faces, {
    name,
    source,
    description: eigenmodes ? `BCT spectral data with ${eigenmodes.K} eigenmodes` : 'BCT mesh data',
    geometry,
    eigenmodes
  });
}
