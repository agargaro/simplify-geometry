import type { BufferAttribute, BufferGeometry, InstancedBufferAttribute, InterleavedBufferAttribute, TypedArray } from 'three';
import { protectedVertex } from './Meshopt.js';
import type { IndexArray } from './Simplify.js';

/** @internal */
export type GeometryAttribute = BufferAttribute | InterleavedBufferAttribute;

/** @internal */
export type MorphAttributes = Record<string, GeometryAttribute[]>;

/** @internal */
export function isInterleavedAttribute(attribute: GeometryAttribute): attribute is InterleavedBufferAttribute {
  return (attribute as Partial<InterleavedBufferAttribute>).isInterleavedBufferAttribute === true;
}

/**
 * Attributes renormalized after `updateVertices`: three.js uses these names for its normals and tangents.
 * @internal
 */
export function isDirectionAttribute(name: string): boolean {
  return name === 'normal' || name === 'tangent';
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
 * Returns the distance between two consecutive items in `attribute.array`.
 * @internal
 */
export function getItemStride(attribute: GeometryAttribute): number {
  return isInterleavedAttribute(attribute) ? attribute.data.stride : attribute.itemSize;
}

/**
 * Returns the position of the first item in `attribute.array`.
 * @internal
 */
export function getItemOffset(attribute: GeometryAttribute): number {
  return isInterleavedAttribute(attribute) ? attribute.offset : 0;
}

/**
 * Returns the value that a normalized integer array maps to 1, or 1 for any other array.
 * @internal
 */
export function getNormalizationScale(array: TypedArray): number {
  const type = array.constructor;

  if (type === Uint8Array || type === Uint8ClampedArray) return 255;
  if (type === Int8Array) return 127;
  if (type === Uint16Array) return 65535;
  if (type === Int16Array) return 32767;
  if (type === Uint32Array) return 4294967295;
  if (type === Int32Array) return 2147483647;

  return 1;
}

/**
 * Returns the index array of a geometry already checked by `validateGeometry`.
 * @internal
 */
export function getIndexArray(geometry: BufferGeometry): IndexArray {
  return (geometry.index as BufferAttribute).array as IndexArray;
}

/**
 * Returns the position array of a geometry already checked by `validateGeometry`.
 * @internal
 */
export function getPositionArray(geometry: BufferGeometry): Float32Array {
  return geometry.getAttribute('position').array as Float32Array;
}

/**
 * Returns a copy of `vertexLock`, or a new lock, where every vertex of a position shared by vertices with different values
 * of the `names` attributes is protected (2). Vertices already locked keep their value.
 * @internal
 */
export function createSeamLock(geometry: BufferGeometry, names: string[], positionRemap: Uint32Array, vertexLock?: Uint8Array): Uint8Array {
  const lock = vertexLock === undefined ? new Uint8Array(positionRemap.length) : vertexLock.slice();
  const seamPositions = new Uint8Array(positionRemap.length);

  for (let i = 0, l = names.length; i < l; i++) {
    markSeamPositions(seamPositions, geometry.getAttribute(names[i]), positionRemap);
  }

  protectSeamVertices(lock, seamPositions, positionRemap);

  return lock;
}

function protectSeamVertices(lock: Uint8Array, seamPositions: Uint8Array, positionRemap: Uint32Array): void {
  for (let i = 0, l = positionRemap.length; i < l; i++) {
    const isSeamVertex = seamPositions[positionRemap[i]] === 1;

    if (isSeamVertex && lock[i] === 0) lock[i] = protectedVertex;
  }
}

function markSeamPositions(seamPositions: Uint8Array, attribute: GeometryAttribute, positionRemap: Uint32Array): void {
  const array = attribute.array;
  const stride = getItemStride(attribute);
  const offset = getItemOffset(attribute);
  const itemSize = attribute.itemSize;

  for (let i = 0, l = positionRemap.length; i < l; i++) {
    const canonicalVertex = positionRemap[i];

    if (canonicalVertex === i) continue;

    const index = i * stride + offset;
    const canonicalIndex = canonicalVertex * stride + offset;

    for (let j = 0; j < itemSize; j++) {
      if (array[index + j] !== array[canonicalIndex + j]) seamPositions[canonicalVertex] = 1;
    }
  }
}
