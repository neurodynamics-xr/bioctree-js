/**
 * TSL Compute Shader Logic for Surface-Constrained Particle System
 * 
 * This file contains all the TSL (Three.js Shading Language) node functions
 * for the surface particle physics simulation. Ported from the HTML version.
 */

const MAX_EDGE_HOPS_PER_STEP = 4;
const FIXED_DELTA = 1 / 60;
const GRAVITY_CONSTANT = 6.67e-11;

export function createSurfaceParticleShaders(
  TSL: any, // Three.js TSL module
  THREE: any, // Three.js core
  storageNodes: any,
  attractorState: any,
  nF: number,
  particleCount: number
) {
  const {
    Fn, If, Loop, float, uint, vec2, vec3, vec4,
    PI, color, cos, sin, mix, instanceIndex, instancedArray,
    uniform, hash
  } = TSL;

  const {
    VStorage, FStorage, t1Storage, t2Storage, nFStorage,
    neighborsStorage, transportStorage
  } = storageNodes;

  const { attractorsPositions, attractorsRotationAxes, attractorsLength } = attractorState;

  // Parameters
  const attractorMass = uniform(Number(`1e7`));
  const particleGlobalMass = uniform(Number(`1e4`));
  const timeScale = uniform(1.0);
  const spinningStrength = uniform(2.75);
  const maxSpeed = uniform(6.0);
  const velocityDamping = uniform(0.06);
  const scale = uniform(0.008);
  const colorA = uniform(color('#5900ff'));
  const colorB = uniform(color('#ffa575'));

  // Per-particle storage
  const faceIdBuffer = instancedArray(particleCount, 'uint');
  const baryBuffer = instancedArray(particleCount, 'vec3');
  const vel2Buffer = instancedArray(particleCount, 'vec2');

  // Per-particle mass multiplier (pseudo-random)
  const particleMassMultiplier = hash(instanceIndex.add(uint(Math.random() * 0xffffff)))
    .remap(0.25, 1.0)
    .toVar();

  const particleMass = particleMassMultiplier.mul(particleGlobalMass).toVar();

  // ============================================================
  // Helper Functions (TSL)
  // ============================================================

  // Generate random barycentric coordinates
  const randomBarycentric = Fn(([seed]) => {
    const u = hash(seed.add(uint(0x1234))).toVar();
    const v = hash(seed.add(uint(0x5678))).toVar();

    const uu = u.toVar();
    const vv = v.toVar();

    // Fold if u+v > 1
    If(uu.add(vv).greaterThan(1.0), () => {
      uu.assign(uu.oneMinus());
      vv.assign(vv.oneMinus());
    });

    const b0 = uu.oneMinus().sub(vv);
    const b1 = uu;
    const b2 = vv;

    return vec3(b0, b1, b2);
  });

  // Reconstruct 3D position from (faceId, barycentric)
  const faceBaryToPos = Fn(([fId, bary]) => {
    const tri = FStorage.element(fId);
    const a = VStorage.element(tri.x);
    const b = VStorage.element(tri.y);
    const c = VStorage.element(tri.z);

    return a.mul(bary.x).add(b.mul(bary.y)).add(c.mul(bary.z));
  });

  // Project 3D point to barycentric coordinates in a face
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
  });

  // Pick edge index based on most-negative bary component
  const pickEdgeIndex = Fn(([bary]) => {
    const bx = bary.x.toVar();
    const by = bary.y.toVar();
    const bz = bary.z.toVar();

    const edge = uint(0).toVar();

    If(by.lessThan(bx).and(by.lessThan(bz)), () => {
      edge.assign(uint(1));
    });

    If(bz.lessThan(bx).and(bz.lessThan(by)), () => {
      edge.assign(uint(2));
    });

    return edge;
  });

  // Get neighbor face from topology (0xFFFFFFFF = boundary)
  const getNeighborFace = Fn(([fId, edgeIndex]) => {
    const nb = neighborsStorage.element(fId); // uvec3
    const n0 = nb.x.toVar();
    const n1 = nb.y.toVar();
    const n2 = nb.z.toVar();

    const out = uint(0xffffffff).toVar();

    If(edgeIndex.equal(uint(0)), () => out.assign(n0));
    If(edgeIndex.equal(uint(1)), () => out.assign(n1));
    If(edgeIndex.equal(uint(2)), () => out.assign(n2));

    return out;
  });

  // Apply parallel transport matrix to 2D velocity
  const transportVel2 = Fn(([fId, edgeIndex, v2]) => {
    const idx = fId.mul(uint(3)).add(edgeIndex);
    const T = transportStorage.element(idx); // vec4 = [T11,T12,T21,T22]

    const x = v2.x;
    const y = v2.y;

    const nx = T.x.mul(x).add(T.y.mul(y));
    const ny = T.z.mul(x).add(T.w.mul(y));

    return vec2(nx, ny);
  });

  // ============================================================
  // Init Compute - Spawn particles
  // ============================================================
  const init = Fn(() => {
    const fId = faceIdBuffer.element(instanceIndex);
    const bary = baryBuffer.element(instanceIndex);
    const v2 = vel2Buffer.element(instanceIndex);

    // Random face (uniform distribution)
    const rf = hash(instanceIndex.add(uint(Math.random() * 0xffffff))).mul(float(nF));
    fId.assign(uint(rf));

    // Random barycentric
    bary.assign(randomBarycentric(instanceIndex));

    // Initial velocity
    const phi = hash(instanceIndex.add(uint(Math.random() * 0xffffff))).mul(PI).mul(2);
    const baseV = vec2(cos(phi), sin(phi)).mul(0.02);
    v2.assign(baseV);
  });

  const initCompute = init().compute(particleCount);

  // ============================================================
  // Update Compute - Physics simulation
  // ============================================================
  const update = Fn(() => {
    const delta = float(FIXED_DELTA).mul(timeScale).toVar();

    const fId = faceIdBuffer.element(instanceIndex);
    const bary = baryBuffer.element(instanceIndex);
    const v2 = vel2Buffer.element(instanceIndex);

    // Reconstruct 3D position
    const pos = faceBaryToPos(fId, bary).toVar();

    // Face frame
    const t1 = t1Storage.element(fId);
    const t2 = t2Storage.element(fId);
    const n = nFStorage.element(fId);

    // ------------------------------------------------------------
    // Force in 3D (gravity + spinning)
    // ------------------------------------------------------------
    const force3 = vec3(0).toVar();

    Loop(attractorsLength, ({ i }) => {
      const aPos = attractorsPositions.element(i);
      const aAxis = attractorsRotationAxes.element(i);

      const toA = aPos.sub(pos);
      const dist = toA.length().add(1e-6);
      const dir = toA.div(dist);

      const gravityStrength =
        attractorMass.mul(particleMass).mul(GRAVITY_CONSTANT).div(dist.pow(2)).toVar();

      force3.addAssign(dir.mul(gravityStrength));

      // Spinning term
      const spinForce = aAxis.mul(gravityStrength).mul(spinningStrength);
      force3.addAssign(spinForce.cross(toA));
    });

    // ------------------------------------------------------------
    // Project to tangent plane, convert to face-local vel2
    // ------------------------------------------------------------
    const fN = n.normalize();
    const forceTan = force3.sub(fN.mul(force3.dot(fN)));

    const dvx = forceTan.dot(t1);
    const dvy = forceTan.dot(t2);

    v2.addAssign(vec2(dvx, dvy).mul(delta));

    // Clamp speed
    const speed = v2.length().toVar();
    If(speed.greaterThan(maxSpeed), () => {
      v2.assign(v2.div(speed).mul(maxSpeed));
    });

    // Damping
    v2.mulAssign(velocityDamping.oneMinus());

    // ------------------------------------------------------------
    // Integrate on surface with edge crossing
    // ------------------------------------------------------------
    const dp = t1.mul(v2.x).add(t2.mul(v2.y)).mul(delta);
    const pNext = pos.add(dp).toVar();

    // Compute barycentric in current face
    bary.assign(pointToBary(fId, pNext));

    // Edge-cross loop
    Loop(uint(MAX_EDGE_HOPS_PER_STEP), () => {
      const bx = bary.x.toVar();
      const by = bary.y.toVar();
      const bz = bary.z.toVar();

      const hasOutside =
        bx.lessThan(0.0).or(by.lessThan(0.0)).or(bz.lessThan(0.0));

      If(hasOutside, () => {
        const edgeIndex = pickEdgeIndex(bary);
        const nbFace = getNeighborFace(fId, edgeIndex).toVar();

        // Boundary => respawn
        If(nbFace.equal(uint(0xffffffff)), () => {
          const seed = instanceIndex.add(uint(Math.random() * 0xffffff)).toVar();
          const rf = hash(seed).mul(float(nF));
          fId.assign(uint(rf));
          bary.assign(randomBarycentric(seed));
          v2.assign(vec2(0.0, 0.0));
        });

        // Valid neighbor
        If(nbFace.notEqual(uint(0xffffffff)), () => {
          // Transport velocity into neighbor frame
          v2.assign(transportVel2(fId, edgeIndex, v2));

          // Hop face
          fId.assign(nbFace);

          // Recompute barycentric in neighbor face
          bary.assign(pointToBary(fId, pNext));
        });
      });
    });
  });

  const updateCompute = update().compute(particleCount).setName('Update Surface Particles');

  // ============================================================
  // Render Material
  // ============================================================
  const material = new THREE.SpriteNodeMaterial({
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  // Position node: reconstruct from (faceId, bary)
  material.positionNode = Fn(() => {
    const fIdAttr = faceIdBuffer.toAttribute();
    const baryAttr = baryBuffer.toAttribute();
    return faceBaryToPos(fIdAttr, baryAttr);
  })();

  // Color node: map speed to color
  material.colorNode = Fn(() => {
    const v2Attr = vel2Buffer.toAttribute();
    const sp = v2Attr.length();
    const mixv = sp.div(maxSpeed).smoothstep(0.0, 0.6);
    const col = mix(colorA, colorB, mixv);
    return vec4(col, 1.0);
  })();

  material.scaleNode = particleMassMultiplier.mul(scale);

  return {
    initCompute,
    updateCompute,
    material,
    uniforms: {
      maxSpeed,
      velocityDamping,
      spinningStrength,
      timeScale,
      scale
    }
  };
}
