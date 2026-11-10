import { BufferAttribute, type BufferGeometry } from 'three';
import { createSeamLock, getIndexArray, getPositionArray } from './GeometryAttributes.js';
import * as Meshopt from './Meshopt.js';
import { packAttributes, unpackAttributes, type AttributeWeights, type PackedAttributes } from './PackAttributes.js';
import { compactGeometry, createSharedGeometry, reorderGeometry, type ReorderedGeometry } from './RemapGeometry.js';
import { toResultIndexArray, type IndexArray, type SimplifyParams } from './Simplify.js';
import { validateGeometry, validateLevelParams } from './Validation.js';

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
   * of these attributes are protected (2) in `vertexLock`, while the other seams can still collapse. Only effective with `permissive`.
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

interface SimplifiedLevel extends Meshopt.SimplifyOutput {
  positionArray?: Float32Array;
  attributes?: PackedAttributes | undefined;
}

type PackedAttributesCache = Map<AttributeWeights | undefined, PackedAttributes | undefined>;

export function simplifyGeometry(geometry: BufferGeometry, params: SimplifyGeometryParams): SimplifyGeometryResult {
  return simplifyGeometryLOD(geometry, [params], params)[1];
}

export function simplifyGeometryLOD(geometry: BufferGeometry, levels: SimplifyGeometryLevelParams[], params: SimplifyGeometryLODParams = {}): SimplifyGeometryResult[] {
  Meshopt.validateReady();
  validateGeometry(geometry);

  const paramsPerLevel = getParamsPerLevel(geometry, levels, params);
  const attributesPerLevel = packAttributesPerLevel(geometry, paramsPerLevel);

  if (params.vertices === 'reordered') return createReorderedLevels(geometry, paramsPerLevel, attributesPerLevel, params);

  return createLevels(geometry, paramsPerLevel, attributesPerLevel, params.vertices);
}

function getParamsPerLevel(geometry: BufferGeometry, levels: SimplifyGeometryLevelParams[], params: SimplifyGeometryLODParams): SimplifyGeometryLevelParams[] {
  const paramsPerLevel = new Array<SimplifyGeometryLevelParams>(levels.length);
  let positionRemap: Uint32Array | undefined;

  for (let i = 0, l = levels.length; i < l; i++) {
    const levelParams = { ...params, ...levels[i] };

    validateLevelParams(geometry, levelParams, params.vertices);

    if (levelParams.protectSeams === undefined) {
      paramsPerLevel[i] = levelParams;
      continue;
    }

    positionRemap ??= Meshopt.generatePositionRemap(getPositionArray(geometry));
    paramsPerLevel[i] = withSeamLock(geometry, levelParams, positionRemap);
  }

  return paramsPerLevel;
}

function withSeamLock<T extends SimplifyGeometryLevelParams>(geometry: BufferGeometry, params: T, positionRemap: Uint32Array): T {
  const vertexLock = createSeamLock(geometry, params.protectSeams ?? [], positionRemap, params.vertexLock);

  return { ...params, vertexLock };
}

function packAttributesPerLevel(geometry: BufferGeometry, paramsPerLevel: SimplifyGeometryLevelParams[]): (PackedAttributes | undefined)[] {
  const cache: PackedAttributesCache = new Map();
  const attributesPerLevel = new Array<PackedAttributes | undefined>(paramsPerLevel.length);

  for (let i = 0, l = paramsPerLevel.length; i < l; i++) {
    const attributeWeights = paramsPerLevel[i].attributes;

    if (!cache.has(attributeWeights)) cache.set(attributeWeights, packAttributes(geometry, attributeWeights));

    attributesPerLevel[i] = cache.get(attributeWeights);
  }

  return attributesPerLevel;
}

function createLevels(geometry: BufferGeometry, paramsPerLevel: SimplifyGeometryLevelParams[], attributesPerLevel: (PackedAttributes | undefined)[], vertices: SimplifyGeometryLODParams['vertices']): SimplifyGeometryResult[] {
  const indexArray = getMeshoptIndexArray(geometry);
  const results = new Array<SimplifyGeometryResult>(paramsPerLevel.length + 1);

  results[0] = { geometry, error: 0 };

  for (let i = 0, l = paramsPerLevel.length; i < l; i++) {
    const levelParams = paramsPerLevel[i];
    const level = simplifyLevel(geometry, indexArray, levelParams, attributesPerLevel[i]);
    const levelGeometry = createLevel(geometry, level, vertices, levelParams.optimizeMemory);

    results[i + 1] = { geometry: levelGeometry, error: level.error };
  }

  return results;
}

function createReorderedLevels(geometry: BufferGeometry, paramsPerLevel: SimplifyGeometryLevelParams[], attributesPerLevel: (PackedAttributes | undefined)[], params: SimplifyGeometryLODParams): SimplifyGeometryResult[] {
  const srcIndexArray = getIndexArray(geometry);
  const levels = simplifyLevels(geometry, paramsPerLevel, attributesPerLevel);
  const levelsIndexArrays = getLevelsIndexArrays(srcIndexArray, levels);
  const reordered = reorderGeometry(geometry, levelsIndexArrays);

  return createReorderedResults(reordered, levels, paramsPerLevel, params, srcIndexArray.BYTES_PER_ELEMENT);
}

function createReorderedResults(reordered: ReorderedGeometry, levels: SimplifiedLevel[], paramsPerLevel: SimplifyGeometryLevelParams[], params: SimplifyGeometryLODParams, srcBytesPerIndex: number): SimplifyGeometryResult[] {
  const verticesCount = reordered.geometry.getAttribute('position').count;
  const results = new Array<SimplifyGeometryResult>(levels.length + 1);

  setLevelIndex(reordered.geometry, reordered.indexArrays[0], srcBytesPerIndex, verticesCount, params.optimizeMemory);
  results[0] = { geometry: reordered.geometry, error: 0 };

  for (let i = 0, l = levels.length; i < l; i++) {
    const levelGeometry = createSharedGeometry(reordered.geometry);

    setLevelIndex(levelGeometry, reordered.indexArrays[i + 1], srcBytesPerIndex, verticesCount, paramsPerLevel[i].optimizeMemory);
    results[i + 1] = { geometry: levelGeometry, error: levels[i].error };
  }

  return results;
}

function simplifyLevels(geometry: BufferGeometry, paramsPerLevel: SimplifyGeometryLevelParams[], attributesPerLevel: (PackedAttributes | undefined)[]): SimplifiedLevel[] {
  const indexArray = getMeshoptIndexArray(geometry);
  const levels = new Array<SimplifiedLevel>(paramsPerLevel.length);

  for (let i = 0, l = paramsPerLevel.length; i < l; i++) {
    levels[i] = simplifyLevel(geometry, indexArray, paramsPerLevel[i], attributesPerLevel[i]);
  }

  return levels;
}

function getMeshoptIndexArray(geometry: BufferGeometry): Uint32Array {
  return Meshopt.toUint32IndexArray(getIndexArray(geometry));
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
  const positionArray = getPositionArray(geometry);

  if (params.updateVertices === true) return simplifyLevelWithUpdate(indexArray, positionArray, params, attributes);

  return Meshopt.simplify(indexArray, positionArray, params, attributes);
}

function simplifyLevelWithUpdate(srcIndexArray: Uint32Array, srcPositionArray: Float32Array, params: SimplifyParams, srcAttributes?: PackedAttributes): SimplifiedLevel {
  const positionArray = srcPositionArray.slice();
  const attributes = srcAttributes === undefined ? undefined : { ...srcAttributes, array: srcAttributes.array.slice() };
  const result = Meshopt.simplifyWithUpdate(srcIndexArray.slice(), positionArray, params, attributes);

  return { indexArray: result.indexArray, error: result.error, positionArray, attributes };
}

function createLevel(geometry: BufferGeometry, level: SimplifiedLevel, vertices: SimplifyGeometryLODParams['vertices'], optimizeMemory?: boolean): BufferGeometry {
  const srcBytesPerIndex = getIndexArray(geometry).BYTES_PER_ELEMENT;

  if (vertices === 'shared') {
    const sharedGeometry = createSharedGeometry(geometry);
    const srcVerticesCount = geometry.getAttribute('position').count;

    return setLevelIndex(sharedGeometry, level.indexArray, srcBytesPerIndex, srcVerticesCount, optimizeMemory);
  }

  const compacted = compactGeometry(geometry, level.indexArray);
  const verticesCount = compacted.geometry.getAttribute('position').count;

  if (level.positionArray !== undefined) updateLevelVertices(compacted.geometry, compacted.remap, level.positionArray, level.attributes);

  return setLevelIndex(compacted.geometry, level.indexArray, srcBytesPerIndex, verticesCount, optimizeMemory);
}

function updateLevelVertices(geometry: BufferGeometry, remap: Uint32Array, positionArray: Float32Array, attributes?: PackedAttributes): void {
  unpackAttributes(geometry, remap, positionArray, attributes);

  geometry.boundingBox = null;
  geometry.boundingSphere = null;
}

function setLevelIndex(geometry: BufferGeometry, indexArray: Uint32Array, srcBytesPerIndex: number, verticesCount: number, optimizeMemory?: boolean): BufferGeometry {
  const levelIndexArray = toResultIndexArray(indexArray, srcBytesPerIndex, verticesCount, optimizeMemory);

  geometry.setIndex(new BufferAttribute(levelIndexArray, 1));

  return geometry;
}
