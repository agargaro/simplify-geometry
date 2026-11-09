import { BufferAttribute, type BufferGeometry } from 'three';
import { simplify, type SimplifyParams } from './Simplify.js';

export function simplifyGeometry(geometry: BufferGeometry, params: SimplifyParams): BufferGeometry {
  if (geometry.index === null) throw new Error('"geometry" must be indexed: non-indexed geometries are not supported.');
  if (geometry.groups.length > 0) throw new Error('"geometry" must not have groups: geometry groups are not supported.');

  const dstGeometry = geometry.clone();
  const srcIndexArray = geometry.index.array as Uint32Array;
  const srcPositionArray = geometry.getAttribute('position').array as Float32Array;

  const [dstIndexArray] = simplify(srcIndexArray, srcPositionArray, params);
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
