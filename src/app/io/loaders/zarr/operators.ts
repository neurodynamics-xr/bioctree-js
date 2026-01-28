/**
 * Zarr Operators Loader
 * 
 * Loads geometric operators from BCT zarr packages:
 * - Mass matrix (diagonal, sparse COO)
 * - Stiffness matrix (Laplace-Beltrami, sparse COO)
 * - Derivative operators (d0, d1, dd0, dd1, etc.)
 */

import * as zarr from 'zarrita';
import type { Location } from 'zarrita';
import { FetchStore } from 'zarrita';
import { openZarrStore } from './store';
import type { ZarrOperator, LoadOperatorOptions, BCTOperatorsAttrs } from './types';

/**
 * Load a single operator from zarr
 * Supports both dense (1D diagonal) and sparse (COO) formats
 */
export async function loadOperatorFromZarr(
  zarrPath: string,
  operatorName: string,
  options?: LoadOperatorOptions
): Promise<ZarrOperator> {
  const store = openZarrStore(zarrPath);
  const groupPath = `manifold/operators/${operatorName}`;
  // Read operator attributes
  const attrsResponse = await fetch(`${zarrPath}/${groupPath}/.zattrs`);
  if (!attrsResponse.ok) {
    throw new Error(`Failed to load operator attributes: ${groupPath}`);
  }
  const attrs = await attrsResponse.json() as BCTOperatorsAttrs;
  // Check storage format
  const storage = attrs.storage || 'dense';
  
  if (storage === 'sparse') {
    // Load sparse COO format
    return loadSparseCOOOperator(store, groupPath, attrs, options);
  } else {
    // Load dense format (diagonal operators like mass)
    return loadDenseOperator(store, groupPath, attrs, options);
  }
}

/**
 * Load mass matrix operator
 * Returns diagonal as Float32Array for GPU upload
 */
export async function loadMassMatrix(
  zarrPath: string,
  options?: LoadOperatorOptions
): Promise<ZarrOperator> {
  return loadOperatorFromZarr(zarrPath, 'mass', options);
}

/**
 * Load stiffness matrix operator (Laplace-Beltrami)
 */
export async function loadStiffnessMatrix(
  zarrPath: string,
  options?: LoadOperatorOptions
): Promise<ZarrOperator> {
  return loadOperatorFromZarr(zarrPath, 'stiffness', options);
}

/**
 * Load dense operator (typically diagonal)
 */
async function loadDenseOperator(
  store: Location<FetchStore>,
  groupPath: string,
  attrs: BCTOperatorsAttrs,
  options?: LoadOperatorOptions
): Promise<ZarrOperator> {
  const dataArray = await zarr.openArray({ store, path: `${groupPath}/data` });
  const data = await dataArray.get();
  
  // Ensure data is Float64Array (typical zarr format)
  if (!(data instanceof Float64Array)) {
    throw new Error(`Expected Float64Array, got ${data.constructor.name}`);
  }
  
  // Convert to Float32 for GPU if requested
  const useFp32 = options?.convertToFloat32 ?? true;
  const finalData = useFp32 ? new Float32Array(data) : data;
  return {
    name: attrs.name || 'unknown',
    format: 'diagonal',
    shape: attrs.shape as [number, number],
    dtype: useFp32 ? 'float32' : 'float64',
    diagonal: finalData,
    metadata: {
      description: attrs.description,
      variant: attrs.variant,
      symmetrize: attrs.symmetrize,
      precision: attrs.precision,
      units: attrs.units,
      storage: attrs.storage
    }
  };
}

/**
 * Load sparse COO operator
 */
async function loadSparseCOOOperator(
  store: Location<FetchStore>,
  groupPath: string,
  attrs: BCTOperatorsAttrs,
  options?: LoadOperatorOptions
): Promise<ZarrOperator> {
  // Load COO components: row, col, data
  const [rowArray, colArray, dataArray] = await Promise.all([
    zarr.openArray({ store, path: `${groupPath}/row` }),
    zarr.openArray({ store, path: `${groupPath}/col` }),
    zarr.openArray({ store, path: `${groupPath}/data` })
  ]);
  
  const [row, col, data] = await Promise.all([
    rowArray.get(),
    colArray.get(),
    dataArray.get()
  ]);
  
  // Validate COO format
  if (!(row instanceof Int32Array || row instanceof Uint32Array)) {
    throw new Error(`Expected integer row indices, got ${row.constructor.name}`);
  }
  if (!(col instanceof Int32Array || col instanceof Uint32Array)) {
    throw new Error(`Expected integer col indices, got ${col.constructor.name}`);
  }
  if (!(data instanceof Float64Array)) {
    throw new Error(`Expected Float64Array for data, got ${data.constructor.name}`);
  }
  
  // Convert to GPU-friendly types
  const useFp32 = options?.convertToFloat32 ?? true;
  const finalData = useFp32 ? new Float32Array(data) : data;
  const finalRow = new Uint32Array(row);
  const finalCol = new Uint32Array(col);
  return {
    name: attrs.name || 'unknown',
    format: 'coo',
    shape: attrs.shape as [number, number],
    dtype: useFp32 ? 'float32' : 'float64',
    row: finalRow,
    col: finalCol,
    data: finalData,
    nnz: attrs.nnz,
    metadata: {
      description: attrs.description,
      variant: attrs.variant,
      symmetrize: attrs.symmetrize,
      precision: attrs.precision,
      units: attrs.units,
      storage: attrs.storage
    }
  };
}

/**
 * Extract diagonal from sparse COO matrix
 * Useful for getting mass matrix diagonal efficiently
 */
export function extractDiagonalFromCOO(
  operator: ZarrOperator
): Float32Array | Float64Array {
  if (operator.format !== 'coo') {
    throw new Error('extractDiagonalFromCOO requires COO format operator');
  }
  
  const [nRows] = operator.shape;
  const diagonal = operator.dtype === 'float32' 
    ? new Float32Array(nRows) 
    : new Float64Array(nRows);
  
  // Extract diagonal entries (row === col)
  for (let i = 0; i < operator.row!.length; i++) {
    const r = operator.row![i];
    const c = operator.col![i];
    if (r === c) {
      diagonal[r] = operator.data[i];
    }
  }
  return diagonal;
}
