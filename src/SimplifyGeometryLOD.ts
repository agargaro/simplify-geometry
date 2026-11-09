import type { BufferGeometry } from 'three';
import { simplifyGeometry, type SimplifyGeometryParams } from './SimplifyGeometry.js';

export function simplifyGeometryLOD(geometry: BufferGeometry, paramsList: SimplifyGeometryParams[]): BufferGeometry[] {
  const geometries: BufferGeometry[] = [geometry];

  for (let i = 0, l = paramsList.length; i < l; i++) {
    geometries.push(simplifyGeometry(geometry, paramsList[i]));
  }

  return geometries;
}

export function simplifyGeometriesLOD(geometries: BufferGeometry[], paramsList: SimplifyGeometryParams[] | SimplifyGeometryParams[][]): BufferGeometry[][] {
  const result: BufferGeometry[][] = [];

  for (let i = 0, l = geometries.length; i < l; i++) {
    const paramsArray = (Array.isArray(paramsList[i]) ? paramsList[i] : paramsList) as SimplifyGeometryParams[];

    result.push(simplifyGeometryLOD(geometries[i], paramsArray));
  }

  return result;
}
