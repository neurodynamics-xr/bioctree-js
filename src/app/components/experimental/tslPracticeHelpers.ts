/**
 * tslPracticeHelpers.ts
 * 
 * Reusable TSL node composition functions.
 * Each function takes TSL as a parameter and returns a TSL node chain.
 * 
 * Usage:
 *   const TSL = await import('three/tsl');
 *   material.colorNode = createAnimatedColor(TSL, '#ff0000', '#0000ff');
 */

/**
 * Simple animated color that oscillates between two colors using sine wave
 */
export function createAnimatedColor(
  TSL: any,
  colorHexA: string,
  colorHexB: string,
  speed: number = 1.0
) {
  const time = TSL.time.mul(speed);
  const oscillation = TSL.sin(time);
  const factor = oscillation.mul(0.5).add(0.5);  // Map -1..1 to 0..1
  
  const colorA = TSL.color(colorHexA);
  const colorB = TSL.color(colorHexB);
  
  return TSL.mix(colorA, colorB, factor);
}

/**
 * Static gradient based on vertical position (Y axis)
 * Bottom of sphere = colorA, Top of sphere = colorB
 */
export function createVerticalGradient(
  TSL: any,
  colorHexA: string,
  colorHexB: string
) {
  const pos = TSL.positionLocal;  // Get vertex position in local space
  const yFactor = pos.y.add(1.0).mul(0.5);  // Map Y from -1..1 to 0..1
  
  const colorA = TSL.color(colorHexA);
  const colorB = TSL.color(colorHexB);
  
  return TSL.mix(colorA, colorB, yFactor);
}

/**
 * Animated gradient that moves up and down the sphere
 */
export function createAnimatedGradient(
  TSL: any,
  colorHexA: string,
  colorHexB: string,
  speed: number = 1.0
) {
  const pos = TSL.positionLocal;
  const time = TSL.time.mul(speed);
  
  // Animate the gradient position with sine wave
  const offset = TSL.sin(time);
  const yFactor = pos.y.add(offset).add(1.0).mul(0.5);
  
  const colorA = TSL.color(colorHexA);
  const colorB = TSL.color(colorHexB);
  
  return TSL.mix(colorA, colorB, yFactor);
}

/**
 * Rainbow color cycling through hue
 * Uses HSL-like color cycling
 */
export function createRainbowCycle(
  TSL: any,
  speed: number = 1.0
) {
  const time = TSL.time.mul(speed);
  
  // Create RGB values that cycle with different phases
  const r = TSL.sin(time).mul(0.5).add(0.5);
  const g = TSL.sin(time.add(2.094)).mul(0.5).add(0.5);  // 2π/3 offset
  const b = TSL.sin(time.add(4.189)).mul(0.5).add(0.5);  // 4π/3 offset
  
  return TSL.vec3(r, g, b);
}

/**
 * Pulsing color - single color that fades in/out
 */
export function createPulsingColor(
  TSL: any,
  colorHex: string,
  speed: number = 1.0,
  minIntensity: number = 0.3
) {
  const time = TSL.time.mul(speed);
  const pulse = TSL.sin(time).mul(0.5).add(0.5);  // 0..1
  
  // Scale pulse to stay above minimum intensity
  const intensity = pulse.mul(1.0 - minIntensity).add(minIntensity);
  
  const baseColor = TSL.color(colorHex);
  return baseColor.mul(intensity);
}

/**
 * Fractal noise texture mapped to colors
 * Creates organic, cloud-like patterns on the surface
 * 
 * Uses mx_fractal_noise_float - a built-in TSL node for fractal Brownian motion (fBm)
 */
export function createFractalNoise(
  TSL: any,
  colorHexA: string = '#000000',
  colorHexB: string = '#ffffff',
  speed: number = 1.0,
  scale: number = 2.0,
  octaves: number = 5
) {
  // Get position and time
  const pos = TSL.positionLocal;
  const time = TSL.time.mul(speed);
  
  // Animate the noise by offsetting position through noise space
  const offset = TSL.vec3(
    time,
    TSL.sin(time),
    TSL.cos(time)
  );
  const animatedPos = pos.add(offset);
  
  // Sample fractal noise (this is a built-in TSL function!)
  // mx_fractal_noise_float(position, octaves, lacunarity, gain, scale)
  const noise = TSL.mx_fractal_noise_float(
    animatedPos,     // input position
    octaves,         // number of noise layers (more = more detail)
    2.0,            // lacunarity (frequency multiplier per octave)
    0.5,            // gain (amplitude multiplier per octave)
    scale           // overall scale of noise
  );
  
  // Map noise to 0-1 range (noise output is roughly 0-1 already)
  const factor = TSL.sin(noise.mul(3.14159)).mul(0.5).add(0.5);
  
  // Mix between two colors based on noise value
  const colorA = TSL.color(colorHexA);
  const colorB = TSL.color(colorHexB);
  
  return TSL.mix(colorA, colorB, factor);
}

/**
 * Procedural flowing particles - simulates particles without compute shaders!
 * Creates glowing dots that flow across the surface using only vertex/fragment shader tricks
 * 
 * This is MUCH simpler than SurfaceEulerianFlow.tsx:
 * - No compute shaders
 * - No instancing
 * - No GPU state buffers
 * - Just clever math in the colorNode
 */
export function createProceduralParticles(
  TSL: any,
  baseColorHex: string = '#0a0a0a',
  particleColorHex: string = '#00ffff',
  speed: number = 1.0,
  density: number = 20.0,
  particleSize: number = 0.15
) {
  const pos = TSL.positionLocal;
  const time = TSL.time.mul(speed);
  
  // Convert JS numbers to TSL nodes
  const densityNode = TSL.float(density);
  const sizeNode = TSL.float(particleSize);
  
  // Create a "flow" by making particles move in a direction
  // We'll use hash to create pseudo-random particle positions
  const flowOffset = TSL.vec3(time, time.mul(0.5), time.mul(0.3));
  const flowingPos = pos.add(flowOffset);
  
  // Scale position to control density
  const scaledPos = flowingPos.mul(densityNode);
  
  // Use hash to create random-looking particle positions
  // Hash creates a 0-1 value that's consistent for each position
  const cellPos = TSL.floor(scaledPos);  // Integer cell coordinates
  const localPos = TSL.fract(scaledPos); // 0-1 position within cell
  
  // Hash the cell to decide if there's a particle here
  const cellHash = TSL.hash(cellPos);
  
  // Only show particles in some cells (creates sparse distribution)
  const hasParticle = cellHash.greaterThan(0.7); // 30% of cells have particles
  
  // Distance from cell center (where particle is)
  const centerDist = TSL.length(localPos.sub(TSL.vec3(0.5, 0.5, 0.5)));
  
  // Create circular particles using smoothstep
  const particleShape = TSL.smoothstep(sizeNode, sizeNode.mul(0.5), centerDist);
  
  // Combine: only show particle if cell has one AND we're close to center
  const particleBrightness = hasParticle.select(particleShape, 0.0);
  
  // Mix base color with particle color
  const baseColor = TSL.color(baseColorHex);
  const particleColor = TSL.color(particleColorHex);
  
  return TSL.mix(baseColor, particleColor, particleBrightness);
}
