/**
 * @fileoverview ViewerUI - UI component management layer
 * 
 * Responsibilities:
 * - Loader overlay (show/hide/progress)
 * - HUD messages
 * - Animation timing and transitions
 * - UI initialization and lifecycle
 * 
 * Rules:
 * - No data loading logic
 * - No Three.js scene manipulation
 * - Pure UI state and DOM manipulation
 * - Provides callbacks for completion events
 */

const LOADER_COMPONENT_PATH = "./ui/loading-indicators/spinning/spinning.html";
const DEFAULT_LOAD_ANIMATION_DURATION = 1500; // ms

/**
 * ViewerUI - Manages all UI components (loader, HUD, overlays)
 */
export class ViewerUI {
  constructor(options = {}) {
    this.hudElement = options.hudElement || null;
    this.loaderElement = options.loaderElement || null;
    this.loadAnimationDuration = options.loadAnimationDuration || DEFAULT_LOAD_ANIMATION_DURATION;
    
    // State
    this.isLoaderVisible = false;
  }

  /**
   * Initialize loader component
   * @returns {Promise<void>}
   */
  async initLoader() {
    if (!this.loaderElement) {
      console.warn("[ViewerUI] No loader element provided");
      return;
    }

    try {
      const response = await fetch(LOADER_COMPONENT_PATH);
      const html = await response.text();
      this.loaderElement.innerHTML = html;
    } catch (err) {
      console.error("[ViewerUI] Failed to load loader component:", err);
      // Fallback: simple loading text
      this.loaderElement.innerHTML = '<div style="color: #eaeaea; font-size: 14px;">Loading...</div>';
    }
  }

  /**
   * Show loader overlay
   */
  showLoader() {
    const el = document.getElementById("loaderOverlay");
    if (!el) {
      console.warn("[ViewerUI] Loader overlay element not found");
      return;
    }
    el.classList.remove("hidden");
    el.style.display = "flex";
    this.isLoaderVisible = true;
  }

  /**
   * Hide loader overlay
   */
  hideLoader() {
    const el = document.getElementById("loaderOverlay");
    if (!el) return;
    el.classList.add("hidden");
    this.isLoaderVisible = false;
  }

  /**
   * Set loader progress (0-100)
   * @param {number} percent - Progress percentage
   */
  setLoaderProgress(percent) {
    const progressBar = document.getElementById("loaderProgress");
    if (progressBar) {
      progressBar.style.width = `${percent}%`;
    }
  }

  /**
   * Update HUD message
   * @param {string} text - Message to display
   */
  setHud(text) {
    if (!this.hudElement) return;
    this.hudElement.textContent = String(text);
  }

  /**
   * Show loading state with message
   * @param {string} message - Loading message
   */
  startLoading(message = "Loading...") {
    this.showLoader();
    this.setLoaderProgress(0);
    this.setHud(message);
  }

  /**
   * Complete loading with success message and animated transition
   * @param {string} message - Success message
   * @param {Function} onComplete - Callback when animation completes
   */
  completeLoading(message = "Loaded", onComplete = null) {
    this.setLoaderProgress(100);
    this.setHud(message);

    // Animate out after delay
    requestAnimationFrame(() => {
      setTimeout(() => {
        this.hideLoader();
        if (onComplete) onComplete();
      }, this.loadAnimationDuration);
    });
  }

  /**
   * Show error state
   * @param {Error|string} error - Error to display
   */
  showError(error) {
    const message = error instanceof Error ? error.message : String(error);
    this.setHud(`Error: ${message}`);
    this.hideLoader();
    console.error("[ViewerUI] Error:", error);
  }

  /**
   * Execute async operation with loading UI
   * @param {Function} operation - Async operation to execute
   * @param {Object} options - UI options
   * @param {string} options.loadingMessage - Message during loading
   * @param {string} options.successMessage - Message on success
   * @param {Function} options.onComplete - Callback after UI animation completes
   * @returns {Promise<any>} - Result of operation
   */
  async withLoadingUI(operation, options = {}) {
    const {
      loadingMessage = "Loading...",
      successMessage = "Loaded",
      onComplete = null
    } = options;

    this.startLoading(loadingMessage);

    try {
      const result = await operation();
      this.completeLoading(successMessage, onComplete);
      return result;
    } catch (err) {
      this.showError(err);
      throw err;
    }
  }

  /**
   * Clear all UI state
   */
  clear() {
    this.hideLoader();
    this.setHud("");
  }
}
