import type { BufferGeometry, InterleavedBufferAttribute } from 'three';
import { isInstancedAttribute, type GeometryAttribute, type MorphAttributes } from './RemapGeometry.js';
import type { SimplifyAttributes, SimplifyParams, SimplifyResult } from './Simplify.js';

const maxAttributeComponents = 32;
const maxAttributeStride = 64;

/** @internal */
export function validateArrays(indexArray: SimplifyResult[0], positionArray: Float32Array): void {
  const indexType = indexArray.constructor;
  const isIndexTypeSupported = indexType === Uint32Array || indexType === Uint16Array || indexType === Uint8Array;

  if (!isIndexTypeSupported) throw new TypeError('"srcIndexArray" must be a Uint32Array, a Uint16Array or a Uint8Array.');
  if (indexArray.length % 3 !== 0) throw new RangeError('"srcIndexArray" length must be a multiple of 3.');
  validatePositionArray(positionArray);
}

/** @internal */
export function validatePositionArray(positionArray: Float32Array): void {
  if (positionArray.constructor !== Float32Array) throw new TypeError('"srcPositionArray" must be a Float32Array.');
  if (positionArray.length % 3 !== 0) throw new RangeError('"srcPositionArray" length must be a multiple of 3.');
}

/** @internal */
export function validateParams(params: SimplifyParams): void {
  const hasTarget = params.ratio !== undefined || params.error !== undefined;
  const isRatioValid = params.ratio === undefined || (params.ratio >= 0 && params.ratio <= 1);
  const isErrorValid = params.error === undefined || params.error >= 0;
  const isRegularizeConflicting = params.regularize === true && params.regularizeLight === true;

  if (!hasTarget) throw new Error('"ratio" or "error" must be specified.');
  if (!isRatioValid) throw new RangeError('"ratio" must be between 0 and 1.');
  if (!isErrorValid) throw new RangeError('"error" must be greater than or equal to 0.');
  if (isRegularizeConflicting) throw new Error('"regularize" and "regularizeLight" must not be enabled together.');
}

/** @internal */
export function validateVertexData(verticesCount: number, vertexLock?: Uint8Array, attributes?: SimplifyAttributes): void {
  if (vertexLock !== undefined) validateVertexLock(vertexLock, verticesCount);
  if (attributes !== undefined) validateAttributes(attributes, verticesCount);
}

/** @internal */
export function validateGeometry(geometry: BufferGeometry): void {
  const isDefaultDrawRange = geometry.drawRange.start === 0 && geometry.drawRange.count === Infinity;

  if (geometry.index === null) throw new Error('"geometry" must be indexed: non-indexed geometries are not supported.');
  if (geometry.groups.length > 0) throw new Error('"geometry" must not have groups: geometry groups are not supported.');
  if (!isDefaultDrawRange) throw new Error('"geometry" must use the default draw range: custom draw ranges are not supported.');
  if (!geometry.hasAttribute('position')) throw new Error('"geometry" must have a "position" attribute.');
  validatePosition(geometry.getAttribute('position'));
  validateVertexAttributes(geometry);
}

/** @internal */
export function validateVertices(vertices: string | undefined, allowed: readonly string[]): void {
  if (vertices !== undefined && !allowed.includes(vertices)) throw new Error(`"vertices" must be one of: ${allowed.join(', ')}.`);
}

/** @internal */
export function validateWeightedAttribute(geometry: BufferGeometry, name: string): void {
  if (name === 'position') throw new Error('"attributes" must not include "position": positions are always used.');
  if (!geometry.hasAttribute(name)) throw new Error(`"geometry" must have a "${name}" attribute.`);

  const attribute = geometry.getAttribute(name);
  const isFloat16 = (attribute as Partial<{ isFloat16BufferAttribute: boolean }>).isFloat16BufferAttribute === true;

  if (isFloat16) throw new TypeError(`"geometry" "${name}" attribute must not be a Float16BufferAttribute: half float attributes are not supported.`);
  if (isInstancedAttribute(attribute)) throw new TypeError(`"geometry" "${name}" attribute must not be instanced: per-instance attributes cannot be weighted.`);
}

/** @internal */
export function validateAttributeWeight(weight: number | number[], itemSize: number, name: string): void {
  const isWeightListValid = !Array.isArray(weight) || weight.length === itemSize;

  if (!isWeightListValid) throw new RangeError(`"attributes.${name}" length must match the attribute itemSize (${itemSize}).`);
}

/** @internal */
export function validateAttributeComponents(componentsCount: number): void {
  if (componentsCount > maxAttributeComponents) throw new RangeError(`"attributes" must have at most ${maxAttributeComponents} components in total.`);
}

function validateVertexLock(vertexLock: Uint8Array, verticesCount: number): void {
  if (vertexLock.constructor !== Uint8Array) throw new TypeError('"vertexLock" must be a Uint8Array.');
  if (vertexLock.length !== verticesCount) throw new RangeError('"vertexLock" length must match the vertex count.');
}

function validateAttributes(attributes: SimplifyAttributes, verticesCount: number): void {
  const { array, stride, weights } = attributes;
  const isStrideValid = Number.isInteger(stride) && stride >= weights.length && stride <= maxAttributeStride;

  if (array.constructor !== Float32Array) throw new TypeError('"srcAttributes.array" must be a Float32Array.');
  if (weights.length > maxAttributeComponents) throw new RangeError(`"srcAttributes.weights" length must be at most ${maxAttributeComponents}.`);
  if (!isStrideValid) throw new RangeError(`"srcAttributes.stride" must be an integer between "srcAttributes.weights" length and ${maxAttributeStride}.`);
  if (array.length !== stride * verticesCount) throw new RangeError('"srcAttributes.array" length must be "srcAttributes.stride" times the vertex count.');
  if (!areWeightsValid(weights)) throw new RangeError('"srcAttributes.weights" values must be greater than or equal to 0.');
}

function areWeightsValid(weights: number[]): boolean {
  for (let i = 0, l = weights.length; i < l; i++) {
    if (!(weights[i] >= 0)) return false;
  }

  return true;
}

function validateVertexAttributes(geometry: BufferGeometry): void {
  const verticesCount = geometry.getAttribute('position').count;
  const names = Object.keys(geometry.attributes);
  const morphAttributes = geometry.morphAttributes as MorphAttributes;
  const morphNames = Object.keys(morphAttributes);

  for (let i = 0, l = names.length; i < l; i++) {
    validateVertexAttributeCount(geometry.getAttribute(names[i]), verticesCount, `"geometry" "${names[i]}" attribute`);
  }

  for (let i = 0, l = morphNames.length; i < l; i++) {
    const morphList = morphAttributes[morphNames[i]];

    for (let j = 0, m = morphList.length; j < m; j++) {
      validateVertexAttributeCount(morphList[j], verticesCount, `"geometry" "${morphNames[i]}" morph attribute ${j}`);
    }
  }
}

function validateVertexAttributeCount(attribute: GeometryAttribute, verticesCount: number, label: string): void {
  const isCountValid = isInstancedAttribute(attribute) || attribute.count === verticesCount;

  if (!isCountValid) throw new RangeError(`${label} count must match the position count.`);
}

function validatePosition(position: GeometryAttribute): void {
  const isInterleaved = (position as Partial<InterleavedBufferAttribute>).isInterleavedBufferAttribute === true;

  if (isInterleaved) throw new TypeError('"geometry" "position" attribute must not be interleaved: interleaved positions are not supported.');
  if (position.itemSize !== 3) throw new RangeError('"geometry" "position" attribute must have an itemSize of 3.');
}
