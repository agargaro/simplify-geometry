import { getScale, simplifyGeometryLOD, type SimplifyGeometryLevelParams, type SimplifyGeometryLODParams, type SimplifyGeometryResult } from '@three.ez/simplify-geometry';
import type { BufferGeometry } from 'three';
import { simplifyFlags, type LevelSettings, type Settings, type SimplifyFlag } from './Settings.js';

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
export function getSimplifyParams(settings: Settings, levels: LevelSettings[]): SimplifyGeometryLODParams {
  const params = getBaseParams(settings);

  for (const flag of getSharedFlags(levels)) params[flag] = true;

  return params;
}

/**
 * Returns the parameters of each level, without the flags listed in `sharedFlags`.
 */
export function getLevelParams(levels: LevelSettings[], sharedFlags: SimplifyFlag[], settings: Settings): SimplifyGeometryLevelParams[] {
  const params: SimplifyGeometryLevelParams[] = [];

  for (const level of levels) {
    const levelParams: SimplifyGeometryLevelParams = {};

    if (level.ratio > 0) levelParams.ratio = level.ratio;
    levelParams.error = level.error;
    if (level.sloppy) levelParams.sloppy = true;
    if (level.updateVertices && canUpdateVertices(level, settings)) levelParams.updateVertices = true;

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

export function canUpdateVertices(level: LevelSettings, settings: Settings): boolean {
  return settings.vertices === 'compact' && !level.sloppy;
}

export function simplifyGeometry(source: BufferGeometry, levels: LevelSettings[], settings: Settings): GeometryLOD {
  const start = performance.now();
  const results = simplifyGeometryLOD(source, getLevelParams(levels, [], settings), getBaseParams(settings));
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
    meshScale: settings.errorAbsolute ? 1 : extent,
    time
  };
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

function getBaseParams(settings: Settings): SimplifyGeometryLODParams {
  const params: SimplifyGeometryLODParams = { vertices: settings.vertices };
  const protectSeams = getProtectSeams(settings);

  if (settings.errorAbsolute) params.errorAbsolute = true;
  if (protectSeams.length > 0) params.protectSeams = protectSeams;

  return params;
}

function getProtectSeams(settings: Settings): string[] {
  const names: string[] = [];

  if (settings.protectNormalSeams) names.push('normal');
  if (settings.protectUvSeams) names.push('uv');

  return names;
}
