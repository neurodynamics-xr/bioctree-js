// src/app/tsl/fractalNoiseField.ts
import {
  add,
  cos,
  div,
  float,
  mul,
  mx_fractal_noise_float,
  sin,
  vec3,
  uniform,
} from "three/tsl";
import type { ScalarField, ScalarFieldContext } from "./types";

export type FractalNoiseParams = {
  speed?: number;       // controls how fast time advances through noise space
  amp?: number;         // advection amplitude
  octaves?: number;     // fractal octaves
  lacunarity?: number;  // frequency multiplier per octave
  gain?: number;        // amplitude multiplier per octave
  scale?: number;       // final scale parameter for mx_fractal_noise_float
};

// TSL uniform nodes for dynamic parameter updates
export const fractalNoiseUniforms = {
  speed: uniform(3.0),
  amp: uniform(1.0),
  octaves: uniform(5),
  lacunarity: uniform(2.0),
  gain: uniform(0.5),
  scale: uniform(2.0),
};

export function createFractalNoiseField(params: FractalNoiseParams = {}): ScalarField {
  // Initialize uniforms with provided values
  fractalNoiseUniforms.speed.value = params.speed ?? 3.0;
  fractalNoiseUniforms.amp.value = params.amp ?? 1.0;
  fractalNoiseUniforms.octaves.value = params.octaves ?? 5;
  fractalNoiseUniforms.lacunarity.value = params.lacunarity ?? 2.0;
  fractalNoiseUniforms.gain.value = params.gain ?? 0.5;
  fractalNoiseUniforms.scale.value = params.scale ?? 2.0;

  return {
    id: "field:fractalNoise",
    domain: "vertex",
    // After sin(pi * noise), output is approximately [-1, 1]
    defaultRange: { min: -1, max: 1 },

    buildScalarNode: ({ positionNode, timeNode }: ScalarFieldContext) => {
      // Use the uniform nodes directly
      const speedUniform = fractalNoiseUniforms.speed;
      const ampUniform = fractalNoiseUniforms.amp;
      const octavesUniform = fractalNoiseUniforms.octaves;
      const lacunarityUniform = fractalNoiseUniforms.lacunarity;
      const gainUniform = fractalNoiseUniforms.gain;
      const scaleUniform = fractalNoiseUniforms.scale;

      // theta = time * speed (higher speed → faster animation)
      const theta = mul(float(timeNode), speedUniform);

      // offset = amp * [theta, sin(theta), cos(theta)]
      const offset = mul(vec3(theta, sin(theta), cos(theta)), ampUniform);

      // advect = position + offset
      const advect = add(positionNode, offset);

      // fractal noise sample
      const n = mx_fractal_noise_float(
        advect,
        octavesUniform,
        lacunarityUniform,
        gainUniform,
        scaleUniform
      );

      // shape to stable signed range for colormap
      return sin(mul(n, float(3.14159265)));
    },
  };
}
