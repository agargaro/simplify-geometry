import { getScale, simplifyGeometryLOD, type SimplifyGeometryLevelParams, type SimplifyGeometryLODParams, type SimplifyGeometryResult } from '@three.ez/simplify-geometry';
import type { BufferGeometry } from 'three';
import { countInfluences, type SkinData } from './Models.js';
import type { SkinReducer } from './SkinReducer.js';
import { simplifyFlags, type LevelSettings, type Settings, type SimplifyFlag } from './Settings.js';

export interface GeometryLOD {
  levels: SimplifyGeometryResult[];
  radius: number;
  meshScale: number;
  time: number;
}

/**
 * Geometries drawn for each level: the simplified ones, or copies with fewer skin influences.
 */
export interface DrawLevels {
  geometries: BufferGeometry[];
  influences: number[];
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
    if (level.limitError) levelParams.error = level.error;
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

  for (const result of results) {
    if (result.geometry.boundingSphere === null) result.geometry.computeBoundingSphere();
  }

  return {
    levels: results,
    radius: geometry.boundingSphere?.radius ?? 0,
    meshScale: settings.errorAbsolute ? 1 : getScale(geometry.getAttribute('position').array as Float32Array),
    time
  };
}

/**
 * Keeps the fewest skin influences per vertex whose displacement stays within `skinError` pixels over every baked frame, for each level
 * from the screen size at which it starts. `screenSizes` holds the starting screen size of the levels after the first one; a positive
 * `maxInfluences` of a level fixes its influences instead.
 */
export function reduceSkin(lod: GeometryLOD, skin: SkinData | null, reducer: SkinReducer | null, levels: LevelSettings[], screenSizes: number[], skinError: number, viewportHeight: number): DrawLevels {
  const start = performance.now();
  const geometries = [lod.levels[0].geometry];
  const influences = [skin === null ? 0 : skin.influences];

  for (let i = 1; i < lod.levels.length; i++) {
    const geometry = lod.levels[i].geometry;
    const screenSize = screenSizes[i - 1];

    if (skin === null || reducer === null) {
      geometries.push(geometry);
      influences.push(0);
      continue;
    }

    const maxInfluences = levels[i - 1].maxInfluences;

    if (maxInfluences > 0) {
      const reduced = maxInfluences < skin.influences ? reducer.reduceTo(i, maxInfluences) : null;

      geometries.push(reduced?.geometry ?? geometry);
      influences.push(reduced?.influences ?? countInfluences(geometry));
      continue;
    }

    if (skinError <= 0 || !(screenSize > 0) || !Number.isFinite(screenSize)) {
      geometries.push(geometry);
      influences.push(countInfluences(geometry));
      continue;
    }

    const reduced = reducer.reduce(i, skinError / (screenSize * viewportHeight));

    geometries.push(reduced.geometry);
    influences.push(reduced.influences);
  }

  return { geometries, influences, time: performance.now() - start };
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
