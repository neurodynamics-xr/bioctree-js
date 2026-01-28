/**
 * @fileoverview Colorbar UI overlay for scalar field visualization
 * 
 * Displays:
 * - Vertical gradient bar showing the current colormap
 * - Min/max value labels
 * - Compact overlay positioned in corner
 */

import { createColormap } from '../visualization/colormaps.js';

/**
 * Colorbar UI overlay
 */
export class Colorbar {
  /**
   * @param {HTMLElement} container - Parent container (e.g., canvas.parentElement)
   */
  constructor(container) {
    this.container = container;
    this.element = null;
    this.canvas = null;
    this.ctx = null;
    
    // State
    this.visible = false;
    this.colormap = 'inferno';
    this.min = 0;
    this.max = 1;
    
    // Dimensions (horizontal bar)
    this.width = 150;
    this.height = 12;
    this.samples = 256;
    
    this.create();
  }
  
  /**
   * Create DOM structure
   * @private
   */
  create() {
    // Container div
    this.element = document.createElement('div');
    this.element.style.cssText = `
      position: absolute;
      bottom: 15px;
      right: 15px;
      display: none;
      flex-direction: row;
      align-items: center;
      gap: 6px;
      font-family: monospace;
      font-size: 10px;
      color: #fff;
      text-shadow: 0 0 3px rgba(0,0,0,0.8);
      pointer-events: none;
      z-index: 100;
    `;
    
    // Min label (left)
    this.minLabel = document.createElement('div');
    this.minLabel.textContent = '0.000';
    this.element.appendChild(this.minLabel);
    
    // Canvas for gradient
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.canvas.style.cssText = `
      border: 1px solid rgba(255,255,255,0.4);
      box-shadow: 0 1px 4px rgba(0,0,0,0.6);
    `;
    this.ctx = this.canvas.getContext('2d');
    this.element.appendChild(this.canvas);
    
    // Max label (right)
    this.maxLabel = document.createElement('div');
    this.maxLabel.textContent = '1.000';
    this.element.appendChild(this.maxLabel);
    
    this.container.appendChild(this.element);
  }
  
  /**
   * Set visibility
   * @param {boolean} visible
   */
  setVisible(visible) {
    this.visible = visible;
    this.element.style.display = visible ? 'flex' : 'none';
  }
  
  /**
   * Update colormap and range
   * @param {string} colormap - Colormap name
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   */
  update(colormap, min, max) {
    this.colormap = colormap;
    this.min = min;
    this.max = max;
    
    this.render();
    this.updateLabels();
  }
  
  /**
   * Render gradient to canvas
   * @private
   */
  render() {
    try {
      const colors = createColormap(this.colormap, this.samples);
      
      if (!colors || !Array.isArray(colors)) {
        console.error('[Colorbar] Invalid colormap array:', this.colormap);
        return;
      }
      
      // Draw horizontal gradient from left (min) to right (max)
      for (let i = 0; i < this.samples; i++) {
        const x = (i / this.samples) * this.width;
        const color = colors[i]; // Left-to-right: min to max
        
        if (!color) {
          console.error('[Colorbar] Missing color at index:', i);
          continue;
        }
        
        this.ctx.fillStyle = `rgb(${color.r * 255}, ${color.g * 255}, ${color.b * 255})`;
        this.ctx.fillRect(x, 0, Math.ceil(this.width / this.samples) + 1, this.height);
      }
    } catch (err) {
      console.error('[Colorbar] Render error:', err);
    }
  }
  
  /**
   * Update min/max labels
   * @private
   */
  updateLabels() {
    this.maxLabel.textContent = this.formatValue(this.max);
    this.minLabel.textContent = this.formatValue(this.min);
  }
  
  /**
   * Format numeric value for display
   * @param {number} value
   * @returns {string}
   * @private
   */
  formatValue(value) {
    const numValue = Number(value);
    if (isNaN(numValue)) return '0.0';
    
    if (Math.abs(numValue) >= 100) {
      return numValue.toExponential(1);
    } else if (Math.abs(numValue) >= 1) {
      return numValue.toFixed(1);
    } else {
      return numValue.toFixed(2);
    }
  }
  
  /**
   * Dispose resources
   */
  dispose() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
    this.canvas = null;
    this.ctx = null;
  }
}
