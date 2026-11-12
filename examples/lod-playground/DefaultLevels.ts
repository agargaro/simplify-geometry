import { getScale } from '@three.ez/simplify-geometry';
import type { BufferGeometry } from 'three';
import { createNextLevel, defaultErrors, type LevelSettings, type ModelSettings } from './Settings.js';
import { getTriangles, simplifyLevel } from './Simplification.js';

/**
 * Triangles and error measured by meshoptimizer of the last level: the source, with error 0, when there is no level yet.
 */
export interface PreviousLevel {
  triangles: number;
  error: number;
}

interface Context {
  source: BufferGeometry;
  modelSettings: ModelSettings;
  /** Units of the level errors per unit of `defaultErrors`: 1, or the mesh size with absolute errors. */
  errorScale: number;
  maxError: number;
}

interface Candidate extends PreviousLevel {
  level: LevelSettings;
}

const maxDefaultLevels = defaultErrors.length;
/** A level needs at least this many times fewer triangles than the previous one. */
const minReduction = 1.5;
/** Factor that raises the error of a level until it removes enough triangles. */
const errorStep = 1.25;
/** The error of a level starts from at least this many times the measured error of the previous one, so that the errors keep growing. */
const errorGrowth = 1.5;

/**
 * Computes the default levels of a geometry with the simplification settings of the model. Each level starts from the next error of
 * `defaultErrors`, raised by `errorStep` until the level has `minReduction` times fewer triangles than the previous one and at least one
 * triangle. Levels are added until `maxDefaultLevels` or until no error makes a level simpler. There is always at least one level.
 */
export function computeDefaultLevels(source: BufferGeometry, modelSettings: ModelSettings): LevelSettings[] {
  const context = createContext(source, modelSettings);
  const levels: LevelSettings[] = [];
  let previous: PreviousLevel = { triangles: getTriangles(source), error: 0 };

  while (levels.length < maxDefaultLevels) {
    const candidate = findNextLevel(context, levels, previous);

    if (candidate === null) break;

    levels.push(candidate.level);
    previous = candidate;
  }

  if (levels.length === 0) levels.push(computeNextLevel(source, modelSettings, levels, previous));

  return levels;
}

/**
 * Computes the level added after `levels` as the default levels are computed. The new level keeps the flags of the last one. When no
 * error makes it simpler, it halves the ratio and doubles the error of the last level.
 */
export function computeNextLevel(source: BufferGeometry, modelSettings: ModelSettings, levels: LevelSettings[], previous: PreviousLevel): LevelSettings {
  const context = createContext(source, modelSettings);
  const candidate = findNextLevel(context, levels, previous);

  if (candidate !== null) return candidate.level;

  const last = levels.at(-1);
  const lastError = last?.error ?? defaultErrors[0] * context.errorScale;

  return createNextLevel(last, Math.min(lastError * 2, context.maxError), (last?.ratio ?? 0) / 2);
}

function createContext(source: BufferGeometry, modelSettings: ModelSettings): Context {
  const errorScale = modelSettings.errorAbsolute ? getScale(source.getAttribute('position').array as Float32Array) : 1;

  return { source, modelSettings, errorScale, maxError: roundError(errorScale) };
}

/**
 * Returns the level after `levels` with the smallest tried error that makes it `minReduction` times simpler than `previous`, or null when
 * no error up to the whole mesh size does without removing every triangle.
 */
function findNextLevel(context: Context, levels: LevelSettings[], previous: PreviousLevel): Candidate | null {
  const last = levels.at(-1);
  const scheduledError = defaultErrors[Math.min(levels.length, defaultErrors.length - 1)] * context.errorScale;
  let error = roundError(Math.min(Math.max(scheduledError, previous.error * errorGrowth), context.maxError));
  let candidate = simplify(context, createNextLevel(last, error, 0));

  while (!isReduced(candidate, previous) && error < context.maxError) {
    error = roundError(Math.min(error * errorStep, context.maxError));
    candidate = simplify(context, createNextLevel(last, error, 0));
  }

  return isReduced(candidate, previous) ? candidate : null;
}

function simplify(context: Context, level: LevelSettings): Candidate {
  const result = simplifyLevel(context.source, level, context.modelSettings);

  return { level, triangles: getTriangles(result.geometry), error: result.error };
}

/**
 * Whether `candidate` has `minReduction` times fewer triangles than `previous` and still has triangles: prune can remove every part of the
 * mesh at large errors.
 */
function isReduced(candidate: PreviousLevel, previous: PreviousLevel): boolean {
  return candidate.triangles > 0 && candidate.triangles * minReduction <= previous.triangles;
}

function roundError(error: number): number {
  return Number(error.toPrecision(2));
}
