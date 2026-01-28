# TSL Shader Library

Reusable TSL (Three.js Shading Language) shader-graph building blocks for the Bioctree application.

## Purpose

This folder contains pure shader-graph logic expressed as TSL `Fn` nodes and composition helpers. These functions are:

- **Not viewer logic** - No scene, camera, or mesh dependencies
- **Not GPU resource logic** - No texture loading, caching, or resource management
- **Reusable building blocks** - Can be composed into:
  - Render materials (`NodeMaterial` graphs)
  - Compute graphs (if using TSL for compute shaders)

Think of this as your project's "shader library" - equivalent to traditional GLSL shader files, but expressed as composable TSL nodes.

## Architecture

```
tsl/
├── colormap.ts      # Color mapping and visualization
├── index.ts         # Main entry point
└── README.md        # This file
```

### Future Modules (Planned)

```
tsl/
├── math.ts          # Mathematical operations (clamp, smoothstep, etc.)
├── noise.ts         # Noise functions (Perlin, simplex, etc.)
├── geometry.ts      # Geometric operations (normals, tangents, etc.)
└── filters.ts       # Common shader filters (blur, sharpen, etc.)
```

## Usage

### In Render Materials

```typescript
import { createColormapNode } from '@/app/tsl/colormap';

// Create a material with colormap
const material = new THREE.MeshStandardNodeMaterial();
const colorNode = createColormapNode(scalarStorage, 'inferno', 0, 1);
material.colorNode = colorNode;
```

### In Compute Shaders

```typescript
import { createColormapNode } from '@/app/tsl/colormap';

// Use in a compute function
const computeFn = Fn(() => {
  const scalar = scalarStorage.element(computeIndex);
  const color = createColormapNode(scalar, 'viridis', 0, 1);
  outputBuffer.element(computeIndex).assign(color);
});
```

## Design Principles

1. **Pure Functions** - No side effects, no global state
2. **Composable** - Nodes can be chained and combined
3. **Type-Safe** - Use TypeScript for inputs/outputs
4. **Documented** - Clear JSDoc for all public APIs
5. **Tested** - Unit tests for shader logic (where possible)

## Colormap Module

The `colormap.ts` module provides color mapping functionality:

- **Supported Colormaps**: viridis, plasma, inferno, magma, cividis, turbo, coolwarm, grayscale
- **Static Mapping**: `createColormapNode()` - Fixed min/max range
- **Dynamic Mapping**: `createDynamicColormapNode()` - Runtime-adjustable range via uniforms

See [colormap.ts](./colormap.ts) for detailed API documentation.

## Contributing

When adding new TSL modules:

1. Keep functions pure (no external dependencies)
2. Export types for all public APIs
3. Add comprehensive JSDoc comments
4. Include usage examples in comments
5. Update this README with the new module
