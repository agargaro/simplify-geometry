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

const protectedVertex = 2;

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

  for (let i = 0, l = positionRemap.length; i < l; i++) {
    if (seamPositions[positionRemap[i]] === 1 && lock[i] === 0) lock[i] = protectedVertex;
  }

  return lock;
}

function markSeamPositions(seamPositions: Uint8Array, attribute: GeometryAttribute, positionRemap: Uint32Array): void {
  const isInterleaved = isInterleavedAttribute(attribute);
  const array = attribute.array;
  const stride = isInterleaved ? attribute.data.stride : attribute.itemSize;
  const offset = isInterleaved ? attribute.offset : 0;
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
