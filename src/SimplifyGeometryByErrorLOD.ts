import type { BufferGeometry } from 'three';
import { simplifyGeometryByError } from './SimplifyGeometryByError.js';

export const performanceRangeLOD = [0.01, 0.02, 0.05, 0.1];
export const balancedRangeLOD = [0.007, 0.015, 0.04, 0.08];
export const qualityRangeLOD = [0.004, 0.01, 0.035, 0.07];

export function simplifyGeometryByErrorLOD(geometry: BufferGeometry, LODCount: number, range = balancedRangeLOD): BufferGeometry[] {
  const geometries: BufferGeometry[] = [geometry];

  for (let i = 0; i < LODCount; i++) {
    geometries.push(simplifyGeometryByError(geometry, range[i]));
  }

  return geometries;
}

export function simplifyGeometriesByErrorLOD(geometries: BufferGeometry[], LODCounts: number | number[], ranges: number[] | number[][] = balancedRangeLOD): BufferGeometry[][] {
  const result: BufferGeometry[][] = [];

  for (let i = 0, l = geometries.length; i < l; i++) {
    const range = (Array.isArray(ranges[i]) ? ranges[i] : ranges) as number[];
    const LODCount = Array.isArray(LODCounts) ? LODCounts[i] : LODCounts;

    result.push(simplifyGeometryByErrorLOD(geometries[i], LODCount, range));
  }

  return result;
}
