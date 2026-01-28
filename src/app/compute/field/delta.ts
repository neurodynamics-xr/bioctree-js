/**
 * delta.ts
 * 
 * Delta function field creation using TSL.
 * Creates a scalar field that is 1.0 at a selected vertex and 0.0 everywhere else.
 * 
 * Used as initial condition for heat kernel, wave propagation, etc.
 */

import * as TSL from 'three/tsl';
import { getVertexCount, isValidVertexIndex } from '../../state/manifold';
import { Field, createComputeField, type FieldCreateOptions } from '../../field/Field';
import { registerField } from '../../state/field';
import type { GPUResourceManager } from '../../gpu/GPUResourceManager';

export interface DeltaFieldTSL {
  field: Field;
  setSourceVertex: (vertexIdx: number) => void;
  getSourceVertex: () => number;
  compute: any;
  resourceKey: string;
}

/**
 * Create a delta field TSL compute system
 * 
 * Delta field: δ_s(v) = 1 if v === s, else 0
 * 
 * @param gpu - GPU resource manager
 * @param massVStorage - Optional mass/area weighting storage
 * @param options - Field creation options (name, description, etc.)
 * @returns DeltaFieldTSL object with Field instance and compute node
 */
export function createDeltaFieldTSL(
  gpu: GPUResourceManager,
  massVStorage?: any,
  options?: Partial<FieldCreateOptions> & {
    setAsCurrent?: boolean;
    addToRegistry?: boolean;
  }
): DeltaFieldTSL {
  const {
    name = 'Delta Field',
    description = 'Delta function at selected vertex',
    domain = 'vertex',
    valueType = 'scalar',
    tags = [],
    setAsCurrent = true,
    addToRegistry = true,
    id,
    range,
    provenance
  } = options || {};

  const nV = getVertexCount();
  // Create buffer for delta field
  const resourceKey = `field:delta_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const data = new Float32Array(nV);
  
  const layout = {
    stride: 4,
    elementCount: nV,
    itemSize: 1,
    dtype: 'float32' as const
  };
  
  const bufferHandle = gpu.getOrCreateStorageBuffer(resourceKey, data, layout);
  const fieldStorage = TSL.storage(bufferHandle.attribute, 'float', nV);

  // Mass storage (if mass-weighted)
  let massVStorage = null;
  if (massVField) {
    // Get mass field backend
    if (massVField.backend.type === 'buffer') {
      const massBuffer = gpu.getBuffer(massVField.backend.resourceKey);
      if (!massBuffer) {
        throw new Error('Mass field buffer not found');
      }
      massVStorage = TSL.storage(massBuffer.attribute, 'float', nV);
    } else {
    }
  }

  // Source vertex uniform
  const sourceVertexUniform = TSL.uniform(0);

  // TSL compute function: Create delta field
  const computeDeltaFn = TSL.Fn(() => {
    const v = TSL.computeIndex;
    const source = TSL.uint(sourceVertexUniform);

    // Check if current vertex is the source
    const isDelta = v.equal(source);

    // Set delta value (optionally weighted by mass)
    if (massVStorage) {
      const mass = massVStorage.element(v);
      TSL.If(isDelta, () => {
        fieldStorage.element(v).assign(mass);
      }).Else(() => {
        fieldStorage.element(v).assign(TSL.float(0.0));
      });
    } else {
      TSL.If(isDelta, () => {
        fieldStorage.element(v).assign(TSL.float(1.0));
      }).Else(() => {
        fieldStorage.element(v).assign(TSL.float(0.0));
      });
    }
  }).setLayout({
    name: 'computeDelta',
    type: 'void',
    inputs: []
  });

  // Create Field object using compute backend
  const field = createComputeField(
    async (ctx) => {
      // Compute function runs delta compute
      // For now, return the resource key - compute is handled by compute node
      return resourceKey;
    },
    (ctx) => {
      // Build scalar node from buffer
      const buffer = ctx.gpu.getBuffer(resourceKey);
      if (!buffer) {
        throw new Error(`Delta field buffer not found: ${resourceKey}`);
      }
      const storage = TSL.storage(buffer.attribute, 'float', nV);
      return storage.element(ctx.vertexIndexNode || TSL.vertexIndex);
    },
    {
      id,
      name,
      description,
      domain,
      valueType,
      tags,
      range,
      provenance: provenance || {
        operation: 'delta',
        parameters: { massWeighted: !!massVStorage },
        description: 'Delta function field'
      }
    }
  );

  // Register field in state manager
  registerField(field, {
    setAsCurrent,
    addToRegistry
  });

  return {
    field,
    resourceKey,
    setSourceVertex: (vertexIdx: number) => {
      if (!isValidVertexIndex(vertexIdx)) {
        return;
      }
      sourceVertexUniform.value = vertexIdx;
      
      // Update provenance with selected vertex
      field.addProvenance({
        operation: 'delta_set_vertex',
        timestamp: Date.now(),
        parameters: { vertexIdx },
        description: `Set delta source to vertex ${vertexIdx}`
      });
      
    getSourceVertex: () => sourceVertexUniform.value,
    compute: computeDeltaFn().compute(nV)
  };
}
