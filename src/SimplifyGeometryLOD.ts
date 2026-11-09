import type { BufferGeometry } from 'three';
import type { SimplifyParams } from './Simplify.js';
import { simplifyGeometry } from './SimplifyGeometry.js';

export function simplifyGeometryLOD(geometry: BufferGeometry, paramsList: SimplifyParams[]): BufferGeometry[] {
  const geometries: BufferGeometry[] = [geometry];

  for (let i = 0, l = paramsList.length; i < l; i++) {
    geometries.push(simplifyGeometry(geometry, paramsList[i]));
  }

  return geometries;
}

export function simplifyGeometriesLOD(geometries: BufferGeometry[], paramsList: SimplifyParams[] | SimplifyParams[][]): BufferGeometry[][] {
  const result: BufferGeometry[][] = [];

  for (let i = 0, l = geometries.length; i < l; i++) {
    const paramsArray = (Array.isArray(paramsList[i]) ? paramsList[i] : paramsList) as SimplifyParams[];

    result.push(simplifyGeometryLOD(geometries[i], paramsArray));
  }

  return result;
}
