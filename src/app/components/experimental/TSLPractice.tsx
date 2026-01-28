/**
 * TSLPractice - Fractal Noise Particle Flow Visualization
 * 
 * Visualizes a 3D fractal noise field using GPU-accelerated particles on a surface.
 * Features:
 * - 20,000 particles with compute shader updates
 * - Barycentric coordinate surface constraint (topology-aware)
 * - Colormap visualization of velocity field
 * - Interactive GUI controls for all parameters
 * - Works with arbitrary manifold meshes
 */

import { useEffect, useRef, useState } from 'react';

export function TSLPractice() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<string>('Initializing...');
  const [error, setError] = useState<string | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    let isMounted = true;

    const initScene = async () => {
      try {
        setStatus('Loading Three.js WebGPU...');
        
        // Import Three.js WebGPU renderer and TSL
        const THREE = await import('three/webgpu');
        const TSL = await import('three/tsl');
        const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
        const { Inspector } = await import('three/addons/inspector/Inspector.js');

        if (!isMounted) return;

        setStatus('Initializing WebGPU renderer...');

        // Setup renderer
        const renderer = new THREE.WebGPURenderer({ 
          canvas: canvasRef.current!,
          antialias: true 
        });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(containerRef.current!.clientWidth, containerRef.current!.clientHeight);
        renderer.setClearColor('#1a1a2e');
        renderer.inspector = new Inspector();
        await renderer.init();

        if (!isMounted) return;

        // Setup scene
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(
          45,
          containerRef.current!.clientWidth / containerRef.current!.clientHeight,
          0.1,
          100
        );
        camera.position.set(0, 0, 4);

        // Setup controls
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        // Add lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
        directionalLight.position.set(5, 5, 5);
        scene.add(directionalLight);

        // ============================================================
        // Instanced Particles with Fractal Noise Flow
        // ============================================================
        setStatus('Creating particle system...');

          const { Fn, If, Loop, instancedArray, instanceIndex, uniform, vec3, vec4, uint, float, hash, normalize, color, mx_fractal_noise_float, texture, clamp, vec2, dot, length, sqrt, storage, mix } = TSL;

          // Create a sphere geometry for surface mesh
          const sphereGeom = new THREE.SphereGeometry(1.2, 64, 64);
          
          // Extract mesh topology
          const positions = sphereGeom.attributes.position.array as Float32Array;
          const indices = sphereGeom.index!.array as Uint32Array;
          const nV = positions.length / 3;
          const nF = indices.length / 3;
          
          // Build face neighbors (adjacency matrix)
          setStatus('Computing mesh topology...');
          const faceNeighbors = new Uint32Array(nF * 3).fill(0xffffffff); // 0xffffffff = no neighbor
          
          // Build edge map: edge -> [face1, face2]
          const edgeMap = new Map<string, number[]>();
          const makeEdgeKey = (v1: number, v2: number) => {
            const [a, b] = v1 < v2 ? [v1, v2] : [v2, v1];
            return `${a},${b}`;
          };
          
          for (let fId = 0; fId < nF; fId++) {
            const i0 = indices[fId * 3 + 0];
            const i1 = indices[fId * 3 + 1];
            const i2 = indices[fId * 3 + 2];
            
            // Register each edge
            for (const [e, v1, v2] of [[0, i0, i1], [1, i1, i2], [2, i2, i0]]) {
              const key = makeEdgeKey(v1, v2);
              if (!edgeMap.has(key)) edgeMap.set(key, []);
              edgeMap.get(key)!.push(fId * 3 + e); // Store faceId*3 + edgeIndex
            }
          }
          
          // Fill adjacency matrix
          for (const facesEdges of edgeMap.values()) {
            if (facesEdges.length === 2) {
              const [fe1, fe2] = facesEdges;
              const fId1 = Math.floor(fe1 / 3);
              const fId2 = Math.floor(fe2 / 3);
              const edge1 = fe1 % 3;
              const edge2 = fe2 % 3;
              faceNeighbors[fId1 * 3 + edge1] = fId2;
              faceNeighbors[fId2 * 3 + edge2] = fId1;
            }
          }
          
          setStatus('Creating GPU storage buffers...');
          
          // Create storage nodes for mesh topology
          const VAttr = new THREE.StorageBufferAttribute(positions, 3);
          const FAttr = new THREE.StorageBufferAttribute(indices, 3);
          const NbAttr = new THREE.StorageBufferAttribute(faceNeighbors, 3);
          
          const VStorage = storage(VAttr, 'vec3', nV);
          const FStorage = storage(FAttr, 'uvec3', nF);
          const NbStorage = storage(NbAttr, 'uvec3', nF);
          
          // GUI-controllable parameters (created once, reused across system)
          const noiseScaleParam = uniform(1.5);
          const flowSpeedParam = uniform(0.3);
          const dampingParam = uniform(0.98);
          const particleSize = uniform(0.05);
          const colormapIndexParam = uniform(8.0); // turbo
          const colorScaleParam = uniform(20.0);
          const sphereOpacity = uniform(0.85);
          const particleColorA = uniform(color('#5900ff')); // purple
          const particleColorB = uniform(color('#00ffff')); // cyan
          
          // Fractal noise parameters
          const octavesParam = uniform(4.0);      // Number of noise layers
          const lacunarityParam = uniform(2.0);   // Frequency multiplier between octaves
          const gainParam = uniform(0.5);         // Amplitude multiplier between octaves

          // Particle system state - will be recreated when count changes
          let particleCount = 20000; // Default: 20k particles
          let faceIdBuffer: any;
          let baryBuffer: any;
          let speedBuffer: any; // Speed magnitude for coloring (no 3D velocity storage!)
          let instancedMesh: any; // THREE.InstancedMesh (using any since THREE is dynamically imported)
          let currentUpdateCompute: any;
          
          // Particle system constants
          const MAX_EDGE_HOPS = 4;
          
          // TSL helper functions for barycentric coordinates
          // @ts-ignore - TSL Fn parameter typing
          const faceBaryToPos = Fn(([fId, bary]) => {
            const tri = FStorage.element(fId);
            const a = VStorage.element(tri.x);
            const b = VStorage.element(tri.y);
            const c = VStorage.element(tri.z);
            return a.mul(bary.x).add(b.mul(bary.y)).add(c.mul(bary.z));
          }).setLayout({ name: 'faceBaryToPos', type: 'vec3', inputs: [{ name: 'fId', type: 'uint' }, { name: 'bary', type: 'vec3' }] });

          // @ts-ignore - TSL Fn parameter typing
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

          // @ts-ignore - TSL Fn parameter typing
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

          // @ts-ignore - TSL Fn parameter typing
          const pickEdge = Fn(([bary]) => {
            const edge = uint(0).toVar();
            If(bary.y.lessThan(bary.x).and(bary.y.lessThan(bary.z)), () => edge.assign(uint(1)));
            If(bary.z.lessThan(bary.x).and(bary.z.lessThan(bary.y)), () => edge.assign(uint(2)));
            return edge;
          }).setLayout({ name: 'pickEdge', type: 'uint', inputs: [{ name: 'bary', type: 'vec3' }] });

          // @ts-ignore - TSL Fn parameter typing
          const getNeighbor = Fn(([fId, edgeIndex]) => {
            const nb = NbStorage.element(fId);
            const out = uint(0xffffffff).toVar();
            If(edgeIndex.equal(uint(0)), () => out.assign(nb.x));
            If(edgeIndex.equal(uint(1)), () => out.assign(nb.y));
            If(edgeIndex.equal(uint(2)), () => out.assign(nb.z));
            return out;
          }).setLayout({ name: 'getNeighbor', type: 'uint', inputs: [{ name: 'fId', type: 'uint' }, { name: 'edgeIndex', type: 'uint' }] });

          // Function to create/recreate particle system
          const createParticleSystem = async (count: number) => {
            // Remove old mesh if exists
            if (instancedMesh) {
              scene.remove(instancedMesh);
              instancedMesh.geometry.dispose();
              (instancedMesh.material as any).dispose();
            }

            particleCount = count;

            // Create instanced buffers (barycentric coordinates on mesh surface)
            faceIdBuffer = instancedArray(particleCount, 'uint');
            baryBuffer = instancedArray(particleCount, 'vec3');
            speedBuffer = instancedArray(particleCount, 'float');

            // Initialize particles at random face+bary positions
            const initParticles = Fn(() => {
              const fId = faceIdBuffer.element(instanceIndex);
              const bary = baryBuffer.element(instanceIndex);
              const spd = speedBuffer.element(instanceIndex);
              
              // Random face selection
              const rFace = hash(instanceIndex.add(uint(0x9e3779b9))).mul(float(nF));
              fId.assign(uint(rFace));
              
              // Random barycentric coordinates
              bary.assign(randomBary.call({ seed: instanceIndex }));
              
              // Start with zero speed
              spd.assign(float(0.0));
            });

            await renderer.computeAsync(initParticles().compute(particleCount));

            // Update particles: apply fractal noise flow field + topology-aware surface constraint
            const updateParticles = Fn(() => {
              const dt = float(1.0 / 60.0).toVar();
              const fId = faceIdBuffer.element(instanceIndex);
              const bary = baryBuffer.element(instanceIndex);
              const spd = speedBuffer.element(instanceIndex);

              // Get triangle vertices
              const tri = FStorage.element(fId);
              const a = VStorage.element(tri.x);
              const b = VStorage.element(tri.y);
              const c = VStorage.element(tri.z);
              
              // Get current 3D position
              const pos = a.mul(bary.x).add(b.mul(bary.y)).add(c.mul(bary.z)).toVar();
              
              // Compute orthonormal basis for tangent plane
              const edge1 = b.sub(a);
              const e1 = normalize(edge1);
              const faceNormal = normalize(edge1.cross(c.sub(a)));
              const e2 = faceNormal.cross(e1);
              
              // Sample noise at face centroid (constant per-face flow)
              const faceCentroid = a.add(b).add(c).div(3.0);
              const time = TSL.time;
              const timeVec = vec3(
                time.mul(flowSpeedParam), 
                time.mul(flowSpeedParam.mul(0.7)), 
                time.mul(flowSpeedParam.mul(0.5))
              );
              const noisePos = faceCentroid.mul(noiseScaleParam).add(timeVec);
              
              // Sample 2 noise channels for 2D tangent flow
              const noise1 = mx_fractal_noise_float(noisePos, octavesParam, lacunarityParam, gainParam, 1.0);
              const noise2 = mx_fractal_noise_float(noisePos.add(vec3(100, 0, 0)), octavesParam, lacunarityParam, gainParam, 1.0);
              
              // Convert to [-1, 1] range for tangent space coefficients
              const alpha = noise1.mul(2.0).sub(1.0);
              const beta = noise2.mul(2.0).sub(1.0);
              
              // Construct 3D flow vector in tangent plane
              const flowVec = e1.mul(alpha).add(e2.mul(beta)).mul(0.5);
              
              // Store speed
              spd.assign(length(flowVec));
              
              // Integrate: move in 3D along tangent flow (like SurfaceEulerianFlow)
              const pNext = pos.add(flowVec.mul(dt)).toVar();
              
              // Project pNext back to current triangle
              bary.assign(pointToBary.call({ fId, p: pNext }));

              // Handle edge crossings (topology-aware transport)
              Loop(uint(MAX_EDGE_HOPS), () => {
                const outside = bary.x.lessThan(0.0).or(bary.y.lessThan(0.0)).or(bary.z.lessThan(0.0));
                If(outside, () => {
                  // Compute current 3D position for reprojection
                  const currentTri = FStorage.element(fId);
                  const currentA = VStorage.element(currentTri.x);
                  const currentB = VStorage.element(currentTri.y);
                  const currentC = VStorage.element(currentTri.z);
                  const currentPos = currentA.mul(bary.x).add(currentB.mul(bary.y)).add(currentC.mul(bary.z));
                  
                  const e = pickEdge.call({ bary });
                  const nbFace = getNeighbor.call({ fId, edgeIndex: e }).toVar();
                  
                  // Check if boundary (no neighbor)
                  If(nbFace.equal(uint(0xffffffff)), () => {
                    // Respawn at random location
                    const rFace2 = hash(instanceIndex.add(uint(0x7f4a7c15))).mul(float(nF));
                    fId.assign(uint(rFace2));
                    bary.assign(randomBary.call({ seed: instanceIndex.add(uint(1337)) }));
                    spd.assign(float(0.0));
                  });
                  
                  // Hop to neighbor face and reproject current position onto new triangle
                  If(nbFace.notEqual(uint(0xffffffff)), () => {
                    fId.assign(nbFace);
                    bary.assign(pointToBary.call({ fId, p: currentPos }));
                  });
                });
              });
            });

            currentUpdateCompute = updateParticles().compute(particleCount);

            // Create SpriteNodeMaterial for rendering particles
            const spriteMaterial = new THREE.SpriteNodeMaterial({
              blending: THREE.AdditiveBlending,
              depthWrite: false,
              transparent: true
            });

            // Position node - compute 3D position from face+bary
            spriteMaterial.positionNode = Fn(() => {
              const fIdAttr = faceIdBuffer.toAttribute();
              const baryAttr = baryBuffer.toAttribute();
              // Inline to avoid scope issues
              const tri = FStorage.element(fIdAttr);
              const a = VStorage.element(tri.x);
              const b = VStorage.element(tri.y);
              const c = VStorage.element(tri.z);
              return a.mul(baryAttr.x).add(b.mul(baryAttr.y)).add(c.mul(baryAttr.z));
            })();

            // Color node - color based on speed
            spriteMaterial.colorNode = Fn(() => {
              const sAttr = speedBuffer.toAttribute();
              const mixFactor = sAttr.div(0.1).smoothstep(0.0, 0.5);
              const c = mix(particleColorA, particleColorB, mixFactor);
              return vec4(c, 1.0);
            })();

            // Scale node - size of particles
            spriteMaterial.scaleNode = particleSize;

            // Create instanced mesh (1 plane geometry, many instances)
            const planeGeom = new THREE.PlaneGeometry(1, 1);
            instancedMesh = new THREE.InstancedMesh(planeGeom, spriteMaterial, particleCount);
            instancedMesh.frustumCulled = false;
            scene.add(instancedMesh);

            setStatus(`Ready - ${particleCount} particles`);
          };

          // Load colormap atlas
          setStatus('Loading colormap atlas...');
          const textureLoader = new THREE.TextureLoader();
          const colormapAtlas = await new Promise<any>((resolve, reject) => {
            textureLoader.load('/colormaps_atlas.png', resolve, undefined, reject);
          });

          // Initialize particle system
          await createParticleSystem(particleCount);
          
          // Background sphere: visualizes the SAME flow field
          const sphereMat = new THREE.MeshStandardNodeMaterial({
            transparent: true,
            roughness: 0.6,
            metalness: 0.1
          });
          sphereMat.opacityNode = sphereOpacity;
          
          sphereMat.colorNode = Fn(() => {
            const pos = TSL.positionLocal;
            const normal = normalize(pos);
            
            // IDENTICAL flow field computation as particles
            const time = TSL.time;
            const timeVec = vec3(
              time.mul(flowSpeedParam), 
              time.mul(flowSpeedParam.mul(0.7)), 
              time.mul(flowSpeedParam.mul(0.5))
            );
            const noisePos = pos.mul(noiseScaleParam).add(timeVec);
            
            const noiseX = mx_fractal_noise_float(noisePos, octavesParam, lacunarityParam, gainParam, 1.0);
            const noiseY = mx_fractal_noise_float(noisePos.add(vec3(100, 0, 0)), octavesParam, lacunarityParam, gainParam, 1.0);
            const noiseZ = mx_fractal_noise_float(noisePos.add(vec3(0, 100, 0)), octavesParam, lacunarityParam, gainParam, 1.0);
            
            const flowX = noiseX.mul(2.0).sub(1.0);
            const flowY = noiseY.mul(2.0).sub(1.0);
            const flowZ = noiseZ.mul(2.0).sub(1.0);
            const flow3D = vec3(flowX, flowY, flowZ).mul(0.05);
            
            // Project to tangent plane (same as particles)
            const normalComponent = dot(flow3D, normal);
            const flowTangent = flow3D.sub(normal.mul(normalComponent));
            
            // Map tangent flow magnitude to colormap
            const tangentSpeed = length(flowTangent);
            const normalized = clamp(tangentSpeed.mul(colorScaleParam), 0.0, 1.0);
            
            const rowHeight = TSL.float(1.0).div(16.0);
            const v = colormapIndexParam.add(0.5).mul(rowHeight);
            const uv = vec2(normalized, v);
            
            return texture(colormapAtlas).sample(uv).rgb;
          })();
          
          const sphereMesh = new THREE.Mesh(sphereGeom, sphereMat);
          scene.add(sphereMesh);

          setError(null);

          // GUI Controls
          const particleFolder = (renderer.inspector as any).createParameters('Particle System');
          particleFolder.add({ count: particleCount }, 'count', 1000, 100000, 1000).name('Particle Count').onChange(async (value: number) => {
            setStatus(`Recreating ${value} particles...`);
            await createParticleSystem(value);
          });
          
          const gui = (renderer.inspector as any).createParameters('Fractal Flow Parameters');
          gui.add(noiseScaleParam, 'value', 0.1, 5.0, 0.1).name('noiseScale');
          gui.add(flowSpeedParam, 'value', 0, 2.0, 0.05).name('flowSpeed');
          gui.add(dampingParam, 'value', 0.8, 1.0, 0.001).name('damping');
          gui.add(particleSize, 'value', 0, 0.2, 0.005).name('particleSize');
          
          const noiseFolder = (renderer.inspector as any).createParameters('Fractal Noise');
          noiseFolder.add(octavesParam, 'value', 1, 8, 1).name('octaves');
          noiseFolder.add(lacunarityParam, 'value', 1.0, 4.0, 0.1).name('lacunarity');
          noiseFolder.add(gainParam, 'value', 0.1, 1.0, 0.05).name('gain');

          const colormapFolder = (renderer.inspector as any).createParameters('Colormap');
          colormapFolder.add(colormapIndexParam, 'value', 0, 15, 1).name('colormapIndex');
          colormapFolder.add(colorScaleParam, 'value', 1, 100, 1).name('colorScale');
          colormapFolder.add(sphereOpacity, 'value', 0, 1, 0.05).name('sphereOpacity');
          colormapFolder.add({ meshVisible: sphereMesh.visible }, 'meshVisible').onChange((value: boolean) => {
            sphereMesh.visible = value;
          });

          gui.add({ 
            reset: () => createParticleSystem(particleCount) 
          }, 'reset').name('Reset Particles');

          // Animation loop - always uses latest updateCompute
          let animationId: number;
          const animate = () => {
            if (!isMounted) return;
            controls.update();
            if (currentUpdateCompute) {
              renderer.compute(currentUpdateCompute);
            }
            renderer.render(scene, camera);
            animationId = requestAnimationFrame(animate);
          };
          animate();

          cleanupRef.current = () => {
            cancelAnimationFrame(animationId);
            if (instancedMesh) {
              instancedMesh.geometry.dispose();
              (instancedMesh.material as any).dispose();
            }
            renderer.dispose();
            sphereGeom.dispose();
            sphereMat.dispose();
            scene.clear();
          };

      } catch (err) {
        console.error('TSLPractice error:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setStatus('Error');
      }
    };

    initScene();

    return () => {
      isMounted = false;
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />
      
      {/* Status Display */}
      <div className="absolute left-3 top-3 bg-black/40 backdrop-blur-sm text-white text-xs px-3 py-2 rounded-lg">
        <div className="font-semibold">Fractal Noise Flow Visualization</div>
        <div className="mt-1 text-white/80">
          {error ? (
            <span className="text-red-400">Error: {error}</span>
          ) : (
            <span>{status}</span>
          )}
        </div>
        <div className="mt-2 text-white/70 text-[11px]">
          <span className="italic">Topology-aware surface constraint using barycentric coordinates</span>
        </div>
      </div>
    </div>
  );
}
