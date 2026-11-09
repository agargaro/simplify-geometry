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
