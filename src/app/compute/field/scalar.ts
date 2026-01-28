/**
 * scalar.ts
 * 
 * Scalar field operations using TSL.
 * Provides common operations on scalar fields defined on mesh vertices.
 */

import * as TSL from 'three/tsl';
import { getVertexCount } from '../../state/manifold';
import { Field, createBufferField, type FieldCreateOptions } from '../../field/Field';
import { registerField } from '../../state/field';
import type { GPUResourceManager } from '../../gpu/GPUResourceManager';

export interface ScalarFieldTSL {
  field?: Field;
  resourceKey: string; // Key in GPUResourceManager
}

/**
 * Create an empty scalar field
 * 
 * @param gpu - GPU resource manager
 * @param initialValue - Initial value for all vertices
 * @param options - Field creation options
 * @returns ScalarFieldTSL object
 */
export function createScalarFieldTSL(
  gpu: GPUResourceManager,
  initialValue: number = 0.0,
  options?: Partial<FieldCreateOptions> & {
    setAsCurrent?: boolean;
    addToRegistry?: boolean;
  }
): ScalarFieldTSL {
  const {
    name = 'Scalar Field',
    description = 'Generic scalar field',
    domain = 'vertex',
    valueType = 'scalar',
    tags = [],
    setAsCurrent = false,
    addToRegistry = false,
    id,
    range,
    provenance
  } = options || {};

  const nV = getVertexCount();
  
  // Create buffer data
  const data = new Float32Array(nV).fill(initialValue);
  
  // Upload to GPU via GPUResourceManager
  const resourceKey = `field:scalar_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const layout = {
    stride: 4,
    elementCount: nV,
    itemSize: 1,
    dtype: 'float32' as const
  };
  
  gpu.getOrCreateStorageBuffer(resourceKey, data, layout);

  // Only create Field object and register if requested
  let field: Field | undefined = undefined;
  if (addToRegistry || setAsCurrent) {
    field = createBufferField(resourceKey, {
      id,
      name,
      description,
      domain,
      valueType,
      tags,
      range,
      provenance: provenance || {
        operation: 'scalar_create',
        parameters: { initialValue },
        description: 'Created empty scalar field'
      }
    });

    registerField(field, {
      setAsCurrent,
      addToRegistry
    });
  }

  return {
    field,
    resourceKey
  };
}

/**
 * Add two scalar fields: result = a + b
 */
export function createScalarAddTSL(
  storageA: any,
  storageB: any,
  resultStorage: any
): any {
  const nV = getVertexCount();

  const addFn = TSL.Fn(() => {
    const v = TSL.computeIndex;
    const a = storageA.element(v);
    const b = storageB.element(v);
    resultStorage.element(v).assign(a.add(b));
  }).setLayout({
    name: 'scalarAdd',
    type: 'void',
    inputs: []
  });

  return addFn().compute(nV);
}

/**
 * Scale scalar field: result = a * scale
 */
export function createScalarScaleTSL(
  storage: any,
  resultStorage: any,
  scaleValue: number = 1.0
): { compute: any; setScale: (s: number) => void } {
  const nV = getVertexCount();
  const scaleUniform = TSL.uniform(scaleValue);

  const scaleFn = TSL.Fn(() => {
    const v = TSL.computeIndex;
    const val = storage.element(v);
    resultStorage.element(v).assign(val.mul(scaleUniform));
  }).setLayout({
    name: 'scalarScale',
    type: 'void',
    inputs: []
  });

  return {
    compute: scaleFn().compute(nV),
    setScale: (s: number) => { scaleUniform.value = s; }
  };
}

/**
 * Compute L2 norm of scalar field (requires CPU readback)
 */
export function computeScalarNorm(fieldAttr: any): number {
  const array = fieldAttr.array;
  let sum = 0.0;
  
  for (let i = 0; i < array.length; i++) {
    sum += array[i] * array[i];
  }
  
  return Math.sqrt(sum);
}

/**
 * Find min/max of scalar field (requires CPU readback)
 */
export function computeScalarRange(fieldAttr: any): { min: number; max: number } {
  const array = fieldAttr.array;
  let min = Infinity;
  let max = -Infinity;
  
  for (let i = 0; i < array.length; i++) {
    const val = array[i];
    if (val < min) min = val;
    if (val > max) max = val;
  }
  
  return { min, max };
}
