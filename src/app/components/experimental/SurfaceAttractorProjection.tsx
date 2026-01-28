/**
 * SurfaceAttractorProjection - Simplified WebGPU particle visualization
 * 
 * Two fixed attractors on mesh surface (specific faces).
 * Particles spawn on Face A and are attracted to Face B, with repulsion from A.
 * Uses simpler projection-based velocity transport (no parallel transport matrices).
 */

import { useEffect, useRef, useState } from 'react';

interface SurfaceAttractorProjectionProps {
  dataPath?: string;
  particleCount?: number;
  faceA?: number;
  faceB?: number;
}

export function SurfaceAttractorProjection({ 
  dataPath = '/data/particle_vis',
  particleCount = Math.pow(2, 17), // 131k particles (less than full version)
  faceA = 0,
  faceB = 2000
}: SurfaceAttractorProjectionProps) {
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
          instancedArray, instanceIndex, uniform, color,
          hash, mix, storage
        } = await import('three/tsl');
        const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
        const { Inspector } = await import('three/addons/inspector/Inspector.js');

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
        renderer.inspector = new Inspector();
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
        camera.position.set(3, 5, 8);

        // Lighting (camera-locked rig for consistent illumination)
        const lightRig = new THREE.Group();
        camera.add(lightRig);
        scene.add(camera); // Add camera to scene so lights work

        // Base ambient light: keep low to preserve contrast
        const ambient = new THREE.AmbientLight(0xffffff, 0.2);
        lightRig.add(ambient);

        // Key light (front-right in view space)
        const key = new THREE.DirectionalLight(0xffffff, 1.45);
        key.position.set(1.0, 0.8, 1.2);
        lightRig.add(key);
        key.target.position.set(0, 0, 0);
        lightRig.add(key.target);

        // Fill light (front-left in view space)
        const fill = new THREE.DirectionalLight(0xffffff, 0.95);
        fill.position.set(-1.0, 0.4, 1.0);
        lightRig.add(fill);
        fill.target.position.set(0, 0, 0);
        lightRig.add(fill.target);

        // Rim light (back in view space) - subtle edge definition
        const rim = new THREE.DirectionalLight(0xffffff, 0.45);
        rim.position.set(0, 0.2, -1.0);
        lightRig.add(rim);
        rim.target.position.set(0, 0, 0);
        lightRig.add(rim.target);

        // Controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.minDistance = 0.05;
        controls.maxDistance = 200;

        setStatus('Loading mesh data...');

        // Load mesh data
        const exportData = await loadExportForThreeJS(dataPath);
        const { nF } = exportData.counts;

        if (!isMounted) return;

        // Clamp face indices
        const clampedFaceA = Math.max(0, Math.min(faceA, nF - 1));
        const clampedFaceB = Math.max(0, Math.min(faceB, nF - 1));

        setStatus(`Building surface mesh (${nF} faces)...`);

        // Create surface mesh
        const surfaceMesh = buildSurfaceMesh(exportData, THREE);
        scene.add(surfaceMesh);

        // Fit camera
        fitCameraToObject(camera, surfaceMesh, controls, THREE);

        setStatus('Creating GPU storage buffers...');

        // Create storage nodes
        const gpu = createStorageNodes(exportData, THREE, storage);

        setStatus('Selecting attractor points...');

        // Get attractor points on surface
        const attractorA = getFacePoint(exportData, clampedFaceA, THREE);
        const attractorB = getFacePoint(exportData, clampedFaceB, THREE);

        setStatus(`Spawning ${particleCount.toLocaleString()} particles...`);

        // Create particle system
        const updateCompute = createSurfaceParticles({
          gpu,
          nF,
          faceA: clampedFaceA,
          faceB: clampedFaceB,
          attractorA,
          attractorB,
          particleCount,
          scene,
          renderer,
          THREE,
          Fn, If, Loop, float, uint, vec2, vec3, vec4,
          instancedArray, instanceIndex, uniform, color, hash, mix
        });

        if (!isMounted) return;

        setStatus(`Running (Face ${clampedFaceA} → Face ${clampedFaceB})...`);
        setError(null);

        // Add GUI controls
        const gui = renderer.inspector.createParameters('Mesh Visibility');
        gui.add({ meshVisible: surfaceMesh.visible }, 'meshVisible').onChange((value: boolean) => {
          surfaceMesh.visible = value;
        });
        gui.add({ meshMode: 'solid' }, 'meshMode', ['solid', 'wireframe', 'hidden']).onChange((value: string) => {
          if (value === 'hidden') {
            surfaceMesh.visible = false;
          } else {
            surfaceMesh.visible = true;
            surfaceMesh.material.wireframe = value === 'wireframe';
          }
        });

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
  }, [dataPath, particleCount, faceA, faceB]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />
      
      {/* Status overlay */}
      <div className="absolute left-3 top-3 bg-black/40 backdrop-blur-sm text-white text-xs px-3 py-2 rounded-lg max-w-md">
        <div className="font-semibold">Surface Attractor Particles (Projection)</div>
        <div className="mt-1 text-white/80">
          {error ? (
            <span className="text-red-400">Error: {error}</span>
          ) : (
            <span>Status: {status}</span>
          )}
        </div>
        <div className="mt-1 text-white/70 text-[11px]">
          WebGPU + TSL compute • Fixed attractors • Simplified projection-based transport
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Helper functions
// ============================================================

async function loadExportForThreeJS(basePath: string) {
  const jsonRes = await fetch(basePath + '.json');
  const json = await jsonRes.json();
  
  const binRes = await fetch(basePath + '.bin');
  const bin = await binRes.arrayBuffer();

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

  // Minimal requirements
  const required = ['V', 'F', 'faceNormals', 'faceNeighborsU32'];
  for (const k of required) {
    if (!buffers[k]) throw new Error(`Missing required buffer: ${k}`);
  }

  return { 
    counts: { nV: json.nV, nF: json.nF }, 
    buffers 
  };
}

function buildSurfaceMesh(exportData: any, THREE: any) {
  const { buffers } = exportData;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(buffers.V, 3));
  geom.setIndex(new THREE.BufferAttribute(buffers.F, 1));
  geom.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.7,
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
  const nFAttr = new THREE.StorageBufferAttribute(b.faceNormals, 3);
  const nbAttr = new THREE.StorageBufferAttribute(b.faceNeighborsU32, 3);

  const VStorage = storage(VAttr, 'vec3', nV).toVar('VStorage');
  const FStorage = storage(FAttr, 'uvec3', nF).toVar('FStorage');
  const nFStorage = storage(nFAttr, 'vec3', nF).toVar('nFStorage');
  const neighborsStorage = storage(nbAttr, 'uvec3', nF).toVar('neighborsStorage');

  return { VStorage, FStorage, nFStorage, neighborsStorage };
}

function getFacePoint(exportData: any, faceId: number, THREE: any) {
  const { buffers } = exportData;
  
  // Prefer centroids if exported
  if (buffers.centroids) {
    const i = faceId * 3;
    return new THREE.Vector3(
      buffers.centroids[i], 
      buffers.centroids[i + 1], 
      buffers.centroids[i + 2]
    );
  }

  // Fallback: compute centroid from V/F on CPU
  const idx0 = buffers.F[faceId * 3 + 0];
  const idx1 = buffers.F[faceId * 3 + 1];
  const idx2 = buffers.F[faceId * 3 + 2];

  const a = new THREE.Vector3(
    buffers.V[idx0 * 3 + 0],
    buffers.V[idx0 * 3 + 1],
    buffers.V[idx0 * 3 + 2]
  );
  const b = new THREE.Vector3(
    buffers.V[idx1 * 3 + 0],
    buffers.V[idx1 * 3 + 1],
    buffers.V[idx1 * 3 + 2]
  );
  const c = new THREE.Vector3(
    buffers.V[idx2 * 3 + 0],
    buffers.V[idx2 * 3 + 1],
    buffers.V[idx2 * 3 + 2]
  );

  return a.add(b).add(c).multiplyScalar(1 / 3);
}

function createSurfaceParticles(params: any) {
  const { 
    gpu, faceA, faceB, attractorA, attractorB, particleCount,
    scene, renderer, THREE,
    Fn, If, Loop, float, uint, vec2, vec3, vec4,
    instancedArray, instanceIndex, uniform, color, hash, mix
  } = params;

  const { VStorage, FStorage, nFStorage, neighborsStorage } = gpu;

  // Constants
  const FIXED_DT = 1 / 60;
  const MAX_EDGE_HOPS = 3;
  const ATTRACT_GAIN = 2.0;
  const REPEL_GAIN = 0.5;
  const MAX_SPEED = 6.0;
  const DAMPING = 0.10;
  const PARTICLE_SCALE = 0.008;

  // Material
  const material = new THREE.SpriteNodeMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  // Uniforms
  const maxSpeed = uniform(MAX_SPEED);
  const velocityDamping = uniform(DAMPING);
  const scale = uniform(PARTICLE_SCALE);
  const colorA = uniform(color('#5900ff'));
  const colorB = uniform(color('#ffa575'));
  const dt = float(FIXED_DT);
  const Apos = uniform(attractorA);
  const Bpos = uniform(attractorB);

  // Particle state buffers
  const faceIdBuffer = instancedArray(particleCount, 'uint');
  const baryBuffer = instancedArray(particleCount, 'vec3');
  const velocityBuffer = instancedArray(particleCount, 'vec3');

  // Helper: random barycentric
  const randomBarycentric = Fn(([seed]: any[]) => {
    const u = hash(seed.add(uint(0x1234))).toVar();
    const v = hash(seed.add(uint(0x5678))).toVar();

    const uu = u.toVar();
    const vv = v.toVar();

    If(uu.add(vv).greaterThan(1.0), () => {
      uu.assign(uu.oneMinus());
      vv.assign(vv.oneMinus());
    });

    const b0 = uu.oneMinus().sub(vv);
    const b1 = uu;
    const b2 = vv;
    return vec3(b0, b1, b2);
  });

  // Helper: reconstruct 3D position from (faceId, bary)
  const faceBaryToPos = Fn(([fId, bary]: any[]) => {
    const tri = FStorage.element(fId);
    const a = VStorage.element(tri.x);
    const b = VStorage.element(tri.y);
    const c = VStorage.element(tri.z);
    return a.mul(bary.x).add(b.mul(bary.y)).add(c.mul(bary.z));
  });

  // Helper: project point to barycentric
  const pointToBary = Fn(([fId, p]: any[]) => {
    const tri = FStorage.element(fId);
    const a = VStorage.element(tri.x);
    const b = VStorage.element(tri.y);
    const c = VStorage.element(tri.z);

    const v0 = b.sub(a);
    const v1 = c.sub(a);
    const v2 = p.sub(a);

    const d00 = v0.dot(v0);
    const d01 = v0.dot(v1);
    const d11 = v1.dot(v1);
    const d20 = v2.dot(v0);
    const d21 = v2.dot(v1);

    const denom = d00.mul(d11).sub(d01.mul(d01));
    const v = d11.mul(d20).sub(d01.mul(d21)).div(denom);
    const w = d00.mul(d21).sub(d01.mul(d20)).div(denom);
    const u = float(1.0).sub(v).sub(w);

    return vec3(u, v, w);
  });

  // Helper: pick edge index
  const pickEdgeIndex = Fn(([bary]: any[]) => {
    const bx = bary.x.toVar();
    const by = bary.y.toVar();
    const bz = bary.z.toVar();

    const edge = uint(0).toVar();
    If(by.lessThan(bx).and(by.lessThan(bz)), () => edge.assign(uint(1)));
    If(bz.lessThan(bx).and(bz.lessThan(by)), () => edge.assign(uint(2)));

    return edge;
  });

  // Helper: get neighbor face
  const getNeighborFace = Fn(([fId, edgeIndex]: any[]) => {
    const nb = neighborsStorage.element(fId);
    const out = uint(0xffffffff).toVar();
    If(edgeIndex.equal(uint(0)), () => out.assign(nb.x));
    If(edgeIndex.equal(uint(1)), () => out.assign(nb.y));
    If(edgeIndex.equal(uint(2)), () => out.assign(nb.z));
    return out;
  });

  // Init compute: spawn on faceA
  const init = Fn(() => {
    const fId = faceIdBuffer.element(instanceIndex);
    const bary = baryBuffer.element(instanceIndex);
    const vel = velocityBuffer.element(instanceIndex);

    fId.assign(uint(faceA));
    bary.assign(randomBarycentric(instanceIndex));

    // Small random initial velocity
    const r0 = hash(instanceIndex.add(uint(Math.random() * 0xffffff))).sub(0.5);
    const r1 = hash(instanceIndex.add(uint(Math.random() * 0xffffff))).sub(0.5);
    const r2 = hash(instanceIndex.add(uint(Math.random() * 0xffffff))).sub(0.5);
    vel.assign(vec3(r0, r1, r2).mul(0.02));
  });

  const initCompute = init().compute(particleCount);
  renderer.compute(initCompute);

  // Update compute: physics + edge crossing
  const update = Fn(() => {
    const fId = faceIdBuffer.element(instanceIndex);
    const bary = baryBuffer.element(instanceIndex);
    const vel = velocityBuffer.element(instanceIndex);

    const pos = faceBaryToPos(fId, bary).toVar();
    const n = nFStorage.element(fId).normalize().toVar();

    // Force: attract to B, repel from A
    const toB = Bpos.sub(pos);
    const dB = toB.length().add(1e-6);
    const dirB = toB.div(dB);

    const fromA = pos.sub(Apos);
    const dA = fromA.length().add(1e-6);
    const dirA = fromA.div(dA);

    const fAttract = dirB.mul(float(ATTRACT_GAIN).div(dB.mul(dB)));
    const fRepel = dirA.mul(float(REPEL_GAIN).div(dA.mul(dA)));
    const force3 = fAttract.add(fRepel);

    // Project force to tangent plane
    const forceTan = force3.sub(n.mul(force3.dot(n)));

    // Update velocity
    vel.addAssign(forceTan.mul(dt));

    // Clamp speed
    const speed = vel.length().toVar();
    If(speed.greaterThan(maxSpeed), () => {
      vel.assign(vel.div(speed).mul(maxSpeed));
    });

    // Damping
    vel.mulAssign(velocityDamping.oneMinus());

    // Propose new position
    const pNext = pos.add(vel.mul(dt)).toVar();

    // Compute bary in current face
    bary.assign(pointToBary(fId, pNext));

    // Edge hop loop
    Loop(uint(MAX_EDGE_HOPS), () => {
      const outside =
        bary.x.lessThan(0.0)
          .or(bary.y.lessThan(0.0))
          .or(bary.z.lessThan(0.0));

      If(outside, () => {
        const edgeIndex = pickEdgeIndex(bary);
        const nbFace = getNeighborFace(fId, edgeIndex).toVar();

        // Boundary => respawn on faceA
        If(nbFace.equal(uint(0xffffffff)), () => {
          fId.assign(uint(faceA));
          bary.assign(randomBarycentric(instanceIndex.add(uint(1337))));
          vel.assign(vec3(0.0, 0.0, 0.0));
        });

        // Valid neighbor => hop and recompute bary
        If(nbFace.notEqual(uint(0xffffffff)), () => {
          fId.assign(nbFace);
          bary.assign(pointToBary(fId, pNext));

          // Re-project velocity to new face tangent plane
          const n2 = nFStorage.element(fId).normalize();
          vel.assign(vel.sub(n2.mul(vel.dot(n2))));
        });
      });
    });

    // If particle gets very near B, respawn at A
    const distToB = Bpos.sub(faceBaryToPos(fId, bary)).length();
    If(distToB.lessThan(0.03), () => {
      fId.assign(uint(faceA));
      bary.assign(randomBarycentric(instanceIndex.add(uint(4242))));
      vel.assign(vec3(0.0, 0.0, 0.0));
    });
  });

  const updateCompute = update().compute(particleCount).setName('Update Surface Particles');

  // Rendering nodes
  material.positionNode = Fn(() => {
    const fIdAttr = faceIdBuffer.toAttribute();
    const baryAttr = baryBuffer.toAttribute();
    return faceBaryToPos(fIdAttr, baryAttr);
  })();

  material.colorNode = Fn(() => {
    const v = velocityBuffer.toAttribute();
    const s = v.length();
    const mixv = s.div(maxSpeed).smoothstep(0.0, 0.5);
    const finalColor = mix(colorA, colorB, mixv);
    return vec4(finalColor, 1.0);
  })();

  const massMul = hash(instanceIndex.add(uint(Math.random() * 0xffffff))).remap(0.25, 1.0).toVar();
  material.scaleNode = massMul.mul(scale);

  const geom = new THREE.PlaneGeometry(1, 1);
  const inst = new THREE.InstancedMesh(geom, material, particleCount);
  inst.frustumCulled = false;
  scene.add(inst);

  // Add small spheres to show attractor locations
  const sphereMatA = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
  const sphereMatB = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
  const sphGeom = new THREE.SphereGeometry(0.005, 16, 16);
  const sA = new THREE.Mesh(sphGeom, sphereMatA);
  const sB = new THREE.Mesh(sphGeom, sphereMatB);
  sA.position.copy(attractorA);
  sB.position.copy(attractorB);
  scene.add(sA);
  scene.add(sB);

  return updateCompute;
}
