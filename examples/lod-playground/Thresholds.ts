import type { LevelSettings, ModelSettings, Settings } from './Settings.js';
import type { GeometryLOD } from './Simplification.js';

const maxTopRowAngle = 0.1;
const minTopRowAngle = 0.02;
const minFarRadii = 30;
const minNearRadii = 3;
const fieldDepthRatio = 30;
const fieldAspect = 1.6;
const fieldFill = 2.5;
const fieldSeed = 1337;
const maxFieldAttempts = 60000;

/**
 * Returns the metrics passed to `addLOD` for the levels after the first one.
 * With screen size thresholds a level is used when the projected diameter divided by the viewport height is at most the metric.
 * With a pixel error budget the screen size is derived from the error of the level:
 * `errorPixels = error * meshScale * screenSize * viewportHeight / (2 * radius)`.
 */
export function getThresholds(lod: GeometryLOD, levels: LevelSettings[], modelSettings: ModelSettings, viewportHeight: number): number[] {
  const thresholds: number[] = [];

  for (let i = 1; i < lod.levels.length; i++) {
    const level = levels[i - 1];

    if (modelSettings.thresholdMode === 'screenSize') thresholds.push(level.screenSize);
    else if (modelSettings.thresholdMode === 'distance') thresholds.push(level.distance);
    else thresholds.push((2 * modelSettings.pixelError * lod.radius) / (lod.levels[i].error * lod.meshScale * viewportHeight));
  }

  return thresholds;
}

/**
 * Returns which levels after the first one reach the mesh: a level is skipped when its metric is not finite and positive or does not
 * follow the previous level (smaller screen size, larger distance), because it would never be used.
 */
export function getUsedLevels(thresholds: number[], modelSettings: ModelSettings): boolean[] {
  const isDistance = modelSettings.thresholdMode === 'distance';
  const used: boolean[] = [];
  let last = isDistance ? 0 : Infinity;

  for (const threshold of thresholds) {
    const isValid = Number.isFinite(threshold) && threshold > 0 && (isDistance ? threshold > last : threshold < last);

    used.push(isValid);

    if (isValid) last = threshold;
  }

  return used;
}

/**
 * Returns the camera distance at which an instance switches to a level, for a perspective camera.
 */
export function getSwitchDistance(threshold: number, radius: number, modelSettings: Pick<ModelSettings, 'thresholdMode'>, fov: number): number {
  if (modelSettings.thresholdMode === 'distance') return threshold;

  return radius / (threshold * getTanHalfFov(fov));
}

/**
 * Returns the screen size (projected diameter / viewport height) at which an instance switches to a level.
 */
export function getSwitchScreenSize(threshold: number, radius: number, modelSettings: Pick<ModelSettings, 'thresholdMode'>, fov: number): number {
  if (modelSettings.thresholdMode !== 'distance') return threshold;

  return radius / (threshold * getTanHalfFov(fov));
}

/**
 * Uniform grid of accepted points, with cells as large as the separation, so a point is checked against the 9 cells around it.
 */
class FieldGrid {
  private readonly cellSize: number;
  private readonly separationSq: number;
  private readonly cells = new Map<number, number[]>();

  constructor(separation: number) {
    this.cellSize = separation;
    this.separationSq = separation * separation;
  }

  isFree(x: number, z: number): boolean {
    const cellX = Math.floor(x / this.cellSize);
    const cellZ = Math.floor(z / this.cellSize);

    for (let i = cellX - 1; i <= cellX + 1; i++) {
      for (let j = cellZ - 1; j <= cellZ + 1; j++) {
        const points = this.cells.get(getCellKey(i, j));

        if (points === undefined) continue;

        for (let k = 0; k < points.length; k += 2) {
          const dx = points[k] - x;
          const dz = points[k + 1] - z;

          if (dx * dx + dz * dz < this.separationSq) return false;
        }
      }
    }

    return true;
  }

  add(x: number, z: number): void {
    const key = getCellKey(Math.floor(x / this.cellSize), Math.floor(z / this.cellSize));
    const points = this.cells.get(key);

    if (points === undefined) this.cells.set(key, [x, z]);
    else points.push(x, z);
  }
}

export interface FieldLayout {
  /** Height of the camera above the instance centers. */
  height: number;
  /** Angle below the horizon of the view direction. */
  pitch: number;
  /** Ground position of each instance as x, z pairs, with the camera above the origin looking towards -z. */
  positions: Float32Array;
  /** Distance from the camera to each instance. */
  distances: Float32Array;
  /** Largest ground distance of an instance from the camera. */
  depth: number;
}

/**
 * Scatters `settings.instances` instances on the ground seen by a camera that looks down from above, at least `settings.spread` radii
 * apart. The layout depends only on the mesh radius, the instances and the spread, not on the level switches, so that changing a
 * switch changes which level each instance draws and never moves the instances under the camera. The camera distances are sampled on
 * a logarithmic scale, so every level gets instances, and the field grows until all of them fit.
 */
export function getFieldLayout(lod: GeometryLOD, settings: Settings, fov: number): FieldLayout {
  const radius = lod.radius;
  const instancesCount = settings.instances;
  const separation = radius * settings.spread;
  const tanHalfWidth = getTanHalfFov(fov) * fieldAspect * 0.92;
  const minFar = Math.sqrt((instancesCount * separation * separation * fieldFill) / tanHalfWidth);
  const far = Math.max(radius * minFarRadii, minFar);
  const near = Math.max(far / fieldDepthRatio, radius * minNearRadii);
  const bottomAngle = maxTopRowAngle + ((fov * Math.PI) / 360) * 1.6;
  const topAngle = Math.min(Math.max(Math.asin(Math.min((Math.sin(bottomAngle) * near) / far, 1)), minTopRowAngle), maxTopRowAngle);
  const height = far * Math.sin(topAngle);
  const visibleNear = height / Math.sin(bottomAngle);
  const field = new FieldGrid(separation);
  const positions = new Float32Array(instancesCount * 2);
  const distances = new Float32Array(instancesCount);
  const random = createRandom(fieldSeed);
  const logRange = Math.log(far / visibleNear);
  let count = 0;
  let maxDepth = 0;

  for (let attempt = 0; attempt < maxFieldAttempts && count < instancesCount; attempt++) {
    const distance = visibleNear * Math.exp(random() * logRange);
    const depth = Math.sqrt(Math.max(distance * distance - height * height, 0));
    const x = (random() * 2 - 1) * depth * tanHalfWidth;
    const z = -depth;

    if (!field.isFree(x, z)) continue;

    field.add(x, z);
    positions[count * 2] = x;
    positions[count * 2 + 1] = z;
    distances[count] = Math.sqrt(x * x + depth * depth + height * height);
    maxDepth = Math.max(maxDepth, depth);
    count++;
  }

  return { height, pitch: (topAngle + bottomAngle) / 2, positions: positions.slice(0, count * 2), distances: distances.slice(0, count), depth: maxDepth };
}

function getCellKey(x: number, z: number): number {
  return (x + 32768) * 65536 + (z + 32768);
}

function createRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) | 0;

    let value = Math.imul(state ^ (state >>> 15), 1 | state);

    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;

    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function getTanHalfFov(fov: number): number {
  return Math.tan((fov * Math.PI) / 360);
}
