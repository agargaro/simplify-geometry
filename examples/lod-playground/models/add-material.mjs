/**
 * Copies the materials, textures, samplers and embedded images of a GLB into another GLB and assigns the first material to every
 * primitive of the target. Used to give the slim models made by convert.mjs the KTX2 material of the same model.
 *
 * Usage: node examples/lod-playground/models/add-material.mjs <target.glb> <material-source.glb> <output.glb>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [targetPath, sourcePath, outputPath] = process.argv.slice(2);
const target = readGlb(targetPath);
const source = readGlb(sourcePath);
const chunks = [target.bin];
let binLength = align(target.bin.length);

target.json.images = (source.json.images ?? []).map((image) => {
  if (image.bufferView === undefined) throw new Error('Only images embedded in the GLB are supported.');

  const view = source.json.bufferViews[image.bufferView];
  const bytes = source.bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);

  chunks.push(Buffer.alloc(binLength - sumLength(chunks)), bytes);

  const bufferView = target.json.bufferViews.push({ buffer: 0, byteOffset: binLength, byteLength: bytes.length }) - 1;

  binLength = align(binLength + bytes.length);

  return { mimeType: image.mimeType, bufferView };
});

target.json.samplers = source.json.samplers;
target.json.textures = source.json.textures;
target.json.materials = source.json.materials;
target.json.extensionsUsed = mergeNames(target.json.extensionsUsed, source.json.extensionsUsed?.filter(isMaterialExtension));
target.json.extensionsRequired = mergeNames(target.json.extensionsRequired, source.json.extensionsRequired?.filter(isMaterialExtension));

for (const mesh of target.json.meshes) {
  for (const primitive of mesh.primitives) primitive.material = 0;
}

chunks.push(Buffer.alloc(binLength - sumLength(chunks)));
target.json.buffers = [{ byteLength: binLength }];
writeGlb(outputPath, target.json, Buffer.concat(chunks));

function readGlb(path) {
  const data = readFileSync(path);
  const jsonLength = data.readUInt32LE(12);
  const json = JSON.parse(data.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength + 8;
  const bin = data.subarray(binStart, binStart + data.readUInt32LE(20 + jsonLength));

  return { json, bin };
}

function writeGlb(path, json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc(align(jsonBytes.length) - jsonBytes.length, 0x20)]);
  const header = Buffer.alloc(12);
  const jsonHeader = Buffer.alloc(8);
  const binHeader = Buffer.alloc(8);

  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + bin.length, 8);
  jsonHeader.writeUInt32LE(jsonPadded.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  binHeader.writeUInt32LE(bin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  writeFileSync(path, Buffer.concat([header, jsonHeader, jsonPadded, binHeader, bin]));
}

function isMaterialExtension(name) {
  return name.startsWith('KHR_materials') || name.startsWith('KHR_texture') || name.startsWith('EXT_texture');
}

function mergeNames(first = [], second = []) {
  const names = [...new Set([...first, ...second])];

  return names.length > 0 ? names : undefined;
}

function sumLength(buffers) {
  return buffers.reduce((sum, buffer) => sum + buffer.length, 0);
}

function align(length) {
  return Math.ceil(length / 4) * 4;
}
