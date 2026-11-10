import { BufferAttribute, BufferGeometry, Float16BufferAttribute, InterleavedBuffer, InterleavedBufferAttribute, type TypedArray } from 'three';
import { isFloat16Attribute, isInstancedAttribute, isInterleavedAttribute, type GeometryAttribute, type MorphAttributes } from './GeometryAttributes.js';
import * as Meshopt from './Meshopt.js';
import type { IndexArray } from './Simplify.js';

/**
 * Geometry without index that only contains the used vertices, and the remap from source to compacted vertices.
 * @internal
 */
export interface CompactedGeometry {
  geometry: BufferGeometry;
  remap: Uint32Array;
}

/**
 * Geometry without index shared by every level, and the index arrays of the levels remapped to it.
 * @internal
 */
export interface ReorderedGeometry {
  geometry: BufferGeometry;
  indexArrays: Uint32Array[];
}

interface ConcatenatedIndexArrays {
  indexArray: Uint32Array;
  views: Uint32Array[];
}

type InterleavedBuffers = Map<InterleavedBuffer, InterleavedBuffer>;
type TypedArrayConstructor = new (length: number) => TypedArray;

/**
 * Returns a geometry without index that shares the attributes of `geometry`.
 * @internal
 */
export function createSharedGeometry(geometry: BufferGeometry): BufferGeometry {
  const dstGeometry = createEmptyGeometry(geometry);
  const names = Object.keys(geometry.attributes);
  const srcMorphAttributes = geometry.morphAttributes as MorphAttributes;
  const dstMorphAttributes = dstGeometry.morphAttributes as MorphAttributes;
  const morphNames = Object.keys(srcMorphAttributes);

  for (let i = 0, l = names.length; i < l; i++) {
    const name = names[i];

    dstGeometry.setAttribute(name, geometry.getAttribute(name));
  }

  for (let i = 0, l = morphNames.length; i < l; i++) {
    const name = morphNames[i];

    dstMorphAttributes[name] = srcMorphAttributes[name].slice();
  }

  return dstGeometry;
}

/**
 * Remaps `indexArray` in place and returns a geometry without index that only contains the vertices it uses.
 * @internal
 */
export function compactGeometry(geometry: BufferGeometry, indexArray: Uint32Array): CompactedGeometry {
  const compacted = Meshopt.compactMesh(indexArray);
  const dstGeometry = remapGeometry(geometry, compacted.remap, compacted.verticesCount);

  return { geometry: dstGeometry, remap: compacted.remap };
}

/**
 * Returns a geometry without index whose vertex order lets coarser levels use a prefix of the vertices,
 * and the arrays of `indexArrays` remapped to it, as views of a single buffer: copy them before exposing them.
 * @internal
 */
export function reorderGeometry(geometry: BufferGeometry, indexArrays: IndexArray[]): ReorderedGeometry {
  const concatenated = concatCoarsestFirst(indexArrays);
  const compacted = compactGeometry(geometry, concatenated.indexArray);

  return { geometry: compacted.geometry, indexArrays: concatenated.views };
}

function concatCoarsestFirst(indexArrays: IndexArray[]): ConcatenatedIndexArrays {
  const levelsCount = indexArrays.length;
  const offsets = new Uint32Array(levelsCount);
  const views = new Array<Uint32Array>(levelsCount);
  let indicesCount = 0;

  for (let i = levelsCount - 1; i >= 0; i--) {
    offsets[i] = indicesCount;
    indicesCount += indexArrays[i].length;
  }

  const indexArray = new Uint32Array(indicesCount);

  for (let i = 0; i < levelsCount; i++) {
    const levelIndexArray = indexArrays[i];
    const offset = offsets[i];

    indexArray.set(levelIndexArray, offset);
    views[i] = indexArray.subarray(offset, offset + levelIndexArray.length);
  }

  return { indexArray, views };
}

function createEmptyGeometry(geometry: BufferGeometry): BufferGeometry {
  const dstGeometry = new BufferGeometry();

  dstGeometry.name = geometry.name;
  dstGeometry.userData = geometry.userData;
  dstGeometry.morphTargetsRelative = geometry.morphTargetsRelative;
  if (geometry.boundingBox !== null) dstGeometry.boundingBox = geometry.boundingBox.clone();
  if (geometry.boundingSphere !== null) dstGeometry.boundingSphere = geometry.boundingSphere.clone();

  return dstGeometry;
}

function remapGeometry(geometry: BufferGeometry, remap: Uint32Array, verticesCount: number): BufferGeometry {
  const dstGeometry = createEmptyGeometry(geometry);
  const interleavedBuffers: InterleavedBuffers = new Map();
  const names = Object.keys(geometry.attributes);

  for (let i = 0, l = names.length; i < l; i++) {
    const name = names[i];
    const attribute = remapAttribute(geometry.getAttribute(name), remap, verticesCount, interleavedBuffers);

    dstGeometry.setAttribute(name, attribute);
  }

  remapMorphAttributes(geometry, dstGeometry, remap, verticesCount, interleavedBuffers);

  return dstGeometry;
}

function remapMorphAttributes(srcGeometry: BufferGeometry, dstGeometry: BufferGeometry, remap: Uint32Array, verticesCount: number, interleavedBuffers: InterleavedBuffers): void {
  const srcMorphAttributes = srcGeometry.morphAttributes as MorphAttributes;
  const dstMorphAttributes = dstGeometry.morphAttributes as MorphAttributes;
  const names = Object.keys(srcMorphAttributes);

  for (let i = 0, l = names.length; i < l; i++) {
    const name = names[i];
    const srcList = srcMorphAttributes[name];
    const dstList = new Array<GeometryAttribute>(srcList.length);

    for (let j = 0, m = srcList.length; j < m; j++) {
      dstList[j] = remapAttribute(srcList[j], remap, verticesCount, interleavedBuffers);
    }

    dstMorphAttributes[name] = dstList;
  }
}

function remapAttribute(attribute: GeometryAttribute, remap: Uint32Array, verticesCount: number, interleavedBuffers: InterleavedBuffers): GeometryAttribute {
  if (isInstancedAttribute(attribute)) return attribute;
  if (isInterleavedAttribute(attribute)) return remapInterleavedAttribute(attribute, remap, verticesCount, interleavedBuffers);

  return remapBufferAttribute(attribute, remap, verticesCount);
}

function remapBufferAttribute(attribute: BufferAttribute, remap: Uint32Array, verticesCount: number): BufferAttribute {
  const itemSize = attribute.itemSize;
  const length = verticesCount * itemSize;
  const ArrayType = attribute.array.constructor as TypedArrayConstructor;
  const dstAttribute = isFloat16Attribute(attribute)
    ? new Float16BufferAttribute(length, itemSize, attribute.normalized)
    : new BufferAttribute(new ArrayType(length), itemSize, attribute.normalized);

  remapArray(attribute.array, dstAttribute.array, itemSize, remap);

  dstAttribute.name = attribute.name;
  dstAttribute.usage = attribute.usage;
  dstAttribute.gpuType = attribute.gpuType;

  return dstAttribute;
}

function remapInterleavedAttribute(attribute: InterleavedBufferAttribute, remap: Uint32Array, verticesCount: number, interleavedBuffers: InterleavedBuffers): InterleavedBufferAttribute {
  const buffer = getRemappedInterleavedBuffer(attribute.data, remap, verticesCount, interleavedBuffers);
  const dstAttribute = new InterleavedBufferAttribute(buffer, attribute.itemSize, attribute.offset, attribute.normalized);

  dstAttribute.name = attribute.name;

  return dstAttribute;
}

function getRemappedInterleavedBuffer(buffer: InterleavedBuffer, remap: Uint32Array, verticesCount: number, interleavedBuffers: InterleavedBuffers): InterleavedBuffer {
  const cachedBuffer = interleavedBuffers.get(buffer);

  if (cachedBuffer !== undefined) return cachedBuffer;

  const stride = buffer.stride;
  const ArrayType = buffer.array.constructor as TypedArrayConstructor;
  const dstBuffer = new InterleavedBuffer(new ArrayType(verticesCount * stride), stride);

  remapArray(buffer.array, dstBuffer.array, stride, remap);

  dstBuffer.usage = buffer.usage;
  interleavedBuffers.set(buffer, dstBuffer);

  return dstBuffer;
}

function remapArray(srcArray: TypedArray, dstArray: TypedArray, stride: number, remap: Uint32Array): void {
  for (let i = 0, l = remap.length; i < l; i++) {
    const dstVertex = remap[i];

    if (dstVertex === Meshopt.unusedVertex) continue;

    const srcIndex = i * stride;
    const dstIndex = dstVertex * stride;

    for (let j = 0; j < stride; j++) {
      dstArray[dstIndex + j] = srcArray[srcIndex + j];
    }
  }
}
