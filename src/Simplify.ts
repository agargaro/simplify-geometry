import { MeshoptSimplifier, type SimplifierFlags } from 'meshoptimizer';

export type SimplifyResult = [Uint32Array | Uint16Array | Uint8Array, number];

export interface SimplifyParams {
  ratio: number;
  error?: number;
  lockBorder?: boolean;
  errorAbsolute?: boolean;
  sparse?: boolean;
  prune?: boolean;
  optimizeMemory?: boolean; // default true
}

let isReady = false;

export async function simplifyReady(): Promise<void> {
  await MeshoptSimplifier.ready;
  isReady = true;
}

export function simplify(srcIndexArray: Uint32Array, srcPositionArray: Float32Array, params: SimplifyParams): SimplifyResult {
  if (!isReady) throw new Error('"simplifyReady()" must be awaited before simplifying.');
  validateArrays(srcIndexArray, srcPositionArray);
  validateParams(params);

  const flags = getFlags(params);
  const error = params.error ?? 1;
  const targetCount = 3 * Math.floor(params.ratio * (srcIndexArray.length / 3));

  const result: SimplifyResult = MeshoptSimplifier.simplify(srcIndexArray, srcPositionArray, 3, targetCount, error, flags);
  const dstIndexArray = result[0];

  if (dstIndexArray.length === srcIndexArray.length) console.error('Simplify: simplification failed');

  if (params.optimizeMemory !== false) {
    result[0] = toSmallestIndexArray(result[0], srcPositionArray.length / 3);
  }

  return result;
}

function validateArrays(indexArray: Uint32Array, positionArray: Float32Array): void {
  const isIndexTypeSupported = indexArray.constructor === Uint32Array || indexArray.constructor === Uint16Array;

  if (!isIndexTypeSupported) throw new TypeError('"srcIndexArray" must be a Uint32Array or a Uint16Array.');
  if (indexArray.length % 3 !== 0) throw new RangeError('"srcIndexArray" length must be a multiple of 3.');
  if (positionArray.constructor !== Float32Array) throw new TypeError('"srcPositionArray" must be a Float32Array.');
  if (positionArray.length % 3 !== 0) throw new RangeError('"srcPositionArray" length must be a multiple of 3.');
}

function validateParams(params: SimplifyParams): void {
  const isRatioValid = params.ratio >= 0 && params.ratio <= 1;
  const isErrorValid = params.error === undefined || params.error >= 0;

  if (!isRatioValid) throw new RangeError('"ratio" must be between 0 and 1.');
  if (!isErrorValid) throw new RangeError('"error" must be greater than or equal to 0.');
}

function getFlags(params: SimplifyParams): SimplifierFlags[] {
  const flags: SimplifierFlags[] = [];

  if (params.lockBorder === true) flags.push('LockBorder');
  if (params.sparse === true) flags.push('Sparse');
  if (params.errorAbsolute === true) flags.push('ErrorAbsolute');
  if (params.prune === true) flags.push('Prune');

  return flags;
}

function toSmallestIndexArray(indexArray: SimplifyResult[0], verticesCount: number): SimplifyResult[0] {
  if (verticesCount > 65535) return indexArray;

  const smallestIndexArray = verticesCount <= 255 ? new Uint8Array(indexArray.length) : new Uint16Array(indexArray.length);
  smallestIndexArray.set(indexArray);

  return smallestIndexArray;
}
