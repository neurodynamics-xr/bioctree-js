# BCT Zarr File Format Specification

**Version:** 1.1  
**Schema:** `bct.manifold@1.1`  
**Format:** Zarr v2  
**Updated:** January 2026

## Overview

The BCT (Bioctree) Zarr format is a standardized hierarchical data format for storing triangulated 2-manifolds (surfaces) with associated geometric, topological, and spectral data. This specification enables interoperability between MATLAB, Python, JavaScript, and other platforms.

### Design Principles

- **Self-describing:** All datasets include comprehensive metadata attributes
- **Zero-based indexing:** Connectivity arrays use 0-based indices (compatible with C, Python, JavaScript)
- **Schema versioning:** Format version tracked in root attributes
- **Lazy computation:** Optional groups (geometry, topology, operators, eigenmodes) only present if computed
- **Sparse matrix support:** Operators stored in COO (Coordinate List) format

### Key Features

- Triangulated surface meshes with vertices, faces, and edges
- Geometric properties (areas, normals, curvatures, tangent frames)
- Topological connectivity (adjacency, boundaries, halfedge structure)
- Differential operators (Laplace-Beltrami, gradient, divergence, curl, DEC)
- Spectral decomposition (eigenvalues and eigenvectors of Laplace-Beltrami operator)
- Support for both primal and dual mesh geometry

---

## File Structure

### Hierarchical Layout

```
cortex.zarr/
├── .zgroup                           # Root group marker
├── .zattrs                           # Root attributes (schema, version, timestamps)
└── manifold/                         # Manifold data group
    ├── .zgroup                       # Group marker
    ├── .zattrs                       # Manifold attributes (ID, metric, winding)
    ├── Vertices/                     # Vertex coordinates [N×3]
    ├── Faces/                        # Face connectivity [M×3]
    ├── Edges/                        # Edge connectivity [E×2]
    ├── geometry/                     # Geometric properties (optional)
    │   ├── .zgroup
    │   ├── .zattrs                   # Computation options, precision
    │   ├── face/                     # Face-based geometry
    │   │   ├── areas/                # Face areas [M×1]
    │   │   ├── centroids/            # Face centroids [M×3]
    │   │   ├── circumcenters/        # Circumcenters [M×3]
    │   │   ├── normals/              # Face normals [M×3]
    │   │   ├── cotan/                # Cotangent values [M×3]
    │   │   ├── tangent1/             # Primary tangent [M×3]
    │   │   └── tangent2/             # Secondary tangent [M×3]
    │   ├── vertex/                   # Vertex-based geometry
    │   │   ├── normals/              # Vertex normals [N×3]
    │   │   ├── tangent1/             # Primary tangent [N×3]
    │   │   └── tangent2/             # Secondary tangent [N×3]
    │   ├── edge/                     # Edge-based geometry
    │   │   ├── lengths/              # Edge lengths [E×1]
    │   │   ├── weights_cotangent/    # Cotangent weights [E×1]
    │   │   └── weights_euclidean/    # Euclidean weights [E×1]
    │   └── dual/                     # Dual mesh geometry (optional)
    │       ├── edgeLengths/          # Dual edge lengths [E×1]
    │       └── vertexAreas/          # Dual vertex areas [N×1]
    ├── topology/                     # Topological connectivity (optional)
    │   ├── .zgroup
    │   ├── .zattrs
    │   ├── adjacency/                # Adjacency matrices (sparse COO)
    │   ├── boundary/                 # Boundary information
    │   └── halfedge/                 # Halfedge data structure
    ├── operators/                    # Differential operators (optional)
    │   ├── .zgroup
    │   ├── .zattrs
    │   ├── massmatrix/               # FEM mass matrix (sparse COO)
    │   ├── stiffness/                # FEM stiffness matrix (sparse COO)
    │   ├── laplacebeltrami/          # Laplace-Beltrami operator (sparse COO)
    │   ├── gradient/                 # Gradient operator (sparse COO)
    │   ├── divergence/               # Divergence operator (sparse COO)
    │   └── dec/                      # Discrete Exterior Calculus operators
    └── eigenmodes/                   # Spectral decomposition (optional)
        ├── .zgroup
        ├── .zattrs                   # Number of modes, computation method
        ├── eigenvalues/              # Eigenvalues [K×1]
        └── eigenvectors/             # Eigenvectors [N×K]
```

---

## Root Attributes

Located in `.zattrs` at the root of the Zarr store.

### Required Attributes

| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `schema` | string | Schema identifier with version | `"bct.manifold@1.1"` |
| `format` | string | File format identifier | `"zarr"` |
| `zarr_version` | integer | Zarr specification version | `2` |
| `created_utc` | string | Creation timestamp (ISO 8601) | `"2026-01-22T18:30:45Z"` |

### Example

```json
{
  "schema": "bct.manifold@1.1",
  "format": "zarr",
  "zarr_version": 2,
  "created_utc": "2026-01-22T18:30:45Z"
}
```

---

## Manifold Group (`/manifold/`)

The primary data container for the triangulated surface.

### Manifold Attributes

Located in `/manifold/.zattrs`.

| Attribute | Type | Description | Example |
|-----------|------|-------------|---------|
| `schema` | string | Manifold schema version | `"bct.Manifold@1.1"` |
| `package` | string | Source package | `"bct"` |
| `ID` | string | Mesh identifier | `"fsaverage_rh_pial"` |
| `FaceWinding` | string | Face orientation convention | `"CCW"` (counter-clockwise) |
| `Metric_units_length` | string | Length unit | `"m"` (meters) |
| `Metric_units_area` | string | Area unit | `"m^2"` |
| `Metric_scale` | number | Scaling factor | `1.0` |
| `Metric_rescaled` | boolean | Whether mesh has been rescaled | `false` |

### Example

```json
{
  "schema": "bct.Manifold@1.1",
  "package": "bct",
  "ID": "fsaverage_rh_pial",
  "FaceWinding": "CCW",
  "Metric_units_length": "m",
  "Metric_units_area": "m^2",
  "Metric_scale": 1.0,
  "Metric_rescaled": false
}
```

---

## Core Datasets

### Vertices (`/manifold/Vertices/`)

**Shape:** `[N, 3]`  
**Dtype:** `float64` (double precision)  
**Units:** meters (m)

3D coordinates of mesh vertices in Euclidean space.

**Attributes:**

```json
{
  "dtype": "double",
  "units": "m",
  "support": "vertex",
  "description": "Vertex coordinates in 3D space"
}
```

**Layout:** Each row represents one vertex `[x, y, z]`.

**Example (JavaScript):**

```javascript
// Using zarr.js
const store = new zarr.DirectoryStore('cortex.zarr');
const vertices = await zarr.openArray({ store, path: 'manifold/Vertices' });
const coords = await vertices.get(); // Shape: [N, 3]
console.log(`First vertex: (${coords[0][0]}, ${coords[0][1]}, ${coords[0][2]})`);
```

---

### Faces (`/manifold/Faces/`)

**Shape:** `[M, 3]`  
**Dtype:** `uint32` (32-bit unsigned integer)  
**Units:** dimensionless (1)  
**Index Base:** 0 (zero-based indexing)

Triangle connectivity defining mesh faces. Each row contains three vertex indices forming a triangle.

**Attributes:**

```json
{
  "dtype": "uint32",
  "units": "1",
  "support": "face",
  "description": "Face connectivity (indices into Vertices)",
  "index_base": 0
}
```

**Layout:** Each row `[v0, v1, v2]` defines a triangular face with vertices at indices `v0`, `v1`, `v2`.

**Face Winding:** Counter-clockwise (CCW) when viewed from outside the surface.

**Example (JavaScript):**

```javascript
const faces = await zarr.openArray({ store, path: 'manifold/Faces' });
const triangles = await faces.get(); // Shape: [M, 3]
// First triangle connects vertices: triangles[0][0], triangles[0][1], triangles[0][2]
```

---

### Edges (`/manifold/Edges/`)

**Shape:** `[E, 2]`  
**Dtype:** `uint32`  
**Units:** dimensionless (1)  
**Index Base:** 0

Unique undirected edges in the mesh. Each edge defined by two vertex indices.

**Attributes:**

```json
{
  "dtype": "uint32",
  "units": "1",
  "support": "edge",
  "description": "Edge connectivity (unique undirected edges)",
  "index_base": 0
}
```

**Layout:** Each row `[v0, v1]` defines an edge between vertices `v0` and `v1`.

**Ordering:** Canonical ordering with `v0 < v1` for undirected edges.

---

## Geometry Group (`/manifold/geometry/`)

Optional group containing computed geometric properties.

### Group Attributes

```json
{
  "schema": "bct.manifold.geometry@1.0.0",
  "package": "bct.manifold.geometry",
  "precision": "double",
  "circumcenterMethod": "native",
  "boundaryPolicy": "error",
  "dualCellType": "circumcentric",
  "includeDual": true,
  "computed_utc": "2026-01-22T18:30:45Z"
}
```

### Face Geometry (`/manifold/geometry/face/`)

#### Areas (`areas/`)
- **Shape:** `[M, 1]`
- **Dtype:** `float64`
- **Units:** m²
- **Description:** Area of each triangular face

#### Centroids (`centroids/`)
- **Shape:** `[M, 3]`
- **Dtype:** `float64`
- **Units:** m
- **Description:** Geometric centroid of each face (average of three vertices)

#### Circumcenters (`circumcenters/`)
- **Shape:** `[M, 3]`
- **Dtype:** `float64`
- **Units:** m
- **Description:** Circumcenter of each triangle (center of circumscribed circle)

#### Normals (`normals/`)
- **Shape:** `[M, 3]`
- **Dtype:** `float64`
- **Units:** dimensionless (normalized)
- **Description:** Unit normal vectors perpendicular to each face (CCW winding)

#### Cotangent Values (`cotan/`)
- **Shape:** `[M, 3]`
- **Dtype:** `float64`
- **Units:** dimensionless
- **Description:** Cotangent of angles at each face vertex (used in FEM)

#### Tangent Frames (`tangent1/`, `tangent2/`)
- **Shape:** `[M, 3]` each
- **Dtype:** `float64`
- **Units:** dimensionless (normalized)
- **Description:** Orthonormal tangent basis for each face

### Vertex Geometry (`/manifold/geometry/vertex/`)

#### Normals (`normals/`)
- **Shape:** `[N, 3]`
- **Dtype:** `float64`
- **Units:** dimensionless (normalized)
- **Description:** Area-weighted average of incident face normals

#### Tangent Frames (`tangent1/`, `tangent2/`)
- **Shape:** `[N, 3]` each
- **Dtype:** `float64`
- **Description:** Orthonormal tangent basis at each vertex

### Edge Geometry (`/manifold/geometry/edge/`)

#### Lengths (`lengths/`)
- **Shape:** `[E, 1]`
- **Dtype:** `float64`
- **Units:** m
- **Description:** Euclidean length of each edge

#### Cotangent Weights (`weights_cotangent/`)
- **Shape:** `[E, 1]`
- **Dtype:** `float64`
- **Units:** dimensionless
- **Description:** Cotangent weight (sum of cotangents of opposite angles)

#### Euclidean Weights (`weights_euclidean/`)
- **Shape:** `[E, 1]`
- **Dtype:** `float64`
- **Units:** m⁻¹
- **Description:** Inverse edge length weights

### Dual Geometry (`/manifold/geometry/dual/`)

**Note:** Only present for closed manifolds (no boundary edges). May be empty if mesh has boundaries.

#### Edge Lengths (`edgeLengths/`)
- **Shape:** `[E, 1]`
- **Dtype:** `float64`
- **Units:** m
- **Description:** Length of dual edges (distance between adjacent face circumcenters)

#### Vertex Areas (`vertexAreas/`)
- **Shape:** `[N, 1]`
- **Dtype:** `float64`
- **Units:** m²
- **Description:** Area of dual Voronoi cells around each vertex

---

## Operators Group (`/manifold/operators/`)

Differential operators stored as **sparse matrices in COO (Coordinate List) format**.

### Sparse Matrix Format

All sparse matrices are stored with three datasets:

1. **`data/`** - Non-zero values `[nnz, 1]`
2. **`indices/`** - Column indices `[nnz, 1]` (0-based)
3. **`indptr/`** - Row pointers `[nrows+1, 1]` (0-based)

This is a **CSR (Compressed Sparse Row)** format variant.

**Alternative COO Format** (used in some datasets):

1. **`row/`** - Row indices `[nnz, 1]` (0-based)
2. **`col/`** - Column indices `[nnz, 1]` (0-based)
3. **`data/`** - Values `[nnz, 1]`

### Operator Attributes

Each operator includes metadata:

```json
{
  "dtype": "double",
  "shape": [10242, 10242],
  "format": "coo",
  "nnz": 71680,
  "symmetric": true,
  "description": "Laplace-Beltrami operator",
  "computedBy": "bct.manifold.operator.laplacebeltrami"
}
```

### Key Operators

#### Laplace-Beltrami (`laplacebeltrami/`)
- **Shape:** `[N, N]`
- **Format:** Sparse COO/CSR
- **Symmetric:** Yes
- **Description:** Discrete Laplace-Beltrami operator (cotangent formulation)
- **Units:** m⁻²

#### Mass Matrix (`massmatrix/`)
- **Shape:** `[N, N]`
- **Format:** Sparse COO/CSR (diagonal)
- **Symmetric:** Yes
- **Description:** FEM mass matrix (lumped or consistent)
- **Units:** m²

#### Stiffness Matrix (`stiffness/`)
- **Shape:** `[N, N]`
- **Format:** Sparse COO/CSR
- **Symmetric:** Yes
- **Description:** FEM stiffness matrix
- **Units:** dimensionless

#### Gradient (`gradient/`)
- **Shape:** `[2M, N]` (maps vertex scalars to face tangent vectors)
- **Format:** Sparse COO
- **Description:** Gradient operator (scalar field → tangent vector field)

#### Divergence (`divergence/`)
- **Shape:** `[N, 2M]`
- **Format:** Sparse COO
- **Description:** Divergence operator (tangent vector field → scalar field)

### DEC Operators (`/manifold/operators/dec/`)

Discrete Exterior Calculus operators:

- **`d0/`** - Exterior derivative (0-forms → 1-forms) `[E, N]`
- **`d1/`** - Exterior derivative (1-forms → 2-forms) `[M, E]`
- **`dd0/`** - Codifferential (1-forms → 0-forms) `[N, E]`
- **`dd1/`** - Codifferential (2-forms → 1-forms) `[E, M]`
- **`hd0/`** - Hodge star (0-forms) `[N, N]` diagonal
- **`hd1/`** - Hodge star (1-forms) `[E, E]` diagonal
- **`hd2/`** - Hodge star (2-forms) `[M, M]` diagonal

**Example (JavaScript - Reading Sparse Matrix):**

```javascript
// Read Laplace-Beltrami operator
const L_data = await (await zarr.openArray({ 
  store, path: 'manifold/operators/laplacebeltrami/data' 
})).get();

const L_row = await (await zarr.openArray({ 
  store, path: 'manifold/operators/laplacebeltrami/row' 
})).get();

const L_col = await (await zarr.openArray({ 
  store, path: 'manifold/operators/laplacebeltrami/col' 
})).get();

// Reconstruct sparse matrix (using a library like sparse-array)
const L = new SparseMatrix(L_row, L_col, L_data, [N, N]);
```

---

## Eigenmodes Group (`/manifold/eigenmodes/`)

Spectral decomposition of the Laplace-Beltrami operator.

### Group Attributes

```json
{
  "schema": "bct.manifold.eigenmodes@1.0.0",
  "numModes": 100,
  "solver": "eigs",
  "computed_utc": "2026-01-22T18:30:45Z"
}
```

### Eigenvalues (`eigenvalues/`)

**Shape:** `[K, 1]`  
**Dtype:** `float64`  
**Units:** m⁻²  
**Description:** Eigenvalues λₖ of Laplace-Beltrami operator in ascending order

**Ordering:** λ₀ = 0 (constant mode), λ₁ ≤ λ₂ ≤ ... ≤ λₖ

### Eigenvectors (`eigenvectors/`)

**Shape:** `[N, K]`  
**Dtype:** `float64`  
**Units:** dimensionless  
**Description:** Eigenvectors (eigenfunctions) of Laplace-Beltrami operator

**Properties:**
- **M-orthonormal:** `U' * M * U = I` where M is the mass matrix
- **Column k:** k-th eigenfunction corresponding to eigenvalue λₖ
- **Basis:** Forms complete orthonormal basis for functions on the manifold

**Chunking:** Large eigenvector matrices may be chunked (e.g., `[N, 10]` chunks)

**Example (JavaScript):**

```javascript
const eigenvalues = await (await zarr.openArray({ 
  store, path: 'manifold/eigenmodes/eigenvalues' 
})).get();

const eigenvectors = await (await zarr.openArray({ 
  store, path: 'manifold/eigenmodes/eigenvectors' 
})).get();

console.log(`First 5 eigenvalues: ${eigenvalues.slice(0, 5)}`);
console.log(`Eigenvector matrix shape: [${eigenvectors.shape}]`);
```

---

## Data Type Reference

### Zarr to Language Type Mapping

| Zarr dtype | MATLAB | Python (NumPy) | JavaScript (TypedArray) | C/C++ |
|------------|--------|----------------|-------------------------|-------|
| `float64` | `double` | `float64` | `Float64Array` | `double` |
| `float32` | `single` | `float32` | `Float32Array` | `float` |
| `uint32` | `uint32` | `uint32` | `Uint32Array` | `uint32_t` |
| `uint16` | `uint16` | `uint16` | `Uint16Array` | `uint16_t` |
| `int32` | `int32` | `int32` | `Int32Array` | `int32_t` |
| `int8` | `int8` | `int8` | `Int8Array` | `int8_t` |
| `\|b1` | `logical` | `bool` | `Uint8Array` | `bool` |

### Endianness

- **Little-endian** (`<`): Default for most platforms
- **Big-endian** (`>`): Rare, explicitly marked
- **Not applicable** (`|`): For single-byte types

**Example:** `<f8` = little-endian 64-bit float (same as `float64`)

---

## Conventions and Standards

### Coordinate System

- **Right-handed:** Standard 3D Euclidean coordinates
- **Units:** Meters (m) by default
- **Origin:** Dataset-specific (e.g., center of mass for cortical surfaces)

### Indexing

- **Arrays:** 0-based (C/Python/JavaScript convention)
- **MATLAB conversion:** Subtract 1 when exporting from MATLAB
- **Attribute:** `index_base = 0` explicitly marks 0-based arrays

### Face Orientation

- **Winding:** Counter-clockwise (CCW) when viewed from outside
- **Normal direction:** Points outward from enclosed volume
- **Validation:** Use `bct.manifold.health.check()` to verify consistent orientation

### Sparse Matrix Storage

**COO Format:**
```
row[i], col[i], data[i]  →  Matrix[row[i], col[i]] = data[i]
```

**CSR Format:**
```
data[k], indices[k]  where k ∈ [indptr[i], indptr[i+1])  →  Matrix[i, indices[k]] = data[k]
```

### Missing Data

- **Empty arrays:** Shape `[0, d]` for missing optional data (e.g., dual geometry on meshes with boundaries)
- **NaN values:** Not used; missing data indicated by empty arrays
- **Optional groups:** Absence of group indicates data not computed

---

## Reading BCT Zarr Files

### Python Example

```python
import zarr
import numpy as np

# Open Zarr store
store = zarr.DirectoryStore('cortex.zarr')
root = zarr.open(store, mode='r')

# Read core mesh data
vertices = root['manifold/Vertices'][:]  # Shape: (N, 3)
faces = root['manifold/Faces'][:]        # Shape: (M, 3)
edges = root['manifold/Edges'][:]        # Shape: (E, 2)

# Read metadata
manifold_attrs = root['manifold'].attrs.asdict()
print(f"Mesh ID: {manifold_attrs['ID']}")
print(f"Vertices: {vertices.shape[0]}, Faces: {faces.shape[0]}")

# Read geometry (if available)
if 'geometry' in root['manifold']:
    face_areas = root['manifold/geometry/face/areas'][:]
    vertex_normals = root['manifold/geometry/vertex/normals'][:]

# Read eigenmodes (if available)
if 'eigenmodes' in root['manifold']:
    eigenvalues = root['manifold/eigenmodes/eigenvalues'][:]
    eigenvectors = root['manifold/eigenmodes/eigenvectors'][:]
    print(f"Number of eigenmodes: {len(eigenvalues)}")
```

### JavaScript Example

```javascript
import * as zarr from 'zarr';

async function loadMesh(path) {
  const store = new zarr.DirectoryStore(path);
  
  // Load core data
  const vertices = await (await zarr.openArray({ 
    store, path: 'manifold/Vertices' 
  })).get();
  
  const faces = await (await zarr.openArray({ 
    store, path: 'manifold/Faces' 
  })).get();
  
  // Load attributes
  const root = await zarr.open({ store, mode: 'r' });
  const manifold = await root.getItem('manifold');
  const attrs = await manifold.attrs.asObject();
  
  console.log(`Loaded mesh: ${attrs.ID}`);
  console.log(`Vertices: ${vertices.shape[0]}, Faces: ${faces.shape[0]}`);
  
  return { vertices, faces, attrs };
}

// Usage
const mesh = await loadMesh('cortex.zarr');
```

### C++ Example (xtensor-zarr)

```cpp
#include <xtensor-zarr/xzarr_hierarchy.hpp>
#include <xtensor/xarray.hpp>

auto store = xt::xzarr_file_system_store("cortex.zarr");
auto hierarchy = xt::xzarr_hierarchy(store);

// Load vertices
auto vertices_array = hierarchy.get_array("/manifold/Vertices");
xt::xarray<double> vertices = vertices_array.get_array<double>();

// Load faces
auto faces_array = hierarchy.get_array("/manifold/Faces");
xt::xarray<uint32_t> faces = faces_array.get_array<uint32_t>();

std::cout << "Vertices: " << vertices.shape()[0] << std::endl;
std::cout << "Faces: " << faces.shape()[0] << std::endl;
```

---

## Version History

### Version 1.1 (January 2026)
- Added dual geometry support
- Renamed `lambda` to `eigenvalues`, `U` to `eigenvectors`
- Improved sparse matrix metadata
- Added comprehensive dataset attributes
- Standardized 0-based indexing for all connectivity arrays

### Version 1.0 (2025)
- Initial release
- Core mesh data (vertices, faces, edges)
- Geometry, topology, operators, eigenmodes groups
- COO sparse matrix format

---

## References

- **Zarr Specification:** https://zarr.readthedocs.io/
- **DEC Theory:** Discrete Differential Geometry (Desbrun et al.)
- **FEM on Surfaces:** Finite Elements for Analysis and Implementation (Brenner & Scott)
- **Spectral Graph Theory:** Spectral Graph Theory (Chung)

---

## Contact and Support

- **Repository:** https://github.com/your-org/bioctree
- **Issues:** https://github.com/your-org/bioctree/issues
- **Documentation:** https://bioctree.readthedocs.io/

---

**End of Specification**
