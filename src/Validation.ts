import type { BufferAttribute, BufferGeometry } from 'three';
import { isFloat16Attribute, isInstancedAttribute, isInterleavedAttribute, type GeometryAttribute, type MorphAttributes } from './GeometryAttributes.js';
import type { IndexArray, SimplifyAttributes, SimplifyParams } from './Simplify.js';
import type { AttributeWeights } from './PackAttributes.js';
import type { SimplifyGeometryLevelParams } from './SimplifyGeometry.js';

const maxAttributeComponents = 32;
const maxAttributeStride = 64;
const normalizableArrayTypes: unknown[] = [
  Float32Array, Uint8Array, Uint8ClampedArray, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array
];
const sloppyUnsupportedFlags = [
  'lockBorder', 'sparse', 'prune', 'regularize', 'regularizeLight', 'permissive', 'preserveFolds', 'errorClamped'
] as const satisfies readonly (keyof SimplifyParams)[];

/** @internal */
export function validateSimplifyArgs(indexArray: IndexArray, positionArray: Float32Array, params: SimplifyParams, attributes?: SimplifyAttributes): void {
  if (!isIndexArrayType(indexArray)) throw new TypeError('"srcIndexArray" must be a Uint32Array, a Uint16Array or a Uint8Array.');
  if (indexArray.length % 3 !== 0) throw new RangeError('"srcIndexArray" length must be a multiple of 3.');
  validatePositionArray(positionArray);
  validateParams(params, positionArray.length / 3);
  if (attributes === undefined) return;
  if (params.sloppy === true) throw new Error('"srcAttributes" must not be used with "sloppy": sloppy simplification ignores attributes.');
  validateAttributes(attributes, positionArray.length / 3);
}

/** @internal */
export function validatePositionArray(positionArray: Float32Array): void {
  if (positionArray.constructor !== Float32Array) throw new TypeError('"srcPositionArray" must be a Float32Array.');
  if (positionArray.length % 3 !== 0) throw new RangeError('"srcPositionArray" length must be a multiple of 3.');
}

/** @internal */
export function validateParams(params: SimplifyParams, verticesCount: number): void {
  const hasTarget = params.ratio !== undefined || params.error !== undefined;
  const isRatioValid = params.ratio === undefined || (params.ratio >= 0 && params.ratio <= 1);
  const isErrorValid = params.error === undefined || params.error >= 0;
  const isRegularizeConflicting = params.regularize === true && params.regularizeLight === true;

  if (!hasTarget) throw new Error('"ratio" or "error" must be specified.');
  if (!isRatioValid) throw new RangeError('"ratio" must be between 0 and 1.');
  if (!isErrorValid) throw new RangeError('"error" must be greater than or equal to 0.');
  if (isRegularizeConflicting) throw new Error('"regularize" and "regularizeLight" must not be enabled together.');
  validateVertexLock(params.vertexLock, verticesCount);
  validateSloppyFlags(params);
}

/**
 * Validates the parameters of a geometry or LOD level, after merging them with the shared LOD parameters.
 * @internal
 */
export function validateLevelParams(geometry: BufferGeometry, params: SimplifyGeometryLevelParams, vertices: string | undefined): void {
  validateParams(params, geometry.getAttribute('position').count);
  validateUpdateVertices(geometry, params, vertices);
  validateSloppyLevel(params);
  validateProtectSeams(geometry, params);
}

/** @internal */
export function validateGeometry(geometry: BufferGeometry): void {
  const isDefaultDrawRange = geometry.drawRange.start === 0 && geometry.drawRange.count === Infinity;

  if (geometry.index === null) throw new Error('"geometry" must be indexed: non-indexed geometries are not supported.');
  if (geometry.groups.length > 0) throw new Error('"geometry" must not have groups: geometry groups are not supported.');
  if (!isDefaultDrawRange) throw new Error('"geometry" must use the default draw range: custom draw ranges are not supported.');
  if (!geometry.hasAttribute('position')) throw new Error('"geometry" must have a "position" attribute.');
  validateIndex(geometry.index);
  validatePosition(geometry.getAttribute('position'));
  validateVertexAttributes(geometry);
}

/** @internal */
export function validateVertices(vertices: string | undefined, allowed: Record<string, true>): void {
  if (vertices !== undefined && !Object.hasOwn(allowed, vertices)) throw new Error(`"vertices" must be one of: ${Object.keys(allowed).join(', ')}.`);
}

/**
 * Attributes without a positive weight are not packed, so meshoptimizer does not update them.
 * @internal
 */
export function hasPositiveWeight(weight: number | number[]): boolean {
  if (!Array.isArray(weight)) return weight > 0;

  for (let i = 0, l = weight.length; i < l; i++) {
    if (weight[i] > 0) return true;
  }

  return false;
}

/** @internal */
export function validateWeightedAttribute(geometry: BufferGeometry, name: string): void {
  if (name === 'position') throw new Error('"attributes" must not include "position": positions are always used.');
  if (!geometry.hasAttribute(name)) throw new Error(`"geometry" must have a "${name}" attribute.`);

  const attribute = geometry.getAttribute(name);
  const isNormalizationSupported = !attribute.normalized || normalizableArrayTypes.includes(attribute.array.constructor);

  if (isFloat16Attribute(attribute)) throw new TypeError(`"geometry" "${name}" attribute must not be a Float16BufferAttribute: half float attributes are not supported.`);
  if (isInstancedAttribute(attribute)) throw new TypeError(`"geometry" "${name}" attribute must not be instanced: per-instance attributes cannot be weighted.`);
  if (!isNormalizationSupported) throw new TypeError(`"geometry" "${name}" attribute must use an integer or Float32Array component type when normalized.`);
}

/** @internal */
export function validateAttributeWeight(weight: number | number[], itemSize: number, name: string): void {
  const isWeightList = Array.isArray(weight);
  const isLengthValid = !isWeightList || weight.length === itemSize;
  const areValuesValid = isWeightList ? areWeightsValid(weight) : weight >= 0;

  if (!isLengthValid) throw new RangeError(`"attributes.${name}" length must match the attribute itemSize (${itemSize}).`);
  if (!areValuesValid) throw new RangeError(`"attributes.${name}" values must be greater than or equal to 0.`);
}

/** @internal */
export function validateAttributeComponents(componentsCount: number): void {
  if (componentsCount > maxAttributeComponents) throw new RangeError(`"attributes" must have at most ${maxAttributeComponents} components in total.`);
}

function validateSloppyFlags(params: SimplifyParams): void {
  if (params.sloppy !== true) return;

  for (let i = 0, l = sloppyUnsupportedFlags.length; i < l; i++) {
    const flag = sloppyUnsupportedFlags[i];

    if (params[flag] === true) throw new Error(`"${flag}" must not be enabled with "sloppy": sloppy simplification does not support it.`);
  }
}

function validateUpdateVertices(geometry: BufferGeometry, params: SimplifyGeometryLevelParams, vertices: string | undefined): void {
  if (params.updateVertices !== true) return;

  const isCompact = vertices === undefined || vertices === 'compact';

  if (!isCompact) throw new Error('"updateVertices" requires "vertices" to be "compact": updated vertices cannot be shared.');
  if (params.attributes !== undefined) validateUpdatedAttributes(geometry, params.attributes);
}

function validateSloppyLevel(params: SimplifyGeometryLevelParams): void {
  if (params.sloppy !== true) return;
  if (params.updateVertices === true) throw new Error('"updateVertices" must not be enabled with "sloppy": sloppy simplification cannot update vertices.');
  if (params.attributes !== undefined && hasWeightedAttribute(params.attributes)) {
    throw new Error('"attributes" must not have positive weights with "sloppy": sloppy simplification ignores attributes.');
  }
}

function hasWeightedAttribute(attributeWeights: AttributeWeights): boolean {
  const names = Object.keys(attributeWeights);

  for (let i = 0, l = names.length; i < l; i++) {
    if (hasPositiveWeight(attributeWeights[names[i]])) return true;
  }

  return false;
}

function validateProtectSeams(geometry: BufferGeometry, params: SimplifyGeometryLevelParams): void {
  const names = params.protectSeams;

  if (names === undefined) return;
  if (params.permissive !== true) throw new Error('"protectSeams" requires "permissive": seams are already preserved without it.');

  for (let i = 0, l = names.length; i < l; i++) {
    if (names[i] === 'position') throw new Error('"protectSeams" must not include "position": seams are found by position.');
    if (!geometry.hasAttribute(names[i])) throw new Error(`"geometry" must have a "${names[i]}" attribute.`);
    if (isInstancedAttribute(geometry.getAttribute(names[i]))) throw new TypeError(`"geometry" "${names[i]}" attribute must not be instanced.`);
  }
}

function validateUpdatedAttributes(geometry: BufferGeometry, attributeWeights: AttributeWeights): void {
  const names = Object.keys(attributeWeights);

  for (let i = 0, l = names.length; i < l; i++) {
    const attribute = geometry.getAttribute(names[i]) as GeometryAttribute | undefined;
    const isUpdated = attribute !== undefined && hasPositiveWeight(attributeWeights[names[i]]);
    const isUpdatable = !isUpdated || attribute.normalized || attribute.array.constructor === Float32Array;

    if (!isUpdatable) {
      throw new TypeError(`"geometry" "${names[i]}" attribute must be a Float32Array or normalized to be updated by "updateVertices".`);
    }
  }
}

function isIndexArrayType(indexArray: IndexArray): boolean {
  const indexType = indexArray.constructor;

  return indexType === Uint32Array || indexType === Uint16Array || indexType === Uint8Array;
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

function validateVertexLock(vertexLock: Uint8Array | undefined, verticesCount: number): void {
  if (vertexLock === undefined) return;
  if (vertexLock.constructor !== Uint8Array) throw new TypeError('"vertexLock" must be a Uint8Array.');
  if (vertexLock.length !== verticesCount) throw new RangeError('"vertexLock" length must match the vertex count.');
}

function areWeightsValid(weights: number[]): boolean {
  for (let i = 0, l = weights.length; i < l; i++) {
    if (!(weights[i] >= 0)) return false;
  }

  return true;
}

function validateIndex(index: BufferAttribute): void {
  const indexArray = index.array as IndexArray;

  if (!isIndexArrayType(indexArray)) throw new TypeError('"geometry" index must be a Uint32Array, a Uint16Array or a Uint8Array.');
  if (indexArray.length % 3 !== 0) throw new RangeError('"geometry" index length must be a multiple of 3.');
}

function validatePosition(position: GeometryAttribute): void {
  if (isInterleavedAttribute(position)) throw new TypeError('"geometry" "position" attribute must not be interleaved: interleaved positions are not supported.');
  if (isInstancedAttribute(position)) throw new TypeError('"geometry" "position" attribute must not be instanced.');
  if (position.array.constructor !== Float32Array) throw new TypeError('"geometry" "position" attribute must be a Float32Array: quantized and half float positions are not supported.');
  if (position.itemSize !== 3) throw new RangeError('"geometry" "position" attribute must have an itemSize of 3.');
  if (position.array.length % 3 !== 0) throw new RangeError('"geometry" "position" attribute array length must be a multiple of 3.');
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
