/**
 * Lightweight scalar field types for procedural visualization
 */

export type ScalarFieldContext = {
  positionNode: any; // TSL vec3 node, e.g. positionLocal
  timeNode: any;     // TSL float node, e.g. time
};

export type ScalarField = {
  id: string;
  domain: "vertex";
  defaultRange: { min: number; max: number };
  buildScalarNode: (ctx: ScalarFieldContext) => any; // returns TSL float node
};
