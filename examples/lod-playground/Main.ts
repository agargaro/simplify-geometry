import { prepareInstancedRenderer } from '@three.ez/instanced-mesh';
import { simplifyReady } from '@three.ez/simplify-geometry';
import { AmbientLight, type BufferGeometry, Color, DirectionalLight, PerspectiveCamera, PMREMGenerator, Scene, WebGLRenderer } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BottomDock } from './BottomDock.js';
import { Inspector } from './Inspector.js';
import { LevelsPanel } from './LevelsPanel.js';
import { LODPreview } from './LODPreview.js';
import { disposeModel, initModelLoaders, loadModel, loadModelFile, type Model } from './Models.js';
import { createModelSettings, createNextLevel, getLevels, maxLevels, modelLabels, type LevelSettings, type ModelName } from './Settings.js';
import { importSettings, readSettingsFromUrl, writeSettingsToUrl } from './SettingsIO.js';
import { disposeLOD, reduceSkin, simplifyGeometry, type DrawLevels, type GeometryLOD } from './Simplification.js';
import { SkinReducer } from './SkinReducer.js';
import type { Snapshot, ViewState } from './State.js';
import { getFieldLayout, getSwitchScreenSize, getThresholds, getUsedLevels } from './Thresholds.js';
import { Toolbar, ViewportBar } from './Toolbar.js';
import { initTooltips } from './Tooltips.js';
import { getResultWarnings, getSettingsWarnings } from './Warnings.js';

interface LODCache {
  key: string;
  model: Model;
  lod: GeometryLOD;
  reducer: SkinReducer | null;
}

interface DrawCache {
  key: string;
  lod: GeometryLOD;
  draw: DrawLevels;
}

const updateDelay = 60;
const resizeDelay = 200;
const maxDelta = 0.1;

const errorBanner = getElement('error');
const errorMessage = getElement('error-message');
const viewport = getElement('viewport');
const status = getElement('viewport-status');

getElement('error-close').addEventListener('click', hideError);
window.addEventListener('error', (event) => {
  showError(event.error ?? event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  showError(event.reason);
});

initTooltips(getElement('tooltip'));

const settings = readSettingsFromUrl();

if (settings.model === 'custom') settings.model = 'imp';
const view: ViewState = { selectedLevel: 1, hoveredLevel: -1, isolate: false, forcedLevel: -1, playing: true, clip: 0 };
const models = new Map<ModelName, Model>();

const renderer = new WebGLRenderer({ antialias: true });
const scene = new Scene();
const camera = new PerspectiveCamera(50, 1, 0.1, 5000);
const controls = new MapControls(camera, renderer.domElement);
const light = new DirectionalLight('white', 2.2);
const preview = new LODPreview(scene);

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
initModelLoaders(renderer);
preview.setEnvironment(new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture);
viewport.append(renderer.domElement);
scene.background = new Color('#121316');
scene.add(new AmbientLight('white', 0.9), camera);
light.position.set(0.4, 1, 0.6);
camera.add(light, light.target);
controls.maxPolarAngle = Math.PI / 2 - 0.02;
controls.screenSpacePanning = false;
controls.addEventListener('change', requestRender);

const toolbar = new Toolbar(getElement('toolbar'), settings, view, { onModel: (name) => void selectModel(name), onOpenFile: (file) => void openModelFile(file), onPlay: togglePlay, onClip: selectClip, onImport });
const viewportBar = new ViewportBar(getElement('viewport-bar'), settings, view, { onChange: scheduleUpdate, onHighlight: updateHighlight, onResetCamera: resetCamera });
const levelsPanel = new LevelsPanel(getElement('levels-dock'), settings, view, { onSelect: selectLevel, onHover: hoverLevel, onAdd: addLevel, onRemove: removeLevel });
const dock = new BottomDock(getElement('bottom-dock'), settings, view, { onSelect: selectLevel, onHover: hoverLevel, onLanguage });
const inspector = new Inspector(getElement('inspector'), settings, view, scheduleUpdate);

preview.onStats = (stats) => {
  levelsPanel.renderStats(stats);
};

let lodCache: LODCache | null = null;
let drawCache: DrawCache | null = null;
let snapshot: Snapshot | null = null;
let buildKey = '';
let builtGeometries: BufferGeometry[] = [];
let cameraKey = '';
let updateTimeout = 0;
let needsRender = true;
let lastTime = 0;
let viewportHeight = 0;

new ResizeObserver(resize).observe(viewport);
resize();

initFileDrop();

await Promise.all([simplifyReady(), prepareInstancedRenderer(renderer)]);
await selectModel(settings.model);
renderer.setAnimationLoop(frame);

async function selectModel(name: ModelName): Promise<void> {
  const cached = models.get(name);

  if (cached !== undefined) {
    settings.model = name;
    showModel(cached);

    return;
  }

  if (name === 'custom') return;

  const model = await loadWithStatus(`Loading ${modelLabels[name]}…`, async () => loadModel(name));

  if (model === null) return;

  models.set(name, model);
  settings.model = name;
  showModel(model);
}

async function openModelFile(file: File): Promise<void> {
  const model = await loadWithStatus(`Loading ${file.name}…`, async () => loadModelFile(file));

  if (model === null) return;

  const previous = models.get('custom');

  models.set('custom', model);
  settings.model = 'custom';
  settings.models.custom = createModelSettings();
  toolbar.setCustomModel(model.label);
  showModel(model);

  if (previous !== undefined && lodCache?.model !== previous) disposeModel(previous);
}

async function loadWithStatus(text: string, load: () => Promise<Model>): Promise<Model | null> {
  toolbar.setModelsDisabled(true);
  status.textContent = text;
  status.hidden = false;

  try {
    return await load();
  } catch (error) {
    showError(error);

    return null;
  } finally {
    toolbar.setModelsDisabled(false);
    status.hidden = true;
  }
}

function initFileDrop(): void {
  const stage = viewport.parentElement!;
  let depth = 0;

  stage.addEventListener('dragenter', (event) => {
    if (!hasFiles(event)) return;

    depth++;
    stage.classList.add('is-dropping');
  });
  stage.addEventListener('dragleave', () => {
    depth = Math.max(depth - 1, 0);

    if (depth === 0) stage.classList.remove('is-dropping');
  });
  stage.addEventListener('dragover', (event) => {
    if (hasFiles(event)) event.preventDefault();
  });
  stage.addEventListener('drop', (event) => {
    event.preventDefault();
    depth = 0;
    stage.classList.remove('is-dropping');

    const file = event.dataTransfer?.files[0];

    if (file === undefined) return;

    if (!/\.glb$/i.test(file.name)) {
      showError(new Error(`"${file.name}" is not a .glb file.`));

      return;
    }

    void openModelFile(file);
  });
}

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') === true;
}

function showModel(model: Model): void {
  view.clip = 0;
  view.forcedLevel = -1;
  toolbar.setModel(model);
  viewportBar.setModel(model);
  preview.setClip(0);
  inspector.render(model);
  update();
}

function frame(time: number): void {
  const delta = lastTime === 0 ? 0 : Math.min((time - lastTime) / 1000, maxDelta);

  lastTime = time;

  if (view.playing && preview.isAnimated) {
    preview.advance(delta);
    needsRender = true;
  }

  if (!needsRender) return;

  needsRender = false;
  preview.cull(camera);
  renderer.render(scene, camera);
}

function requestRender(): void {
  needsRender = true;
}

function resize(): void {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;

  if (width === 0 || height === 0) return;

  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  requestRender();

  if (height === viewportHeight) return;

  const isFirst = viewportHeight === 0;

  viewportHeight = height;

  if (!isFirst) scheduleUpdate(resizeDelay);
}

function scheduleUpdate(delay = updateDelay): void {
  clearTimeout(updateTimeout);
  updateTimeout = window.setTimeout(update, delay);
}

function update(): void {
  clearTimeout(updateTimeout);

  const model = models.get(settings.model);

  if (model === undefined) return;

  writeSettingsToUrl(settings);

  try {
    snapshot = createSnapshot(model);
    hideError();
  } catch (error) {
    showError(error);

    return;
  }

  const count = snapshot.lod.levels.length;

  if (view.selectedLevel >= count) selectLevel(count - 1);
  if (view.forcedLevel >= count) view.forcedLevel = -1;

  buildPreview(snapshot);
  levelsPanel.render(snapshot);
  dock.render(snapshot);
  viewportBar.setLevelsCount(count);
  requestRender();
}

function createSnapshot(model: Model): Snapshot {
  const levels = getLevels(settings);
  const lod = getLOD(model, levels);
  const thresholds = getThresholds(lod, levels, settings, viewportHeight);
  const used = getUsedLevels(thresholds, settings);
  const screenSizes = thresholds.map((threshold) => getSwitchScreenSize(threshold, lod.radius, settings, camera.fov));
  const draw = getDrawLevels(model, lodCache!, screenSizes);
  const warnings = [...getSettingsWarnings(settings, model), ...getResultWarnings(lod, used, settings)];

  return { model, lod, draw, thresholds, used, field: getFieldLayout(lod, thresholds, settings, camera.fov), fov: camera.fov, warnings };
}

/**
 * Returns the levels of the model, simplifying it again only when the simplification parameters change.
 */
function getLOD(model: Model, levels: LevelSettings[]): GeometryLOD {
  const key = JSON.stringify([
    model.id, settings.vertices, settings.errorAbsolute, settings.normalWeight, settings.uvWeight, settings.protectNormalSeams, settings.protectUvSeams,
    levels.map((level) => ({ ...level, screenSize: 0, distance: 0, hysteresis: 0 }))
  ]);

  if (lodCache?.key === key) return lodCache.lod;

  const lod = simplifyGeometry(model.geometry, levels, settings);
  const previous = lodCache;

  const reducer = model.skin === null ? null : new SkinReducer(lod.levels.map((level) => level.geometry), model.skin);

  lodCache = { key, model, lod, reducer };

  if (previous !== null) {
    previous.reducer?.dispose();
    disposeLOD(previous.lod, previous.model.geometry);
  }

  return lod;
}

/**
 * Returns the geometries drawn for each level, reducing the skin influences again only when the levels or their switch points change.
 */
function getDrawLevels(model: Model, cache: LODCache, screenSizes: number[]): DrawLevels {
  const key = model.skin === null ? '' : JSON.stringify([screenSizes, settings.skinError, viewportHeight]);

  if (drawCache !== null && drawCache.lod === cache.lod && drawCache.key === key) return drawCache.draw;

  const draw = reduceSkin(cache.lod, model.skin, cache.reducer, screenSizes, settings.skinError, viewportHeight);

  drawCache = { key, lod: cache.lod, draw };

  return draw;
}

function buildPreview(current: Snapshot): void {
  const levels = getLevels(settings);
  const key = JSON.stringify([current.thresholds, current.used, levels.map((level) => level.hysteresis), settings.layout, settings.shading, view.forcedLevel]);
  const geometries = current.draw.geometries;
  const isSameGeometries = geometries.length === builtGeometries.length && geometries.every((geometry, i) => geometry === builtGeometries[i]);

  builtGeometries = geometries;

  if (key !== buildKey || !isSameGeometries) {
    preview.build({ ...current, geometries: current.draw.geometries, settings, forcedLevel: view.forcedLevel });
    preview.setClip(view.clip);
    buildKey = key;
  }

  preview.setColorByLevel(settings.colorByLevel);
  preview.setFlatShading(settings.flatShading);
  preview.setHighlightedLevel(getHighlightedLevel(), view.hoveredLevel >= 0 || view.isolate);

  const nextCameraKey = JSON.stringify([current.model.id, settings.layout, current.lod.levels.length]);

  if (nextCameraKey === cameraKey) return;

  cameraKey = nextCameraKey;
  resetCamera();
}

function resetCamera(): void {
  const defaultView = preview.getDefaultView(camera);

  camera.position.copy(defaultView.position);
  camera.far = defaultView.far;
  camera.near = defaultView.far / 20000;
  camera.updateProjectionMatrix();
  controls.target.copy(defaultView.target);
  controls.update();
  requestRender();
}

function selectLevel(level: number): void {
  view.selectedLevel = level;
  levelsPanel.select(level);
  dock.select(level);
  updateHighlight();

  if (snapshot !== null) inspector.render(snapshot.model);
}

function hoverLevel(level: number): void {
  if (level === view.hoveredLevel) return;

  view.hoveredLevel = level;
  updateHighlight();
}

function updateHighlight(): void {
  preview.setHighlightedLevel(getHighlightedLevel(), view.hoveredLevel >= 0 || view.isolate);
  requestRender();
}

function getHighlightedLevel(): number {
  if (view.hoveredLevel >= 0) return view.hoveredLevel;

  return view.selectedLevel;
}

function addLevel(): void {
  const levels = getLevels(settings);

  if (levels.length >= maxLevels) return;

  levels.push(createNextLevel(levels.at(-1)));
  update();
  selectLevel(levels.length);
}

function removeLevel(): void {
  const levels = getLevels(settings);

  if (levels.length === 0) return;

  levels.pop();
  update();
  selectLevel(Math.min(view.selectedLevel, levels.length));
}

function togglePlay(): void {
  view.playing = !view.playing;
  toolbar.setPlaying(view.playing);
}

function selectClip(clip: number): void {
  view.clip = clip;
  preview.setClip(clip);
  requestRender();
}

function onLanguage(): void {
  writeSettingsToUrl(settings);

  if (snapshot !== null) dock.renderCode(snapshot);
}

function onImport(text: string): void {
  try {
    writeSettingsToUrl(importSettings(text));
  } catch (error) {
    showError(error);

    return;
  }

  window.location.reload();
}

function showError(error: unknown): void {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unexpected error.';

  errorMessage.textContent = message;
  errorBanner.hidden = false;
  console.error(error);
}

function hideError(): void {
  errorBanner.hidden = true;
}

function getElement(id: string): HTMLElement {
  return document.getElementById(id)!;
}
