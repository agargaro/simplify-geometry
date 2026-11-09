import { BufferAttribute, type BufferGeometry } from 'three';
import { createSeamLock, getIndexArray } from './GeometryAttributes.js';
import { packAttributes, unpackAttributes, type AttributeWeights, type PackedAttributes } from './PackAttributes.js';
import { compactGeometry, createSharedGeometry, reorderGeometry } from './RemapGeometry.js';
import {
  generatePositionRemap,
  simplifyIndexArray,
  toIndexArray,
  toMeshoptIndexArray,
  updateIndexArray,
  validateReady,
  type IndexArray,
  type SimplifyParams
} from './Simplify.js';
import { validateGeometry, validateLevelParams, validateVertices } from './Validation.js';

export interface SimplifyGeometryLevelParams extends SimplifyParams {
  attributes?: AttributeWeights;
  /**
   * Moves the remaining vertices and their weighted attributes to better approximate the source surface.
   * Requires `vertices: 'compact'`. Weighted `normal` and `tangent` attributes are renormalized.
   * Morph targets are not updated: absolute morph targets (`morphTargetsRelative: false`) keep the source positions.
   * The bounding box and sphere are reset to `null`, because the moved vertices can leave the source bounds:
   * three.js computes them again when needed.
   * @default false
   */
  updateVertices?: boolean;
  /**
   * Names of the attributes whose seams are protected in `permissive` mode: vertices that share a position but have different values
   * of these attributes are protected (2) in `vertexLock`, while the other seams can still collapse. Requires `permissive`.
   */
  protectSeams?: string[];
}

export interface SimplifyGeometryParams extends SimplifyGeometryLevelParams {
  vertices?: 'compact' | 'shared';
}

export interface SimplifyGeometryLODParams extends SimplifyGeometryLevelParams {
  vertices?: 'compact' | 'shared' | 'reordered';
}

export interface SimplifyGeometryResult {
  geometry: BufferGeometry;
  error: number;
}

interface SimplifiedLevel {
  indexArray: Uint32Array;
  error: number;
  positionArray?: Float32Array;
  attributes?: PackedAttributes | undefined;
}

type PackedAttributesCache = Map<AttributeWeights | undefined, PackedAttributes | undefined>;

const geometryVertices = { compact: true, shared: true } satisfies Record<NonNullable<SimplifyGeometryParams['vertices']>, true>;
const lodVertices = { compact: true, shared: true, reordered: true } satisfies Record<NonNullable<SimplifyGeometryLODParams['vertices']>, true>;

export function simplifyGeometry(geometry: BufferGeometry, params: SimplifyGeometryParams): SimplifyGeometryResult {
  validateReady();
  validateGeometry(geometry);
  validateVertices(params.vertices, geometryVertices);
  validateLevelParams(geometry, params, params.vertices);

  const levelParams = params.protectSeams === undefined ? params : withSeamLock(geometry, params, getPositionRemap(geometry));
  const srcAttributes = packAttributes(geometry, params.attributes);
  const level = simplifyLevel(geometry, toMeshoptIndexArray(getIndexArray(geometry)), levelParams, srcAttributes);

  return { geometry: createLevel(geometry, level, params.vertices, params.optimizeMemory), error: level.error };
}

export function simplifyGeometryLOD(geometry: BufferGeometry, levels: SimplifyGeometryLevelParams[], params: SimplifyGeometryLODParams = {}): SimplifyGeometryResult[] {
  validateReady();
  validateGeometry(geometry);
  validateVertices(params.vertices, lodVertices);

  const levelsParams = getLevelsParams(geometry, levels, params);
  const levelsAttributes = packLevelsAttributes(geometry, levelsParams);

  if (params.vertices === 'reordered') return createReorderedLevels(geometry, levelsParams, levelsAttributes, params);

  return createLevels(geometry, levelsParams, levelsAttributes, params.vertices);
}

function getLevelsParams(geometry: BufferGeometry, levels: SimplifyGeometryLevelParams[], params: SimplifyGeometryLODParams): SimplifyGeometryLevelParams[] {
  const levelsParams = new Array<SimplifyGeometryLevelParams>(levels.length);
  let positionRemap: Uint32Array | undefined;

  for (let i = 0, l = levels.length; i < l; i++) {
    const levelParams = { ...params, ...levels[i] };

    validateLevelParams(geometry, levelParams, params.vertices);

    if (levelParams.protectSeams === undefined) {
      levelsParams[i] = levelParams;
      continue;
    }

    positionRemap ??= getPositionRemap(geometry);
    levelsParams[i] = withSeamLock(geometry, levelParams, positionRemap);
  }

  return levelsParams;
}

function getPositionRemap(geometry: BufferGeometry): Uint32Array {
  return generatePositionRemap(geometry.getAttribute('position').array as Float32Array);
}

function withSeamLock<T extends SimplifyGeometryLevelParams>(geometry: BufferGeometry, params: T, positionRemap: Uint32Array): T {
  return { ...params, vertexLock: createSeamLock(geometry, params.protectSeams ?? [], positionRemap, params.vertexLock) };
}

function packLevelsAttributes(geometry: BufferGeometry, levelsParams: SimplifyGeometryLevelParams[]): (PackedAttributes | undefined)[] {
  const packedAttributes: PackedAttributesCache = new Map();
  const levelsAttributes = new Array<PackedAttributes | undefined>(levelsParams.length);

  for (let i = 0, l = levelsParams.length; i < l; i++) {
    const attributeWeights = levelsParams[i].attributes;

    if (!packedAttributes.has(attributeWeights)) packedAttributes.set(attributeWeights, packAttributes(geometry, attributeWeights));

    levelsAttributes[i] = packedAttributes.get(attributeWeights);
  }

  return levelsAttributes;
}

function createLevels(
  geometry: BufferGeometry,
  levelsParams: SimplifyGeometryLevelParams[],
  levelsAttributes: (PackedAttributes | undefined)[],
  vertices: SimplifyGeometryLODParams['vertices']
): SimplifyGeometryResult[] {
  const indexArray = toMeshoptIndexArray(getIndexArray(geometry));
  const results = new Array<SimplifyGeometryResult>(levelsParams.length + 1);

  results[0] = { geometry, error: 0 };

  for (let i = 0, l = levelsParams.length; i < l; i++) {
    const level = simplifyLevel(geometry, indexArray, levelsParams[i], levelsAttributes[i]);

    results[i + 1] = { geometry: createLevel(geometry, level, vertices, levelsParams[i].optimizeMemory), error: level.error };
  }

  return results;
}

function createReorderedLevels(
  geometry: BufferGeometry,
  levelsParams: SimplifyGeometryLevelParams[],
  levelsAttributes: (PackedAttributes | undefined)[],
  params: SimplifyGeometryLODParams
): SimplifyGeometryResult[] {
  const srcIndexArray = getIndexArray(geometry);
  const levels = simplifyLevels(geometry, levelsParams, levelsAttributes);
  const [vertexGeometry, indexArrays] = reorderGeometry(geometry, getLevelsIndexArrays(srcIndexArray, levels));
  const verticesCount = vertexGeometry.getAttribute('position').count;
  const results = new Array<SimplifyGeometryResult>(indexArrays.length);

  for (let i = 0, l = indexArrays.length; i < l; i++) {
    const isSourceLevel = i === 0;
    const levelParams = isSourceLevel ? params : levelsParams[i - 1];
    const dstGeometry = isSourceLevel ? vertexGeometry : createSharedGeometry(vertexGeometry);

    setLevelIndex(dstGeometry, indexArrays[i], srcIndexArray.BYTES_PER_ELEMENT, verticesCount, levelParams.optimizeMemory);
    results[i] = { geometry: dstGeometry, error: isSourceLevel ? 0 : levels[i - 1].error };
  }

  return results;
}

function simplifyLevels(
  geometry: BufferGeometry,
  levelsParams: SimplifyGeometryLevelParams[],
  levelsAttributes: (PackedAttributes | undefined)[]
): SimplifiedLevel[] {
  const indexArray = toMeshoptIndexArray(getIndexArray(geometry));
  const levels = new Array<SimplifiedLevel>(levelsParams.length);

  for (let i = 0, l = levelsParams.length; i < l; i++) {
    levels[i] = simplifyLevel(geometry, indexArray, levelsParams[i], levelsAttributes[i]);
  }

  return levels;
}

function getLevelsIndexArrays(srcIndexArray: IndexArray, levels: SimplifiedLevel[]): IndexArray[] {
  const indexArrays = new Array<IndexArray>(levels.length + 1);

  indexArrays[0] = srcIndexArray;

  for (let i = 0, l = levels.length; i < l; i++) {
    indexArrays[i + 1] = levels[i].indexArray;
  }

  return indexArrays;
}

function simplifyLevel(geometry: BufferGeometry, indexArray: Uint32Array, params: SimplifyGeometryLevelParams, attributes?: PackedAttributes): SimplifiedLevel {
  const positionArray = geometry.getAttribute('position').array as Float32Array;

  if (params.updateVertices === true) return simplifyUpdatedLevel(getIndexArray(geometry), positionArray, params, attributes);

  const [dstIndexArray, error] = simplifyIndexArray(indexArray, positionArray, params, attributes);

  return { indexArray: dstIndexArray, error };
}

function simplifyUpdatedLevel(srcIndexArray: IndexArray, positionArray: Float32Array, params: SimplifyParams, attributes?: PackedAttributes): SimplifiedLevel {
  const dstPositionArray = positionArray.slice();
  const dstAttributes = attributes === undefined ? undefined : { ...attributes, array: attributes.array.slice() };
  const [dstIndexArray, error] = updateIndexArray(new Uint32Array(srcIndexArray), dstPositionArray, params, dstAttributes);

  return { indexArray: dstIndexArray, error, positionArray: dstPositionArray, attributes: dstAttributes };
}

function createLevel(geometry: BufferGeometry, level: SimplifiedLevel, vertices: SimplifyGeometryLODParams['vertices'], optimizeMemory?: boolean): BufferGeometry {
  const srcBytesPerIndex = getIndexArray(geometry).BYTES_PER_ELEMENT;

  if (vertices === 'shared') {
    const srcVerticesCount = geometry.getAttribute('position').count;

    return setLevelIndex(createSharedGeometry(geometry), level.indexArray, srcBytesPerIndex, srcVerticesCount, optimizeMemory);
  }

  const [dstGeometry, remap] = compactGeometry(geometry, level.indexArray);

  if (level.positionArray !== undefined) updateLevelVertices(dstGeometry, remap, level.positionArray, level.attributes);

  return setLevelIndex(dstGeometry, level.indexArray, srcBytesPerIndex, dstGeometry.getAttribute('position').count, optimizeMemory);
}

function updateLevelVertices(geometry: BufferGeometry, remap: Uint32Array, positionArray: Float32Array, attributes?: PackedAttributes): void {
  unpackAttributes(geometry, remap, positionArray, attributes);

  geometry.boundingBox = null;
  geometry.boundingSphere = null;
}

function setLevelIndex(
  geometry: BufferGeometry,
  indexArray: Uint32Array,
  srcBytesPerIndex: number,
  verticesCount: number,
  optimizeMemory?: boolean
): BufferGeometry {
  geometry.setIndex(new BufferAttribute(toIndexArray(indexArray, srcBytesPerIndex, verticesCount, optimizeMemory), 1));

  return geometry;
}
