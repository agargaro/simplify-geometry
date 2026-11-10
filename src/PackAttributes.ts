import type { BufferGeometry, TypedArray } from 'three';
import { getItemOffset, getItemStride, getNormalizationScale, isDirectionAttribute, type GeometryAttribute } from './GeometryAttributes.js';
import { positionStride, unusedVertex } from './Meshopt.js';
import type { SimplifyAttributes } from './Simplify.js';
import { hasPositiveWeight, validateAttributeWeight, validateWeightedAttribute } from './Validation.js';

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

  packAttributeList(array, stride, geometry, names);

  return { array, stride, weights, names };
}

/**
 * Writes the positions and packed attributes updated by meshoptimizer to `geometry`, the level compacted with `remap`.
 * Normals and tangents are renormalized.
 * @internal
 */
export function unpackAttributes(geometry: BufferGeometry, remap: Uint32Array, positionArray: Float32Array, attributes?: PackedAttributes): void {
  const position = geometry.getAttribute('position');

  unpackAttribute(positionArray, positionStride, 0, position, remap);

  if (attributes === undefined) return;

  const packedArray = attributes.array;
  const packedStride = attributes.stride;
  const names = attributes.names;
  let packedOffset = 0;

  for (let i = 0, l = names.length; i < l; i++) {
    const name = names[i];
    const attribute = geometry.getAttribute(name);

    if (isDirectionAttribute(name)) normalizeDirections(packedArray, packedStride, packedOffset, remap);

    unpackAttribute(packedArray, packedStride, packedOffset, attribute, remap);
    packedOffset += attribute.itemSize;
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
    const name = names[i];
    const weight = attributeWeights[name];
    const itemSize = geometry.getAttribute(name).itemSize;
    const isWeightList = Array.isArray(weight);

    for (let j = 0; j < itemSize; j++) {
      weights.push(isWeightList ? weight[j] : weight);
    }
  }

  return weights;
}

function packAttributeList(dstArray: Float32Array, dstStride: number, geometry: BufferGeometry, names: string[]): void {
  let dstOffset = 0;

  for (let i = 0, l = names.length; i < l; i++) {
    const attribute = geometry.getAttribute(names[i]);

    packAttribute(dstArray, dstStride, dstOffset, attribute);
    dstOffset += attribute.itemSize;
  }
}

function packAttribute(dstArray: Float32Array, dstStride: number, dstOffset: number, attribute: GeometryAttribute): void {
  const isQuantized = getQuantizationScale(attribute) !== 1;

  if (isQuantized) {
    packQuantizedAttribute(dstArray, dstStride, dstOffset, attribute);
    return;
  }

  packFloatAttribute(dstArray, dstStride, dstOffset, attribute);
}

function packFloatAttribute(dstArray: Float32Array, dstStride: number, dstOffset: number, attribute: GeometryAttribute): void {
  const srcArray = attribute.array;
  const srcStride = getItemStride(attribute);
  const srcOffset = getItemOffset(attribute);
  const itemSize = attribute.itemSize;

  for (let i = 0, l = attribute.count; i < l; i++) {
    const dstIndex = i * dstStride + dstOffset;
    const srcIndex = i * srcStride + srcOffset;

    for (let j = 0; j < itemSize; j++) {
      dstArray[dstIndex + j] = srcArray[srcIndex + j];
    }
  }
}

function packQuantizedAttribute(dstArray: Float32Array, dstStride: number, dstOffset: number, attribute: GeometryAttribute): void {
  const srcArray = attribute.array;
  const srcStride = getItemStride(attribute);
  const srcOffset = getItemOffset(attribute);
  const itemSize = attribute.itemSize;
  const scale = getNormalizationScale(srcArray);
  const minValue = getMinNormalizedValue(srcArray);

  for (let i = 0, l = attribute.count; i < l; i++) {
    const dstIndex = i * dstStride + dstOffset;
    const srcIndex = i * srcStride + srcOffset;

    for (let j = 0; j < itemSize; j++) {
      dstArray[dstIndex + j] = dequantize(srcArray[srcIndex + j], scale, minValue);
    }
  }
}

function unpackAttribute(srcArray: Float32Array, srcStride: number, srcOffset: number, attribute: GeometryAttribute, remap: Uint32Array): void {
  const isQuantized = getQuantizationScale(attribute) !== 1;

  if (isQuantized) {
    unpackQuantizedAttribute(srcArray, srcStride, srcOffset, attribute, remap);
    return;
  }

  unpackFloatAttribute(srcArray, srcStride, srcOffset, attribute, remap);
}

function unpackFloatAttribute(srcArray: Float32Array, srcStride: number, srcOffset: number, attribute: GeometryAttribute, remap: Uint32Array): void {
  const dstArray = attribute.array;
  const dstStride = getItemStride(attribute);
  const dstOffset = getItemOffset(attribute);
  const itemSize = attribute.itemSize;

  for (let i = 0, l = remap.length; i < l; i++) {
    const dstVertex = remap[i];

    if (dstVertex === unusedVertex) continue;

    const srcIndex = i * srcStride + srcOffset;
    const dstIndex = dstVertex * dstStride + dstOffset;

    for (let j = 0; j < itemSize; j++) {
      dstArray[dstIndex + j] = srcArray[srcIndex + j];
    }
  }
}

function unpackQuantizedAttribute(srcArray: Float32Array, srcStride: number, srcOffset: number, attribute: GeometryAttribute, remap: Uint32Array): void {
  const dstArray = attribute.array;
  const dstStride = getItemStride(attribute);
  const dstOffset = getItemOffset(attribute);
  const itemSize = attribute.itemSize;
  const scale = getNormalizationScale(dstArray);
  const minValue = getMinNormalizedValue(dstArray);

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

function dequantize(value: number, scale: number, minValue: number): number {
  return Math.max(value / scale, minValue);
}

function quantize(value: number, scale: number, minValue: number): number {
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

function getQuantizationScale(attribute: GeometryAttribute): number {
  return attribute.normalized ? getNormalizationScale(attribute.array) : 1;
}

function getMinNormalizedValue(array: TypedArray): number {
  const type = array.constructor;
  const isSigned = type === Int8Array || type === Int16Array || type === Int32Array;

  return isSigned ? -1 : 0;
}
