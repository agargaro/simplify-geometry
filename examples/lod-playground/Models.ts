import { SkeletalAnimationBake } from '@three.ez/instanced-mesh';
import {
  BufferAttribute,
  InterpolateLinear,
  LinearInterpolant,
  Matrix3,
  MeshStandardMaterial,
  type AnimationClip,
  type BindMode,
  type BufferGeometry,
  type InterleavedBufferAttribute,
  type Interpolant,
  type KeyframeTrack,
  type Material,
  type Matrix4,
  type Mesh,
  type Object3D,
  type Skeleton,
  type SkinnedMesh,
  type Texture,
  type WebGLRenderer
} from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuiltInModelName, ModelName, ShadingMode } from './Settings.js';

export interface SkinData {
  skeleton: Skeleton;
  bindMatrix: Matrix4;
  bindMode: BindMode;
  bake: SkeletalAnimationBake;
  clipNames: string[];
  influences: number;
}

export interface MorphData {
  targetsCount: number;
  duration: number;
  interpolant: Interpolant;
}

export interface Model {
  /** Unique for every loaded model, also when a file replaces another one. */
  id: number;
  name: ModelName;
  label: string;
  geometry: BufferGeometry;
  skin: SkinData | null;
  morph: MorphData | null;
  /** The material of the file. */
  material: Material;
  /** Only the base color (texture and factor) and the vertex colors of the file; null when it has neither texture nor vertex colors. */
  textureMaterial: Material | null;
  /** What was changed or ignored to load the model. */
  notes: string[];
}

type AnyAttribute = BufferAttribute | InterleavedBufferAttribute;

const glbMagic = 0x46546c67;
const jsonChunkType = 0x4e4f534a;

const bakeFramesPerSecond = 30;
const horseHeight = 2;
const maxLabelLength = 18;
const decodersUrl = 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/libs/';

const modelUrls: Record<BuiltInModelName, string> = {
  imp: new URL('./models/imp.glb', import.meta.url).href,
  puglin: new URL('./models/puglin.glb', import.meta.url).href,
  horse: new URL('./models/horse.glb', import.meta.url).href
};

const builtInLabels: Record<BuiltInModelName, string> = { imp: 'Imp', puglin: 'Puglin', horse: 'Horse' };

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
let nextId = 0;

/**
 * Enables the KTX2 and Draco decoders, downloaded from jsDelivr when a file first needs them.
 */
export function initModelLoaders(renderer: WebGLRenderer): void {
  loader.setKTX2Loader(new KTX2Loader().setTranscoderPath(`${decodersUrl}basis/`).detectSupport(renderer));
  loader.setDRACOLoader(new DRACOLoader().setDecoderPath(`${decodersUrl}draco/gltf/`));
}

export function isShadingAvailable(model: Model, shading: ShadingMode): boolean {
  if (shading === 'uv') return model.geometry.hasAttribute('uv');
  if (shading === 'texture') return model.textureMaterial !== null;

  return true;
}

/**
 * Disposes the geometry, the materials and the textures of a model.
 */
export function disposeModel(model: Model): void {
  model.geometry.dispose();
  disposeMaterial(model.material);

  if (model.textureMaterial !== null) model.textureMaterial.dispose();
}

export async function loadModel(name: BuiltInModelName): Promise<Model> {
  const gltf = await loader.loadAsync(modelUrls[name]);
  const source = findMeshes(gltf.scene)[0];
  const material = getMaterial(source, source.geometry, []);
  const textureMaterial = createTextureMaterial(material, source.geometry);

  if (isSkinnedMesh(source)) {
    const skin = createSkinData(gltf, source, source.geometry, []);

    return { id: nextId++, name, label: builtInLabels[name], geometry: source.geometry, skin, morph: null, material, textureMaterial, notes: [] };
  }

  const geometry = source.geometry;

  placeOnGround(geometry, horseHeight);
  geometry.computeVertexNormals();

  const morph = createMorphData(gltf, geometry, []);

  if (morph === null) throw new Error('The horse model has no morph animation.');

  return { id: nextId++, name, label: builtInLabels[name], geometry, skin: null, morph, material, textureMaterial, notes: [] };
}

/**
 * Loads a GLB file. Skinned meshes win over the others; several meshes are merged into one geometry when they share their attributes
 * (and, when skinned, their skeleton and bind matrix). Every change made to fit the playground is listed in `notes`.
 */
export async function loadModelFile(file: File): Promise<Model> {
  const gltf = await loader.parseAsync(checkGlb(await file.arrayBuffer()), '');
  const meshes = findMeshes(gltf.scene);
  const skinned = meshes.filter(isSkinnedMesh);
  const notes: string[] = [];
  const label = getFileLabel(file.name);

  gltf.scene.updateMatrixWorld(true);

  if (skinned.length > 0) return createSkinnedModel(gltf, skinned, meshes.length - skinned.length, label, notes);

  const geometries = meshes.map((mesh) => transformGeometry(mesh.geometry.clone(), mesh.matrixWorld));
  const geometry = prepareGeometry(geometries, notes);

  placeOnGround(geometry, 0);

  const morph = meshes.length === 1 ? createMorphData(gltf, geometry, notes) : null;
  const material = getSharedMaterial(meshes, geometry, notes);

  return { id: nextId++, name: 'custom', label, geometry, skin: null, morph, material, textureMaterial: createTextureMaterial(material, geometry), notes };
}

function checkGlb(buffer: ArrayBuffer): ArrayBuffer {
  const view = new DataView(buffer);

  if (buffer.byteLength < 20 || view.getUint32(0, true) !== glbMagic || view.getUint32(16, true) !== jsonChunkType) {
    throw new Error('The file is not a GLB (binary glTF).');
  }

  return buffer;
}

/**
 * Returns the material of the first mesh, noting when the other meshes use other materials.
 */
function getSharedMaterial(meshes: Mesh[], geometry: BufferGeometry, notes: string[]): Material {
  const material = getMaterial(meshes[0], geometry, notes);

  if (meshes.some((mesh) => mesh.material !== meshes[0].material)) {
    notes.push(`The meshes use different materials: only the one of the first mesh ("${material.name || 'unnamed'}") is shown.`);
  }

  return material;
}

function getMaterial(mesh: Mesh, geometry: BufferGeometry, notes: string[]): Material {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const material = materials[0];

  if (materials.length > 1) notes.push('The mesh uses several materials: only the first one is shown.');

  if (material.vertexColors && !geometry.hasAttribute('color')) {
    material.vertexColors = false;
    material.needsUpdate = true;
    notes.push('The vertex colors of the material were removed with the color attribute.');
  }

  return material;
}

/**
 * Creates a material with only the base color (texture and factor) and the vertex colors of `material`.
 */
function createTextureMaterial(material: Material, geometry: BufferGeometry): Material | null {
  const source = material as Partial<MeshStandardMaterial>;
  const map = source.map ?? null;
  const vertexColors = geometry.hasAttribute('color');

  if (map === null && !vertexColors) return null;

  const textureMaterial = new MeshStandardMaterial({ map, vertexColors, side: material.side, alphaTest: material.alphaTest, metalness: 0, roughness: 0.75 });

  if (source.color !== undefined) textureMaterial.color.copy(source.color);

  return textureMaterial;
}

function disposeMaterial(material: Material): void {
  const values = material as unknown as Record<string, Partial<Texture> | null | undefined>;

  for (const key of Object.keys(values)) {
    const value = values[key];

    if (value?.isTexture === true) value.dispose?.();
  }

  material.dispose();
}

/**
 * Slots a geometry uses: one more than the last slot with a nonzero weight in any vertex, as the skinning shaders count them.
 */
export function countInfluences(geometry: BufferGeometry): number {
  const weights = geometry.getAttribute('skinWeight');
  let count = 1;

  for (let i = 0; i < weights.count; i++) {
    for (let k = 3; k >= count; k--) {
      if (weights.getComponent(i, k) === 0) continue;

      count = k + 1;
      break;
    }
  }

  return count;
}

function createSkinnedModel(gltf: GLTF, meshes: SkinnedMesh[], staticCount: number, label: string, notes: string[]): Model {
  const first = meshes[0];

  for (const mesh of meshes) {
    if (mesh.skeleton !== first.skeleton || !mesh.bindMatrix.equals(first.bindMatrix)) {
      throw new Error('The skinned meshes of the file use different skeletons or bind matrices: only one skinned mesh, or several sharing them, are supported.');
    }
  }

  if (staticCount > 0) notes.push(`${staticCount} mesh${staticCount === 1 ? '' : 'es'} without skinning ${staticCount === 1 ? 'is' : 'are'} not shown.`);

  const geometry = prepareGeometry(meshes.map((mesh) => mesh.geometry.clone()), notes);

  if (geometry.morphAttributes['position'] !== undefined) {
    geometry.morphAttributes = {};
    notes.push('The morph targets of the skinned mesh are removed: only one deformation is previewed.');
  }

  const skin = createSkinData(gltf, first, geometry, notes);
  const material = getSharedMaterial(meshes, geometry, notes);

  return { id: nextId++, name: 'custom', label, geometry, skin, morph: null, material, textureMaterial: createTextureMaterial(material, geometry), notes };
}

function createSkinData(gltf: GLTF, mesh: SkinnedMesh, geometry: BufferGeometry, notes: string[]): SkinData | null {
  const bake = new SkeletalAnimationBake(mesh.skeleton);
  const clipNames: string[] = [];

  for (const clip of gltf.animations) {
    try {
      bake.addClip(gltf.scene, clip, bakeFramesPerSecond);
      clipNames.push(formatClipName(clip.name));
    } catch {
      notes.push(`The clip "${clip.name}" could not be baked and is skipped.`);
    }
  }

  if (clipNames.length === 0) {
    notes.push('The skinned mesh has no clip to bake: it is shown in its bind pose and its bone influences are not reduced.');

    return null;
  }

  return {
    skeleton: mesh.skeleton,
    bindMatrix: mesh.bindMatrix.clone(),
    bindMode: mesh.bindMode,
    bake,
    clipNames,
    influences: countInfluences(geometry)
  };
}

function createMorphData(gltf: GLTF, geometry: BufferGeometry, notes: string[]): MorphData | null {
  const targetsCount = geometry.morphAttributes['position']?.length ?? 0;

  if (targetsCount === 0) return null;

  for (const clip of gltf.animations) {
    const track = findMorphTrack(clip);

    if (track === undefined) continue;

    if (track.getInterpolation() !== InterpolateLinear) {
      notes.push('The morph animation does not use linear interpolation: the morph targets are not animated.');

      return null;
    }

    return { targetsCount, duration: clip.duration, interpolant: createInterpolant(track) };
  }

  notes.push('The mesh has morph targets but no morph animation: they are not animated.');

  return null;
}

function findMorphTrack(clip: AnimationClip): KeyframeTrack | undefined {
  return clip.tracks.find((track) => track.name.endsWith('.morphTargetInfluences'));
}

/**
 * Merges the geometries into one indexed geometry with plain, non-interleaved attributes and no groups, as the simplifier needs.
 */
function prepareGeometry(geometries: BufferGeometry[], notes: string[]): BufferGeometry {
  const common = getCommonAttributes(geometries);
  const dropped = new Set<string>();
  let hadGroups = false;
  let hadNoIndex = false;

  for (let i = 0; i < geometries.length; i++) {
    let geometry = geometries[i];

    for (const name of Object.keys(geometry.attributes)) {
      if (common.includes(name)) geometry.setAttribute(name, toPlainAttribute(geometry.getAttribute(name), name));
      else {
        geometry.deleteAttribute(name);
        dropped.add(name);
      }
    }

    if (geometries.length > 1 && Object.keys(geometry.morphAttributes).length > 0) {
      geometry.morphAttributes = {};
      dropped.add('morph targets');
    }

    const morphs = geometry.morphAttributes as Record<string, AnyAttribute[] | undefined>;

    for (const name of Object.keys(morphs)) morphs[name] = morphs[name]?.map((target) => toPlainAttribute(target, name));

    hadGroups ||= geometry.groups.length > 1;
    geometry.clearGroups();

    if (geometry.index === null) {
      hadNoIndex = true;
      geometry = mergeVertices(geometry);
    } else if (!(geometry.index.array instanceof Uint16Array) && !(geometry.index.array instanceof Uint32Array)) {
      geometry.setIndex(new BufferAttribute(Uint32Array.from(geometry.index.array), 1));
    }

    geometries[i] = geometry;
  }

  const geometry = geometries.length === 1 ? geometries[0] : (mergeGeometries(geometries, false) as BufferGeometry | null);

  if (geometry === null) throw new Error('The meshes of the file could not be merged into one geometry.');

  if (geometries.length > 1) notes.push(`${geometries.length} meshes are merged into one geometry.`);
  if (dropped.size > 0) notes.push(`Not shared by every mesh and removed: ${[...dropped].join(', ')}.`);
  if (hadGroups) notes.push('The material groups are removed: the playground draws one material per model.');
  if (hadNoIndex) notes.push('The geometry had no index: vertices with equal attributes were merged (mergeVertices).');

  if (!geometry.hasAttribute('normal')) {
    geometry.computeVertexNormals();
    notes.push('The geometry had no normals: they were computed.');
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  return geometry;
}

function getCommonAttributes(geometries: BufferGeometry[]): string[] {
  return Object.keys(geometries[0].attributes).filter((name) => geometries.every((geometry) => geometry.hasAttribute(name)));
}

/**
 * Copies an attribute into a plain array: float components, denormalized, except the joint indices, which stay integers.
 */
function toPlainAttribute(attribute: AnyAttribute, name: string): BufferAttribute {
  const isInterleaved = (attribute as { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute === true;
  const isSkinIndex = name === 'skinIndex';

  if (!isInterleaved && !attribute.normalized && (isSkinIndex || attribute.array instanceof Float32Array)) return attribute as BufferAttribute;

  const itemSize = attribute.itemSize;
  const count = attribute.count;
  const array = isSkinIndex ? new Uint16Array(count * itemSize) : new Float32Array(count * itemSize);

  for (let i = 0; i < count; i++) {
    for (let k = 0; k < itemSize; k++) array[i * itemSize + k] = attribute.getComponent(i, k);
  }

  return new BufferAttribute(array, itemSize);
}

/**
 * Applies the world matrix of a mesh to its geometry, morph targets included.
 */
function transformGeometry(geometry: BufferGeometry, matrix: Matrix4): BufferGeometry {
  const targets = geometry.morphAttributes['position'] ?? [];
  const linear = new Matrix3().setFromMatrix4(matrix);

  for (let i = 0; i < targets.length; i++) {
    const target = toPlainAttribute(targets[i], 'position');

    if (geometry.morphTargetsRelative) target.applyMatrix3(linear);
    else target.applyMatrix4(matrix);

    targets[i] = target;
  }

  const normals = geometry.morphAttributes['normal'] ?? [];
  const normalMatrix = new Matrix3().getNormalMatrix(matrix);

  for (let i = 0; i < normals.length; i++) normals[i] = toPlainAttribute(normals[i], 'normal').applyMatrix3(normalMatrix);

  return geometry.applyMatrix4(matrix);
}

/**
 * Moves the model so that its lowest point is at 0 and, when `height` is positive, scales it to that height. Morph targets follow.
 */
function placeOnGround(geometry: BufferGeometry, height: number): void {
  geometry.computeBoundingBox();

  const box = geometry.boundingBox!;
  const scale = height > 0 ? height / (box.max.y - box.min.y) : 1;
  const offset = -box.min.y * scale;

  scaleAttribute(geometry.getAttribute('position') as BufferAttribute, scale, offset);

  for (const target of geometry.morphAttributes['position'] ?? []) {
    scaleAttribute(target as BufferAttribute, scale, geometry.morphTargetsRelative ? 0 : offset);
  }

  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

function scaleAttribute(attribute: BufferAttribute, scale: number, offsetY: number): void {
  const array = attribute.array;

  for (let i = 0; i < array.length; i += 3) {
    array[i] *= scale;
    array[i + 1] = array[i + 1] * scale + offsetY;
    array[i + 2] *= scale;
  }

  attribute.needsUpdate = true;
}

function findMeshes(root: Object3D): Mesh[] {
  const meshes: Mesh[] = [];

  root.traverse((object) => {
    if ((object as { isMesh?: boolean }).isMesh === true) meshes.push(object as Mesh);
  });

  if (meshes.length === 0) throw new Error('The file has no mesh.');

  return meshes;
}

function isSkinnedMesh(mesh: Mesh): mesh is SkinnedMesh {
  return (mesh as { isSkinnedMesh?: boolean }).isSkinnedMesh === true;
}

function createInterpolant(track: KeyframeTrack): Interpolant {
  const size = track.getValueSize();

  return new LinearInterpolant(track.times, track.values, size, new Float32Array(size));
}

function formatClipName(name: string): string {
  return name.replace(/_Loop$/, '').replace(/_Fwd$/, '').replace(/_/g, ' ');
}

function getFileLabel(fileName: string): string {
  const name = fileName.replace(/\.(glb|gltf)$/i, '');

  return name.length > maxLabelLength ? `${name.slice(0, maxLabelLength - 1)}…` : name;
}
