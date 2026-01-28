// Eigenmodes loader (Phase 2)
// Loads eigenvalues and eigenvectors from BCT Zarr eigenmodes group

import type { Location } from 'zarrita';
import { FetchStore } from 'zarrita';
import { openZarrStore, readArray, readAttrs, checkGroupExists } from './store';
import type {
  ZarrEigenmodes,
  BCTEigenmodesAttrs,
  LoadEigenmodesOptions,
} from './types';

/**
 * Load eigenmodes from a BCT Zarr package
 * @param path - Path to .zarr directory (e.g., 'src/app/data/bctbunny.zarr')
 * @param options - Loading options (maxModes, modesRange)
 * @returns ZarrEigenmodes containing eigenvalues, eigenvectors, and metadata
 */
export async function loadEigenmodesFromZarr(
  path: string,
  options: LoadEigenmodesOptions = {}
): Promise<ZarrEigenmodes> {
  const { maxModes, modesRange } = options;

  // Open the Zarr store
  const rootLoc = await openZarrStore(path);

  // Check if eigenmodes group exists
  const eigenmodesExists = await checkGroupExists(rootLoc, 'manifold/eigenmodes');
  if (!eigenmodesExists) {
    throw new Error(
      `Eigenmodes group not found at ${path}/manifold/eigenmodes`
    );
  }

  // Read eigenmodes metadata
  const eigenmodesAttrs = await readAttrs<BCTEigenmodesAttrs>(
    rootLoc,
    'manifold/eigenmodes'
  );

  // Determine how many modes to load
  const numModes = eigenmodesAttrs.numModes;
  let loadCount = numModes;
  let startIdx = 0;

  if (modesRange) {
    startIdx = modesRange[0];
    loadCount = modesRange[1] - modesRange[0];
    if (startIdx < 0 || modesRange[1] > numModes) {
      throw new Error(
        `Invalid modesRange [${startIdx}, ${modesRange[1]}): must be within [0, ${numModes})`
      );
    }
  } else if (maxModes !== undefined) {
    loadCount = Math.min(maxModes, numModes);
  }

  // Load eigenvalues and eigenvectors
  const eigenvalues = await loadEigenvalues(rootLoc, startIdx, loadCount);
  const eigenvectors = await loadEigenvectors(rootLoc, startIdx, loadCount);

  return {
    eigenvalues,
    eigenvectors,
    metadata: {
      ...eigenmodesAttrs,
      numModes: loadCount, // Update to reflect loaded count
    },
  };
}

/**
 * Load eigenvalues array [K, 1] or [K] from manifold/eigenmodes/eigenvalues
 */
async function loadEigenvalues(
  loc: Location<FetchStore>,
  startIdx: number,
  count: number
): Promise<Float32Array | Float64Array> {
  try {
    const eigenvaluesRaw = await readArray<Float64Array>(
      loc,
      'manifold/eigenmodes/eigenvalues'
    );
    // Eigenvalues are stored as [K, 1] - need to flatten
    // Extract column (every other element if [K, 1] is flattened to [K*1])
    const eigenvalues = new Float64Array(count);
    
    // If length equals count, data is already [K] shape
    if (eigenvaluesRaw.length === count) {
      return eigenvaluesRaw.slice(startIdx, startIdx + count);
    }
    
    // Otherwise, it's [K, 1] shape - extract column
    for (let i = 0; i < count; i++) {
      eigenvalues[i] = eigenvaluesRaw[startIdx + i];
    }
    return eigenvalues;
  } catch (error) {
    throw new Error(`Failed to load eigenvalues: ${error}`);
  }
}

/**
 * Load eigenvectors array [N, K] from manifold/eigenmodes/eigenvectors
 * Zarr stores in row-major order: [N, K] means N rows, K columns
 * @param startIdx - Start mode index
 * @param count - Number of modes to load
 * @returns Eigenvectors as [N*count] flattened array (N vertices × count modes)
 */
async function loadEigenvectors(
  loc: Location<FetchStore>,
  startIdx: number,
  count: number
): Promise<Float32Array | Float64Array> {
  try {
    const eigenvectorsRaw = await readArray<Float64Array>(
      loc,
      'manifold/eigenmodes/eigenvectors'
    );
    // Eigenvectors stored as [N, K] in row-major order (C order)
    // Total length = N * K
    // To get mode i for vertex j: eigenvectorsRaw[j * K + i]
    
    // Infer dimensions from metadata (we'll need numVertices and totalModes)
    // For now, assume we're loading all modes if count matches
    const totalLength = eigenvectorsRaw.length;
    
    // Determine K (total modes) from metadata
    // This should match the full K from .zattrs
    // For slicing, we need to know N and K
    
    // If loading all modes, return as-is
    if (startIdx === 0 && totalLength % count === 0) {
      const N = totalLength / count;
      return eigenvectorsRaw;
    }

    // For partial loading, need to extract columns [startIdx : startIdx + count]
    // This requires knowing the total K
    const K = eigenvectorsRaw.length / Math.floor(Math.sqrt(eigenvectorsRaw.length));
    const N = eigenvectorsRaw.length / K;
    // Extract columns [startIdx : startIdx + count]
    const subset = new Float64Array(N * count);
    for (let j = 0; j < N; j++) { // For each vertex
      for (let i = 0; i < count; i++) { // For each mode in range
        subset[j * count + i] = eigenvectorsRaw[j * K + (startIdx + i)];
      }
    }
    return subset;
  } catch (error) {
    throw new Error(`Failed to load eigenvectors: ${error}`);
  }
}

/**
 * Helper: Get a specific eigenmode as a scalar field [N]
 * @param path - Path to .zarr directory
 * @param modeIndex - Mode index (0-based)
 * @returns Single eigenmode as [N] array
 */
export async function loadSingleEigenmode(
  path: string,
  modeIndex: number
): Promise<Float32Array | Float64Array> {
  const eigenmodes = await loadEigenmodesFromZarr(path, {
    modesRange: [modeIndex, modeIndex + 1],
  });

  return eigenmodes.eigenvectors;
}
