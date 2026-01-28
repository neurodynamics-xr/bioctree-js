/**
 * @file stateManager.js
 * Centralized application state manager with finite state machine
 * 
 * Purpose:
 * - Single source of truth for application state
 * - Gate user actions based on current state
 * - Prevent race conditions with request tokens
 * - Handle async operations (loading, computing)
 * - Coordinate between MATLAB and JavaScript
 * 
 * Architecture:
 * - Top-level FSM: idle → loading → ready → computing → ready
 * - Sub-state slices: mesh, compute, viz, data
 * - Event-driven transitions
 * - Request token system for async operations
 */

/**
 * Top-level application states
 */
export const AppState = {
  IDLE: 'idle',           // No mesh loaded
  LOADING: 'loading',     // Asset/data load in progress
  READY: 'ready',         // Interactive, stable
  COMPUTING: 'computing', // Compute job running
  ERROR: 'error',         // Recoverable error
  CANCELING: 'canceling'  // Canceling operation
};

/**
 * Module-specific states
 */
export const MeshStatus = {
  NONE: 'none',
  LOADING: 'loading',
  LOADED: 'loaded',
  FAILED: 'failed'
};

export const ComputeStatus = {
  IDLE: 'idle',
  RUNNING: 'running',
  FAILED: 'failed'
};

export const VizStatus = {
  IDLE: 'idle',
  ATTACHED: 'attached',
  RENDERING: 'rendering',
  FAILED: 'failed'
};

export const DataStatus = {
  NONE: 'none',
  LOADING: 'loading',
  READY: 'ready',
  FAILED: 'failed'
};

/**
 * Event types for state transitions
 */
export const StateEvent = {
  // Mesh events
  LOAD_MESH_REQUESTED: 'LOAD_MESH_REQUESTED',
  LOAD_MESH_PROGRESS: 'LOAD_MESH_PROGRESS',
  LOAD_MESH_SUCCEEDED: 'LOAD_MESH_SUCCEEDED',
  LOAD_MESH_FAILED: 'LOAD_MESH_FAILED',
  CLEAR_MESH_REQUESTED: 'CLEAR_MESH_REQUESTED',
  
  // Data events
  LOAD_DATA_REQUESTED: 'LOAD_DATA_REQUESTED',
  LOAD_DATA_SUCCEEDED: 'LOAD_DATA_SUCCEEDED',
  LOAD_DATA_FAILED: 'LOAD_DATA_FAILED',
  CLEAR_DATA_REQUESTED: 'CLEAR_DATA_REQUESTED',
  
  // Compute events
  COMPUTE_REQUESTED: 'COMPUTE_REQUESTED',
  COMPUTE_PROGRESS: 'COMPUTE_PROGRESS',
  COMPUTE_SUCCEEDED: 'COMPUTE_SUCCEEDED',
  COMPUTE_FAILED: 'COMPUTE_FAILED',
  
  // Control events
  CANCEL_REQUESTED: 'CANCEL_REQUESTED',
  CANCEL_COMPLETED: 'CANCEL_COMPLETED',
  ERROR_RECOVERED: 'ERROR_RECOVERED',
  RESET_REQUESTED: 'RESET_REQUESTED'
};

/**
 * StateManager - Manages application state machine
 */
export class StateManager {
  constructor() {
    // Top-level state
    this.state = AppState.IDLE;
    
    // Module sub-states
    this.mesh = {
      status: MeshStatus.NONE,
      vertexCount: 0,
      faceCount: 0,
      bounds: null
    };
    
    this.compute = {
      status: ComputeStatus.IDLE,
      operation: null,
      progress: 0,
      requestId: null
    };
    
    this.viz = {
      status: VizStatus.IDLE,
      material: 'default',
      helpers: {
        vertexNormals: false,
        tangents: false
      }
    };
    
    this.data = {
      status: DataStatus.NONE,
      type: null, // 'scalar' | 'vector' | null
      count: 0,
      range: [0, 1]
    };
    
    // Request token counter (for async operations)
    this.requestCounter = 0;
    
    // Event listeners
    this.listeners = new Map();
    
    // State transition history (for debugging)
    this.history = [];
    this.maxHistorySize = 50;
  }
  
  /**
   * Get current application state
   */
  getState() {
    return this.state;
  }
  
  /**
   * Get full state snapshot
   */
  getSnapshot() {
    return {
      state: this.state,
      mesh: { ...this.mesh },
      compute: { ...this.compute },
      viz: { ...this.viz },
      data: { ...this.data }
    };
  }
  
  /**
   * Generate unique request token
   */
  generateRequestId() {
    return ++this.requestCounter;
  }
  
  /**
   * Check if action is allowed in current state
   */
  canPerformAction(action) {
    const allowedActions = this._getAllowedActions(this.state);
    return allowedActions.includes(action);
  }
  
  /**
   * Get allowed actions for a state
   * @private
   */
  _getAllowedActions(state) {
    switch (state) {
      case AppState.IDLE:
        return ['LOAD_MESH_REQUESTED', 'RESET_REQUESTED'];
        
      case AppState.LOADING:
        return ['CANCEL_REQUESTED'];
        
      case AppState.READY:
        return [
          'LOAD_MESH_REQUESTED',
          'CLEAR_MESH_REQUESTED',
          'LOAD_DATA_REQUESTED',
          'CLEAR_DATA_REQUESTED',
          'COMPUTE_REQUESTED',
          'RESET_REQUESTED'
        ];
        
      case AppState.COMPUTING:
        return ['CANCEL_REQUESTED'];
        
      case AppState.ERROR:
        return ['ERROR_RECOVERED', 'RESET_REQUESTED'];
        
      case AppState.CANCELING:
        return [];
        
      default:
        return [];
    }
  }
  
  /**
   * Dispatch event to trigger state transition
   */
  dispatch(event, payload = {}) {
    const previousState = this.state;
    const previousSnapshot = this.getSnapshot();
    
    // Process event
    this._processEvent(event, payload);
    
    // Record transition
    this._recordTransition(previousState, event, payload);
    
    // Notify listeners
    this._notifyListeners(event, previousSnapshot, this.getSnapshot());
    
    return this.state;
  }
  
  /**
   * Process event and update state
   * @private
   */
  _processEvent(event, payload) {
    switch (event) {
      // Mesh loading
      case StateEvent.LOAD_MESH_REQUESTED:
        this.state = AppState.LOADING;
        this.mesh.status = MeshStatus.LOADING;
        // Use requestId from payload if provided, otherwise generate one
        this.mesh.requestId = payload.requestId || this.generateRequestId();
        break;
        
      case StateEvent.LOAD_MESH_SUCCEEDED:
        if (payload.requestId && payload.requestId !== this.mesh.requestId) {
          // Stale response - ignore
          return;
        }
        this.state = AppState.READY;
        this.mesh.status = MeshStatus.LOADED;
        this.mesh.vertexCount = payload.vertexCount || 0;
        this.mesh.faceCount = payload.faceCount || 0;
        this.mesh.bounds = payload.bounds || null;
        this.viz.status = VizStatus.ATTACHED;
        break;
        
      case StateEvent.LOAD_MESH_FAILED:
        this.state = AppState.ERROR;
        this.mesh.status = MeshStatus.FAILED;
        this.mesh.error = payload.error;
        break;
        
      case StateEvent.CLEAR_MESH_REQUESTED:
        this.state = AppState.IDLE;
        this.mesh.status = MeshStatus.NONE;
        this.mesh.vertexCount = 0;
        this.mesh.faceCount = 0;
        this.mesh.bounds = null;
        this.viz.status = VizStatus.IDLE;
        // Also clear data
        this.data.status = DataStatus.NONE;
        this.data.type = null;
        this.data.count = 0;
        break;
        
      // Data loading
      case StateEvent.LOAD_DATA_REQUESTED:
        this.data.status = DataStatus.LOADING;
        // Use requestId from payload if provided, otherwise generate one
        this.data.requestId = payload.requestId || this.generateRequestId();
        break;
        
      case StateEvent.LOAD_DATA_SUCCEEDED:
        if (payload.requestId && payload.requestId !== this.data.requestId) {
          // Stale response - ignore
          return;
        }
        this.data.status = DataStatus.READY;
        this.data.type = payload.type || 'scalar';
        this.data.count = payload.count || 0;
        this.data.range = payload.range || [0, 1];
        break;
        
      case StateEvent.LOAD_DATA_FAILED:
        this.data.status = DataStatus.FAILED;
        this.data.error = payload.error;
        break;
        
      case StateEvent.CLEAR_DATA_REQUESTED:
        this.data.status = DataStatus.NONE;
        this.data.type = null;
        this.data.count = 0;
        this.data.range = [0, 1];
        break;
        
      // Compute operations
      case StateEvent.COMPUTE_REQUESTED:
        this.state = AppState.COMPUTING;
        this.compute.status = ComputeStatus.RUNNING;
        this.compute.operation = payload.operation;
        this.compute.progress = 0;
        this.compute.requestId = this.generateRequestId();
        break;
        
      case StateEvent.COMPUTE_PROGRESS:
        if (payload.requestId && payload.requestId !== this.compute.requestId) {
          // Stale progress - ignore
          return;
        }
        this.compute.progress = payload.progress || 0;
        break;
        
      case StateEvent.COMPUTE_SUCCEEDED:
        if (payload.requestId && payload.requestId !== this.compute.requestId) {
          // Stale response - ignore
          return;
        }
        this.state = AppState.READY;
        this.compute.status = ComputeStatus.IDLE;
        this.compute.operation = null;
        this.compute.progress = 0;
        break;
        
      case StateEvent.COMPUTE_FAILED:
        this.state = AppState.ERROR;
        this.compute.status = ComputeStatus.FAILED;
        this.compute.error = payload.error;
        break;
        
      // Control
      case StateEvent.CANCEL_REQUESTED:
        this.state = AppState.CANCELING;
        break;
        
      case StateEvent.CANCEL_COMPLETED:
        this.state = AppState.READY;
        this.compute.status = ComputeStatus.IDLE;
        this.compute.operation = null;
        break;
        
      case StateEvent.ERROR_RECOVERED:
        if (this.mesh.status === MeshStatus.LOADED) {
          this.state = AppState.READY;
        } else {
          this.state = AppState.IDLE;
        }
        this.compute.status = ComputeStatus.IDLE;
        break;
        
      case StateEvent.RESET_REQUESTED:
        this._reset();
        break;
    }
  }
  
  /**
   * Reset to initial state
   * @private
   */
  _reset() {
    this.state = AppState.IDLE;
    this.mesh.status = MeshStatus.NONE;
    this.mesh.vertexCount = 0;
    this.mesh.faceCount = 0;
    this.mesh.bounds = null;
    this.compute.status = ComputeStatus.IDLE;
    this.compute.operation = null;
    this.compute.progress = 0;
    this.viz.status = VizStatus.IDLE;
    this.data.status = DataStatus.NONE;
    this.data.type = null;
    this.data.count = 0;
  }
  
  /**
   * Record state transition in history
   * @private
   */
  _recordTransition(previousState, event, payload) {
    this.history.push({
      timestamp: Date.now(),
      previousState,
      event,
      payload,
      newState: this.state
    });
    
    // Trim history if too large
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }
  
  /**
   * Subscribe to state changes
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    
    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    };
  }
  
  /**
   * Notify listeners of state change
   * @private
   */
  _notifyListeners(event, previousSnapshot, currentSnapshot) {
    // Notify event-specific listeners
    const eventListeners = this.listeners.get(event) || [];
    eventListeners.forEach(cb => {
      try {
        cb(currentSnapshot, previousSnapshot);
      } catch (err) {
        console.error('[StateManager] Listener error:', err);
      }
    });
    
    // Notify global listeners (subscribed to '*')
    const globalListeners = this.listeners.get('*') || [];
    globalListeners.forEach(cb => {
      try {
        cb(event, currentSnapshot, previousSnapshot);
      } catch (err) {
        console.error('[StateManager] Global listener error:', err);
      }
    });
  }
  
  /**
   * Get state transition history
   */
  getHistory() {
    return [...this.history];
  }
  
  /**
   * Clear history
   */
  clearHistory() {
    this.history = [];
  }
}
