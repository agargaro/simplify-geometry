import { prepareInstancedRenderer } from '@three.ez/instanced-mesh';
import { simplifyReady } from '@three.ez/simplify-geometry';
import { AmbientLight, type BufferGeometry, Color, DirectionalLight, PerspectiveCamera, PMREMGenerator, Scene, WebGLRenderer } from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BottomDock } from './BottomDock.js';
import { formatTime } from './Format.js';
import { History } from './History.js';
import { Inspector } from './Inspector.js';
import { LevelNav } from './LevelNav.js';
import { LevelsPanel } from './LevelsPanel.js';
import { LODPreview } from './LODPreview.js';
import { disposeModel, initModelLoaders, loadModel, loadModelFile, type Model } from './Models.js';
import { createDefaultSettings, createModelSettings, createNextLevel, getLevels, maxLevels, modelLabels, type LevelSettings, type ModelName, type Settings, type ThresholdMode } from './Settings.js';
import { importSettings, readInitialSettings, saveSettings } from './SettingsIO.js';
import { disposeLOD, simplifyGeometry, type GeometryLOD } from './Simplification.js';
import { randomClip, type Snapshot, type ViewState } from './State.js';
import { getFieldLayout, getSwitchDistance, getSwitchScreenSize, getThresholds, getUsedLevels } from './Thresholds.js';
import { Toolbar, ViewportBar } from './Toolbar.js';
import { initTooltips } from './Tooltips.js';
import { getResultWarnings, getSettingsWarnings } from './Warnings.js';

interface LODCache {
  key: string;
  model: Model;
  lod: GeometryLOD;
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

const settings = readInitialSettings();

if (settings.model === 'custom') settings.model = 'imp';

const history = new History(settings);
const view: ViewState = { selectedLevel: 1, hoveredLevel: -1, isolate: false, forcedLevel: -1, playing: true, clip: randomClip };
const models = new Map<ModelName, Model>();

const renderer = new WebGLRenderer({ antialias: true });
const scene = new Scene();
const camera = new PerspectiveCamera(settings.fov, 1, 0.1, 5000);
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
controls.zoomToCursor = true;
controls.zoomSpeed = 0.5;
controls.panSpeed = 0.5;
controls.rotateSpeed = 0.6;
controls.addEventListener('change', requestRender);

const toolbar = new Toolbar(getElement('toolbar'), settings, view, { onModel: (name) => void selectModel(name), onOpenFile: (file) => void openModelFile(file), onPlay: togglePlay, onClip: selectClip, onImport, onUndo: undo, onRedo: redo, onReset });
const viewportBar = new ViewportBar(getElement('viewport-bar'), settings, view, { onChange: scheduleUpdate, onHighlight: updateHighlight, onResetCamera: resetCamera });
const levelsPanel = new LevelsPanel(getElement('levels-dock'), settings, view, { onSelect: selectLevel, onHover: hoverLevel, onAdd: addLevel, onRemove: removeLevel, onMeasure: () => void measureBuildTime() });
const dock = new BottomDock(getElement('bottom-dock'), settings, view, { onSelect: selectLevel, onHover: hoverLevel, onLanguage });
const inspector = new Inspector(getElement('inspector'), levelsPanel.settingsContainer, settings, view, scheduleUpdate);
const levelNav = new LevelNav(document.querySelector<HTMLElement>('.inspector .dock-header')!, selectLevel);

preview.onStats = (stats) => {
  levelsPanel.renderStats(stats);
};

let lodCache: LODCache | null = null;
let snapshot: Snapshot | null = null;
let buildKey = '';
let snapshotMode: ThresholdMode = settings.thresholdMode;
let builtGeometries: BufferGeometry[] = [];
let cameraKey = '';
let updateTimeout = 0;
let needsRender = true;
let lastTime = 0;
let viewportHeight = 0;

new ResizeObserver(resize).observe(viewport);
resize();

initFileDrop();
document.addEventListener('keydown', onHistoryKey);

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
  history.clear('custom');
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
  view.clip = randomClip;
  view.forcedLevel = -1;
  toolbar.setModel(model);
  viewportBar.setModel(model);
  preview.setClip(randomClip);
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

  prefillManualSwitches(model);
  saveSettings(settings);
  recordHistory();
  applyFov();

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
  levelNav.update(view.selectedLevel, count);
  requestRender();
}

function createSnapshot(model: Model): Snapshot {
  const levels = getLevels(settings);
  const lod = getLOD(model, levels);
  const thresholds = getThresholds(lod, levels, settings, viewportHeight);
  const used = getUsedLevels(thresholds, settings);
  const warnings = [...getSettingsWarnings(settings, model), ...getResultWarnings(lod, used, settings)];

  return { model, lod, thresholds, used, field: getFieldLayout(lod, settings, camera.fov), fov: camera.fov, warnings };
}

/**
 * Returns the levels of the model, simplifying it again only when the simplification parameters change.
 */
function getLOD(model: Model, levels: LevelSettings[]): GeometryLOD {
  const key = JSON.stringify([
    model.id, settings.vertices, settings.errorAbsolute, settings.protectNormalSeams, settings.protectUvSeams,
    levels.map((level) => ({ ...level, screenSize: 0, distance: 0, hysteresis: 0 }))
  ]);

  if (lodCache?.key === key) return lodCache.lod;

  const lod = simplifyGeometry(model.geometry, levels, settings);
  const previous = lodCache;

  lodCache = { key, model, lod };

  if (previous !== null) disposeLOD(previous.lod, previous.model.geometry);

  return lod;
}

function buildPreview(current: Snapshot): void {
  const levels = getLevels(settings);
  const key = JSON.stringify([current.thresholds, current.used, levels.map((level) => level.hysteresis), settings.instances, settings.spread, settings.environment, settings.layout, settings.shading, view.forcedLevel]);
  const geometries = current.lod.levels.map((level) => level.geometry);
  const isSameGeometries = geometries.length === builtGeometries.length && geometries.every((geometry, i) => geometry === builtGeometries[i]);

  builtGeometries = geometries;

  if (key !== buildKey || !isSameGeometries) {
    preview.build({ ...current, geometries, settings, forcedLevel: view.forcedLevel });
    preview.setClip(view.clip);
    buildKey = key;
  }

  preview.setColorByLevel(settings.colorByLevel);
  preview.setFlatShading(settings.flatShading);
  preview.setHighlightedLevel(getHighlightedLevel());

  const nextCameraKey = JSON.stringify([current.model.id, settings.layout, current.lod.levels.length, settings.instances, settings.spread, settings.fov]);

  if (nextCameraKey === cameraKey) return;

  cameraKey = nextCameraKey;
  resetCamera();
}

/**
 * When the switch mode changes, writes the switch points shown so far into the screen sizes and distances of the levels, so that a
 * manual mode starts from where the levels already switched instead of from fixed placeholders.
 */
function prefillManualSwitches(model: Model): void {
  const previousMode = snapshotMode;

  snapshotMode = settings.thresholdMode;

  if (snapshot === null || snapshot.model !== model || previousMode === settings.thresholdMode || settings.thresholdMode === 'pixelError') return;

  const levels = getLevels(settings);
  const previous = { ...settings, thresholdMode: previousMode };
  const { thresholds, used, lod, fov } = snapshot;

  for (let i = 0; i < thresholds.length && i < levels.length; i++) {
    if (!used[i]) continue;

    levels[i].screenSize = roundSwitch(getSwitchScreenSize(thresholds[i], lod.radius, previous, fov));
    levels[i].distance = roundSwitch(getSwitchDistance(thresholds[i], lod.radius, previous, fov));
  }

  inspector.render(model);
}

function roundSwitch(value: number): number {
  return Number(value.toPrecision(3));
}

function applyFov(): void {
  if (camera.fov === settings.fov) return;

  camera.fov = settings.fov;
  camera.updateProjectionMatrix();
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

  if (snapshot === null) return;

  levelNav.update(level, snapshot.lod.levels.length);
  inspector.render(snapshot.model);
}

function hoverLevel(level: number): void {
  if (level === view.hoveredLevel) return;

  view.hoveredLevel = level;
  updateHighlight();
}

function updateHighlight(): void {
  viewportBar.setSelectedLevel(view.selectedLevel);
  preview.setHighlightedLevel(getHighlightedLevel());
  requestRender();
}

/**
 * Returns the level whose instances stay lit while the others are dimmed: the hovered level, or the selected one while isolated.
 * Selecting a level alone dims nothing, so that the drawn colors and textures stay true.
 */
function getHighlightedLevel(): number {
  if (view.hoveredLevel >= 0) return view.hoveredLevel;

  return view.isolate ? view.selectedLevel : -1;
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
  saveSettings(settings);
  recordHistory();

  if (snapshot !== null) dock.renderCode(snapshot);
}

function recordHistory(): void {
  if (history.record()) levelsPanel.setBuildTime('');

  toolbar.setHistory(history.canUndo, history.canRedo);
}

/**
 * Simplifies every level from scratch, without the cache of the preview, and shows the time.
 */
async function measureBuildTime(): Promise<void> {
  const model = models.get(settings.model);

  if (model === undefined) return;

  levelsPanel.setBuildTime('Measuring…', true);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const start = performance.now();
  const lod = simplifyGeometry(model.geometry, getLevels(settings), settings);

  levelsPanel.setBuildTime(formatTime(performance.now() - start));
  disposeLOD(lod, model.geometry);
}

function undo(): void {
  if (history.undo()) showSettings();
}

function redo(): void {
  if (history.redo()) showSettings();
}

/**
 * Shows in every panel the settings replaced by undo, redo or import.
 */
function showSettings(): void {
  const model = models.get(settings.model);

  viewportBar.sync();
  dock.sync();

  if (model !== undefined) inspector.render(model);

  update();
}

function onHistoryKey(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

  const key = event.key.toLowerCase();

  if (key === 'z') {
    event.preventDefault();

    if (event.shiftKey) redo();
    else undo();
  } else if (key === 'y' && !event.shiftKey) {
    event.preventDefault();
    redo();
  }
}

/**
 * Replaces the settings with the imported ones as one change of the current model, so that undo restores them, then shows the
 * imported model.
 */
function onImport(text: string): void {
  let imported: Settings;

  try {
    imported = importSettings(text);
  } catch (error) {
    showError(error);

    return;
  }

  const model = imported.model;

  Object.assign(settings, imported, { model: settings.model });
  showSettings();

  if (model !== settings.model) void selectModel(model);
}

/**
 * Restores every setting to its default, keeping the current model, as one change that undo reverts.
 */
function onReset(): void {
  Object.assign(settings, createDefaultSettings(), { model: settings.model });
  showSettings();
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
