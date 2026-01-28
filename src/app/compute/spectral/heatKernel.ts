/**
 * Heat Kernel Localization on Spectral Basis
 * 
 * Computes localized heat field at a selected vertex using spectral decomposition:
 * 1. Forward transform: Project delta function to eigenmode coefficients
 * 2. Apply heat filter: exp(-λ * τ) 
 * 3. Inverse transform: Reconstruct filtered field on vertices
 * 
 * Uses WebGPU compute shaders for efficient GPU computation.
 */

import type { BCTSpectralData } from '../../io/loaders/types';

export interface HeatKernelParams {
  selectedVertex: number;  // 0-based vertex index
  tau: number;            // Heat diffusion time parameter
  Kactive: number;        // Number of active eigenmodes (≤ K)
}

export interface HeatKernelResult {
  field: Float32Array;    // Heat field on vertices [nV]
  range: [number, number]; // [min, max] of field values
  params: HeatKernelParams;
}

/**
 * WebGPU Heat Kernel Compute Engine
 */
export class HeatKernelCompute {
  private device: GPUDevice | null = null;
  private initialized = false;

  // Compute pipelines
  private coeffPipeline: GPUComputePipeline | null = null;
  private reconstructPipeline: GPUComputePipeline | null = null;

  // GPU buffers (persistent)
  private lambdaBuffer: GPUBuffer | null = null;
  private psiKVBuffer: GPUBuffer | null = null;
  private massVBuffer: GPUBuffer | null = null;
  private coeffBuffer: GPUBuffer | null = null;
  private heatVertexBuffer: GPUBuffer | null = null;
  private paramsBuffer: GPUBuffer | null = null;
  private readbackBuffer: GPUBuffer | null = null;

  // Data dimensions
  private nV = 0;
  private K = 0;

  // Time-varying state
  private currentDiffT = 0.0;
  private currentSourceVertex = -1;
  private currentKactive = 0;

  constructor() {}

  /**
   * Initialize WebGPU and upload BCT data
   * @param bctData Spectral data from BCT package
   * @param sharedDevice Optional GPU device shared with Three.js WebGPU renderer
   */
  async initialize(bctData: BCTSpectralData, sharedDevice?: GPUDevice): Promise<void> {
    if (this.initialized) {
      return;
    }
    // Use shared device if provided, otherwise request new one
    if (sharedDevice) {
      this.device = sharedDevice;
    } else {
      // Request WebGPU adapter and device
      if (!navigator.gpu) {
        throw new Error('WebGPU not supported in this browser');
      }

      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        throw new Error('Failed to get WebGPU adapter');
      }

      this.device = await adapter.requestDevice();
    }
    
    this.nV = bctData.nV;
    this.K = bctData.K;
    // Create GPU buffers and upload data
    await this.createBuffers(bctData);

    // Create compute pipelines
    await this.createPipelines();

    this.initialized = true;
  }

  /**
   * Create and upload GPU buffers
   */
  private async createBuffers(bctData: BCTSpectralData): Promise<void> {
    if (!this.device) throw new Error('Device not initialized');

    const { lambda, psi, massV, nV, K } = bctData;

    // Lambda buffer (eigenvalues) - K floats
    this.lambdaBuffer = this.device.createBuffer({
      size: lambda.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: 'lambda'
    });
    this.device.queue.writeBuffer(this.lambdaBuffer, 0, lambda.buffer as ArrayBuffer, lambda.byteOffset, lambda.byteLength);

    // PsiKV buffer (eigenvectors, row-major K×nV) - K*nV floats
    this.psiKVBuffer = this.device.createBuffer({
      size: psi.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: 'psiKV'
    });
    this.device.queue.writeBuffer(this.psiKVBuffer, 0, psi.buffer as ArrayBuffer, psi.byteOffset, psi.byteLength);

    // MassV buffer (vertex masses) - nV floats
    this.massVBuffer = this.device.createBuffer({
      size: massV.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      label: 'massV'
    });
    this.device.queue.writeBuffer(this.massVBuffer, 0, massV.buffer as ArrayBuffer, massV.byteOffset, massV.byteLength);

    // Coefficients buffer (filtered eigenmode coefficients) - K floats
    this.coeffBuffer = this.device.createBuffer({
      size: K * 4, // 4 bytes per float32
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      label: 'coeff'
    });

    // Heat vertex buffer (output field) - nV floats
    this.heatVertexBuffer = this.device.createBuffer({
      size: nV * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      label: 'H_vertex'
    });

    // Parameters buffer (selectedVertex, tau, Kactive, K, nV)
    this.paramsBuffer = this.device.createBuffer({
      size: 5 * 4, // 5 uint32/float32
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'params'
    });

    // Readback buffer (for CPU access)
    this.readbackBuffer = this.device.createBuffer({
      size: nV * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
      label: 'readback'
    });
  }

  /**
   * Create compute pipelines
   */
  private async createPipelines(): Promise<void> {
    if (!this.device) throw new Error('Device not initialized');

    // Compute shader 1: Forward transform + heat filter
    const coeffShaderCode = `
      struct Params {
        selectedVertex: u32,
        tau: f32,
        Kactive: u32,
        K: u32,
        nV: u32,
      }

      @group(0) @binding(0) var<uniform> params: Params;
      @group(0) @binding(1) var<storage, read> lambda: array<f32>;
      @group(0) @binding(2) var<storage, read> psiKV: array<f32>;
      @group(0) @binding(3) var<storage, read> massV: array<f32>;
      @group(0) @binding(4) var<storage, read_write> coeff: array<f32>;

      @compute @workgroup_size(64)
      fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let k = global_id.x;
        if (k >= params.Kactive) {
          return;
        }

        let s = params.selectedVertex;
        let K = params.K;
        
        // Get mass at selected vertex
        let mass_s = massV[s];
        
        // Get eigenmode value at selected vertex: psi_k(s) = psiKV[k + K*s]
        let psi_s = psiKV[k + K * s];
        
        // Apply heat filter: coeff[k] = exp(-lambda[k] * tau) * psi_k(s) * mass_s
        coeff[k] = exp(-lambda[k] * params.tau) * psi_s * mass_s;
      }
    `;

    const coeffShaderModule = this.device.createShaderModule({
      code: coeffShaderCode,
      label: 'coeff_shader'
    });

    // Compute shader 2: Inverse transform (reconstruction)
    const reconstructShaderCode = `
      struct Params {
        selectedVertex: u32,
        tau: f32,
        Kactive: u32,
        K: u32,
        nV: u32,
      }

      @group(0) @binding(0) var<uniform> params: Params;
      @group(0) @binding(1) var<storage, read> psiKV: array<f32>;
      @group(0) @binding(2) var<storage, read> coeff: array<f32>;
      @group(0) @binding(3) var<storage, read_write> H_vertex: array<f32>;

      @compute @workgroup_size(64)
      fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        let v = global_id.x;
        if (v >= params.nV) {
          return;
        }

        let K = params.K;
        let Kactive = params.Kactive;
        
        // Sum: H(v) = sum_k coeff[k] * psi_k(v)
        var sum: f32 = 0.0;
        for (var k: u32 = 0u; k < Kactive; k = k + 1u) {
          // Get eigenmode value at vertex v: psi_k(v) = psiKV[k + K*v]
          let psi_v = psiKV[k + K * v];
          sum = sum + coeff[k] * psi_v;
        }
        
        H_vertex[v] = sum;
      }
    `;

    const reconstructShaderModule = this.device.createShaderModule({
      code: reconstructShaderCode,
      label: 'reconstruct_shader'
    });

    // Create bind group layouts
    const coeffBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
      label: 'coeff_bind_group_layout'
    });

    const reconstructBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
      label: 'reconstruct_bind_group_layout'
    });

    // Create pipeline layouts
    const coeffPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [coeffBindGroupLayout],
      label: 'coeff_pipeline_layout'
    });

    const reconstructPipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [reconstructBindGroupLayout],
      label: 'reconstruct_pipeline_layout'
    });

    // Create compute pipelines
    this.coeffPipeline = this.device.createComputePipeline({
      layout: coeffPipelineLayout,
      compute: {
        module: coeffShaderModule,
        entryPoint: 'main'
      },
      label: 'coeff_pipeline'
    });

    this.reconstructPipeline = this.device.createComputePipeline({
      layout: reconstructPipelineLayout,
      compute: {
        module: reconstructShaderModule,
        entryPoint: 'main'
      },
      label: 'reconstruct_pipeline'
    });
  }

  /**
   * Update coefficients for time-varying animation (no readback)
   * This is O(Kactive) and extremely cheap - can run at 30-60 Hz
   */
  async computeTimeStep(diffT: number, withReadback: boolean = false): Promise<Float32Array | null> {
    if (!this.initialized || !this.device) {
      throw new Error('HeatKernelCompute not initialized');
    }
    if (this.currentSourceVertex < 0) {
      throw new Error('Must call compute() first to set source vertex');
    }

    this.currentDiffT = diffT;

    // Update only tau in params buffer (offset 4 bytes)
    const tauData = new Float32Array([diffT]);
    this.device.queue.writeBuffer(this.paramsBuffer!, 4, tauData.buffer as ArrayBuffer);

    // Create command encoder
    const commandEncoder = this.device.createCommandEncoder({
      label: 'heat_kernel_timestep_encoder'
    });

    // Create bind group for coefficient pass
    const coeffBindGroup = this.device.createBindGroup({
      layout: this.coeffPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer! } },
        { binding: 1, resource: { buffer: this.lambdaBuffer! } },
        { binding: 2, resource: { buffer: this.psiKVBuffer! } },
        { binding: 3, resource: { buffer: this.massVBuffer! } },
        { binding: 4, resource: { buffer: this.coeffBuffer! } },
      ],
      label: 'coeff_bind_group'
    });

    // Compute Pass 1: Update coefficients with new diffT
    {
      const pass = commandEncoder.beginComputePass({ label: 'coeff_pass' });
      pass.setPipeline(this.coeffPipeline!);
      pass.setBindGroup(0, coeffBindGroup);
      
      const workgroups = Math.ceil(this.currentKactive / 64);
      pass.dispatchWorkgroups(workgroups);
      pass.end();
    }

    // Create bind group for reconstruction pass
    const reconstructBindGroup = this.device.createBindGroup({
      layout: this.reconstructPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer! } },
        { binding: 1, resource: { buffer: this.psiKVBuffer! } },
        { binding: 2, resource: { buffer: this.coeffBuffer! } },
        { binding: 3, resource: { buffer: this.heatVertexBuffer! } },
      ],
      label: 'reconstruct_bind_group'
    });

    // Compute Pass 2: Reconstruct field
    {
      const pass = commandEncoder.beginComputePass({ label: 'reconstruct_pass' });
      pass.setPipeline(this.reconstructPipeline!);
      pass.setBindGroup(0, reconstructBindGroup);
      
      const workgroups = Math.ceil(this.nV / 64);
      pass.dispatchWorkgroups(workgroups);
      pass.end();
    }

    // Optional readback for visualization
    if (withReadback) {
      commandEncoder.copyBufferToBuffer(
        this.heatVertexBuffer!,
        0,
        this.readbackBuffer!,
        0,
        this.nV * 4
      );
    }

    // Submit commands
    this.device.queue.submit([commandEncoder.finish()]);

    // Return data if readback requested
    if (withReadback) {
      await this.readbackBuffer!.mapAsync(GPUMapMode.READ);
      const resultArrayBuffer = this.readbackBuffer!.getMappedRange();
      const result = new Float32Array(resultArrayBuffer).slice(); // Copy data
      this.readbackBuffer!.unmap();
      return result;
    }

    return null;
  }

  /**
   * Compute heat kernel at selected vertex (static mode)
   */
  async compute(params: HeatKernelParams): Promise<HeatKernelResult> {
    if (!this.initialized || !this.device) {
      throw new Error('HeatKernelCompute not initialized');
    }

    const { selectedVertex, tau, Kactive } = params;

    // Track state for time-varying mode
    this.currentSourceVertex = selectedVertex;
    this.currentKactive = Kactive;
    this.currentDiffT = tau;

    // Validate parameters
    if (selectedVertex < 0 || selectedVertex >= this.nV) {
      throw new Error(`Invalid vertex index: ${selectedVertex} (must be 0 to ${this.nV - 1})`);
    }
    if (Kactive <= 0 || Kactive > this.K) {
      throw new Error(`Invalid Kactive: ${Kactive} (must be 1 to ${this.K})`);
    }
    // Update parameters buffer
    const paramsData = new Uint32Array([
      selectedVertex,
      0, // tau will be written as float
      Kactive,
      this.K,
      this.nV
    ]);
    const paramsFloat = new Float32Array(paramsData.buffer);
    paramsFloat[1] = tau; // Write tau as float at offset 1

    this.device.queue.writeBuffer(this.paramsBuffer!, 0, paramsData.buffer as ArrayBuffer);

    // Create bind groups
    const coeffBindGroup = this.device.createBindGroup({
      layout: this.coeffPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer! } },
        { binding: 1, resource: { buffer: this.lambdaBuffer! } },
        { binding: 2, resource: { buffer: this.psiKVBuffer! } },
        { binding: 3, resource: { buffer: this.massVBuffer! } },
        { binding: 4, resource: { buffer: this.coeffBuffer! } },
      ],
      label: 'coeff_bind_group'
    });

    const reconstructBindGroup = this.device.createBindGroup({
      layout: this.reconstructPipeline!.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.paramsBuffer! } },
        { binding: 1, resource: { buffer: this.psiKVBuffer! } },
        { binding: 2, resource: { buffer: this.coeffBuffer! } },
        { binding: 3, resource: { buffer: this.heatVertexBuffer! } },
      ],
      label: 'reconstruct_bind_group'
    });

    // Create command encoder
    const commandEncoder = this.device.createCommandEncoder({
      label: 'heat_kernel_encoder'
    });

    // Compute Pass 1: Forward transform + filter
    {
      const pass = commandEncoder.beginComputePass({ label: 'coeff_pass' });
      pass.setPipeline(this.coeffPipeline!);
      pass.setBindGroup(0, coeffBindGroup);
      
      const workgroups = Math.ceil(Kactive / 64);
      pass.dispatchWorkgroups(workgroups);
      pass.end();
    }

    // Compute Pass 2: Inverse transform (reconstruction)
    {
      const pass = commandEncoder.beginComputePass({ label: 'reconstruct_pass' });
      pass.setPipeline(this.reconstructPipeline!);
      pass.setBindGroup(0, reconstructBindGroup);
      
      const workgroups = Math.ceil(this.nV / 64);
      pass.dispatchWorkgroups(workgroups);
      pass.end();
    }

    // Copy result to readback buffer
    commandEncoder.copyBufferToBuffer(
      this.heatVertexBuffer!,
      0,
      this.readbackBuffer!,
      0,
      this.nV * 4
    );

    // Submit commands
    this.device.queue.submit([commandEncoder.finish()]);

    // Read back results
    await this.readbackBuffer!.mapAsync(GPUMapMode.READ);
    const resultArrayBuffer = this.readbackBuffer!.getMappedRange();
    const result = new Float32Array(resultArrayBuffer).slice(); // Copy data
    this.readbackBuffer!.unmap();

    // Compute range
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < result.length; i++) {
      if (result[i] < min) min = result[i];
      if (result[i] > max) max = result[i];
    }
    return {
      field: result,
      range: [min, max],
      params
    };
  }

  /**
   * Get current diffusion time (for time-varying mode)
   */
  getCurrentDiffT(): number {
    return this.currentDiffT;
  }

  /**
   * Get current source vertex
   */
  getCurrentSourceVertex(): number {
    return this.currentSourceVertex;
  }

  /**
   * Get current Kactive
   */
  getCurrentKactive(): number {
    return this.currentKactive;
  }

  /**
   * Dispose GPU resources
   */
  dispose(): void {
    this.lambdaBuffer?.destroy();
    this.psiKVBuffer?.destroy();
    this.massVBuffer?.destroy();
    this.coeffBuffer?.destroy();
    this.heatVertexBuffer?.destroy();
    this.paramsBuffer?.destroy();
    this.readbackBuffer?.destroy();

    this.device = null;
    this.initialized = false;
  }
}
