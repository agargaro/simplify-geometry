import { prepareInstancedRenderer } from '@three.ez/instanced-mesh';
import { simplifyReady } from '@three.ez/simplify-geometry';
import { AmbientLight, type BufferGeometry, Color, DirectionalLight, PerspectiveCamera, PMREMGenerator, Scene, WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BottomDock } from './BottomDock.js';
import { CameraHint } from './CameraHint.js';
import { computeDefaultLevels, computeNextLevel } from './DefaultLevels.js';
import { formatPercent, formatTime } from './Format.js';
import { FlyControls } from './FlyControls.js';
import { FrameRate } from './FrameRate.js';
import { getRendererInfo, GpuTimer } from './GpuTimer.js';
import { History } from './History.js';
import { Inspector } from './Inspector.js';
import { LevelNav } from './LevelNav.js';
import { LevelsPanel } from './LevelsPanel.js';
import { LODPreview } from './LODPreview.js';
import { modelFileList, readDataTransfer, type FileSet } from './ModelFiles.js';
import { pickModels } from './ModelPicker.js';
import { disposeModel, initModelLoaders, loadModel, loadModelFile, type Model } from './Models.js';
import { builtInModelNames, createDefaultSettings, createModelSettings, getLevels, getModelSettings, isBuiltInModel, maxLevels, modelLabels, type ModelId, type ModelSettings, type Settings, type ThresholdMode } from './Settings.js';
import { importSettings, readInitialSettings, readRemovedModels, saveRemovedModels, saveSettings } from './SettingsIO.js';
import { disposeLOD, getTriangles, simplifyGeometry, type GeometryLOD } from './Simplification.js';
import { randomClip, type Snapshot, type ViewState } from './State.js';
import { getFieldLayout, getSwitchDistance, getSwitchScreenSize, getThresholds, getUsedLevels } from './Thresholds.js';
import { initShortcuts } from './Shortcuts.js';
import { Toolbar, Transport, ViewportBar, type ModelTab } from './Toolbar.js';
import { TransitionLabels } from './TransitionLabels.js';
import { initTooltips } from './Tooltips.js';
import { getResultWarnings, getSettingsWarnings, type Warning } from './Warnings.js';

interface LODCache {
  key: string;
  model: Model;
  lod: GeometryLOD;
}

const updateDelay = 60;
const resizeDelay = 200;
const maxDelta = 0.1;

const app = getElement('app');
const errorBanner = getElement('error');
const errorMessage = getElement('error-message');
const viewport = getElement('viewport');
const status = getElement('viewport-status');
const emptyNote = getElement('viewport-empty');

getElement('error-close').addEventListener('click', hideError);
window.addEventListener('error', (event) => {
  showError(event.error ?? event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  showError(event.reason);
});

initTooltips(getElement('tooltip'));

const settings = readInitialSettings();
const removedModels: ModelId[] = readRemovedModels();
const history = new History(settings);
const view: ViewState = { selectedLevel: 1, hoveredLevel: -1, isolate: false, forcedLevel: -1, playing: true, clip: randomClip };
const models = new Map<ModelId, Model>();
/** Models opened from files, in the order of their tabs. */
const fileModels: ModelId[] = [];

const renderer = new WebGLRenderer({ antialias: true });
const scene = new Scene();
const camera = new PerspectiveCamera(settings.fov, 1, 0.1, 5000);
const controls = new FlyControls(camera, renderer.domElement);
const light = new DirectionalLight('white', 2.2);
const preview = new LODPreview(scene);
const cameraHint = new CameraHint(viewport);
const transitionLabels = new TransitionLabels(viewport, focusTransition);
const gpuTimer = new GpuTimer(renderer);
const frameRate = new FrameRate();

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
initModelLoaders(renderer);
preview.setEnvironment(new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture);
viewport.append(renderer.domElement);
scene.background = new Color('#121316');
scene.add(new AmbientLight('white', 0.9), camera);
light.position.set(0.4, 1, 0.6);
camera.add(light, light.target);
controls.onStart = () => {
  cameraHint.onCameraStart();
};
controls.onChange = requestRender;

const toolbar = new Toolbar(getElement('toolbar'), settings, { onModel: (id) => void selectModel(id), onRemoveModel: (id) => void removeModel(id), onRestoreModels: restoreModels, onOpenFiles: (files) => void openModelFiles(files), onImport, onUndo: undo, onRedo: redo, onReset });
const viewportBar = new ViewportBar(getElement('viewport-bar'), settings, view, { onChange: scheduleUpdate, onHighlight: updateHighlight, onResetCamera: resetCamera, onCameraHint: toggleCameraHint });
const transport = new Transport(viewport, view, { onPlay: togglePlay, onClip: selectClip });
const levelsPanel = new LevelsPanel(getElement('levels-dock'), settings, view, { onSelect: selectLevel, onHover: hoverLevel, onAdd: addLevel, onRemove: removeLevel, onMeasure: () => void measureBuildTime() });
const dock = new BottomDock(getElement('bottom-dock'), settings, view, { onSelect: selectLevel, onHover: hoverLevel, onWarning: showWarning, onLanguage });
const inspector = new Inspector(getElement('inspector'), levelsPanel.settingsContainer, settings, view, scheduleUpdate);
const levelNav = new LevelNav(document.querySelector<HTMLElement>('.inspector .dock-header')!, selectLevel);

cameraHint.onVisibility = (visible) => {
  viewportBar.setCameraHint(visible);
};

preview.onStats = (stats) => {
  levelsPanel.renderStats(stats);
};

gpuTimer.onTime = (milliseconds) => {
  levelsPanel.renderGpuTime(milliseconds);
};
frameRate.onRate = (fps) => {
  levelsPanel.renderFrameRate(fps);
};
levelsPanel.setRenderer(getRendererInfo(renderer), gpuTimer.isSupported);

let lodCache: LODCache | null = null;
let snapshot: Snapshot | null = null;
let buildKey = '';
let snapshotMode: ThresholdMode = getModelSettings(settings).thresholdMode;
let builtGeometries: BufferGeometry[] = [];
let cameraKey = '';
let updateTimeout = 0;
let needsRender = true;
let lastTime = 0;
let viewportHeight = 0;

new ResizeObserver(resize).observe(viewport);
resize();

initFileDrop();
renderModelTabs();
document.addEventListener('keydown', onHistoryKey);
initShortcuts({
  onLevel: (level) => {
    if (snapshot !== null && level < snapshot.lod.levels.length) selectLevel(level);
  },
  onLayout: () => {
    viewportBar.nextLayout();
  },
  onIsolate: () => {
    viewportBar.toggleIsolate();
  },
  onColorByLevel: () => {
    viewportBar.toggleColorByLevel();
  },
  onForce: () => {
    viewportBar.nextForcedLevel();
  },
  onResetCamera: () => {
    viewportBar.resetCamera();
  },
  onPlay: togglePlay,
  onLegend: toggleCameraHint
});

await Promise.all([simplifyReady(), prepareInstancedRenderer(renderer)]);

if (removedModels.includes(settings.model)) await selectFirstModel();
else await selectModel(settings.model);

renderer.setAnimationLoop(frame);

async function selectModel(id: ModelId): Promise<void> {
  const cached = models.get(id);

  if (cached !== undefined) {
    settings.model = id;
    showModel(cached);

    return;
  }

  if (!isBuiltInModel(id)) return;

  const model = await loadWithStatus(`Loading ${modelLabels[id]}…`, async () => loadModel(id));

  if (model === null) {
    renderModelTabs();

    return;
  }

  models.set(id, model);
  settings.model = id;
  showModel(model);
}

async function selectFirstModel(): Promise<void> {
  const first = getModelTabs().at(0);

  if (first === undefined) showEmpty();
  else await selectModel(first.id);
}

/**
 * Opens the models of `files` in their own tabs, one after the other, and shows the first one that loads. When a folder holds several
 * models, a dialog asks which ones to open. The files that fail are listed in one error.
 */
async function openModelFiles(files: FileSet): Promise<void> {
  if (files.models.length === 0) {
    showError(new Error(`No model among the opened files: use ${modelFileList}.`));

    return;
  }

  const chosen = files.fromFolder && files.models.length > 1 ? await pickModels(files.models) : files.models;
  const count = chosen.length;
  const failures: string[] = [];
  let first: Model | null = null;

  for (let i = 0; i < count; i++) {
    const source = chosen[i];
    const progress = count > 1 ? ` (${i + 1}/${count})` : '';
    const onError = (error: unknown): void => {
      failures.push(`${source.path}: ${getErrorMessage(error)}`);
    };
    const model = await loadWithStatus(`Loading ${source.file.name}${progress}…`, async () => loadModelFile(source, files), onError);

    if (model === null) continue;

    addFileModel(model);
    first ??= model;
  }

  if (first !== null) {
    settings.model = first.name;
    showModel(first);
  }

  if (failures.length === 0) return;

  showError(new Error(failures.length === 1 ? failures[0] : `${failures.length} files could not be opened. ${failures.join(' ')}`));
}

function addFileModel(model: Model): void {
  models.set(model.name, model);
  fileModels.push(model.name);
  settings.models[model.name] = createModelSettings();
  history.clear(model.name);
}

/**
 * Removes a model with its levels and history. A removed built-in model stays removed in this browser until `restoreModels`.
 */
async function removeModel(id: ModelId): Promise<void> {
  const model = models.get(id);
  const isShown = id === settings.model;

  models.delete(id);

  if (isBuiltInModel(id)) {
    removedModels.push(id);
    saveRemovedModels(removedModels.filter(isBuiltInModel));
    settings.models[id] = createModelSettings();
  } else {
    fileModels.splice(fileModels.indexOf(id), 1);
    settings.models = withoutModel(settings.models, id);
  }

  history.clear(id);

  if (isShown) clearPreview();
  if (model !== undefined) disposeModel(model);

  if (isShown) await selectFirstModel();
  else renderModelTabs();

  saveSettings(settings);
}

function restoreModels(): void {
  const isEmpty = app.classList.contains('is-empty');

  removedModels.length = 0;
  saveRemovedModels([]);
  renderModelTabs();

  if (isEmpty) void selectFirstModel();
}

function withoutModel(source: Record<ModelId, ModelSettings>, id: ModelId): Record<ModelId, ModelSettings> {
  return Object.fromEntries(Object.entries(source).filter(([key]) => key !== id));
}

function getModelTabs(): ModelTab[] {
  const tabs: ModelTab[] = [];

  for (const name of builtInModelNames) {
    if (!removedModels.includes(name)) tabs.push({ id: name, label: modelLabels[name] });
  }

  for (const id of fileModels) tabs.push({ id, label: models.get(id)!.label });

  return tabs;
}

function renderModelTabs(): void {
  const active = app.classList.contains('is-empty') ? null : settings.model;

  toolbar.setModels(getModelTabs(), active, removedModels.length > 0);
}

/**
 * Shows that no model is left: the panels are hidden until a model is opened or the sample models are restored.
 */
function showEmpty(): void {
  settings.model = builtInModelNames[0];
  setEmpty(true);
  renderModelTabs();
}

function setEmpty(isEmpty: boolean): void {
  app.classList.toggle('is-empty', isEmpty);
  emptyNote.hidden = !isEmpty;
}

/**
 * Removes the instances of the shown model and frees its levels, before the model itself is disposed.
 */
function clearPreview(): void {
  preview.dispose();

  if (lodCache !== null) disposeLOD(lodCache.lod, lodCache.model.geometry);

  lodCache = null;
  snapshot = null;
  buildKey = '';
  cameraKey = '';
  builtGeometries = [];
  requestRender();
}

async function loadWithStatus(text: string, load: () => Promise<Model>, onError: (error: unknown) => void = showError): Promise<Model | null> {
  toolbar.setModelsDisabled(true);
  status.textContent = text;
  status.hidden = false;
  emptyNote.hidden = true;

  try {
    return await load();
  } catch (error) {
    onError(error);

    return null;
  } finally {
    toolbar.setModelsDisabled(false);
    status.hidden = true;
    emptyNote.hidden = !app.classList.contains('is-empty');
    if (emptyNote.hidden) cameraHint.showFirstTime();
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

    if (event.dataTransfer === null) return;

    readDataTransfer(event.dataTransfer).then(openModelFiles, showError);
  });
}

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') === true;
}

function showModel(model: Model): void {
  applyPendingLevels(model);
  setEmpty(false);
  renderModelTabs();
  view.clip = randomClip;
  view.forcedLevel = -1;
  transport.setModel(model);
  viewportBar.setModel(model);
  preview.setClip(randomClip);
  inspector.render(model);
  update();
}

/**
 * Replaces the placeholder levels of the shown model with the levels computed from its geometry. The computed levels are the starting
 * point of the model history, so undo never goes back to the placeholders.
 */
function applyPendingLevels(model: Model): void {
  const modelSettings = getModelSettings(settings);

  if (!modelSettings.levelsPending) return;

  setDefaultLevels(modelSettings, model);
  history.clear(settings.model);
}

function setDefaultLevels(modelSettings: ModelSettings, model: Model): void {
  modelSettings.levels = computeDefaultLevels(model.geometry, modelSettings);
  modelSettings.levelsPending = false;
}

function frame(time: number): void {
  const delta = lastTime === 0 ? 0 : Math.min((time - lastTime) / 1000, maxDelta);

  lastTime = time;
  gpuTimer.poll();

  if (view.playing && preview.isAnimated) {
    preview.advance(delta);
    needsRender = true;
  }

  if (preview.updateFlip(time)) needsRender = true;
  if (controls.update(delta)) needsRender = true;

  frameRate.tick(time, needsRender);

  if (!needsRender) return;

  needsRender = false;
  camera.updateMatrixWorld();
  preview.cull(camera);
  gpuTimer.begin();
  renderer.render(scene, camera);
  gpuTimer.end();
  transitionLabels.update(camera, viewport.clientWidth, viewport.clientHeight);
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

  const wasHidden = viewportHeight === 0;

  viewportHeight = height;
  scheduleUpdate(wasHidden ? 0 : resizeDelay);
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
  inspector.setSnapshot(snapshot);
  levelsPanel.render(snapshot);
  dock.render(snapshot);
  viewportBar.setLevelsCount(count);
  levelNav.update(view.selectedLevel, count);
  requestRender();
}

function createSnapshot(model: Model): Snapshot {
  const modelSettings = getModelSettings(settings);
  const levels = modelSettings.levels;
  const lod = getLOD(model, modelSettings);
  const thresholds = getThresholds(lod, levels, modelSettings, viewportHeight);
  const used = getUsedLevels(thresholds, modelSettings);
  const warnings = [...getSettingsWarnings(modelSettings, model), ...getResultWarnings(lod, used, modelSettings)];

  return { model, lod, thresholds, used, field: getFieldLayout(lod, settings, camera.fov), fov: camera.fov, warnings };
}

/**
 * Returns the levels of the model, simplifying it again only when the simplification parameters change.
 */
function getLOD(model: Model, modelSettings: ModelSettings): GeometryLOD {
  const levels = modelSettings.levels;
  const key = JSON.stringify([
    model.id, modelSettings.vertices, modelSettings.errorAbsolute, modelSettings.protectNormalSeams, modelSettings.protectUvSeams,
    levels.map((level) => ({ ...level, screenSize: 0, distance: 0, hysteresis: 0 }))
  ]);

  if (lodCache?.key === key) return lodCache.lod;

  const lod = simplifyGeometry(model.geometry, levels, modelSettings);
  const previous = lodCache;

  lodCache = { key, model, lod };

  if (previous !== null) disposeLOD(previous.lod, previous.model.geometry);

  return lod;
}

function buildPreview(current: Snapshot): void {
  const levels = getLevels(settings);
  const key = JSON.stringify([current.thresholds, current.used, levels.map((level) => level.hysteresis), settings.instances, settings.spread, settings.environment, settings.layout, settings.transitionView, settings.fov, settings.shading, view.forcedLevel]);
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
  preview.setFocusLevel(view.selectedLevel);
  showTransitionLabels(current);
  lockCamera(settings.layout === 'transitions');

  const transitionsKey = settings.layout === 'transitions' ? [current.thresholds, current.used, settings.transitionView, viewportHeight] : null;
  const nextCameraKey = JSON.stringify([current.model.id, settings.layout, current.lod.levels.length, settings.instances, settings.spread, settings.fov, transitionsKey]);

  if (nextCameraKey === cameraKey) return;

  cameraKey = nextCameraKey;
  resetCamera();
}

/**
 * Labels every switch of the Transitions layout with its size on screen and the triangles it saves, or hides the labels in the other
 * layouts.
 */
function showTransitionLabels(current: Snapshot): void {
  if (settings.layout !== 'transitions') {
    transitionLabels.hide();

    return;
  }

  const levels = current.lod.levels;
  const labels = preview.transitions.map((transition) => {
    const saved = 1 - getTriangles(levels[transition.to].geometry) / getTriangles(levels[transition.from].geometry);
    const pixels = Math.round(transition.screenSize * viewportHeight);

    return { anchor: transition.anchor, from: transition.from, to: transition.to, detail: `${formatPercent(transition.screenSize)} · ${pixels} px · −${formatPercent(saved)} tri` };
  });

  transitionLabels.show(labels, preview.focusedTransition);
}

/**
 * Moves the camera to the switch at `index` of the Transitions layout, by selecting the level it switches to.
 */
function focusTransition(index: number): void {
  const transition = preview.transitions.at(index);

  if (transition !== undefined) selectLevel(transition.to);
}

/**
 * Locks the camera in the Transitions layout, so that the switches always keep their real size on screen.
 */
function lockCamera(isLocked: boolean): void {
  controls.enabled = !isLocked;
  app.classList.toggle('is-camera-locked', isLocked);
}

/**
 * When the switch mode changes, writes the switch points shown so far into the screen sizes and distances of the levels, so that a
 * manual mode starts from where the levels already switched instead of from fixed placeholders.
 */
function prefillManualSwitches(model: Model): void {
  const modelSettings = getModelSettings(settings);
  const previousMode = snapshotMode;

  snapshotMode = modelSettings.thresholdMode;

  if (snapshot === null || snapshot.model !== model || previousMode === modelSettings.thresholdMode || modelSettings.thresholdMode === 'pixelError') return;

  const levels = modelSettings.levels;
  const previous = { thresholdMode: previousMode };
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

function toggleCameraHint(): void {
  cameraHint.toggle();
}

function resetCamera(): void {
  const defaultView = preview.getDefaultView(camera);

  controls.setScale(defaultView.position.distanceTo(defaultView.target));
  controls.minHeight = defaultView.far / 4000;
  controls.maxDistance = defaultView.far / 2;

  camera.far = defaultView.far;
  camera.near = defaultView.far / 20000;
  camera.updateProjectionMatrix();
  controls.setView(defaultView.position, defaultView.target);
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

  if (!preview.setFocusLevel(level) || settings.layout !== 'transitions') return;

  transitionLabels.setFocus(preview.focusedTransition);
  resetCamera();
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

/**
 * Adds a level after the last one, computed as the default levels from the triangles and the error of the last level shown.
 */
function addLevel(): void {
  const modelSettings = getModelSettings(settings);
  const levels = modelSettings.levels;
  const model = models.get(settings.model);

  if (levels.length >= maxLevels || model === undefined || snapshot === null) return;

  const last = snapshot.lod.levels[snapshot.lod.levels.length - 1];
  const previous = { triangles: getTriangles(last.geometry), error: last.error };

  levels.push(computeNextLevel(model.geometry, modelSettings, levels, previous));
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
  transport.setPlaying(view.playing);
}

/**
 * Selects the level a warning is about and points at the setting that causes it.
 */
function showWarning(warning: Warning): void {
  if (warning.level >= 0) selectLevel(warning.level);
  if (warning.field !== undefined) inspector.highlight(warning.field);
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

  const modelSettings = getModelSettings(settings);
  const levels = modelSettings.levels;
  const start = performance.now();
  const lod = simplifyGeometry(model.geometry, levels, modelSettings);
  const total = performance.now() - start;
  const times: number[] = [];

  disposeLOD(lod, model.geometry);

  for (const level of levels) {
    const levelStart = performance.now();
    const levelLOD = simplifyGeometry(model.geometry, [level], modelSettings);

    times.push(performance.now() - levelStart);
    disposeLOD(levelLOD, model.geometry);
  }

  levelsPanel.setBuildTime(formatTime(total), false, times);
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
 * imported model when it is a built-in one still available. Models opened from files keep their levels, except the shown one when the
 * imported file was saved with a file model shown: it takes those levels.
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
  const levels = { ...settings.models };
  const isFileToFile = !isBuiltInModel(model) && !isBuiltInModel(settings.model);

  for (const name of builtInModelNames) levels[name] = imported.models[name];

  if (isFileToFile) levels[settings.model] = imported.models[model];

  Object.assign(settings, imported, { model: settings.model, models: levels });

  const shown = models.get(settings.model);
  const shownSettings = getModelSettings(settings);

  if (shown !== undefined && shownSettings.levelsPending) setDefaultLevels(shownSettings, shown);

  showSettings();

  if (isBuiltInModel(model) && model !== settings.model && !removedModels.includes(model)) void selectModel(model);
}

/**
 * Restores the LOD settings of the current model and the preview settings to their defaults, as one change that undo reverts. The other
 * models keep their settings.
 */
function onReset(): void {
  const model = models.get(settings.model);
  const modelSettings = createModelSettings();

  if (model !== undefined) setDefaultLevels(modelSettings, model);

  Object.assign(settings, createDefaultSettings(), { model: settings.model, models: { ...settings.models, [settings.model]: modelSettings } });
  showSettings();
}

function showError(error: unknown): void {
  errorMessage.textContent = getErrorMessage(error);
  errorBanner.hidden = false;
  console.error(error);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unexpected error.';
}

function hideError(): void {
  errorBanner.hidden = true;
}

function getElement(id: string): HTMLElement {
  return document.getElementById(id)!;
}
