/**
 * index.ts
 * 
 * Main exports for the field module.
 * This module handles field object creation, metadata, and provenance.
 */

export {
  Field,
  createFieldObject,
  generateFieldId,
  validateFieldCount,
  getExpectedCount,
  getFieldInfo,
  type FieldDomain,
  type FieldValueType,
  type FieldMetadata,
  type FieldProvenance,
  type FieldCreateOptions
} from './Field';
