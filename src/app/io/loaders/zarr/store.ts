// Utility functions for working with Zarrita stores
import { FetchStore } from 'zarrita';
import type { Location } from 'zarrita';
import * as zarr from 'zarrita';

/**
 * Open a Zarr store and return the root location
 * @param path - Relative path from public/ or absolute URL
 * @returns Root location for the Zarr store
 */
export async function openZarrStore(path: string): Promise<Location<FetchStore>> {
  // Construct full URL using the same pattern as the old loader
  const fullUrl = path.startsWith('http') 
    ? path 
    : new URL(path, window.location.origin).href;
  const store = new FetchStore(fullUrl);
  return zarr.root(store);
}

/**
 * Check if a group exists within a Zarr store
 * @param loc - Parent location
 * @param groupPath - Relative path to group (e.g., 'manifold/eigenmodes')
 * @returns True if group exists, false otherwise
 */
export async function checkGroupExists(
  loc: Location<FetchStore>,
  groupPath: string
): Promise<boolean> {
  try {
    const groupLoc = loc.resolve(groupPath);
    await zarr.open(groupLoc, { kind: 'group' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a Zarr array and extract the TypedArray data
 * @param loc - Parent location
 * @param arrayPath - Relative path to array (e.g., 'manifold/vertices')
 * @returns TypedArray containing the array data
 */
export async function readArray<T extends TypedArray = Float64Array>(
  loc: Location<FetchStore>,
  arrayPath: string
): Promise<T> {
  const arrayLoc = loc.resolve(arrayPath);
  const array = await zarr.open(arrayLoc, { kind: 'array' });
  
  // Get the ndarray
  const ndarray = await zarr.get(array);
  
  // Extract the .data property which contains the TypedArray
  const data = (ndarray as any).data;
  
  if (!data) {
    throw new Error(`Failed to extract data from array at ${arrayPath}`);
  }
  
  return data as T;
}

/**
 * Read attributes from a Zarr group or array
 * @param loc - Parent location
 * @param groupPath - Relative path to group/array
 * @returns Parsed attributes object
 */
export async function readAttrs<T = Record<string, any>>(
  loc: Location<FetchStore>,
  groupPath: string
): Promise<T> {
  const groupLoc = loc.resolve(groupPath);
  
  try {
    // Use zarr.open() which handles .zattrs parsing internally
    const group = await zarr.open(groupLoc, { kind: 'group' });
    // zarr.open() returns an object with attrs property that's already parsed
    return group.attrs as T;
  } catch (error) {
    throw error;
  }
}

/**
 * List all groups and subgroups within a Zarr store
 * @param path - Path to .zarr directory
 * @returns Array of group paths with their attributes
 */
export async function listZarrGroups(
  path: string
): Promise<Array<{ path: string; attrs: Record<string, any> }>> {
  const rootLoc = await openZarrStore(path);
  const groups: Array<{ path: string; attrs: Record<string, any> }> = [];
  
  // Known group structure in BCT schema
  const knownGroups = [
    'manifold',
    'manifold/eigenmodes',
    'manifold/geometry',
    'manifold/geometry/vertex',
    'manifold/geometry/edge',
    'manifold/geometry/face',
    'manifold/geometry/dual',
    'manifold/topology',
    'manifold/operators',
  ];
  
  // Check each known group and read its attributes
  for (const groupPath of knownGroups) {
    const exists = await checkGroupExists(rootLoc, groupPath);
    if (exists) {
      try {
        const attrs = await readAttrs(rootLoc, groupPath);
        groups.push({ path: groupPath, attrs });
      } catch (error) {
      }
    }
  }
  
  return groups;
}

/**
 * Read raw attributes directly from .zattrs file (for inspection)
 * @param path - Full path to zarr package
 * @param groupPath - Relative path to group (e.g., 'manifold/eigenmodes')
 * @returns Raw parsed JSON from .zattrs file
 */
export async function readRawAttrs(
  path: string,
  groupPath: string
): Promise<Record<string, any>> {
  const attrsUrl = `${path}/${groupPath}/.zattrs`;
  const fullUrl = attrsUrl.startsWith('http') 
    ? attrsUrl 
    : new URL(attrsUrl, window.location.origin).href;
  const response = await fetch(fullUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${attrsUrl}: ${response.statusText}`);
  }
  
  return await response.json();
}

// Type aliases for common TypedArrays
type TypedArray =
  | Float32Array
  | Float64Array
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Int8Array
  | Int16Array
  | Int32Array;
