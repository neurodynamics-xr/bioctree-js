// TypeScript interfaces for BCT Zarr schema v1.1
// Based on bct.manifold schema specification

// === Root-level Zarr attributes ===

export interface BCTRootAttrs {
  schema: string;           // "bct.manifold@X.Y"
  format: string;            // "zarr"
  zarr_version: number;      // 2
  created_utc: string;       // ISO timestamp
}

// === Manifold group attributes ===

export interface BCTManifoldAttrs {
  Name?: string;
  Source?: string;
  CreatedAt?: string;
  CreatedBy?: string;
  ID?: string;
  FaceWinding?: 'CCW' | 'CW';
  Metric_units_length?: string;
  Metric_scale?: number;
  [key: string]: any;        // Allow additional custom attributes
}

// === Eigenmodes group attributes ===

export interface BCTEigenmodesAttrs {
  schema?: string;            // "bct.manifold.eigen@X.Y"
  package?: string;           // "bct.manifold.eigen"
  numModes: number;           // K: number of computed eigenmodes
  numVertices: number;        // N: number of vertices
  operator?: string;          // "Laplace-Beltrami", etc.
  basis?: string;             // "P1-FEM", etc.
  ordering?: string;          // "ascending", "descending"
  massType?: string;          // "voronoi", "barycentric", etc.
  removedDC?: boolean;        // Whether DC component was removed
  solver?: string;            // Solver algorithm (e.g., "LOBPCG", "eigs")
  computed_utc?: string;      // ISO timestamp
  [key: string]: any;
}

// === Geometry group attributes ===

export interface BCTGeometryAttrs {
  schema?: string;            // "bct.geometry@X.Y"
  [key: string]: any;
}

// === Topology group attributes ===

export interface BCTTopologyAttrs {
  schema?: string;            // "bct.topology@X.Y"
  [key: string]: any;
}

// === Operators group attributes ===

export interface BCTOperatorsAttrs {
  schema?: string;            // "bct.operators@X.Y"
  format?: string;            // "coo", "csr", "dense"
  shape?: number[];           // Matrix dimensions [nRows, nCols]
  nnz?: number;               // Number of non-zero entries
  dtype?: string;             // "double", "float", etc.
  name?: string;              // Operator name (e.g., "mass", "stiffness")
  path?: string;              // Operator path (e.g., "operator/mass")
  description?: string;       // Human-readable description
  variant?: string;           // Operator variant (e.g., "voronoi", "barycentric")
  symmetrize?: boolean;       // Whether matrix is symmetrized
  precision?: string;         // Numerical precision
  units?: string;             // Physical units
  storage?: string;           // "sparse", "dense", "diagonal"
  [key: string]: any;
}

// === Data structures returned by loaders ===

export interface ZarrManifold {
  vertices: Float32Array | Float64Array;    // [N, 3]
  faces: Uint32Array;                        // [M, 3]
  edges?: Uint32Array;                       // [E, 2] (optional)
  eigenmodes?: ZarrEigenmodes;               // Eigenmodes (optional)
  metadata: BCTManifoldAttrs;
}

export interface ZarrEigenmodes {
  eigenvalues: Float32Array | Float64Array; // [K, 1] or [K]
  eigenvectors: Float32Array | Float64Array; // [N, K]
  metadata: BCTEigenmodesAttrs;
}

export interface ZarrGeometry {
  vertexAreas?: Float32Array | Float64Array;  // [N]
  faceAreas?: Float32Array | Float64Array;    // [M]
  faceNormals?: Float32Array | Float64Array;  // [M, 3]
  vertexNormals?: Float32Array | Float64Array; // [N, 3]
  edgeLengths?: Float32Array | Float64Array;  // [E]
  metadata: BCTGeometryAttrs;
}

export interface ZarrTopology {
  vertexDegrees?: Uint32Array;    // [N]
  adjacencyList?: Uint32Array;    // Variable length
  metadata: BCTTopologyAttrs;
}

export interface ZarrOperators {
  // Sparse matrices in COO format
  laplacian?: {
    row: Uint32Array;
    col: Uint32Array;
    data: Float32Array | Float64Array;
    shape: [number, number];
  };
  massMatrix?: {
    row: Uint32Array;
    col: Uint32Array;
    data: Float32Array | Float64Array;
    shape: [number, number];
  };
  metadata: BCTOperatorsAttrs;
}

// === Loader options ===

export interface LoadManifoldOptions {
  loadEdges?: boolean;            // Default: true
  loadEigenmodes?: boolean;       // Default: true
  eigenmodesOptions?: LoadEigenmodesOptions; // Options for eigenmodes loading
  validateIndices?: boolean;      // Default: true
}

export interface LoadEigenmodesOptions {
  maxModes?: number;           // Load only first K modes
  modesRange?: [number, number]; // Load specific range [start, end)
}

export interface LoadOperatorOptions {
  convertToFloat32?: boolean;  // Convert from Float64 to Float32 (default: true)
}

// === Operator data structures ===

export interface ZarrOperator {
  name: string;
  format: 'diagonal' | 'coo' | 'csr';
  shape: [number, number];
  dtype: 'float32' | 'float64';
  
  // Diagonal format (for diagonal matrices like mass)
  diagonal?: Float32Array | Float64Array;
  
  // COO format (row, col, data)
  row?: Uint32Array;
  col?: Uint32Array;
  data: Float32Array | Float64Array;
  nnz?: number;
  
  // CSR format (indptr, indices, data)
  indptr?: Uint32Array;
  indices?: Uint32Array;
  
  // Metadata
  metadata?: {
    description?: string;
    variant?: string;
    symmetrize?: boolean;
    precision?: string;
    units?: string;
    storage?: string;
  };
}
