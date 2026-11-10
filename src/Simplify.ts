import * as Meshopt from './Meshopt.js';
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
  /**
   * Uses meshoptimizer `simplifySloppy`: faster and able to merge disconnected parts, but it ignores seams, borders and attributes,
   * so the result has a larger error. Supports only `ratio`, `error`, `errorAbsolute`, `vertexLock` and `optimizeMemory`:
   * the other flags and the attributes are ignored.
   * @default false
   */
  sloppy?: boolean;
  /** @default true */
  optimizeMemory?: boolean;
}

export interface SimplifyAttributes {
  array: Float32Array;
  stride: number;
  weights: number[];
}

export async function simplifyReady(): Promise<void> {
  await Meshopt.load();
}

export function simplify(srcIndexArray: IndexArray, srcPositionArray: Float32Array, params: SimplifyParams, srcAttributes?: SimplifyAttributes): SimplifyResult {
  Meshopt.validateReady();
  validateSimplifyArgs(srcIndexArray, srcPositionArray, params);

  const verticesCount = srcPositionArray.length / Meshopt.positionStride;
  const srcBytesPerIndex = srcIndexArray.BYTES_PER_ELEMENT;
  const indexArray = Meshopt.toUint32IndexArray(srcIndexArray);
  const result = Meshopt.simplify(indexArray, srcPositionArray, params, srcAttributes);
  const dstIndexArray = toResultIndexArray(result.indexArray, srcBytesPerIndex, verticesCount, params.optimizeMemory);

  return [dstIndexArray, result.error];
}

export function getScale(srcPositionArray: Float32Array): number {
  Meshopt.validateReady();
  validatePositionArray(srcPositionArray);

  return Meshopt.getScale(srcPositionArray);
}

/**
 * Maps every vertex to the first vertex with the same position. Vertices that share a position but not their attributes lie on a seam.
 */
export function generatePositionRemap(srcPositionArray: Float32Array): Uint32Array {
  Meshopt.validateReady();
  validatePositionArray(srcPositionArray);

  return Meshopt.generatePositionRemap(srcPositionArray);
}

/**
 * The returned indices keep the source type, or a smaller one that fits the vertex count when `optimizeMemory` is enabled (default).
 * The returned array always owns its whole buffer, so a view of a larger buffer is copied.
 * @internal
 */
export function toResultIndexArray(indexArray: Uint32Array, srcBytesPerIndex: number, verticesCount: number, optimizeMemory?: boolean): IndexArray {
  const smallestBytesPerIndex = getSmallestBytesPerIndex(verticesCount);
  const bytesPerIndex = optimizeMemory === false ? srcBytesPerIndex : Math.min(srcBytesPerIndex, smallestBytesPerIndex);
  const isView = indexArray.byteLength !== indexArray.buffer.byteLength;

  if (bytesPerIndex === 1) return new Uint8Array(indexArray);
  if (bytesPerIndex === 2) return new Uint16Array(indexArray);
  if (isView) return indexArray.slice();

  return indexArray;
}

function getSmallestBytesPerIndex(verticesCount: number): number {
  if (verticesCount <= 255) return 1;
  if (verticesCount <= 65535) return 2;
  return 4;
}
