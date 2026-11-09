import { MeshoptSimplifier, type SimplifierFlags } from 'meshoptimizer/simplifier';
import { validatePositionArray, validateSimplifyArgs } from './Validation.js';

export type IndexArray = Uint32Array | Uint16Array | Uint8Array;

export type SimplifyResult = [IndexArray, number];

export interface SimplifyParams {
  ratio?: number;
  error?: number;
  lockBorder?: boolean;
  errorAbsolute?: boolean;
  sparse?: boolean;
  prune?: boolean;
  regularize?: boolean;
  regularizeLight?: boolean;
  permissive?: boolean;
  preserveFolds?: boolean;
  errorClamped?: boolean;
  vertexLock?: Uint8Array;
  /** @default true */
  optimizeMemory?: boolean;
}

export interface SimplifyAttributes {
  array: Float32Array;
  stride: number;
  weights: number[];
}

interface SimplifierOptions {
  targetCount: number;
  error: number;
  vertexLock: Uint8Array | null;
  flags: SimplifierFlags[];
}

const unlimitedError = 3.4028234663852886e38;
const emptyAttributes: SimplifyAttributes = { array: new Float32Array(0), stride: 0, weights: [] };

let isReady = false;

export async function simplifyReady(): Promise<void> {
  await MeshoptSimplifier.ready;
  isReady = true;
}

export function simplify(srcIndexArray: IndexArray, srcPositionArray: Float32Array, params: SimplifyParams, srcAttributes?: SimplifyAttributes): SimplifyResult {
  validateReady();
  validateSimplifyArgs(srcIndexArray, srcPositionArray, params, srcAttributes);

  const verticesCount = srcPositionArray.length / 3;
  const [dstIndexArray, error] = simplifyIndexArray(toMeshoptIndexArray(srcIndexArray), srcPositionArray, params, srcAttributes);

  return [toIndexArray(dstIndexArray, srcIndexArray.BYTES_PER_ELEMENT, verticesCount, params.optimizeMemory), error];
}

export function getScale(srcPositionArray: Float32Array): number {
  validateReady();
  validatePositionArray(srcPositionArray);

  return MeshoptSimplifier.getScale(srcPositionArray, 3);
}

/** @internal */
export function validateReady(): void {
  if (!isReady) throw new Error('"simplifyReady()" must be awaited before using the simplifier.');
}

/**
 * Runs meshoptimizer on arguments that the caller has already validated.
 * @internal
 */
export function simplifyIndexArray(indexArray: Uint32Array, positionArray: Float32Array, params: SimplifyParams, attributes?: SimplifyAttributes): [Uint32Array, number] {
  const { targetCount, error, vertexLock, flags } = getSimplifierOptions(params, indexArray.length);
  const { array, stride, weights } = attributes ?? emptyAttributes;

  return MeshoptSimplifier.simplifyWithAttributes(
    indexArray, positionArray, 3, array, stride, weights, vertexLock, targetCount, error, flags
  );
}

/**
 * Like `simplifyIndexArray`, but also moves the remaining vertices: `indexArray`, `positionArray` and `attributes.array` are modified in place.
 * @internal
 */
export function updateIndexArray(indexArray: Uint32Array, positionArray: Float32Array, params: SimplifyParams, attributes?: SimplifyAttributes): [Uint32Array, number] {
  const { targetCount, error, vertexLock, flags } = getSimplifierOptions(params, indexArray.length);
  const { array, stride, weights } = attributes ?? emptyAttributes;
  const [indexCount, resultError] = MeshoptSimplifier.simplifyWithUpdate(
    indexArray, positionArray, 3, array, stride, weights, vertexLock, targetCount, error, flags
  );

  return [indexArray.slice(0, indexCount), resultError];
}

/**
 * Uint8Array and Uint16Array indices are copied to a Uint32Array for meshoptimizer.
 * @internal
 */
export function toMeshoptIndexArray(indexArray: IndexArray): Uint32Array {
  if (indexArray.constructor === Uint32Array) return indexArray;

  return new Uint32Array(indexArray);
}

/**
 * The returned indices keep the source type, or a smaller one that fits the vertex count when `optimizeMemory` is enabled (default).
 * @internal
 */
export function toIndexArray(indexArray: Uint32Array, srcBytesPerIndex: number, verticesCount: number, optimizeMemory?: boolean): IndexArray {
  const smallestBytesPerIndex = getSmallestBytesPerIndex(verticesCount);
  const bytesPerIndex = optimizeMemory === false ? srcBytesPerIndex : Math.min(srcBytesPerIndex, smallestBytesPerIndex);

  if (bytesPerIndex === 1) return new Uint8Array(indexArray);
  if (bytesPerIndex === 2) return new Uint16Array(indexArray);

  return indexArray;
}

function getSimplifierOptions(params: SimplifyParams, indicesCount: number): SimplifierOptions {
  return {
    targetCount: 3 * Math.floor((params.ratio ?? 0) * (indicesCount / 3)),
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

function getSmallestBytesPerIndex(verticesCount: number): number {
  if (verticesCount <= 255) return 1;
  if (verticesCount <= 65535) return 2;
  return 4;
}
