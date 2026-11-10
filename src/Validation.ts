import type { BufferGeometry } from 'three';
import { getNormalizationScale, isDirectionAttribute, isFloat16Attribute, isInstancedAttribute, isInterleavedAttribute, type GeometryAttribute, type MorphAttributes } from './GeometryAttributes.js';
import { positionStride } from './Meshopt.js';
import type { IndexArray, SimplifyParams } from './Simplify.js';
import type { AttributeWeights } from './PackAttributes.js';
import type { SimplifyGeometryLevelParams } from './SimplifyGeometry.js';

/**
 * Checks only what meshoptimizer cannot detect: its own assertions already reject invalid ratios, errors, weights and locks.
 * @internal
 */
export function validateSimplifyArgs(indexArray: IndexArray, positionArray: Float32Array, params: SimplifyParams): void {
  validatePositionArray(positionArray);
  validateIndexArray(indexArray, positionArray.length / positionStride, '"srcIndexArray"');
  validateParams(params);
}

/** @internal */
export function validatePositionArray(positionArray: Float32Array): void {
  if (positionArray.constructor !== Float32Array) throw new TypeError('"srcPositionArray" must be a Float32Array.');
  if (positionArray.length % positionStride !== 0) throw new RangeError(`"srcPositionArray" length must be a multiple of ${positionStride}.`);
}

/** @internal */
export function validateParams(params: SimplifyParams): void {
  if (params.ratio === undefined && params.error === undefined) throw new Error('"ratio" or "error" must be specified.');
}

/**
 * Validates the parameters of a geometry or LOD level, after merging them with the shared LOD parameters.
 * @internal
 */
export function validateLevelParams(geometry: BufferGeometry, params: SimplifyGeometryLevelParams, vertices: string | undefined): void {
  validateParams(params);
  validateUpdateVertices(geometry, params, vertices);
  validateProtectSeams(geometry, params);
}

/** @internal */
export function validateGeometry(geometry: BufferGeometry): void {
  const isDefaultDrawRange = geometry.drawRange.start === 0 && geometry.drawRange.count === Infinity;

  if (geometry.index === null) throw new Error('"geometry" must be indexed: non-indexed geometries are not supported.');
  if (geometry.groups.length > 0) throw new Error('"geometry" must not have groups: geometry groups are not supported.');
  if (!isDefaultDrawRange) throw new Error('"geometry" must use the default draw range: custom draw ranges are not supported.');
  if (!geometry.hasAttribute('position')) throw new Error('"geometry" must have a "position" attribute.');

  const position = geometry.getAttribute('position');
  const indexArray = geometry.index.array as IndexArray;

  validatePosition(position);
  validateIndexArray(indexArray, position.count, '"geometry" index');
  validateVertexAttributes(geometry);
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
  validateVertexAttribute(geometry, name);

  const attribute = geometry.getAttribute(name);
  const isNormalizedInteger = getNormalizationScale(attribute.array) !== 1;
  const isNormalizationSupported = !attribute.normalized || isNormalizedInteger || attribute.array.constructor === Float32Array;

  if (isFloat16Attribute(attribute)) throw new TypeError(`"geometry" "${name}" attribute must not be a Float16BufferAttribute: half float attributes are not supported.`);
  if (!isNormalizationSupported) throw new TypeError(`"geometry" "${name}" attribute must use an integer or Float32Array component type when normalized.`);
}

/** @internal */
export function validateAttributeWeight(weight: number | number[], itemSize: number, name: string): void {
  const isLengthValid = !Array.isArray(weight) || weight.length === itemSize;

  if (!isLengthValid) throw new RangeError(`"attributes.${name}" length must match the attribute itemSize (${itemSize}).`);
}

function validateUpdateVertices(geometry: BufferGeometry, params: SimplifyGeometryLevelParams, vertices: string | undefined): void {
  if (params.updateVertices !== true) return;

  const isCompact = vertices === undefined || vertices === 'compact';

  if (!isCompact) throw new Error('"updateVertices" requires "vertices" to be "compact": updated vertices cannot be shared.');
  if (params.sloppy === true) throw new Error('"updateVertices" must not be enabled with "sloppy": sloppy simplification cannot update vertices.');
  if (params.attributes !== undefined) validateUpdatedAttributes(geometry, params.attributes);
}

function validateProtectSeams(geometry: BufferGeometry, params: SimplifyGeometryLevelParams): void {
  const names = params.protectSeams;

  if (names === undefined) return;

  for (let i = 0, l = names.length; i < l; i++) {
    validateVertexAttribute(geometry, names[i]);
  }
}

function validateVertexAttribute(geometry: BufferGeometry, name: string): void {
  if (!geometry.hasAttribute(name)) throw new Error(`"geometry" must have a "${name}" attribute.`);
  if (isInstancedAttribute(geometry.getAttribute(name))) throw new TypeError(`"geometry" "${name}" attribute must not be instanced: per-instance values are not supported.`);
}

function validateUpdatedAttributes(geometry: BufferGeometry, attributeWeights: AttributeWeights): void {
  const names = Object.keys(attributeWeights);

  for (let i = 0, l = names.length; i < l; i++) {
    const name = names[i];
    const attribute = geometry.getAttribute(name) as GeometryAttribute | undefined;
    const isUpdated = attribute !== undefined && hasPositiveWeight(attributeWeights[name]);
    const isUpdatable = !isUpdated || attribute.normalized || attribute.array.constructor === Float32Array;
    const isRenormalizable = !isUpdated || !isDirectionAttribute(name) || attribute.itemSize >= 3;

    if (!isUpdatable) {
      throw new TypeError(`"geometry" "${name}" attribute must be a Float32Array or normalized to be updated by "updateVertices".`);
    }

    if (!isRenormalizable) {
      throw new RangeError(`"geometry" "${name}" attribute must have an itemSize of at least 3 to be renormalized by "updateVertices".`);
    }
  }
}

function isIndexArrayType(indexArray: IndexArray): boolean {
  const indexType = indexArray.constructor;

  return indexType === Uint32Array || indexType === Uint16Array || indexType === Uint8Array;
}

function validateIndexArray(indexArray: IndexArray, verticesCount: number, label: string): void {
  if (!isIndexArrayType(indexArray)) throw new TypeError(`${label} must be a Uint32Array, a Uint16Array or a Uint8Array.`);
  if (!isIndexRangeValid(indexArray, verticesCount)) throw new RangeError(`${label} values must be less than the vertex count.`);
}

function isIndexRangeValid(indexArray: IndexArray, verticesCount: number): boolean {
  for (let i = 0, l = indexArray.length; i < l; i++) {
    if (indexArray[i] >= verticesCount) return false;
  }

  return true;
}

function validatePosition(position: GeometryAttribute): void {
  if (isInterleavedAttribute(position)) throw new TypeError('"geometry" "position" attribute must not be interleaved: interleaved positions are not supported.');
  if (isInstancedAttribute(position)) throw new TypeError('"geometry" "position" attribute must not be instanced.');
  if (position.array.constructor !== Float32Array) throw new TypeError('"geometry" "position" attribute must be a Float32Array: quantized and half float positions are not supported.');
  if (position.itemSize !== positionStride) throw new RangeError(`"geometry" "position" attribute must have an itemSize of ${positionStride}.`);
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
