import { MeshoptSimplifier, type SimplifierFlags } from 'meshoptimizer/simplifier';

export type SimplifyResult = [Uint32Array | Uint16Array | Uint8Array, number];

export interface SimplifyParams {
  ratio: number;
  error?: number;
  lockBorder?: boolean;
  errorAbsolute?: boolean;
  sparse?: boolean;
  prune?: boolean;
  regularize?: boolean;
  regularizeLight?: boolean;
  permissive?: boolean;
  preserveFolds?: boolean;
  optimizeMemory?: boolean; // default true
}

let isReady = false;

export async function simplifyReady(): Promise<void> {
  await MeshoptSimplifier.ready;
  isReady = true;
}

export function simplify(srcIndexArray: SimplifyResult[0], srcPositionArray: Float32Array, params: SimplifyParams): SimplifyResult {
  if (!isReady) throw new Error('"simplifyReady()" must be awaited before simplifying.');
  validateArrays(srcIndexArray, srcPositionArray);
  validateParams(params);

  const flags = getFlags(params);
  const error = params.error ?? 1;
  const targetCount = 3 * Math.floor(params.ratio * (srcIndexArray.length / 3));
  const meshoptIndexArray = toMeshoptIndexArray(srcIndexArray);
  const bytesPerIndex = getDstBytesPerIndex(srcIndexArray, srcPositionArray.length / 3, params.optimizeMemory !== false);

  const result: SimplifyResult = MeshoptSimplifier.simplify(meshoptIndexArray, srcPositionArray, 3, targetCount, error, flags);

  result[0] = toIndexArray(result[0], bytesPerIndex);

  return result;
}

function validateArrays(indexArray: SimplifyResult[0], positionArray: Float32Array): void {
  const indexType = indexArray.constructor;
  const isIndexTypeSupported = indexType === Uint32Array || indexType === Uint16Array || indexType === Uint8Array;

  if (!isIndexTypeSupported) throw new TypeError('"srcIndexArray" must be a Uint32Array, a Uint16Array or a Uint8Array.');
  if (indexArray.length % 3 !== 0) throw new RangeError('"srcIndexArray" length must be a multiple of 3.');
  if (positionArray.constructor !== Float32Array) throw new TypeError('"srcPositionArray" must be a Float32Array.');
  if (positionArray.length % 3 !== 0) throw new RangeError('"srcPositionArray" length must be a multiple of 3.');
}

function validateParams(params: SimplifyParams): void {
  const isRatioValid = params.ratio >= 0 && params.ratio <= 1;
  const isErrorValid = params.error === undefined || params.error >= 0;
  const isRegularizeConflicting = params.regularize === true && params.regularizeLight === true;

  if (!isRatioValid) throw new RangeError('"ratio" must be between 0 and 1.');
  if (!isErrorValid) throw new RangeError('"error" must be greater than or equal to 0.');
  if (isRegularizeConflicting) throw new Error('"regularize" and "regularizeLight" must not be enabled together.');
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
