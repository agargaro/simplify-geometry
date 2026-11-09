import type { BufferAttribute, BufferGeometry, InstancedBufferAttribute, InterleavedBufferAttribute } from 'three';
import type { IndexArray } from './Simplify.js';

/** @internal */
export type GeometryAttribute = BufferAttribute | InterleavedBufferAttribute;

/** @internal */
export type MorphAttributes = Record<string, GeometryAttribute[]>;

/**
 * Value of a remap entry for a vertex that is not used by the remapped indices.
 * @internal
 */
export const unusedVertex = 0xffffffff;

/** @internal */
export function isInterleavedAttribute(attribute: GeometryAttribute): attribute is InterleavedBufferAttribute {
  return (attribute as Partial<InterleavedBufferAttribute>).isInterleavedBufferAttribute === true;
}

/** @internal */
export function isFloat16Attribute(attribute: GeometryAttribute): boolean {
  return (attribute as Partial<{ isFloat16BufferAttribute: boolean }>).isFloat16BufferAttribute === true;
}

/** @internal */
export function isInstancedAttribute(attribute: GeometryAttribute): boolean {
  if ((attribute as Partial<InstancedBufferAttribute>).isInstancedBufferAttribute === true) return true;
  if (!isInterleavedAttribute(attribute)) return false;

  return (attribute.data as Partial<{ isInstancedInterleavedBuffer: boolean }>).isInstancedInterleavedBuffer === true;
}

/**
 * Returns the index array of a geometry already checked by `validateGeometry`.
 * @internal
 */
export function getIndexArray(geometry: BufferGeometry): IndexArray {
  return (geometry.index as BufferAttribute).array as IndexArray;
}
