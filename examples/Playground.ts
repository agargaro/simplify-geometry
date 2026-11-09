import { Main, PerspectiveCameraAuto } from '@three.ez/main';
import {
  generatePositionRemap,
  getScale,
  simplify,
  simplifyGeometry,
  simplifyGeometryLOD,
  simplifyReady,
  type AttributeWeights,
  type IndexArray,
  type SimplifyAttributes,
  type SimplifyGeometryLevelParams,
  type SimplifyGeometryLODParams,
  type SimplifyGeometryParams,
  type SimplifyGeometryResult,
  type SimplifyParams
} from '@three.ez/simplify-geometry';
import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  type Material,
  Mesh,
  MeshNormalMaterial,
  MeshStandardMaterial,
  Scene,
  SRGBColorSpace,
  TorusKnotGeometry
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Pane, type FolderApi } from 'tweakpane';

type ModelName = 'torusKnot' | 'box' | 'soldier';
type MaterialName = 'original' | 'normal' | 'uvChecker';
type Api = 'geometry' | 'arrays';
type Mode = 'single' | 'lod';
type Vertices = NonNullable<SimplifyGeometryLODParams['vertices']>;
type LockPreset = 'none' | 'lock' | 'protect';

interface Model {
  name: ModelName;
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
}

interface AttributeControl {
  weight: number;
  components: string;
  protectSeams: boolean;
}

interface LevelControl {
  ratio: number;
  error: number;
  updateVertices: boolean;
  sloppy: boolean;
}

const soldierUrl = 'https://threejs.org/examples/models/gltf/Soldier.glb';

const errorPopup = getElement('error-popup');
const errorMessage = getElement('error-message');
const errorStack = getElement('error-stack');

getElement('error-close').addEventListener('click', hideError);
window.addEventListener('error', (event) => {
  showError(event.error ?? event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  showError(event.reason);
});

await simplifyReady();

const settings = {
  model: 'torusKnot' as ModelName,
  material: 'uvChecker' as MaterialName,
  wireframe: false,
  api: 'geometry' as Api,
  mode: 'single' as Mode,
  vertices: 'compact' as Vertices,
  vertexLock: 'none' as LockPreset,
  displayedLevel: 1
};

const params = {
  ratio: 0,
  error: 0.01,
  errorAbsolute: false,
  lockBorder: false,
  sparse: false,
  prune: false,
  regularize: false,
  regularizeLight: false,
  permissive: false,
  preserveFolds: false,
  errorClamped: false,
  sloppy: false,
  updateVertices: false,
  optimizeMemory: true
};

const levels: LevelControl[] = [
  { ratio: 0, error: 0.005, updateVertices: false, sloppy: false },
  { ratio: 0, error: 0.02, updateVertices: false, sloppy: false },
  { ratio: 0, error: 0.05, updateVertices: false, sloppy: false }
];

const stats = { triangles: '', vertices: '', error: '', worldError: '', indexType: '', time: '', seams: '', levels: '' };

const models = new Map<ModelName, Promise<Model>>();
const attributeControls = new Map<ModelName, Map<string, AttributeControl>>();
const normalMaterial = new MeshNormalMaterial();
const checkerMaterial = new MeshStandardMaterial({ map: createCheckerTexture() });
let resultGeometries: BufferGeometry[] = [];
let updateId = 0;
let attributesFolder: FolderApi | undefined;
let attributesModel: ModelName | undefined;

const main = new Main();
const mesh = new Mesh();
const scene = new Scene().add(mesh).activeSmartRendering();
const camera = new PerspectiveCameraAuto(50).translateZ(6);
const controls = new OrbitControls(camera, main.renderer.domElement);
controls.update();
scene.add(new AmbientLight());
const dirLight = new DirectionalLight('white', 2);
camera.add(dirLight, dirLight.target);
main.createView({ scene, camera });

const pane = createPane();
void update();

function createPane(): Pane {
  const root = new Pane({ title: 'simplify-geometry playground' });

  addViewFolder(root);
  addSimplificationFolder(root);
  addFlagsFolder(root);
  attributesFolder = root.addFolder({ title: 'Attributes', expanded: false });
  addLevelsFolder(root);
  addResultFolder(root);

  root.on('change', () => {
    void update();
  });

  return root;
}

function addViewFolder(root: Pane): void {
  const folder = root.addFolder({ title: 'View' });

  folder.addBinding(settings, 'model', { options: { 'Torus knot': 'torusKnot', 'Box (hard edges)': 'box', Soldier: 'soldier' } });
  folder.addBinding(settings, 'material', { options: { Original: 'original', Normals: 'normal', 'UV checker': 'uvChecker' } });
  folder.addBinding(settings, 'wireframe');
}

function addSimplificationFolder(root: Pane): void {
  const folder = root.addFolder({ title: 'Simplification' });

  folder.addBinding(settings, 'api', { options: { 'Geometry (simplifyGeometry*)': 'geometry', 'Arrays (simplify)': 'arrays' } });
  folder.addBinding(settings, 'mode', { options: { Single: 'single', LOD: 'lod' } });
  folder.addBinding(settings, 'vertices', { options: { compact: 'compact', shared: 'shared', reordered: 'reordered' } });
  folder.addBinding(params, 'ratio', { min: 0, max: 1, step: 0.001 });
  folder.addBinding(params, 'error', { min: 0, max: 0.2, step: 0.0005 });
  folder.addBinding(params, 'sloppy');
  folder.addBinding(params, 'updateVertices');
  folder.addBinding(params, 'optimizeMemory');
  folder.addBinding(settings, 'vertexLock', { label: 'vertexLock', options: { None: 'none', 'x > 0 locked (1)': 'lock', 'x > 0 protected (2)': 'protect' } });
}

function addFlagsFolder(root: Pane): void {
  const folder = root.addFolder({ title: 'Flags', expanded: false });

  folder.addBinding(params, 'errorAbsolute');
  folder.addBinding(params, 'lockBorder');
  folder.addBinding(params, 'sparse');
  folder.addBinding(params, 'prune');
  folder.addBinding(params, 'regularize');
  folder.addBinding(params, 'regularizeLight');
  folder.addBinding(params, 'permissive');
  folder.addBinding(params, 'preserveFolds');
  folder.addBinding(params, 'errorClamped');
}

function addLevelsFolder(root: Pane): void {
  const folder = root.addFolder({ title: 'LOD levels', expanded: false });

  for (let i = 0; i < levels.length; i++) {
    const levelFolder = folder.addFolder({ title: `Level ${i + 1}` });

    levelFolder.addBinding(levels[i], 'ratio', { min: 0, max: 1, step: 0.001 });
    levelFolder.addBinding(levels[i], 'error', { min: 0, max: 0.2, step: 0.0005 });
    levelFolder.addBinding(levels[i], 'updateVertices');
    levelFolder.addBinding(levels[i], 'sloppy');
  }

  folder.addBinding(settings, 'displayedLevel', { label: 'displayed level', min: 0, max: levels.length, step: 1 });
}

function addResultFolder(root: Pane): void {
  const folder = root.addFolder({ title: 'Result' });

  folder.addBinding(stats, 'triangles', { readonly: true });
  folder.addBinding(stats, 'vertices', { readonly: true });
  folder.addBinding(stats, 'error', { readonly: true });
  folder.addBinding(stats, 'worldError', { label: 'world error', readonly: true });
  folder.addBinding(stats, 'indexType', { label: 'index', readonly: true });
  folder.addBinding(stats, 'time', { readonly: true });
  folder.addBinding(stats, 'seams', { label: 'shared positions', readonly: true });
  folder.addBinding(stats, 'levels', { readonly: true, multiline: true, rows: 4 });
}

function updateAttributesFolder(model: Model): void {
  if (attributesFolder === undefined || attributesModel === model.name) return;

  for (const child of [...attributesFolder.children]) child.dispose();

  const modelControls = getAttributeControls(model);

  for (const [name, control] of modelControls) {
    const folder = attributesFolder.addFolder({ title: name, expanded: name === 'normal' || name === 'uv' });

    folder.addBinding(control, 'weight', { min: 0, max: 2, step: 0.01 });
    folder.addBinding(control, 'components', { label: 'weights (a,b,c)' });
    folder.addBinding(control, 'protectSeams', { label: 'protect seams' });
  }

  attributesModel = model.name;
  pane.refresh();
}

function getAttributeControls(model: Model): Map<string, AttributeControl> {
  let modelControls = attributeControls.get(model.name);

  if (modelControls !== undefined) return modelControls;

  modelControls = new Map();

  for (const name of Object.keys(model.geometry.attributes)) {
    if (name !== 'position') modelControls.set(name, { weight: 0, components: '', protectSeams: false });
  }

  attributeControls.set(model.name, modelControls);

  return modelControls;
}

async function update(): Promise<void> {
  const id = ++updateId;

  try {
    const model = await getModel(settings.model);

    if (id !== updateId) return;

    updateAttributesFolder(model);
    simplifyModel(model);
    hideError();
  } catch (error) {
    showError(error);
  }
}

function simplifyModel(model: Model): void {
  const start = performance.now();
  const results = runSimplification(model);
  const time = performance.now() - start;
  const displayedIndex = settings.mode === 'single' ? 1 : Math.min(settings.displayedLevel, results.length - 1);

  replaceResults(model.geometry, results);
  mesh.geometry = results[displayedIndex].geometry;
  mesh.material = getMaterial(model);
  updateStats(model, results, displayedIndex, time);
  scene.needsRender = true;
}

function runSimplification(model: Model): SimplifyGeometryResult[] {
  const source = { geometry: model.geometry, error: 0 };

  if (settings.api === 'arrays') return [source, simplifyArrays(model)];
  if (settings.mode === 'single') return [source, simplifyGeometry(model.geometry, getParams(model) as SimplifyGeometryParams)];

  return simplifyGeometryLOD(model.geometry, getLevels(), getParams(model));
}

function getParams(model: Model): SimplifyGeometryLODParams {
  const levelParams: SimplifyGeometryLODParams = { ...params, vertices: settings.vertices };
  const attributes = getAttributeWeights(model);
  const protectSeams = getProtectedSeams(model);
  const vertexLock = createVertexLock(model.geometry);

  if (attributes !== undefined) levelParams.attributes = attributes;
  if (protectSeams.length > 0) levelParams.protectSeams = protectSeams;
  if (vertexLock !== undefined) levelParams.vertexLock = vertexLock;

  return levelParams;
}

function getLevels(): SimplifyGeometryLevelParams[] {
  const levelsParams: SimplifyGeometryLevelParams[] = [];

  for (const level of levels) {
    const levelParams: SimplifyGeometryLevelParams = { ratio: level.ratio, error: level.error };

    if (level.updateVertices) levelParams.updateVertices = true;
    if (level.sloppy) levelParams.sloppy = true;

    levelsParams.push(levelParams);
  }

  return levelsParams;
}

function getAttributeWeights(model: Model): AttributeWeights | undefined {
  const weights: AttributeWeights = {};
  let hasWeights = false;

  for (const [name, control] of getAttributeControls(model)) {
    const components = control.components.trim();

    if (components === '' && control.weight === 0) continue;

    weights[name] = components === '' ? control.weight : components.split(',').map(Number);
    hasWeights = true;
  }

  return hasWeights ? weights : undefined;
}

function getProtectedSeams(model: Model): string[] {
  const names: string[] = [];

  for (const [name, control] of getAttributeControls(model)) {
    if (control.protectSeams) names.push(name);
  }

  return names;
}

function createVertexLock(geometry: BufferGeometry): Uint8Array | undefined {
  if (settings.vertexLock === 'none') return undefined;

  const position = geometry.getAttribute('position');
  const vertexLock = new Uint8Array(position.count);
  const value = settings.vertexLock === 'lock' ? 1 : 2;

  for (let i = 0; i < position.count; i++) {
    if (position.getX(i) > 0) vertexLock[i] = value;
  }

  return vertexLock;
}

function simplifyArrays(model: Model): SimplifyGeometryResult {
  if (settings.mode === 'lod') throw new Error('The arrays API (simplify) has no LOD function: use the geometry API for LODs.');
  if (params.updateVertices) throw new Error('"updateVertices" is available only with the geometry API.');
  if (getProtectedSeams(model).length > 0) throw new Error('"protectSeams" is available only with the geometry API: build a "vertexLock" instead.');

  const geometry = model.geometry;
  const indexArray = geometry.index?.array as IndexArray;
  const positionArray = geometry.getAttribute('position').array as Float32Array;
  const srcAttributes = packAttributes(geometry, getAttributeWeights(model));
  const simplifyParams: SimplifyParams = { ...params };
  const vertexLock = createVertexLock(geometry);

  if (vertexLock !== undefined) simplifyParams.vertexLock = vertexLock;

  const [dstIndexArray, error] = simplify(indexArray, positionArray, simplifyParams, srcAttributes);

  return { geometry: createIndexedGeometry(geometry, dstIndexArray), error };
}

function packAttributes(geometry: BufferGeometry, attributeWeights: AttributeWeights | undefined): SimplifyAttributes | undefined {
  if (attributeWeights === undefined) return undefined;

  const names = Object.keys(attributeWeights);
  const weights: number[] = [];

  for (const name of names) {
    const weight = attributeWeights[name];
    const itemSize = geometry.getAttribute(name).itemSize;

    for (let i = 0; i < itemSize; i++) weights.push(Array.isArray(weight) ? weight[i] ?? 0 : weight);
  }

  const verticesCount = geometry.getAttribute('position').count;
  const array = new Float32Array(weights.length * verticesCount);

  for (let vertex = 0, offset = 0; vertex < verticesCount; vertex++) {
    for (const name of names) {
      const attribute = geometry.getAttribute(name);

      for (let i = 0; i < attribute.itemSize; i++) array[offset++] = attribute.getComponent(vertex, i);
    }
  }

  return { array, stride: weights.length, weights };
}

function createIndexedGeometry(source: BufferGeometry, indexArray: IndexArray): BufferGeometry {
  const geometry = new BufferGeometry();

  for (const name of Object.keys(source.attributes)) geometry.setAttribute(name, source.getAttribute(name));

  geometry.setIndex(new BufferAttribute(indexArray, 1));

  return geometry;
}

function replaceResults(source: BufferGeometry, results: SimplifyGeometryResult[]): void {
  for (const geometry of resultGeometries) {
    if (geometry !== source) geometry.dispose();
  }

  resultGeometries = results.map((result) => result.geometry);
}

function getMaterial(model: Model): Material {
  const material = settings.material === 'original' ? model.material : settings.material === 'normal' ? normalMaterial : checkerMaterial;

  material.wireframe = settings.wireframe;

  return material;
}

function updateStats(model: Model, results: SimplifyGeometryResult[], displayedIndex: number, time: number): void {
  const source = model.geometry;
  const displayed = results[displayedIndex];
  const positionArray = source.getAttribute('position').array as Float32Array;
  const worldError = params.errorAbsolute ? displayed.error : displayed.error * getScale(positionArray);

  stats.triangles = `${getTriangles(displayed.geometry)} / ${getTriangles(source)}`;
  stats.vertices = `${getVertices(displayed.geometry)} / ${getVertices(source)}`;
  stats.error = displayed.error.toExponential(3);
  stats.worldError = worldError.toExponential(3);
  stats.indexType = displayed.geometry.index?.array.constructor.name ?? 'none';
  stats.time = `${time.toFixed(1)} ms`;
  stats.seams = `${countSharedPositions(positionArray)} vertices`;
  stats.levels = results.map((result, i) => `L${i}: ${getTriangles(result.geometry)} tris, ${getVertices(result.geometry)} verts, error ${result.error.toExponential(2)}`).join('\n');
}

function countSharedPositions(positionArray: Float32Array): number {
  const remap = generatePositionRemap(positionArray);
  const canonicals = new Set<number>();
  let count = 0;

  for (let i = 0; i < remap.length; i++) {
    if (remap[i] !== i) {
      canonicals.add(remap[i]);
      count++;
    }
  }

  return count + canonicals.size;
}

function getTriangles(geometry: BufferGeometry): number {
  return (geometry.index?.count ?? 0) / 3;
}

function getVertices(geometry: BufferGeometry): number {
  return geometry.getAttribute('position').count;
}

async function getModel(name: ModelName): Promise<Model> {
  let model = models.get(name);

  if (model === undefined) {
    model = loadModel(name);
    models.set(name, model);
    model.catch(() => models.delete(name));
  }

  return model;
}

async function loadModel(name: ModelName): Promise<Model> {
  switch (name) {
    case 'torusKnot':
      return { name, geometry: new TorusKnotGeometry(1, 0.4, 512, 64), material: new MeshStandardMaterial({ color: 0xc8c8c8 }) };
    case 'box':
      return { name, geometry: createBox(), material: new MeshStandardMaterial({ color: 0xc8c8c8 }) };
    case 'soldier':
      return loadSoldier();
  }
}

function createBox(): BufferGeometry {
  const geometry = new BoxGeometry(2, 2, 2, 32, 32, 32);

  geometry.clearGroups();

  return geometry;
}

async function loadSoldier(): Promise<Model> {
  const gltf = await new GLTFLoader().loadAsync(soldierUrl);
  const source = gltf.scene.children[0].children[0] as Mesh<BufferGeometry, MeshStandardMaterial>;
  const geometry = source.geometry.rotateX(Math.PI / -2).rotateY(Math.PI).center();

  geometry.computeBoundingSphere();

  const scale = 2 / (geometry.boundingSphere?.radius ?? 1);

  geometry.scale(scale, scale, scale);

  return { name: 'soldier', geometry, material: source.material };
}

function createCheckerTexture(): CanvasTexture {
  const size = 512;
  const cells = 16;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;

  canvas.width = size;
  canvas.height = size;

  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const isDark = (x + y) % 2 === 0;
      context.fillStyle = `hsl(${(x / cells) * 360}, 70%, ${isDark ? 35 : 70}%)`;
      context.fillRect((x * size) / cells, (y * size) / cells, size / cells, size / cells);
    }
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;

  return texture;
}

function showError(error: unknown): void {
  const isError = error instanceof Error;

  errorMessage.textContent = isError ? error.message : typeof error === 'string' ? error : 'Unexpected error.';
  errorStack.textContent = isError ? error.stack ?? '' : '';
  errorPopup.hidden = false;
}

function hideError(): void {
  errorPopup.hidden = true;
}

function getElement(id: string): HTMLElement {
  return document.getElementById(id)!;
}
