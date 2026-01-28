/**
 * vector.ts
 * 
 * Vector field operations using TSL.
 * Provides operations on vector fields defined on mesh vertices or faces.
 * 
 * Note: Most vector field operations (curl, div, gradient) require
 * mesh connectivity and differential geometry operators, which will
 * be implemented as needed.
 */

import * as TSL from 'three/tsl';
import { getVertexCount, getFaceCount } from '../../state/manifold';

export interface VectorFieldTSL {
  fieldStorage: any;  // vec3 storage
  fieldAttr: any;
  compute?: any;
}

/**
 * Create an empty vector field on vertices
 */
export function createVertexVectorFieldTSL(
  initialValue: [number, number, number] = [0, 0, 0]
): VectorFieldTSL {
  const nV = getVertexCount();
  
  const THREE = TSL;
  const data = new Float32Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    data[i * 3 + 0] = initialValue[0];
    data[i * 3 + 1] = initialValue[1];
    data[i * 3 + 2] = initialValue[2];
  }
  
  const fieldAttr = new THREE.StorageBufferAttribute(data, 3);
  const fieldStorage = TSL.storage(fieldAttr, 'vec3', nV);

  return {
    fieldStorage,
    fieldAttr
  };
}

/**
 * Create an empty vector field on faces
 */
export function createFaceVectorFieldTSL(
  initialValue: [number, number, number] = [0, 0, 0]
): VectorFieldTSL {
  const nF = getFaceCount();
  
  const THREE = TSL;
  const data = new Float32Array(nF * 3);
  for (let i = 0; i < nF; i++) {
    data[i * 3 + 0] = initialValue[0];
    data[i * 3 + 1] = initialValue[1];
    data[i * 3 + 2] = initialValue[2];
  }
  
  const fieldAttr = new THREE.StorageBufferAttribute(data, 3);
  const fieldStorage = TSL.storage(fieldAttr, 'vec3', nF);

  return {
    fieldStorage,
    fieldAttr
  };
}

/**
 * Compute magnitude of vector field → scalar field
 */
export function createVectorMagnitudeTSL(
  vectorStorage: any,
  scalarResultStorage: any
): any {
  const nV = getVertexCount();

  const magFn = TSL.Fn(() => {
    const v = TSL.computeIndex;
    const vec = vectorStorage.element(v);
    const mag = vec.length();
    scalarResultStorage.element(v).assign(mag);
  }).setLayout({
    name: 'vectorMagnitude',
    type: 'void',
    inputs: []
  });

  return magFn().compute(nV);
}

/**
 * Scale vector field by scalar
 */
export function createVectorScaleTSL(
  vectorStorage: any,
  resultStorage: any,
  scaleValue: number = 1.0
): { compute: any; setScale: (s: number) => void } {
  const nV = getVertexCount();
  const scaleUniform = TSL.uniform(scaleValue);

  const scaleFn = TSL.Fn(() => {
    const v = TSL.computeIndex;
    const vec = vectorStorage.element(v);
    resultStorage.element(v).assign(vec.mul(scaleUniform));
  }).setLayout({
    name: 'vectorScale',
    type: 'void',
    inputs: []
  });

  return {
    compute: scaleFn().compute(nV),
    setScale: (s: number) => { scaleUniform.value = s; }
  };
}
