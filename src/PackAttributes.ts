import type { BufferGeometry, TypedArray } from 'three';
import { isInterleavedAttribute, unusedVertex, type GeometryAttribute } from './GeometryAttributes.js';
import type { SimplifyAttributes } from './Simplify.js';
import { hasPositiveWeight, validateAttributeComponents, validateAttributeWeight, validateWeightedAttribute } from './Validation.js';

export type AttributeWeights = Record<string, number | number[]>;

/** @internal */
export interface PackedAttributes extends SimplifyAttributes {
  names: string[];
}

/**
 * Attributes whose weights are all 0 do not affect meshoptimizer and are not packed.
 * @internal
 */
export function packAttributes(geometry: BufferGeometry, attributeWeights?: AttributeWeights): PackedAttributes | undefined {
  if (attributeWeights === undefined) return undefined;

  const names = getWeightedNames(geometry, attributeWeights);

  if (names.length === 0) return undefined;

  const weights = getWeights(geometry, attributeWeights, names);
  const stride = weights.length;
  const array = new Float32Array(stride * geometry.getAttribute('position').count);

  writeAttributes(array, stride, geometry, names);

  return { array, stride, weights, names };
}

/**
 * Writes the positions and packed attributes updated by meshoptimizer to `geometry`, the level compacted with `remap`.
 * Normals and tangents are renormalized.
 * @internal
 */
export function unpackAttributes(geometry: BufferGeometry, remap: Uint32Array, positionArray: Float32Array, attributes?: PackedAttributes): void {
  readAttribute(positionArray, 3, 0, geometry.getAttribute('position'), remap);

  if (attributes === undefined) return;

  const names = attributes.names;
  let srcOffset = 0;

  for (let i = 0, l = names.length; i < l; i++) {
    const attribute = geometry.getAttribute(names[i]);
    const isDirection = names[i] === 'normal' || names[i] === 'tangent';

    if (isDirection) normalizeDirections(attributes.array, attributes.stride, srcOffset, remap);

    readAttribute(attributes.array, attributes.stride, srcOffset, attribute, remap);
    srcOffset += attribute.itemSize;
  }
}

function getWeightedNames(geometry: BufferGeometry, attributeWeights: AttributeWeights): string[] {
  const names = Object.keys(attributeWeights);
  const weightedNames: string[] = [];

  for (let i = 0, l = names.length; i < l; i++) {
    const name = names[i];
    const weight = attributeWeights[name];

    validateWeightedAttribute(geometry, name);
    validateAttributeWeight(weight, geometry.getAttribute(name).itemSize, name);

    if (hasPositiveWeight(weight)) weightedNames.push(name);
  }

  return weightedNames;
}

function getWeights(geometry: BufferGeometry, attributeWeights: AttributeWeights, names: string[]): number[] {
  const weights: number[] = [];

  for (let i = 0, l = names.length; i < l; i++) {
    const weight = attributeWeights[names[i]];
    const itemSize = geometry.getAttribute(names[i]).itemSize;
    const isWeightList = Array.isArray(weight);

    for (let j = 0; j < itemSize; j++) {
      weights.push(isWeightList ? weight[j] : weight);
    }
  }

  validateAttributeComponents(weights.length);

  return weights;
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
  const isInterleaved = isInterleavedAttribute(attribute);
  const srcArray = attribute.array;
  const srcStride = isInterleaved ? attribute.data.stride : attribute.itemSize;
  const srcOffset = isInterleaved ? attribute.offset : 0;
  const itemSize = attribute.itemSize;
  const divisor = attribute.normalized ? getNormalizationScale(srcArray) : 1;
  const minValue = attribute.normalized && isSignedIntegerArray(srcArray) ? -1 : -Infinity;

  for (let i = 0, l = attribute.count; i < l; i++) {
    const dstIndex = i * dstStride + dstOffset;
    const srcIndex = i * srcStride + srcOffset;

    for (let j = 0; j < itemSize; j++) {
      dstArray[dstIndex + j] = Math.max(srcArray[srcIndex + j] / divisor, minValue);
    }
  }
}

function readAttribute(srcArray: Float32Array, srcStride: number, srcOffset: number, attribute: GeometryAttribute, remap: Uint32Array): void {
  const isInterleaved = isInterleavedAttribute(attribute);
  const dstArray = attribute.array;
  const dstStride = isInterleaved ? attribute.data.stride : attribute.itemSize;
  const dstOffset = isInterleaved ? attribute.offset : 0;
  const itemSize = attribute.itemSize;
  const scale = attribute.normalized ? getNormalizationScale(dstArray) : 1;
  const minValue = isSignedIntegerArray(dstArray) ? -1 : 0;

  for (let i = 0, l = remap.length; i < l; i++) {
    const dstVertex = remap[i];

    if (dstVertex === unusedVertex) continue;

    const srcIndex = i * srcStride + srcOffset;
    const dstIndex = dstVertex * dstStride + dstOffset;

    for (let j = 0; j < itemSize; j++) {
      dstArray[dstIndex + j] = quantize(srcArray[srcIndex + j], scale, minValue);
    }
  }
}

function quantize(value: number, scale: number, minValue: number): number {
  if (scale === 1) return value;

  return Math.round(Math.min(Math.max(value, minValue), 1) * scale);
}

function normalizeDirections(array: Float32Array, stride: number, offset: number, remap: Uint32Array): void {
  for (let i = 0, l = remap.length; i < l; i++) {
    if (remap[i] === unusedVertex) continue;

    const index = i * stride + offset;
    const x = array[index];
    const y = array[index + 1];
    const z = array[index + 2];
    const length = Math.sqrt(x * x + y * y + z * z);

    if (length === 0) continue;

    array[index] = x / length;
    array[index + 1] = y / length;
    array[index + 2] = z / length;
  }
}

function getNormalizationScale(array: TypedArray): number {
  const type = array.constructor;

  if (type === Uint8Array || type === Uint8ClampedArray) return 255;
  if (type === Int8Array) return 127;
  if (type === Uint16Array) return 65535;
  if (type === Int16Array) return 32767;
  if (type === Uint32Array) return 4294967295;
  if (type === Int32Array) return 2147483647;

  return 1;
}

function isSignedIntegerArray(array: TypedArray): boolean {
  const type = array.constructor;

  return type === Int8Array || type === Int16Array || type === Int32Array;
}
