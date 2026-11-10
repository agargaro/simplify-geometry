/**
 * Converts a skinned Quaternius Bestiary model into the slim GLB loaded by the LOD playground:
 * every skinned primitive is merged into one indexed mesh (position, normal, uv, joints as uint16, weights as float32),
 * materials and textures are dropped, and the requested clips of the Universal Animation Library are retargeted onto the rig
 * (bone rotations, and the pelvis translation scaled by the ratio of the pelvis heights).
 *
 * Usage: node examples/lod-playground/models/convert.mjs <model.glb> <animations.glb> <output.glb> <clip>...
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { Matrix4, Quaternion, Vector3 } from 'three';

const componentArrays = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const normalizedDivisors = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };
const typeSizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const mergedAttributes = [
  { name: 'POSITION', size: 3, type: Float32Array },
  { name: 'NORMAL', size: 3, type: Float32Array },
  { name: 'TEXCOORD_0', size: 2, type: Float32Array },
  { name: 'JOINTS_0', size: 4, type: Uint16Array },
  { name: 'WEIGHTS_0', size: 4, type: Float32Array }
];

const [modelPath, animationsPath, outputPath, ...clipNames] = process.argv.slice(2);
const model = readGlb(modelPath);
const library = readGlb(animationsPath);
const output = createOutput();

const skinnedNodes = model.json.nodes.filter((node) => node.mesh !== undefined);

if (skinnedNodes.some((node) => node.skin !== 0)) throw new Error('Every mesh must be bound to the first skin.');

const meshIndex = addMergedMesh(skinnedNodes.flatMap((node) => model.json.meshes[node.mesh].primitives));
const nodes = model.json.nodes.map(copyNode);
const modelNodeIndex = nodes.push({ name: 'Model', mesh: meshIndex, skin: 0 }) - 1;
const skin = model.json.skins[0];

output.json.nodes = nodes;
output.json.scenes = [{ name: 'Scene', nodes: [...model.json.scenes[0].nodes, modelNodeIndex] }];
output.json.skins = [{ joints: skin.joints, inverseBindMatrices: copyAccessor(model, skin.inverseBindMatrices) }];
output.json.animations = clipNames.map((name) => retargetClip(name, getPelvisHeight(model.json) / getPelvisHeight(library.json)));

writeGlb(outputPath);

function readGlb(path) {
  const data = readFileSync(path);
  const jsonLength = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength + 8;
  const bin = data.subarray(binStart, binStart + data.readUInt32LE(20 + jsonLength));

  return { json, bin };
}

function readAccessor(source, index) {
  const accessor = source.json.accessors[index];

  if (accessor.sparse !== undefined) throw new Error('Sparse accessors are not supported.');

  const view = source.json.bufferViews[accessor.bufferView];
  const Type = componentArrays[accessor.componentType];
  const size = typeSizes[accessor.type];
  const stride = view.byteStride ?? size * Type.BYTES_PER_ELEMENT;
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = new Float64Array(accessor.count * size);
  const dataView = new DataView(source.bin.buffer, source.bin.byteOffset, source.bin.byteLength);
  const divisor = accessor.normalized === true ? normalizedDivisors[accessor.componentType] : 1;

  for (let i = 0; i < accessor.count; i++) {
    for (let j = 0; j < size; j++) {
      const byteOffset = offset + i * stride + j * Type.BYTES_PER_ELEMENT;
      values[i * size + j] = readComponent(dataView, byteOffset, accessor.componentType) / divisor;
    }
  }

  return { values, size, count: accessor.count };
}

function readComponent(dataView, byteOffset, componentType) {
  switch (componentType) {
    case 5120: return dataView.getInt8(byteOffset);
    case 5121: return dataView.getUint8(byteOffset);
    case 5122: return dataView.getInt16(byteOffset, true);
    case 5123: return dataView.getUint16(byteOffset, true);
    case 5125: return dataView.getUint32(byteOffset, true);
    case 5126: return dataView.getFloat32(byteOffset, true);
    default: throw new Error(`Unsupported component type ${componentType}.`);
  }
}

function addMergedMesh(primitives) {
  const vertexCount = primitives.reduce((count, primitive) => count + model.json.accessors[primitive.attributes.POSITION].count, 0);
  const indexCount = primitives.reduce((count, primitive) => count + model.json.accessors[primitive.indices].count, 0);
  const arrays = mergedAttributes.map((attribute) => new attribute.type(vertexCount * attribute.size));
  const indices = new Uint32Array(indexCount);
  let vertexOffset = 0;
  let indexOffset = 0;

  for (const primitive of primitives) {
    if ((primitive.mode ?? 4) !== 4) throw new Error('Only triangle primitives are supported.');

    for (let a = 0; a < mergedAttributes.length; a++) {
      const attribute = mergedAttributes[a];
      const index = primitive.attributes[attribute.name];

      if (index === undefined) throw new Error(`A primitive has no ${attribute.name}.`);

      arrays[a].set(readAccessor(model, index).values, vertexOffset * attribute.size);
    }

    const primitiveIndices = readAccessor(model, primitive.indices).values;

    for (let i = 0; i < primitiveIndices.length; i++) indices[indexOffset + i] = primitiveIndices[i] + vertexOffset;

    vertexOffset += model.json.accessors[primitive.attributes.POSITION].count;
    indexOffset += primitiveIndices.length;
  }

  const attributes = {};

  for (let a = 0; a < mergedAttributes.length; a++) {
    const attribute = mergedAttributes[a];
    attributes[attribute.name] = addAccessor(arrays[a], attribute.size, attribute.name === 'POSITION', 34962);
  }

  return output.json.meshes.push({ name: 'Model', primitives: [{ attributes, indices: addAccessor(indices, 1, false, 34963), mode: 4 }] }) - 1;
}

function copyNode(node) {
  const copy = { name: node.name };

  if (node.children !== undefined) copy.children = node.children;
  if (node.matrix !== undefined) copy.matrix = node.matrix;
  if (node.translation !== undefined) copy.translation = node.translation;
  if (node.rotation !== undefined) copy.rotation = node.rotation;
  if (node.scale !== undefined) copy.scale = node.scale;

  return copy;
}

function copyAccessor(source, index) {
  const accessor = readAccessor(source, index);

  return addAccessor(Float32Array.from(accessor.values), accessor.size, false);
}

function retargetClip(name, pelvisRatio) {
  const animation = library.json.animations.find((clip) => clip.name === name);

  if (animation === undefined) throw new Error(`Clip "${name}" not found.`);

  const nodeIndices = new Map(model.json.nodes.map((node, index) => [node.name, index]));
  const samplers = [];
  const channels = [];

  for (const channel of animation.channels) {
    const nodeName = library.json.nodes[channel.target.node].name;
    const node = nodeIndices.get(nodeName);
    const isRotation = channel.target.path === 'rotation';
    const isPelvisTranslation = channel.target.path === 'translation' && nodeName === 'pelvis';

    if (node === undefined || (!isRotation && !isPelvisTranslation)) continue;

    const sampler = animation.samplers[channel.sampler];
    const values = readAccessor(library, sampler.output);
    const output = Float32Array.from(values.values, (value) => (isPelvisTranslation ? value * pelvisRatio : value));

    channels.push({ sampler: samplers.length, target: { node, path: channel.target.path } });
    samplers.push({ input: copyInputAccessor(sampler.input), output: addAccessor(output, values.size, false), interpolation: sampler.interpolation ?? 'LINEAR' });
  }

  return { name, channels, samplers };
}

function copyInputAccessor(index) {
  output.inputAccessors ??= new Map();

  const cached = output.inputAccessors.get(index);

  if (cached !== undefined) return cached;

  const values = Float32Array.from(readAccessor(library, index).values);
  const accessor = addAccessor(values, 1, true);

  output.inputAccessors.set(index, accessor);

  return accessor;
}

function getPelvisHeight(json) {
  const parents = new Map();

  json.nodes.forEach((node, index) => node.children?.forEach((child) => parents.set(child, index)));

  let index = json.nodes.findIndex((node) => node.name === 'pelvis');

  if (index === -1) throw new Error('The rig has no pelvis.');

  const world = new Matrix4();

  while (index !== undefined) {
    world.premultiply(getLocalMatrix(json.nodes[index]));
    index = parents.get(index);
  }

  return world.elements[13];
}

function getLocalMatrix(node) {
  if (node.matrix !== undefined) return new Matrix4().fromArray(node.matrix);

  const position = new Vector3().fromArray(node.translation ?? [0, 0, 0]);
  const quaternion = new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]);
  const scale = new Vector3().fromArray(node.scale ?? [1, 1, 1]);

  return new Matrix4().compose(position, quaternion, scale);
}

function createOutput() {
  return {
    json: { asset: { version: '2.0', generator: 'lod-playground convert.mjs' }, scene: 0, meshes: [], accessors: [], bufferViews: [], buffers: [] },
    chunks: [],
    byteLength: 0
  };
}

function addAccessor(array, size, withBounds, target) {
  const byteOffset = output.byteLength;
  const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
  const padding = (4 - (bytes.byteLength % 4)) % 4;
  const view = { buffer: 0, byteOffset, byteLength: bytes.byteLength };

  if (target !== undefined) view.target = target;

  output.chunks.push(bytes, new Uint8Array(padding));
  output.byteLength += bytes.byteLength + padding;

  const accessor = {
    bufferView: output.json.bufferViews.push(view) - 1,
    componentType: getComponentType(array),
    count: array.length / size,
    type: Object.keys(typeSizes).find((type) => typeSizes[type] === size)
  };

  if (withBounds) Object.assign(accessor, getBounds(array, size));

  return output.json.accessors.push(accessor) - 1;
}

function getComponentType(array) {
  if (array instanceof Float32Array) return 5126;
  if (array instanceof Uint16Array) return 5123;
  if (array instanceof Uint32Array) return 5125;

  throw new Error('Unsupported array type.');
}

function getBounds(array, size) {
  const min = new Array(size).fill(Infinity);
  const max = new Array(size).fill(-Infinity);

  for (let i = 0; i < array.length; i++) {
    min[i % size] = Math.min(min[i % size], array[i]);
    max[i % size] = Math.max(max[i % size], array[i]);
  }

  return { min, max };
}

function writeGlb(path) {
  output.json.buffers = [{ byteLength: output.byteLength }];

  const json = Buffer.from(JSON.stringify(output.json));
  const jsonPadding = Buffer.alloc((4 - (json.length % 4)) % 4, 0x20);
  const bin = Buffer.concat(output.chunks);
  const header = Buffer.alloc(12);
  const jsonHeader = Buffer.alloc(8);
  const binHeader = Buffer.alloc(8);
  const totalLength = 12 + 8 + json.length + jsonPadding.length + 8 + bin.length;

  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  jsonHeader.writeUInt32LE(json.length + jsonPadding.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  writeFileSync(path, Buffer.concat([header, jsonHeader, json, jsonPadding, binHeader, bin]));
  console.log(`${path}: ${model.json.accessors.length > 0 ? output.json.accessors[output.json.meshes[0].primitives[0].attributes.POSITION].count : 0} vertices, ${clipNames.length} clips, ${totalLength} bytes`);
}
