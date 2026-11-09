import { MeshoptSimplifier, type SimplifierFlags } from 'meshoptimizer/simplifier';
import { validateArrays, validateParams, validateVertexData } from './Validation.js';

export type SimplifyResult = [Uint32Array | Uint16Array | Uint8Array, number];

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
  optimizeMemory?: boolean; // default true
}

export interface SimplifyAttributes {
  array: Float32Array;
  stride: number;
  weights: number[];
}

const emptyAttributes: SimplifyAttributes = { array: new Float32Array(0), stride: 0, weights: [] };

let isReady = false;

export async function simplifyReady(): Promise<void> {
  await MeshoptSimplifier.ready;
  isReady = true;
}

export function simplify(srcIndexArray: SimplifyResult[0], srcPositionArray: Float32Array, params: SimplifyParams, srcAttributes?: SimplifyAttributes): SimplifyResult {
  if (!isReady) throw new Error('"simplifyReady()" must be awaited before simplifying.');
  validateArrays(srcIndexArray, srcPositionArray);
  validateParams(params);
  validateVertexData(srcPositionArray.length / 3, params.vertexLock, srcAttributes);

  const meshoptIndexArray = toMeshoptIndexArray(srcIndexArray);
  const bytesPerIndex = getDstBytesPerIndex(srcIndexArray, srcPositionArray.length / 3, params.optimizeMemory !== false);

  const result = runSimplifier(meshoptIndexArray, srcPositionArray, params, srcAttributes);

  result[0] = toIndexArray(result[0], bytesPerIndex);

  return result;
}

function runSimplifier(indexArray: Uint32Array, positionArray: Float32Array, params: SimplifyParams, attributes?: SimplifyAttributes): SimplifyResult {
  const flags = getFlags(params);
  const error = params.error ?? 1;
  const ratio = params.ratio ?? 0;
  const targetCount = 3 * Math.floor((ratio) * (indexArray.length / 3));
  const vertexLock = params.vertexLock ?? null;
  const { array, stride, weights } = attributes ?? emptyAttributes;

  return MeshoptSimplifier.simplifyWithAttributes(
    indexArray, positionArray, 3, array, stride, weights, vertexLock, targetCount, error, flags
  );
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

/**
 * Uint8Array and Uint16Array indices are copied to a Uint32Array for meshoptimizer.
 * The returned indices keep the source type, or a smaller one that fits the vertex count when `optimizeMemory` is enabled (default).
 */
function toMeshoptIndexArray(indexArray: SimplifyResult[0]): Uint32Array {
  if (indexArray.constructor === Uint32Array) return indexArray;

  return new Uint32Array(indexArray);
}

function getDstBytesPerIndex(srcIndexArray: SimplifyResult[0], verticesCount: number, optimizeMemory: boolean): number {
  const srcBytesPerIndex = srcIndexArray.BYTES_PER_ELEMENT;

  if (!optimizeMemory) return srcBytesPerIndex;

  return Math.min(srcBytesPerIndex, getSmallestBytesPerIndex(verticesCount));
}

function toIndexArray(indexArray: SimplifyResult[0], bytesPerIndex: number): SimplifyResult[0] {
  if (bytesPerIndex === indexArray.BYTES_PER_ELEMENT) return indexArray;
  if (bytesPerIndex === 1) return new Uint8Array(indexArray);
  if (bytesPerIndex === 2) return new Uint16Array(indexArray);

  return new Uint32Array(indexArray);
}

function getSmallestBytesPerIndex(verticesCount: number): number {
  if (verticesCount <= 255) return 1;
  if (verticesCount <= 65535) return 2;
  return 4;
}
