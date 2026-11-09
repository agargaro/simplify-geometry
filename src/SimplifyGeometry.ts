import { BufferAttribute, type BufferGeometry, type InterleavedBufferAttribute } from 'three';
import { simplify, type SimplifyParams, type SimplifyResult } from './Simplify.js';

export function simplifyGeometry(geometry: BufferGeometry, params: SimplifyParams): BufferGeometry {
  if (geometry.index === null) throw new Error('"geometry" must be indexed: non-indexed geometries are not supported.');
  if (geometry.groups.length > 0) throw new Error('"geometry" must not have groups: geometry groups are not supported.');
  if (!geometry.hasAttribute('position')) throw new Error('"geometry" must have a "position" attribute.');
  validatePosition(geometry.getAttribute('position'));

  const srcIndexArray = geometry.index.array as SimplifyResult[0];
  const srcPositionArray = geometry.getAttribute('position').array as Float32Array;

  const [dstIndexArray] = simplify(srcIndexArray, srcPositionArray, params);

  const dstGeometry = geometry.clone();
  dstGeometry.index = new BufferAttribute(dstIndexArray, 1);

  return dstGeometry;
}

export function simplifyGeometries(geometries: BufferGeometry[], paramsList: SimplifyParams | SimplifyParams[]): BufferGeometry[] {
  const result = new Array<BufferGeometry>(geometries.length);

  for (let i = 0, l = geometries.length; i < l; i++) {
    const params = Array.isArray(paramsList) ? paramsList[i] : paramsList;

    result[i] = simplifyGeometry(geometries[i], params);
  }

  return result;
}

function validatePosition(position: BufferAttribute | InterleavedBufferAttribute): void {
  const isInterleaved = (position as Partial<InterleavedBufferAttribute>).isInterleavedBufferAttribute === true;

  if (isInterleaved) throw new TypeError('"geometry" position must not be interleaved: interleaved attributes are not supported.');
  if (position.itemSize !== 3) throw new RangeError('"geometry" position must have an itemSize of 3.');
}
