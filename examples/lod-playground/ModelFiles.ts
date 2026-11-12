import { LoadingManager, Mesh, MeshStandardMaterial, type AnimationClip, type BufferGeometry, type Object3D } from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface ModelFile {
  scene: Object3D;
  animations: AnimationClip[];
  /** Object URLs of the resources read from the opened files, revoked when the model is disposed. */
  urls: string[];
}

/**
 * A file opened by the user, with its path relative to the opened folder (only its name when it was opened alone).
 */
export interface SourceFile {
  path: string;
  file: File;
}

/**
 * Files opened together, from a folder and its subfolders or a multiple selection: the models to load and the resources (buffers,
 * textures) they can reference.
 */
export interface FileSet {
  models: SourceFile[];
  /** Every file by lowercase path. */
  byPath: Map<string, File>;
  /** Every file by lowercase name, the first one when several files share it. */
  byName: Map<string, File>;
  /** Whether some files come from an opened or dropped folder. */
  fromFolder: boolean;
}

type ModelFormat = 'glb' | 'gltf' | 'fbx' | 'dae' | 'obj' | 'stl' | 'ply';

interface GLTFJson {
  buffers?: { uri?: string }[];
}

interface Resources {
  manager: LoadingManager;
  urls: Map<File, string>;
  missing: string[];
}

const formats: ModelFormat[] = ['glb', 'gltf', 'fbx', 'dae', 'obj', 'stl', 'ply'];
const glbMagic = 0x46546c67;
const jsonChunkType = 0x4e4f534a;
const passThroughUrl = /^(?:data|blob|https?):/i;

let blankImageUrl: string | null = null;

/**
 * The extensions the file picker accepts.
 */
export const modelFileAccept = formats.map((format) => `.${format}`).join(',');

/**
 * The extensions listed for the user, as in ".glb, .gltf, .fbx".
 */
export const modelFileList = formats.map((format) => `.${format}`).join(', ');

export function isModelFile(fileName: string): boolean {
  return getFormat(fileName) !== null;
}

/**
 * Collects the files of a file input: with `webkitdirectory` every file keeps its path inside the chosen folder.
 */
export function readFileList(list: FileList): FileSet {
  const sources: SourceFile[] = [];

  for (let i = 0; i < list.length; i++) {
    const file = list[i];

    sources.push({ path: file.webkitRelativePath === '' ? file.name : file.webkitRelativePath, file });
  }

  return createFileSet(sources);
}

/**
 * Collects the dropped files and, recursively, the files of the dropped folders. Must be called while the drop event is dispatched.
 */
export async function readDataTransfer(transfer: DataTransfer): Promise<FileSet> {
  const entries: FileSystemEntry[] = [];
  const sources: SourceFile[] = [];

  for (let i = 0; i < transfer.items.length; i++) {
    const item = transfer.items[i];

    if (item.kind !== 'file') continue;

    const entry = item.webkitGetAsEntry();
    const file = entry === null ? item.getAsFile() : null;

    if (entry !== null) entries.push(entry);
    else if (file !== null) sources.push({ path: file.name, file });
  }

  for (const entry of entries) await readEntry(entry, sources);

  return createFileSet(sources);
}

/**
 * Parses a model file into a scene and its clips. Buffers and textures it references are looked up among the files opened with it: by
 * path relative to the model, then by name. Geometry-only formats (STL, PLY) get one mesh with a default material; textures that are not
 * found are replaced with a blank image. Every change is listed in `notes`.
 */
export async function parseModelFile(source: SourceFile, files: FileSet, createGltfLoader: (manager: LoadingManager) => GLTFLoader, notes: string[]): Promise<ModelFile> {
  const format = getFormat(source.file.name);

  if (format === null) throw new Error(`"${source.file.name}" is not a supported model: use ${modelFileList}.`);

  const resources = createResources(files, getDirectory(source.path));
  const parsed = await parseFormat(format, source, files, resources, createGltfLoader, notes);

  noteMissingTextures(resources.missing, notes);

  return { ...parsed, urls: [...resources.urls.values()] };
}

async function parseFormat(format: ModelFormat, source: SourceFile, files: FileSet, resources: Resources, createGltfLoader: (manager: LoadingManager) => GLTFLoader, notes: string[]): Promise<Omit<ModelFile, 'urls'>> {
  const file = source.file;

  switch (format) {
    case 'glb': return createGltfLoader(resources.manager).parseAsync(checkGlb(await file.arrayBuffer()), '');
    case 'gltf': return createGltfLoader(resources.manager).parseAsync(checkGltfBuffers(await file.text(), files, getDirectory(source.path)), '');
    case 'fbx': return parseFbx(await file.arrayBuffer(), resources.manager);
    case 'dae': return parseCollada(await file.text(), resources.manager);
    case 'obj': return parseObj(await file.text());
    case 'stl': return parseStl(await file.arrayBuffer(), notes);
    case 'ply': return parsePly(await file.arrayBuffer());
  }
}

function createFileSet(sources: SourceFile[]): FileSet {
  const byPath = new Map<string, File>();
  const byName = new Map<string, File>();

  for (const source of sources) {
    const name = getName(source.path).toLowerCase();

    byPath.set(source.path.toLowerCase(), source.file);

    if (!byName.has(name)) byName.set(name, source.file);
  }

  const models = sources.filter((source) => isModelFile(source.file.name)).sort((a, b) => a.path.localeCompare(b.path));

  return { models, byPath, byName, fromFolder: sources.some((source) => source.path.includes('/')) };
}

async function readEntry(entry: FileSystemEntry, sources: SourceFile[]): Promise<void> {
  if (isFileEntry(entry)) {
    const file = await new Promise<File>((resolve, reject) => {
      entry.file(resolve, reject);
    });

    sources.push({ path: entry.fullPath.replace(/^\//, ''), file });

    return;
  }

  if (isDirectoryEntry(entry)) await readDirectory(entry.createReader(), sources);
}

/**
 * Reads every batch of a directory: `readEntries` returns the children in batches, then an empty one.
 */
async function readDirectory(reader: FileSystemDirectoryReader, sources: SourceFile[]): Promise<void> {
  const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });

  if (batch.length === 0) return;

  for (const child of batch) await readEntry(child, sources);

  await readDirectory(reader, sources);
}

function isFileEntry(entry: FileSystemEntry): entry is FileSystemFileEntry {
  return entry.isFile;
}

function isDirectoryEntry(entry: FileSystemEntry): entry is FileSystemDirectoryEntry {
  return entry.isDirectory;
}

/**
 * A manager that keeps data, blob and http URLs and replaces every other URL with an object URL of the opened file it references, or with
 * a blank image, recording its name, when no opened file matches.
 */
function createResources(files: FileSet, directory: string): Resources {
  const resources: Resources = { manager: new LoadingManager(), urls: new Map(), missing: [] };

  resources.manager.setURLModifier((url) => {
    if (passThroughUrl.test(url)) return url;

    const file = findFile(files, directory, url);

    if (file === undefined) {
      resources.missing.push(url);

      return getBlankImageUrl();
    }

    let objectUrl = resources.urls.get(file);

    if (objectUrl === undefined) {
      objectUrl = URL.createObjectURL(file);
      resources.urls.set(file, objectUrl);
    }

    return objectUrl;
  });

  return resources;
}

/**
 * Finds the opened file a model references: by its path relative to the model's folder, then, for paths that point elsewhere (absolute
 * paths written by the exporter, other folder layouts), by its name alone.
 */
function findFile(files: FileSet, directory: string, uri: string): File | undefined {
  const path = resolvePath(directory, decodeUri(uri));

  return files.byPath.get(path.toLowerCase()) ?? files.byName.get(getName(path).toLowerCase());
}

function resolvePath(directory: string, uri: string): string {
  const parts = directory === '' ? [] : directory.split('/');

  for (const part of uri.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue;

    if (part === '..') parts.pop();
    else parts.push(part);
  }

  return parts.join('/');
}

function decodeUri(uri: string): string {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
}

function getDirectory(path: string): string {
  const index = path.lastIndexOf('/');

  return index === -1 ? '' : path.slice(0, index);
}

function getName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function getFormat(fileName: string): ModelFormat | null {
  const extension = /\.([^.]+)$/.exec(fileName)?.[1]?.toLowerCase() ?? '';

  return formats.find((format) => format === extension) ?? null;
}

function checkGlb(buffer: ArrayBuffer): ArrayBuffer {
  const view = new DataView(buffer);

  if (buffer.byteLength < 20 || view.getUint32(0, true) !== glbMagic || view.getUint32(16, true) !== jsonChunkType) {
    throw new Error('The file is not a GLB (binary glTF).');
  }

  return buffer;
}

/**
 * The buffers of a .gltf hold its geometry: unlike a missing texture, a missing buffer cannot be replaced.
 */
function checkGltfBuffers(text: string, files: FileSet, directory: string): string {
  let json: GLTFJson;

  try {
    json = JSON.parse(text) as GLTFJson;
  } catch {
    throw new Error('The file is not a glTF: its JSON cannot be parsed.');
  }

  const uris = (json.buffers ?? []).map((buffer) => buffer.uri ?? '').filter((uri) => uri !== '' && !passThroughUrl.test(uri));
  const missing = uris.filter((uri) => findFile(files, directory, uri) === undefined);

  if (missing.length > 0) {
    throw new Error(`The .gltf references buffers that are not among the opened files (${missing.join(', ')}): open the folder that contains the model and its files, or drop them together.`);
  }

  return text;
}

async function parseFbx(buffer: ArrayBuffer, manager: LoadingManager): Promise<Omit<ModelFile, 'urls'>> {
  const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
  const scene = new FBXLoader(manager).parse(buffer, '');

  return { scene, animations: scene.animations };
}

async function parseCollada(text: string, manager: LoadingManager): Promise<Omit<ModelFile, 'urls'>> {
  const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js');
  const collada = new ColladaLoader(manager).parse(text, '');

  if (collada === null) throw new Error('The file is not a valid Collada (.dae) document.');

  return { scene: collada.scene, animations: collada.scene.animations };
}

async function parseObj(text: string): Promise<Omit<ModelFile, 'urls'>> {
  const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');

  return { scene: new OBJLoader().parse(text), animations: [] };
}

async function parseStl(buffer: ArrayBuffer, notes: string[]): Promise<Omit<ModelFile, 'urls'>> {
  const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js');
  const geometry = new STLLoader().parse(buffer);

  geometry.deleteAttribute('normal');
  notes.push('The STL facet normals are removed, so that the vertices shared by adjacent triangles can be merged.');

  return createGeometryModel(geometry);
}

async function parsePly(buffer: ArrayBuffer): Promise<Omit<ModelFile, 'urls'>> {
  const { PLYLoader } = await import('three/examples/jsm/loaders/PLYLoader.js');
  const geometry = new PLYLoader().parse(buffer);

  if (geometry.index === null) throw new Error('The PLY file has no faces: point clouds cannot be simplified.');

  return createGeometryModel(geometry);
}

function createGeometryModel(geometry: BufferGeometry): Omit<ModelFile, 'urls'> {
  const material = new MeshStandardMaterial({ vertexColors: geometry.hasAttribute('color'), metalness: 0, roughness: 0.75 });

  return { scene: new Mesh(geometry, material), animations: [] };
}

function noteMissingTextures(missing: string[], notes: string[]): void {
  if (missing.length === 0) return;

  notes.push(`Textures not found among the opened files are left blank: ${[...new Set(missing)].join(', ')}.`);
}

function getBlankImageUrl(): string {
  if (blankImageUrl !== null) return blankImageUrl;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;

  canvas.width = 1;
  canvas.height = 1;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 1, 1);
  blankImageUrl = canvas.toDataURL('image/png');

  return blankImageUrl;
}
