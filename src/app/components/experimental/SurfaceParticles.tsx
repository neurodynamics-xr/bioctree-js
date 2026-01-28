/**
 * SurfaceParticles - WebGPU particle visualization constrained to surface mesh
 * 
 * Port of experimental/surfaceAttractorParticles.html into React component.
 * Uses Three.js WebGPU renderer with TSL compute shaders for particle physics.
 */

import { useEffect, useRef, useState } from 'react';
import { createSurfaceParticleShaders } from './surfaceParticlesShaders';

interface SurfaceParticlesProps {
  dataPath?: string;
  particleCount?: number;
}

export function SurfaceParticles({ 
  dataPath = '/data/particle_vis',
  particleCount = Math.pow(2, 18) // 262k particles
}: SurfaceParticlesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<string>('Initializing...');
  const [error, setError] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    let isMounted = true;

    const initViewer = async () => {
      try {
        setStatus('Loading Three.js WebGPU...');
        
        // Dynamic import of Three.js modules
        const THREE = await import('three/webgpu');
        const { 
          Fn, If, Loop, float, uint, vec2, vec3, vec4,
          PI, color, cos, sin, mix, instanceIndex, instancedArray,
          uniform, uniformArray, hash, storage
        } = await import('three/tsl');
        const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
        const { TransformControls } = await import('three/addons/controls/TransformControls.js');

        if (!isMounted) return;

        setStatus('Initializing WebGPU renderer...');

        // Renderer setup
        const renderer = new THREE.WebGPURenderer({ 
          canvas: canvasRef.current!,
          antialias: true 
        });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(containerRef.current!.clientWidth, containerRef.current!.clientHeight);
        renderer.setClearColor('#000000');
        await renderer.init();

        if (!isMounted) return;

        // Scene and camera
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(
          25,
          containerRef.current!.clientWidth / containerRef.current!.clientHeight,
          0.01,
          500
        );
        camera.position.set(3, 4, 8);

        // Lighting
        scene.add(new THREE.AmbientLight('#ffffff', 0.35));
        const dirLight = new THREE.DirectionalLight('#ffffff', 1.5);
        dirLight.position.set(4, 3, 2);
        scene.add(dirLight);

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.minDistance = 0.05;
        controls.maxDistance = 200;

        setStatus('Loading mesh data...');

        // Load mesh data
        const exportData = await loadExportForThreeJS(dataPath);
        const { nV, nF } = exportData.counts;

        if (!isMounted) return;

        setStatus(`Building surface mesh (${nV} vertices, ${nF} faces)...`);

        // Create surface mesh
        const surfaceMesh = buildSurfaceMesh(exportData, THREE);
        scene.add(surfaceMesh);

        // Fit camera
        fitCameraToObject(camera, surfaceMesh, controls, THREE);

        setStatus('Creating GPU storage buffers...');

        // Create storage nodes
        const storageNodes = createStorageNodes(exportData, THREE, storage);

        setStatus(`Spawning ${particleCount.toLocaleString()} particles...`);

        // Create attractors
        const attractors = createAttractors(scene, camera, renderer, controls, THREE, uniformArray, uniform, TransformControls);

        // Create particle system
        const { updateCompute, reset } = createSurfaceParticlesSystem(
          attractors,
          storageNodes,
          nF,
          particleCount,
          scene,
          renderer,
          THREE,
          Fn, If, Loop, float, uint, vec2, vec3, vec4,
          PI, color, cos, sin, mix, instanceIndex, instancedArray,
          uniform, hash, storage
        );

        reset();

        if (!isMounted) return;

        setStatus('Running...');
        setError(null);

        // Animation loop
        let animationId: number;
        const animate = () => {
          if (!isMounted) return;
          
          controls.update();
          renderer.compute(updateCompute);
          renderer.render(scene, camera);
          animationId = requestAnimationFrame(animate);
        };
        animate();

        // Handle resize
        const handleResize = () => {
          if (!containerRef.current) return;
          const width = containerRef.current.clientWidth;
          const height = containerRef.current.clientHeight;
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
        };
        window.addEventListener('resize', handleResize);

        // Cleanup function
        cleanupRef.current = () => {
          cancelAnimationFrame(animationId);
          window.removeEventListener('resize', handleResize);
          renderer.dispose();
          scene.clear();
        };

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setStatus('Error');
      }
    };

    initViewer();

    return () => {
      isMounted = false;
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, [dataPath, particleCount]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />
      
      {/* Status overlay */}
      <div className="absolute left-3 top-3 bg-black/40 backdrop-blur-sm text-white text-xs px-3 py-2 rounded-lg max-w-md">
        <div className="font-semibold">Surface Attractor Particles</div>
        <div className="mt-1 text-white/80">
          {error ? (
            <span className="text-red-400">Error: {error}</span>
          ) : (
            <span>Status: {status}</span>
          )}
        </div>
        <div className="mt-1 text-white/70 text-[11px]">
          WebGPU + TSL compute • Particles constrained to surface via (faceId, barycentric)
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Helper functions (ported from HTML)
// ============================================================

async function loadExportForThreeJS(basePath: string) {
  const jsonRes = await fetch(basePath + '.json');
  const json = await jsonRes.json();
  
  const binRes = await fetch(basePath + '.bin');
  const bin = await binRes.arrayBuffer();

  const nV = json.nV;
  const nF = json.nF;

  const dtypeToCtor = (dtype: string) => {
    switch (dtype) {
      case 'float32': return Float32Array;
      case 'uint32': return Uint32Array;
      case 'int32': return Int32Array;
      case 'uint8': return Uint8Array;
      default: throw new Error(`Unsupported dtype: ${dtype}`);
    }
  };

  const buffers: Record<string, any> = {};
  for (const entry of json.buffers) {
    const Ctor = dtypeToCtor(entry.dtype);
    buffers[entry.name] = new Ctor(bin, entry.byteOffset, entry.count);
  }

  // Handle faceNeighbors as u32
  if (buffers.faceNeighbors instanceof Int32Array) {
    buffers.faceNeighborsU32 = new Uint32Array(
      buffers.faceNeighbors.buffer,
      buffers.faceNeighbors.byteOffset,
      buffers.faceNeighbors.length
    );
  } else {
    buffers.faceNeighborsU32 = buffers.faceNeighbors;
  }

  return { counts: { nV, nF }, buffers, raw: { json, bin } };
}

function buildSurfaceMesh(exportData: any, THREE: any) {
  const { buffers } = exportData;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(buffers.V, 3));
  geom.setIndex(new THREE.BufferAttribute(buffers.F, 1));
  geom.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide
  });

  return new THREE.Mesh(geom, mat);
}

function fitCameraToObject(camera: any, object: any, orbitControls: any, THREE: any) {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxSize = Math.max(size.x, size.y, size.z);
  const fitHeightDistance = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)));
  const fitWidthDistance = fitHeightDistance / camera.aspect;
  const distance = 1.25 * Math.max(fitHeightDistance, fitWidthDistance);

  camera.position.copy(center).add(new THREE.Vector3(0, 0, distance));
  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();

  orbitControls.target.copy(center);
  orbitControls.update();
}

function createStorageNodes(exportData: any, THREE: any, storage: any) {
  const { nV, nF } = exportData.counts;
  const b = exportData.buffers;

  const VAttr = new THREE.StorageBufferAttribute(b.V, 3);
  const FAttr = new THREE.StorageBufferAttribute(b.F, 3);
  const t1Attr = new THREE.StorageBufferAttribute(b.t1, 3);
  const t2Attr = new THREE.StorageBufferAttribute(b.t2, 3);
  const nFAttr = new THREE.StorageBufferAttribute(b.faceNormals, 3);
  const neighborsAttr = new THREE.StorageBufferAttribute(b.faceNeighborsU32, 3);
  const transportAttr = new THREE.StorageBufferAttribute(b.transport2x2, 4);
  const areasAttr = b.faceAreas ? new THREE.StorageBufferAttribute(b.faceAreas, 1) : null;
  const centroidsAttr = b.centroids ? new THREE.StorageBufferAttribute(b.centroids, 3) : null;

  const VStorage = storage(VAttr, 'vec3', nV).toVar('VStorage');
  const FStorage = storage(FAttr, 'uvec3', nF).toVar('FStorage');
  const t1Storage = storage(t1Attr, 'vec3', nF).toVar('t1Storage');
  const t2Storage = storage(t2Attr, 'vec3', nF).toVar('t2Storage');
  const nFStorage = storage(nFAttr, 'vec3', nF).toVar('nFStorage');
  const neighborsStorage = storage(neighborsAttr, 'uvec3', nF).toVar('neighborsStorage');
  const transportStorage = storage(transportAttr, 'vec4', nF * 3).toVar('transportStorage');
  const faceAreasStorage = areasAttr ? storage(areasAttr, 'float', nF).toVar('faceAreasStorage') : null;
  const centroidsStorage = centroidsAttr ? storage(centroidsAttr, 'vec3', nF).toVar('centroidsStorage') : null;

  return { 
    VStorage, FStorage, t1Storage, t2Storage, nFStorage, 
    neighborsStorage, transportStorage, faceAreasStorage, centroidsStorage 
  };
}

function createAttractors(scene: any, camera: any, renderer: any, controls: any, THREE: any, uniformArray: any, uniform: any, TransformControls: any) {
  const attractorsPositions = uniformArray([
    new THREE.Vector3(-1.0, 0.0, 0.0),
    new THREE.Vector3(1.0, 0.0, -0.6),
    new THREE.Vector3(0.0, 0.8, 1.0)
  ]);

  const attractorsRotationAxes = uniformArray([
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(1, 0, -0.5).normalize()
  ]);

  const attractorsLength = uniform(attractorsPositions.array.length, 'uint');

  const attractors = [];
  const helpersRingGeometry = new THREE.RingGeometry(1, 1.02, 32, 1, 0, Math.PI * 1.5);
  const helpersArrowGeometry = new THREE.ConeGeometry(0.1, 0.4, 12, 1, false);
  const helpersMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: 0xaaaaaa });

  for (let i = 0; i < attractorsPositions.array.length; i++) {
    const attractor: any = {};
    attractor.position = attractorsPositions.array[i];
    attractor.orientation = attractorsRotationAxes.array[i];

    attractor.reference = new THREE.Object3D();
    attractor.reference.position.copy(attractor.position);
    attractor.reference.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), attractor.orientation);
    scene.add(attractor.reference);

    attractor.helper = new THREE.Group();
    attractor.helper.scale.setScalar(0.325);
    attractor.reference.add(attractor.helper);

    attractor.ring = new THREE.Mesh(helpersRingGeometry, helpersMaterial);
    attractor.ring.rotation.x = -Math.PI * 0.5;
    attractor.helper.add(attractor.ring);

    attractor.arrow = new THREE.Mesh(helpersArrowGeometry, helpersMaterial);
    attractor.arrow.position.x = 1;
    attractor.arrow.position.z = 0.2;
    attractor.arrow.rotation.x = Math.PI * 0.5;
    attractor.helper.add(attractor.arrow);

    attractor.controls = new TransformControls(camera, renderer.domElement);
    attractor.controls.mode = 'translate';
    attractor.controls.size = 0.5;
    attractor.controls.attach(attractor.reference);
    attractor.controls.visible = true;
    attractor.controls.enabled = true;
    scene.add(attractor.controls.getHelper());

    attractor.controls.addEventListener('dragging-changed', (event: any) => {
      controls.enabled = !event.value;
    });

    attractor.controls.addEventListener('change', () => {
      attractor.position.copy(attractor.reference.position);
      attractor.orientation.copy(
        new THREE.Vector3(0, 1, 0).applyQuaternion(attractor.reference.quaternion)
      );
    });

    attractors.push(attractor);
  }

  return { attractors, attractorsPositions, attractorsRotationAxes, attractorsLength };
}

// NOTE: Full implementation using TSL compute shaders
function createSurfaceParticlesSystem(
  attractorState: any,
  storageNodes: any,
  nF: number,
  particleCount: number,
  scene: any,
  renderer: any,
  THREE: any,
  Fn: any, If: any, Loop: any, float: any, uint: any, vec2: any, vec3: any, vec4: any,
  PI: any, color: any, cos: any, sin: any, mix: any, instanceIndex: any, instancedArray: any,
  uniform: any, hash: any, _storage: any
) {
  // Assemble TSL module
  const TSL = {
    Fn, If, Loop, float, uint, vec2, vec3, vec4,
    PI, color, cos, sin, mix, instanceIndex, instancedArray,
    uniform, hash
  };

  // Create shader programs
  const { initCompute, updateCompute, material, uniforms } = createSurfaceParticleShaders(
    TSL,
    THREE,
    storageNodes,
    attractorState,
    nF,
    particleCount
  );

  const reset = () => renderer.compute(initCompute);

  // Create particle mesh
  const geom = new THREE.PlaneGeometry(1, 1);
  const particles = new THREE.InstancedMesh(geom, material, particleCount);
  particles.frustumCulled = false;
  particles.name = 'SurfaceParticles';
  scene.add(particles);

  return { updateCompute, reset, uniforms };
}
