import { MeshoptSimplifier, type SimplifierFlags } from 'meshoptimizer/simplifier';
import type { IndexArray, SimplifyAttributes, SimplifyParams } from './Simplify.js';

/**
 * Indices and error returned by a meshoptimizer simplification.
 * @internal
 */
export interface SimplifyOutput {
  indexArray: Uint32Array;
  error: number;
}

/**
 * Remap from source to compacted vertices, and the number of compacted vertices.
 * @internal
 */
export interface CompactOutput {
  remap: Uint32Array;
  verticesCount: number;
}

interface SimplifierOptions {
  targetCount: number;
  error: number;
  vertexLock: Uint8Array | null;
  flags: SimplifierFlags[];
}

/**
 * Number of floats per vertex in the position arrays passed to meshoptimizer.
 * @internal
 */
export const positionStride = 3;

/**
 * Value of a remap entry for a vertex that is not used by the remapped indices.
 * @internal
 */
export const unusedVertex = 0xffffffff;

/**
 * `vertexLock` value of a vertex that can move only to collapse a seam or border edge.
 * @internal
 */
export const protectedVertex = 2;

const indicesPerTriangle = 3;
const unlimitedError = 3.4028234663852886e38;
const emptyAttributes: SimplifyAttributes = { array: new Float32Array(0), stride: 0, weights: [] };

let isReady = false;

/** @internal */
export async function load(): Promise<void> {
  await MeshoptSimplifier.ready;
  isReady = true;
}

/** @internal */
export function validateReady(): void {
  if (!isReady) throw new Error('"simplifyReady()" must be awaited before using the simplifier.');
}

/** @internal */
export function getScale(positionArray: Float32Array): number {
  return MeshoptSimplifier.getScale(positionArray, positionStride);
}

/** @internal */
export function generatePositionRemap(positionArray: Float32Array): Uint32Array {
  return MeshoptSimplifier.generatePositionRemap(positionArray, positionStride);
}

/**
 * Runs `simplifySloppy` when `params.sloppy` is enabled, `simplifyWithAttributes` otherwise, on arguments already validated.
 * @internal
 */
export function simplify(indexArray: Uint32Array, positionArray: Float32Array, params: SimplifyParams, attributes: SimplifyAttributes = emptyAttributes): SimplifyOutput {
  const options = getSimplifierOptions(params, indexArray.length);

  if (params.sloppy === true) return simplifySloppy(indexArray, positionArray, params, options);

  const [dstIndexArray, error] = MeshoptSimplifier.simplifyWithAttributes(
    indexArray, positionArray, positionStride,
    attributes.array, attributes.stride, attributes.weights,
    options.vertexLock, options.targetCount, options.error, options.flags
  );

  return { indexArray: dstIndexArray, error };
}

/**
 * Like `simplify`, but also moves the remaining vertices: `indexArray`, `positionArray` and `attributes.array` are modified in place.
 * The returned indices are a copy of the used part of `indexArray`.
 * @internal
 */
export function simplifyWithUpdate(indexArray: Uint32Array, positionArray: Float32Array, params: SimplifyParams, attributes: SimplifyAttributes = emptyAttributes): SimplifyOutput {
  const options = getSimplifierOptions(params, indexArray.length);
  const [indexCount, error] = MeshoptSimplifier.simplifyWithUpdate(
    indexArray, positionArray, positionStride,
    attributes.array, attributes.stride, attributes.weights,
    options.vertexLock, options.targetCount, options.error, options.flags
  );

  return { indexArray: indexArray.slice(0, indexCount), error };
}

/**
 * Remaps `indexArray` in place so that the used vertices are numbered in order of first use.
 * @internal
 */
export function compactMesh(indexArray: Uint32Array): CompactOutput {
  const [remap, verticesCount] = MeshoptSimplifier.compactMesh(indexArray);

  return { remap, verticesCount };
}

/**
 * Uint8Array and Uint16Array indices are copied to a Uint32Array, the only index type accepted by every meshoptimizer function.
 * @internal
 */
export function toUint32IndexArray(indexArray: IndexArray): Uint32Array {
  if (indexArray.constructor === Uint32Array) return indexArray;

  return new Uint32Array(indexArray);
}

function simplifySloppy(indexArray: Uint32Array, positionArray: Float32Array, params: SimplifyParams, options: SimplifierOptions): SimplifyOutput {
  const scale = params.errorAbsolute === true ? getScale(positionArray) : 1;
  const targetError = Math.min(options.error / scale, unlimitedError);
  const [dstIndexArray, error] = MeshoptSimplifier.simplifySloppy(
    indexArray, positionArray, positionStride, options.vertexLock, options.targetCount, targetError
  );

  return { indexArray: dstIndexArray, error: error * scale };
}

function getSimplifierOptions(params: SimplifyParams, indicesCount: number): SimplifierOptions {
  return {
    targetCount: indicesPerTriangle * Math.floor((params.ratio ?? 0) * (indicesCount / indicesPerTriangle)),
    error: params.error ?? unlimitedError,
    vertexLock: params.vertexLock ?? null,
    flags: getFlags(params)
  };
}

function getFlags(params: SimplifyParams): SimplifierFlags[] {
  const flags: SimplifierFlags[] = [];

  if (params.lockBorder === true) flags.push('LockBorder');
  if (params.sparse === true) flags.push('Sparse');
  if (params.errorAbsolute === true) flags.push('ErrorAbsolute');
  if (params.prune === true) flags.push('Prune');
  if (params.regularize === true) flags.push('Regularize');
  if (params.regularizeLight === true) flags.push('RegularizeLight');
  if (params.permissive === true) flags.push('Permissive');
  if (params.preserveFolds === true) flags.push('PreserveFolds');
  if (params.errorClamped === true) flags.push('ErrorClamped');

  return flags;
}
