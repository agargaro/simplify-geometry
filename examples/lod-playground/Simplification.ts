import { getScale, simplifyGeometry as simplifyGeometryLevel, simplifyGeometryLOD, type SimplifyGeometryLevelParams, type SimplifyGeometryLODParams, type SimplifyGeometryResult } from '@three.ez/simplify-geometry';
import type { BufferGeometry } from 'three';
import { simplifyFlags, type LevelSettings, type ModelSettings, type SimplifyFlag } from './Settings.js';

export interface GeometryLOD {
  levels: SimplifyGeometryResult[];
  radius: number;
  /** Largest extent of the bounding box of level 0: relative errors are fractions of it. */
  extent: number;
  /** Model units per unit of the level errors: `extent`, or 1 with absolute errors. */
  meshScale: number;
  time: number;
}

/**
 * Returns the parameters shared by every level. Flags enabled on every level are set here once.
 */
export function getSimplifyParams(modelSettings: ModelSettings, levels: LevelSettings[]): SimplifyGeometryLODParams {
  const params = getBaseParams(modelSettings);

  for (const flag of getSharedFlags(levels)) params[flag] = true;

  return params;
}

/**
 * Returns the parameters of each level, without the flags listed in `sharedFlags`.
 */
export function getLevelParams(levels: LevelSettings[], sharedFlags: SimplifyFlag[], modelSettings: ModelSettings): SimplifyGeometryLevelParams[] {
  const params: SimplifyGeometryLevelParams[] = [];

  for (const level of levels) {
    const levelParams: SimplifyGeometryLevelParams = {};

    if (level.ratio > 0) levelParams.ratio = level.ratio;
    levelParams.error = level.error;
    if (level.sloppy) levelParams.sloppy = true;
    if (level.updateVertices && canUpdateVertices(level, modelSettings)) levelParams.updateVertices = true;

    for (const flag of simplifyFlags) {
      if (level[flag] && !sharedFlags.includes(flag)) levelParams[flag] = true;
    }

    params.push(levelParams);
  }

  return params;
}

export function getSharedFlags(levels: LevelSettings[]): SimplifyFlag[] {
  return simplifyFlags.filter((flag) => levels.every((level) => level[flag]));
}

export function canUpdateVertices(level: LevelSettings, modelSettings: ModelSettings): boolean {
  return modelSettings.vertices === 'compact' && !level.sloppy;
}

export function simplifyGeometry(source: BufferGeometry, levels: LevelSettings[], modelSettings: ModelSettings): GeometryLOD {
  const start = performance.now();
  const results = simplifyGeometryLOD(source, getLevelParams(levels, [], modelSettings), getBaseParams(modelSettings));
  const time = performance.now() - start;
  const geometry = results[0].geometry;
  const extent = getScale(geometry.getAttribute('position').array as Float32Array);

  for (const result of results) {
    if (result.geometry.boundingSphere === null) result.geometry.computeBoundingSphere();
  }

  return {
    levels: results,
    radius: geometry.boundingSphere?.radius ?? 0,
    extent,
    meshScale: modelSettings.errorAbsolute ? 1 : extent,
    time
  };
}

/**
 * Simplifies `level` alone with the simplification settings of the model. The result shares the vertices of `source` and is never drawn:
 * it is enough to read its triangles and error.
 */
export function simplifyLevel(source: BufferGeometry, level: LevelSettings, modelSettings: ModelSettings): SimplifyGeometryResult {
  const sharedSettings: ModelSettings = { ...modelSettings, vertices: 'shared' };
  const levelParams = getLevelParams([level], [], sharedSettings)[0];

  return simplifyGeometryLevel(source, { ...getBaseParams(sharedSettings), ...levelParams, vertices: 'shared' });
}

export function disposeLOD(lod: GeometryLOD, source: BufferGeometry): void {
  for (const level of lod.levels) {
    if (level.geometry !== source) level.geometry.dispose();
  }
}

export function getTriangles(geometry: BufferGeometry): number {
  return (geometry.index?.count ?? 0) / 3;
}

export function getVertices(geometry: BufferGeometry): number {
  return geometry.getAttribute('position').count;
}

function getBaseParams(modelSettings: ModelSettings): SimplifyGeometryLODParams {
  const params: SimplifyGeometryLODParams = { vertices: modelSettings.vertices };
  const protectSeams = getProtectSeams(modelSettings);

  if (modelSettings.errorAbsolute) params.errorAbsolute = true;
  if (protectSeams.length > 0) params.protectSeams = protectSeams;

  return params;
}

function getProtectSeams(modelSettings: ModelSettings): string[] {
  const names: string[] = [];

  if (modelSettings.protectNormalSeams) names.push('normal');
  if (modelSettings.protectUvSeams) names.push('uv');

  return names;
}
