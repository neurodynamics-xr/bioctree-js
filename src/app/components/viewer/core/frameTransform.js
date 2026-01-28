/**
 * frameTransform.js
 * 
 * Coordinate frame transformation utilities.
 * 
 * Encodes coordinate system conversions between different conventions:
 * - MATLAB RAS (Right-Anterior-Superior) with Z-up
 * - three.js default (Y-up)
 * - FreeSurfer conventions
 * 
 * Frame transforms are applied to root nodes, not individual geometry objects.
 * 
 * Critical rule: Never rotate camera to compensate for data conventions.
 * Camera stays canonical (three.js Y-up). Geometry adapts via frame roots.
 */

import * as THREE from 'three';

/**
 * Create a root node that maps MATLAB RAS coordinates
 * into three.js Y-up display space.
 * 
 * MATLAB/FreeSurfer: Z-up
 * three.js: Y-up
 * 
 * Rotate -90° about X to map Z → Y
 * 
 * @returns {THREE.Group} Frame root with MATLAB→three.js transform
 */
export function createMATLABFrame() {
  const root = new THREE.Group();

  // MATLAB / FreeSurfer: Z-up
  // three.js: Y-up
  // Rotate -90° about X to map Z → Y
  root.rotation.x = -Math.PI / 2;

  root.name = 'MATLABFrame';

  return root;
}

/**
 * Create a native three.js frame (identity transform)
 * @returns {THREE.Group} Frame root with no transform
 */
export function createThreeJSFrame() {
  const root = new THREE.Group();
  root.name = 'ThreeJSFrame';
  return root;
}

/**
 * Set frame rotation for different coordinate conventions
 * @param {THREE.Group} frameRoot - Frame root to modify
 * @param {string} convention - Convention identifier ('matlab', 'threejs', etc.)
 */
export function setFrameConvention(frameRoot, convention) {
  switch (convention) {
    case 'matlab':
    case 'freesurfer':
    case 'ras-zup':
      // MATLAB/FreeSurfer Z-up → three.js Y-up
      frameRoot.rotation.x = -Math.PI / 2;
      frameRoot.name = 'MATLABFrame';
      break;

    case 'threejs':
    case 'yup':
      // Native three.js (identity)
      frameRoot.rotation.x = 0;
      frameRoot.name = 'ThreeJSFrame';
      break;

    default:
      console.warn(`[frameTransform] Unknown convention: ${convention}, using identity`);
      frameRoot.rotation.x = 0;
  }
}

