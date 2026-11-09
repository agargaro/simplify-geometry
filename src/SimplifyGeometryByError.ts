import type { BufferGeometry } from 'three';
import { simplifyGeometry } from './SimplifyGeometry.js';

export function simplifyGeometryByError(geometry: BufferGeometry, appearanceError: number): BufferGeometry {
  return simplifyGeometry(geometry, { ratio: 0, error: appearanceError });
}

export function simplifyGeometriesByError(geometries: BufferGeometry[], appearanceErrorList: number | number[]): BufferGeometry[] {
  const result = new Array<BufferGeometry>(geometries.length);

  for (let i = 0, l = geometries.length; i < l; i++) {
    const appearanceError = Array.isArray(appearanceErrorList) ? appearanceErrorList[i] : appearanceErrorList;

    result[i] = simplifyGeometryByError(geometries[i], appearanceError);
  }

  return result;
}
