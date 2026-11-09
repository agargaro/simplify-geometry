import { BufferAttribute, type BufferGeometry } from 'three';
import { packAttributes, type AttributeWeights } from './PackAttributes.js';
import { simplify, type SimplifyAttributes, type SimplifyParams, type SimplifyResult } from './Simplify.js';
import { validateGeometry } from './Validation.js';

export interface SimplifyGeometryParams extends SimplifyParams {
  attributes?: AttributeWeights;
}

export function simplifyGeometry(geometry: BufferGeometry, params: SimplifyGeometryParams): BufferGeometry {
  validateGeometry(geometry);

  const srcAttributes = packAttributes(geometry, params.attributes);

  return simplifyValidatedGeometry(geometry, params, srcAttributes);
}

export function simplifyGeometryLOD(geometry: BufferGeometry, levels: SimplifyGeometryParams[], params: SimplifyGeometryParams = {}): BufferGeometry[] {
  validateGeometry(geometry);

  const sharedAttributes = packAttributes(geometry, params.attributes);
  const geometries: BufferGeometry[] = [geometry];

  for (let i = 0, l = levels.length; i < l; i++) {
    const levelParams: SimplifyGeometryParams = { ...params, ...levels[i] };
    const isSharedAttributes = levelParams.attributes === params.attributes;
    const srcAttributes = isSharedAttributes ? sharedAttributes : packAttributes(geometry, levelParams.attributes);

    geometries.push(simplifyValidatedGeometry(geometry, levelParams, srcAttributes));
  }

  return geometries;
}

function simplifyValidatedGeometry(geometry: BufferGeometry, params: SimplifyParams, srcAttributes?: SimplifyAttributes): BufferGeometry {
  const srcIndexArray = (geometry.index as BufferAttribute).array as SimplifyResult[0];
  const srcPositionArray = geometry.getAttribute('position').array as Float32Array;

  const [dstIndexArray] = simplify(srcIndexArray, srcPositionArray, params, srcAttributes);

  const dstGeometry = geometry.clone();
  dstGeometry.index = new BufferAttribute(dstIndexArray, 1);

  return dstGeometry;
}
