/**
 * visualizationControls.js
 * 
 * lil-gui-based visualization controls panel.
 * 
 * Responsibilities:
 * - Create GUI instance with folder hierarchy
 * - Bind controls to visualization state
 * - Trigger onChange callback on modifications
 * 
 * Rules:
 * - No direct three.js calls
 * - No scene/geometry access
 * - JSON-serializable state only
 * - No picker/interaction logic
 */

import GUI from 'lil-gui';

/**
 * Create visualization controls panel
 * 
 * @param {Object} config
 * @param {Object} config.vizState - Visualization state object
 * @param {Function} config.onChange - Callback invoked on any state change
 * @param {HTMLElement} config.container - Container element to append GUI to
 * @returns {GUI} GUI instance (for disposal)
 */
export function createVisualizationControls({ vizState, onChange, container }) {
  const gui = new GUI({ width: 280, title: '', container: container || undefined });
  
  // Position in top-right corner (relative to container)
  gui.domElement.style.position = 'absolute';
  gui.domElement.style.top = '10px';
  gui.domElement.style.right = '10px';
  gui.domElement.style.zIndex = '1000';
  gui.domElement.style.pointerEvents = 'auto';
  
  // Hide the root GUI title bar to make folders appear top-level
  const titleBar = gui.domElement.querySelector('.title');
  if (titleBar) {
    titleBar.style.display = 'none';
  }
  
  // Manifold folder - consolidated mesh rendering and helpers
  const manifoldFolder = gui.addFolder('Manifold');
  manifoldFolder.close(); // Collapsed by default
  
  // Material dropdown (replaces separate Visible + Wireframe checkboxes)
  manifoldFolder.add(vizState.surface, 'material', ['default', 'wireframe']).name('Material').onChange(onChange);
  
  // Wireframe color (when wireframe material is active)
  manifoldFolder.addColor(vizState.edges, 'color').name('Wireframe Color').onChange(onChange);
  
  // Geometry helpers - moved under Manifold
  manifoldFolder.add(vizState.helpers, 'vertexNormals').name('Vertex Normals').onChange(onChange);
  manifoldFolder.add(vizState.helpers, 'tangents').name('Tangents').onChange(onChange);
  
  // Field folder - scalar visualization controls
  const fieldFolder = gui.addFolder('Field');
  fieldFolder.close(); // Collapsed by default
  fieldFolder.add(vizState.scalar, 'colormap', [
    'viridis', 'plasma', 'inferno', 'magma', 'turbo',
    'rainbow', 'hot', 'cool', 'cooltowarm'
  ]).name('Colormap').onChange(onChange);
  fieldFolder.add(vizState.scalar, 'autoRange').name('Auto Range').onChange(onChange);
  fieldFolder.add(vizState.scalar, 'colorbar').name('Show Colorbar').onChange(onChange);
  
  return gui;
}
