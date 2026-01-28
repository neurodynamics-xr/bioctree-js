/**
 * field.ts
 * 
 * Field state manager - tracks current/active field and field registry.
 * 
 * This module ONLY manages state (which field is active, which fields exist).
 * Field creation and data ownership is handled by app/field/Field.ts.
 * 
 * Unlike manifold.ts (single source of truth), this manages multiple fields
 * but tracks a "current" field that is displayed/visualized.
 */

import { Field } from '../field/Field';

// State
let currentField: Field | null = null;
let fieldRegistry: Map<string, Field> = new Map();
let currentFieldListeners: Set<(field: Field | null) => void> = new Set();
let registryListeners: Set<(fields: Field[]) => void> = new Set();

/**
 * Register a field
 * 
 * By default, replaces the current field and adds to registry.
 * Use options.setAsCurrent = false to only add to registry.
 * Use options.addToRegistry = false to only update current field.
 * 
 * @param field - Field instance
 * @param options - Registration options
 * @returns Field ID
 */
export function registerField(
  field: Field,
  options?: {
    setAsCurrent?: boolean;
    addToRegistry?: boolean;
  }
): string {
  const {
    setAsCurrent = true,
    addToRegistry = true
  } = options || {};

  const fieldId = field.metadata.id;
  const fieldName = field.metadata.name;

  // Add to registry
  if (addToRegistry) {
    fieldRegistry.set(fieldId, field);
    notifyRegistryListeners();
  }

  // Set as current field
  if (setAsCurrent) {
    currentField = field;
    notifyCurrentFieldListeners();
  }

  return fieldId;
}

/**
 * Set the current field by ID
 */
export function setCurrentField(fieldId: string): void {
  const field = fieldRegistry.get(fieldId);
  
  if (!field) {
    return;
  }

  currentField = field;
  notifyCurrentFieldListeners();
}

/**
 * Get the current field
 */
export function getCurrentField(): Field | null {
  return currentField;
}

/**
 * Clear the current field (doesn't remove from registry)
 */
export function clearCurrentField(): void {
  currentField = null;
  notifyCurrentFieldListeners();
}

/**
 * Get a field by ID from registry
 */
export function getField(fieldId: string): Field | null {
  return fieldRegistry.get(fieldId) || null;
}

/**
 * Get all fields from registry
 */
export function getAllFields(): Field[] {
  return Array.from(fieldRegistry.values());
}

/**
 * Delete a field from registry
 */
export function deleteField(fieldId: string): void {
  const field = fieldRegistry.get(fieldId);
  
  if (!field) {
    return;
  }

  // Clear current field if it's the one being deleted
  if (currentField?.metadata.id === fieldId) {
    clearCurrentField();
  }

  fieldRegistry.delete(fieldId);
  notifyRegistryListeners();
}

/**
 * Register listener for current field changes
 */
export function onCurrentFieldChange(listener: (field: Field | null) => void): () => void {
  currentFieldListeners.add(listener);
  
  // Return unsubscribe function
  return () => {
    currentFieldListeners.delete(listener);
  };
}

/**
 * Subscribe to field registry changes
 */
export function onFieldRegistryChange(listener: (fields: Field[]) => void): () => void {
  registryListeners.add(listener);
  
  // Return unsubscribe function
  return () => {
    registryListeners.delete(listener);
  };
}

/**
 * Notify listeners of current field change
 */
function notifyCurrentFieldListeners(): void {
  currentFieldListeners.forEach(listener => {
    try {
      listener(currentField);
    } catch (error) {
    }
  });
}

/**
 * Notify listeners of registry change
 */
function notifyRegistryListeners(): void {
  const fields = getAllFields();
  registryListeners.forEach(listener => {
    try {
      listener(fields);
    } catch (error) {
    }
  });
}


