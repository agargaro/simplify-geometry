import type { BufferGeometry, InterleavedBufferAttribute, TypedArray } from 'three';
import type { SimplifyAttributes } from './Simplify.js';
import type { GeometryAttribute } from './RemapGeometry.js';
import { validateAttributeComponents, validateAttributeWeight, validateWeightedAttribute } from './Validation.js';

export type AttributeWeights = Record<string, number | number[]>;

/** @internal */
export function packAttributes(geometry: BufferGeometry, attributeWeights?: AttributeWeights): SimplifyAttributes | undefined {
  if (attributeWeights === undefined) return undefined;

  const names = Object.keys(attributeWeights);
  const verticesCount = geometry.getAttribute('position').count;
  const weights: number[] = [];

  for (let i = 0, l = names.length; i < l; i++) {
    const attribute = getAttribute(geometry, names[i]);

    pushWeights(weights, attributeWeights[names[i]], attribute.itemSize, names[i]);
  }

  validateAttributeComponents(weights.length);

  const array = new Float32Array(weights.length * verticesCount);

  writeAttributes(array, weights.length, geometry, names);

  return { array, stride: weights.length, weights };
}

function getAttribute(geometry: BufferGeometry, name: string): GeometryAttribute {
  validateWeightedAttribute(geometry, name);

  return geometry.getAttribute(name);
}

function pushWeights(weights: number[], weight: number | number[], itemSize: number, name: string): void {
  validateAttributeWeight(weight, itemSize, name);

  const isWeightList = Array.isArray(weight);

  for (let i = 0; i < itemSize; i++) {
    weights.push(isWeightList ? weight[i] : weight);
  }
}

function writeAttributes(dstArray: Float32Array, dstStride: number, geometry: BufferGeometry, names: string[]): void {
  let dstOffset = 0;

  for (let i = 0, l = names.length; i < l; i++) {
    const attribute = geometry.getAttribute(names[i]);

    writeAttribute(dstArray, dstStride, dstOffset, attribute);
    dstOffset += attribute.itemSize;
  }
}

function writeAttribute(dstArray: Float32Array, dstStride: number, dstOffset: number, attribute: GeometryAttribute): void {
  const isInterleaved = (attribute as Partial<InterleavedBufferAttribute>).isInterleavedBufferAttribute === true;
  const srcArray = isInterleaved ? (attribute as InterleavedBufferAttribute).data.array : attribute.array;
  const srcStride = isInterleaved ? (attribute as InterleavedBufferAttribute).data.stride : attribute.itemSize;
  const srcOffset = isInterleaved ? (attribute as InterleavedBufferAttribute).offset : 0;
  const itemSize = attribute.itemSize;
  const divisor = attribute.normalized ? getNormalizationScale(srcArray) : 1;
  const minValue = attribute.normalized ? -1 : -Infinity;

  for (let i = 0, l = attribute.count; i < l; i++) {
    const dstIndex = i * dstStride + dstOffset;
    const srcIndex = i * srcStride + srcOffset;

    for (let j = 0; j < itemSize; j++) {
      dstArray[dstIndex + j] = Math.max(srcArray[srcIndex + j] / divisor, minValue);
    }
  }
}

function getNormalizationScale(array: TypedArray): number {
  const type = array.constructor;

  if (type === Float32Array) return 1;
  if (type === Uint8Array || type === Uint8ClampedArray) return 255;
  if (type === Int8Array) return 127;
  if (type === Uint16Array) return 65535;
  if (type === Int16Array) return 32767;
  if (type === Uint32Array) return 4294967295;
  if (type === Int32Array) return 2147483647;

  throw new TypeError('"geometry" normalized attributes must use an integer or Float32Array component type.');
}
