/**
 * SurfaceEulerianFlow - WebGPU particle visualization sampling exported Eulerian velocity field
 * Particles constrained to triangles (faceId+bary) sampling U_face per face
 */

import { useEffect, useRef, useState } from 'react';

interface SurfaceEulerianFlowProps {
  dataPath?: string;
  particleCount?: number;
}

export function SurfaceEulerianFlow({ 
  dataPath = '/data/particle_vis_eulerian',
  particleCount = Math.pow(2, 17)
}: SurfaceEulerianFlowProps) {
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
        
        const THREE = await import('three/webgpu');
        const TSL = await import('three/tsl');
        const { Fn, If, Loop, float, uint, vec3, vec4, instancedArray, instanceIndex, uniform, color, hash, mix, storage } = TSL;
        const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
        const { Inspector } = await import('three/addons/inspector/Inspector.js');

        if (!isMounted) return;

        setStatus('Initializing WebGPU renderer...');

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

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(
          25,
          containerRef.current!.clientWidth / containerRef.current!.clientHeight,
          0.01,
          500
        );
        camera.position.set(0, 0, 5);

        // Camera-locked lighting rig
        const lightRig = new THREE.Group();
        camera.add(lightRig);
        scene.add(camera);

        const ambient = new THREE.AmbientLight(0xffffff, 0.2);
        lightRig.add(ambient);

        const key = new THREE.DirectionalLight(0xffffff, 1.45);
        key.position.set(1.0, 0.8, 1.2);
        lightRig.add(key);
        key.target.position.set(0, 0, 0);
        lightRig.add(key.target);

        const fill = new THREE.DirectionalLight(0xffffff, 0.95);
        fill.position.set(-1.0, 0.4, 1.0);
        lightRig.add(fill);
        fill.target.position.set(0, 0, 0);
        lightRig.add(fill.target);

        const rim = new THREE.DirectionalLight(0xffffff, 0.45);
        rim.position.set(0, 0.2, -1.0);
        lightRig.add(rim);
        rim.target.position.set(0, 0, 0);
        lightRig.add(rim.target);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.minDistance = 0.05;
        controls.maxDistance = 200;

        setStatus('Loading mesh data...');

        // Load export data
        const jsonRes = await fetch(dataPath + '.json');
        const json = await jsonRes.json();
        const binRes = await fetch(dataPath + '.bin');
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

        // Required buffers (includes lifecycle data for continuous flow)
        const required = ['V', 'F', 'faceNeighbors', 'U_face', 'vertexNormals', 'faceNormals', 'centroids', 'H_face', 'spawnMask', 'sinkMask'];
        for (const k of required) {
          if (!buffers[k]) throw new Error(`Missing required buffer "${k}" in export.`);
        }

        // Validate lifecycle buffers
        if (buffers.H_face.length !== nF) throw new Error(`H_face length mismatch: ${buffers.H_face.length} !== ${nF}`);
        if (buffers.spawnMask.length !== nF) throw new Error(`spawnMask length mismatch: ${buffers.spawnMask.length} !== ${nF}`);
        if (buffers.sinkMask.length !== nF) throw new Error(`sinkMask length mismatch: ${buffers.sinkMask.length} !== ${nF}`);

        // Pack spawn and sink masks into single uvec2 buffer (to stay within WebGPU storage buffer limit)
        const packedMasks = new Uint32Array(nF * 2);
        for (let i = 0; i < nF; i++) {
          packedMasks[i * 2 + 0] = buffers.spawnMask[i]; // spawn
          packedMasks[i * 2 + 1] = buffers.sinkMask[i];  // sink
        }
        buffers.packedMasks = packedMasks;

        // Reinterpret faceNeighbors int32 as u32
        buffers.faceNeighborsU32 = new Uint32Array(
          buffers.faceNeighbors.buffer,
          buffers.faceNeighbors.byteOffset,
          buffers.faceNeighbors.length
        );

        if (!isMounted) return;

        setStatus(`Building surface mesh (${nF} faces)...`);

        // Build surface mesh
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(buffers.V, 3));
        geom.setAttribute('normal', new THREE.BufferAttribute(buffers.vertexNormals, 3));
        geom.setIndex(new THREE.BufferAttribute(buffers.F, 1));

        const mat = new THREE.MeshStandardMaterial({
          color: 0x111111,
          roughness: 0.9,
          metalness: 0.0,
          side: THREE.DoubleSide
        });

        const surfaceMesh = new THREE.Mesh(geom, mat);
        surfaceMesh.name = 'SurfaceMesh';
        scene.add(surfaceMesh);

        // Fit camera
        surfaceMesh.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(surfaceMesh);
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
        controls.target.copy(center);
        controls.update();

        setStatus('Creating GPU storage buffers...');

        // Create storage nodes (mesh + field + lifecycle)
        // Note: Pack masks into uvec2 to stay within WebGPU storage buffer limit (8 per stage)
        const VAttr = new THREE.StorageBufferAttribute(buffers.V, 3);
        const FAttr = new THREE.StorageBufferAttribute(buffers.F, 3);
        const NbAttr = new THREE.StorageBufferAttribute(buffers.faceNeighborsU32, 3);
        const UAttr = new THREE.StorageBufferAttribute(buffers.U_face, 3);
        const HAttr = new THREE.StorageBufferAttribute(buffers.H_face, 1);
        const MaskAttr = new THREE.StorageBufferAttribute(buffers.packedMasks, 2); // uvec2: [spawn, sink]

        const VStorage = storage(VAttr, 'vec3', nV);
        const FStorage = storage(FAttr, 'uvec3', nF);
        const NbStorage = storage(NbAttr, 'uvec3', nF);
        const UStorage = storage(UAttr, 'vec3', nF);
        const HStorage = storage(HAttr, 'float', nF);
        const MaskStorage = storage(MaskAttr, 'uvec2', nF); // .x = spawn, .y = sink

        setStatus(`Spawning ${particleCount.toLocaleString()} particles...`);

        // Particle system constants
        const MAX_EDGE_HOPS = 4;

        // Controls
        const timeScale = uniform(1.0);
        const speedGain = uniform(1.0);
        const maxSpeed = uniform(8.0);
        const particleSz = uniform(0.008);
        const respawnEnabled = uniform(0.0); // 1.0 = enabled, 0.0 = disabled (default: off)
        const spawnTries = uniform(32.0); // max rejection sampling attempts

        const colorA = uniform(color('#5900ff'));
        const colorB = uniform(color('#ffa575'));

        // Particle state buffers
        const faceIdBuffer = instancedArray(particleCount, 'uint');
        const baryBuffer = instancedArray(particleCount, 'vec3');
        const speedBuffer = instancedArray(particleCount, 'float');

        // TSL helper functions
        const faceBaryToPos = Fn(([fId, bary]) => {
          const tri = FStorage.element(fId);
          const a = VStorage.element(tri.x);
          const b = VStorage.element(tri.y);
          const c = VStorage.element(tri.z);
          return a.mul(bary.x).add(b.mul(bary.y)).add(c.mul(bary.z));
        }).setLayout({ name: 'faceBaryToPos', type: 'vec3', inputs: [{ name: 'fId', type: 'uint' }, { name: 'bary', type: 'vec3' }] });

        const randomBary = Fn(([seed]) => {
          const u = hash(seed.add(uint(0x1234))).toVar();
          const v = hash(seed.add(uint(0x5678))).toVar();
          const uu = u.toVar();
          const vv = v.toVar();
          If(uu.add(vv).greaterThan(1.0), () => {
            uu.assign(uu.oneMinus());
            vv.assign(vv.oneMinus());
          });
          return vec3(uu.oneMinus().sub(vv), uu, vv);
        }).setLayout({ name: 'randomBary', type: 'vec3', inputs: [{ name: 'seed', type: 'uint' }] });

        const pointToBary = Fn(([fId, p]) => {
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
        }).setLayout({ name: 'pointToBary', type: 'vec3', inputs: [{ name: 'fId', type: 'uint' }, { name: 'p', type: 'vec3' }] });

        const pickEdge = Fn(([bary]) => {
          const edge = uint(0).toVar();
          If(bary.y.lessThan(bary.x).and(bary.y.lessThan(bary.z)), () => edge.assign(uint(1)));
          If(bary.z.lessThan(bary.x).and(bary.z.lessThan(bary.y)), () => edge.assign(uint(2)));
          return edge;
        }).setLayout({ name: 'pickEdge', type: 'uint', inputs: [{ name: 'bary', type: 'vec3' }] });

        const getNeighbor = Fn(([fId, edgeIndex]) => {
          const nb = NbStorage.element(fId);
          const out = uint(0xffffffff).toVar();
          If(edgeIndex.equal(uint(0)), () => out.assign(nb.x));
          If(edgeIndex.equal(uint(1)), () => out.assign(nb.y));
          If(edgeIndex.equal(uint(2)), () => out.assign(nb.z));
          return out;
        }).setLayout({ name: 'getNeighbor', type: 'uint', inputs: [{ name: 'fId', type: 'uint' }, { name: 'edgeIndex', type: 'uint' }] });

        // Init compute
        const init = Fn(() => {
          const fId = faceIdBuffer.element(instanceIndex);
          const bary = baryBuffer.element(instanceIndex);
          const spd = speedBuffer.element(instanceIndex);
          const rFace = hash(instanceIndex.add(uint(0x9e3779b9))).mul(float(nF));
          fId.assign(uint(rFace));
          bary.assign(randomBary(instanceIndex));
          spd.assign(float(0.0));
        });

        const initCompute = init().compute(particleCount);
        const reset = () => renderer.compute(initCompute);
        renderer.compute(initCompute);

        // Update compute
        const update = Fn(() => {
          const dt = float(1.0 / 60.0).mul(timeScale).toVar();
          const fId = faceIdBuffer.element(instanceIndex);
          const bary = baryBuffer.element(instanceIndex);
          const spd = speedBuffer.element(instanceIndex);

          // Particle lifecycle: respawn if in sink region
          If(respawnEnabled.greaterThan(0.5), () => {
            const masks = MaskStorage.element(fId); // uvec2: .x = spawn, .y = sink
            const inSink = masks.y.greaterThan(uint(0));
            If(inSink, () => {
              // Bounded rejection sampling: find spawn face
              const maxTries = uint(spawnTries);
              const seed = instanceIndex.add(hash(instanceIndex).mul(uint(0xFFFFFF)));
              const foundFace = uint(0).toVar();
              const found = uint(0).toVar();
              
              Loop(maxTries, ({ i }) => {
                If(found.equal(uint(0)), () => {
                  const candidate = hash(seed.add(i)).mul(float(nF));
                  const candidateId = uint(candidate).toVar();
                  const candidateMasks = MaskStorage.element(candidateId);
                  const isSpawn = candidateMasks.x.greaterThan(uint(0)); // check spawn bit
                  If(isSpawn, () => {
                    foundFace.assign(candidateId);
                    found.assign(uint(1));
                  });
                });
              });
              
              // Respawn particle (use foundFace or fallback to face 0)
              const newFaceId = found.greaterThan(uint(0)).select(foundFace, uint(0));
              fId.assign(newFaceId);
              bary.assign(randomBary(instanceIndex.add(uint(Math.floor(Math.random() * 0xFFFFFF)))));
              spd.assign(float(0.0));
            });
          });

          const pos = faceBaryToPos(fId, bary).toVar();
          const u = UStorage.element(fId).mul(speedGain).toVar();
          const s = u.length().toVar();
          If(s.greaterThan(maxSpeed), () => {
            u.assign(u.normalize().mul(maxSpeed));
          });
          spd.assign(u.length());
          const pNext = pos.add(u.mul(dt)).toVar();
          bary.assign(pointToBary(fId, pNext));

          Loop(uint(MAX_EDGE_HOPS), () => {
            const outside = bary.x.lessThan(0.0).or(bary.y.lessThan(0.0)).or(bary.z.lessThan(0.0));
            If(outside, () => {
              const e = pickEdge(bary);
              const nbFace = getNeighbor(fId, e).toVar();
              If(nbFace.equal(uint(0xffffffff)), () => {
                const rFace2 = hash(instanceIndex.add(uint(0x7f4a7c15))).mul(float(nF));
                fId.assign(uint(rFace2));
                bary.assign(randomBary(instanceIndex.add(uint(1337))));
                spd.assign(float(0.0));
              });
              If(nbFace.notEqual(uint(0xffffffff)), () => {
                fId.assign(nbFace);
                bary.assign(pointToBary(fId, pNext));
              });
            });
          });
        });

        const updateCompute = update().compute(particleCount).setName('Update Eulerian Surface Particles');

        // Render material
        const material = new THREE.SpriteNodeMaterial({
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });

        material.positionNode = Fn(() => {
          const fIdAttr = faceIdBuffer.toAttribute();
          const baryAttr = baryBuffer.toAttribute();
          // Inline to avoid scope issues
          const tri = FStorage.element(fIdAttr);
          const a = VStorage.element(tri.x);
          const b = VStorage.element(tri.y);
          const c = VStorage.element(tri.z);
          return a.mul(baryAttr.x).add(b.mul(baryAttr.y)).add(c.mul(baryAttr.z));
        })();

        material.colorNode = Fn(() => {
          const sAttr = speedBuffer.toAttribute();
          const mixv = sAttr.div(maxSpeed).smoothstep(0.0, 0.5);
          const c = mix(colorA, colorB, mixv);
          return vec4(c, 1.0);
        })();

        material.scaleNode = particleSz;

        const planeGeom = new THREE.PlaneGeometry(1, 1);
        const inst = new THREE.InstancedMesh(planeGeom, material, particleCount);
        inst.frustumCulled = false;
        scene.add(inst);

        if (!isMounted) return;

        setStatus('Running Eulerian flow...');
        setError(null);

        // GUI controls
        const gui = renderer.inspector.createParameters('Flow Parameters');
        gui.add(timeScale, 'value', 0, 5, 0.01).name('timeScale');
        gui.add(speedGain, 'value', 0, 10, 0.01).name('speedGain');
        gui.add(maxSpeed, 'value', 0, 20, 0.01).name('maxSpeed');
        gui.add(particleSz, 'value', 0, 0.05, 0.001).name('particleSize');
        
        const lifecycleFolder = renderer.inspector.createParameters('Particle Lifecycle');
        lifecycleFolder.add({ enabled: respawnEnabled.value > 0.5 }, 'enabled').onChange((value: boolean) => {
          respawnEnabled.value = value ? 1.0 : 0.0;
        });
        lifecycleFolder.add(spawnTries, 'value', 8, 128, 1).name('spawnTries');
        
        gui.add({ meshVisible: surfaceMesh.visible }, 'meshVisible').onChange((value: boolean) => {
          surfaceMesh.visible = value;
        });
        gui.add({ reset }, 'reset');

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
      <div className="absolute left-3 top-3 bg-black/40 backdrop-blur-sm text-white text-xs px-3 py-2 rounded-lg max-w-md">
        <div className="font-semibold">Eulerian Surface Flow</div>
        <div className="mt-1 text-white/80">
          {error ? (
            <span className="text-red-400">Error: {error}</span>
          ) : (
            <span>Status: {status}</span>
          )}
        </div>
        <div className="mt-1 text-white/70 text-[11px]">
          WebGPU + TSL compute • Sampling U_face per-face velocity field • Topology-aware transport
        </div>
      </div>
    </div>
  );
}
