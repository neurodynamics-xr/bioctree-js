/**
 * Field.ts
 * 
 * Core field abstraction: metadata + provider pattern.
 * Fields describe "what" (domain, type, provenance) but don't own GPU resources.
 * GPU resources are managed by GPUResourceManager.
 * 
 * Supports multiple backend types:
 * - Procedural: computed from position/time in shader
 * - Buffer: stored in GPU buffer/attribute
 * - Spectral: reconstructed from spectral coefficients
 * - Compute: output from compute pipeline
 */

import { getVertexCount, getFaceCount, isManifoldLoaded } from '../state/manifold';
import type { GPUResourceManager } from '../gpu/GPUResourceManager';

// Field domain types
export type FieldDomain = 'vertex' | 'edge' | 'face';
export type FieldValueType = 'scalar' | 'vector';

/**
 * Field provenance - tracks how the field was created
 */
export interface FieldProvenance {
  operation: string; // e.g., 'delta', 'heat_kernel', 'gradient', 'user_input', 'procedural'
  timestamp: number;
  parameters?: Record<string, any>;
  sourceFieldIds?: string[]; // Fields this was derived from
  description?: string;
}

/**
 * Field metadata
 */
export interface FieldMetadata {
  id: string;
  name: string;
  domain: FieldDomain;
  valueType: FieldValueType;
  count: number; // nV, nE, or nF depending on domain
  componentsPerValue: number; // 1 for scalar, 3 for vector
  createdAt: number;
  description?: string;
  tags?: string[];
  range?: [number, number]; // [min, max] for scalar fields
}

/**
 * Context needed to bind a field (build TSL nodes)
 */
export interface FieldBindContext {
  gpu: GPUResourceManager;
  positionNode?: any; // TSL position node (for procedural fields)
  timeNode?: any; // TSL time uniform (for time-varying fields)
  vertexIndexNode?: any; // TSL vertex index attribute
}

/**
 * Result of binding a field - ready for visualization
 */
export interface FieldBinding {
  scalarNode: any; // TSL node outputting scalar (or vec3 for vector fields)
  range?: [number, number]; // Optional range hint for colormap
  dispose?: () => void; // Optional cleanup for transient resources
}

/**
 * Field backend types
 */
export type FieldBackend =
  | ProceduralBackend
  | BufferBackend
  | SpectralBackend
  | ComputeBackend;

/**
 * Procedural field: computed from (position, time, params) in shader
 */
export interface ProceduralBackend {
  kind: 'procedural';
  buildScalarNode: (ctx: FieldBindContext) => any; // Returns TSL scalar node
  parameters?: Record<string, any>; // Noise params, etc.
}

/**
 * Buffer field: scalar stored in GPU buffer/attribute
 */
export interface BufferBackend {
  kind: 'buffer';
  resourceKey: string; // Key in GPUResourceManager (e.g., 'field:heat_0')
  buildScalarNode: (ctx: FieldBindContext) => any; // Returns TSL storage.element(vertexIndex)
}

/**
 * Spectral field: reconstructed from coefficients + eigenvectors
 */
export interface SpectralBackend {
  kind: 'spectral';
  coefficientsKey: string; // Key for coefficient buffer
  eigenvectorsKey: string; // Key for eigenvector texture/buffer
  modeCount: number; // K modes
  buildScalarNode: (ctx: FieldBindContext) => any; // Spectral reconstruction
}

/**
 * Compute field: output from compute pipeline
 */
export interface ComputeBackend {
  kind: 'compute';
  computeFn: (ctx: FieldBindContext) => Promise<string>; // Returns output buffer key
  buildScalarNode: (ctx: FieldBindContext) => any; // Reads from compute output
  isTransient?: boolean; // If true, dispose buffer after use
}

/**
 * Field class - metadata + backend provider
 * Does NOT own GPU resources (managed by GPUResourceManager)
 */
export class Field {
  readonly metadata: FieldMetadata;
  readonly backend: FieldBackend;
  readonly provenance: FieldProvenance[];

  constructor(
    metadata: FieldMetadata,
    backend: FieldBackend,
    provenance?: FieldProvenance
  ) {
    this.metadata = metadata;
    this.backend = backend;
    this.provenance = provenance ? [provenance] : [];
  }

  /**
   * Bind field - produces TSL scalar node for visualization
   * @param ctx - Context with GPU manager and TSL nodes
   * @returns Scalar node and optional range/dispose
   */
  bind(ctx: FieldBindContext): FieldBinding {
    const scalarNode = this.backend.buildScalarNode(ctx);
    
    return {
      scalarNode,
      range: this.metadata.range,
      dispose: undefined // Can be set by backend for transient resources
    };
  }

  /**
   * Add provenance entry
   */
  addProvenance(provenance: FieldProvenance): void {
    this.provenance.push(provenance);
  }

  /**
   * Get the latest provenance entry
   */
  getLatestProvenance(): FieldProvenance | null {
    return this.provenance.length > 0 ? this.provenance[this.provenance.length - 1] : null;
  }

  /**
   * Get full provenance chain
   */
  getProvenanceChain(): FieldProvenance[] {
    return [...this.provenance];
  }

  /**
   * Clone field metadata (not backend)
   */
  cloneMetadata(): FieldMetadata {
    return {
      ...this.metadata,
      id: generateFieldId(), // New ID for clone
      createdAt: Date.now()
    };
  }

  /**
   * Dispose field (delegates to backend if needed)
   */
  dispose(): void {
    // Backend-specific disposal handled by GPUResourceManager
    // Field itself doesn't own GPU resources
  }
}

/**
 * Field creation options
 */
export interface FieldCreateOptions {
  id?: string;
  name: string;
  description?: string;
  domain?: FieldDomain;
  valueType?: FieldValueType;
  tags?: string[];
  provenance?: Omit<FieldProvenance, 'timestamp'>;
  range?: [number, number]; // [min, max] for scalar fields
  backend: FieldBackend; // Required: how to produce the scalar
}

/**
 * Generate a unique field ID
 */
export function generateFieldId(): string {
  return `field_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validate field count matches manifold domain
 */
export function validateFieldCount(domain: FieldDomain, actualCount: number): boolean {
  if (!isManifoldLoaded()) {
    return false;
  }

  const expectedCount = getExpectedCount(domain);

  if (actualCount !== expectedCount) {
    return false;
  }

  return true;
}

/**
 * Get expected count for domain
 */
export function getExpectedCount(domain: FieldDomain): number {
  if (!isManifoldLoaded()) {
    throw new Error('No manifold loaded');
  }

  switch (domain) {
    case 'vertex':
      return getVertexCount();
    case 'face':
      return getFaceCount();
    case 'edge':
      throw new Error('Edge domain not yet supported');
    default:
      throw new Error(`Unknown domain: ${domain}`);
  }
}

/**
 * Create a field object
 * 
 * This is the main factory function for creating Field instances.
 * Fields now use a backend provider pattern and don't own GPU resources.
 * 
 * @param options - Field creation options (including backend)
 * @returns Field instance
 */
export function createFieldObject(options: FieldCreateOptions): Field {
  const {
    id = generateFieldId(),
    name,
    description,
    domain = 'vertex',
    valueType = 'scalar',
    tags = [],
    provenance,
    range,
    backend
  } = options;

  // Determine count and components
  const count = getExpectedCount(domain);
  const componentsPerValue = valueType === 'scalar' ? 1 : 3;

  // Create metadata
  const metadata: FieldMetadata = {
    id,
    name,
    domain,
    valueType,
    count,
    componentsPerValue,
    createdAt: Date.now(),
    description,
    tags,
    range
  };

  // Create provenance if provided
  const fullProvenance: FieldProvenance | undefined = provenance ? {
    ...provenance,
    timestamp: Date.now()
  } : undefined;

  return new Field(metadata, backend, fullProvenance);
}

/**
 * Helper to extract field info for display
 */
export function getFieldInfo(field: Field): string {
  const { name, domain, valueType, count } = field.metadata;
  const prov = field.getLatestProvenance();
  const operation = prov ? `from ${prov.operation}` : '';
  const backendType = field.backend.kind;
  return `${name} (${valueType} on ${count} ${domain}s) [${backendType}] ${operation}`;
}

/**
 * ================================================================================
 * Helper Functions for Common Backend Types
 * ================================================================================
 */

/**
 * Create a buffer-backed field
 * Stores scalar data in GPUResourceManager, references by key
 */
export function createBufferField(
  resourceKey: string,
  options: Omit<FieldCreateOptions, 'backend'>
): Field {
  const backend: BufferBackend = {
    kind: 'buffer',
    resourceKey,
    buildScalarNode: (ctx: FieldBindContext) => {
      // Get buffer from GPU resource manager
      const buffer = ctx.gpu.getBuffer(resourceKey);
      if (!buffer) {
        throw new Error(`Buffer not found: ${resourceKey}`);
      }
      
      // Create storage node and sample at vertex index
      const { storage } = TSL;
      const storageNode = storage(buffer.attribute, 'float', buffer.count);
      return storageNode.element(ctx.vertexIndexNode || TSL.vertexIndex);
    }
  };

  return createFieldObject({
    ...options,
    backend
  });
}

/**
 * Create a procedural field
 * Computed from position/time in shader
 */
export function createProceduralField(
  buildScalarNode: (ctx: FieldBindContext) => any,
  options: Omit<FieldCreateOptions, 'backend'> & {
    parameters?: Record<string, any>;
  }
): Field {
  const { parameters, ...fieldOptions } = options;
  
  const backend: ProceduralBackend = {
    kind: 'procedural',
    buildScalarNode,
    parameters
  };

  return createFieldObject({
    ...fieldOptions,
    backend
  });
}

/**
 * Create a spectral field
 * Reconstructed from coefficients + eigenvectors
 */
export function createSpectralField(
  coefficientsKey: string,
  eigenvectorsKey: string,
  modeCount: number,
  buildScalarNode: (ctx: FieldBindContext) => any,
  options: Omit<FieldCreateOptions, 'backend'>
): Field {
  const backend: SpectralBackend = {
    kind: 'spectral',
    coefficientsKey,
    eigenvectorsKey,
    modeCount,
    buildScalarNode
  };

  return createFieldObject({
    ...options,
    backend
  });
}

/**
 * Create a compute field
 * Output from compute pipeline
 */
export function createComputeField(
  computeFn: (ctx: FieldBindContext) => Promise<string>,
  buildScalarNode: (ctx: FieldBindContext) => any,
  options: Omit<FieldCreateOptions, 'backend'> & {
    isTransient?: boolean;
  }
): Field {
  const { isTransient, ...fieldOptions } = options;
  
  const backend: ComputeBackend = {
    kind: 'compute',
    computeFn,
    buildScalarNode,
    isTransient
  };

  return createFieldObject({
    ...fieldOptions,
    backend
  });
}

// Import TSL for helper functions
import * as TSL from 'three/tsl';
