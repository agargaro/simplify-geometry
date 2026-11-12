import { cameraHintText } from './CameraHint.js';
import { createChoice, createElement, selectChoice } from './Controls.js';
import { icon, type IconName } from './Icons.js';
import { getDrawnShading } from './LODPreview.js';
import { modelFileAccept, readFileList, type FileSet } from './ModelFiles.js';
import { isShadingAvailable, type Model } from './Models.js';
import type { ModelId, PreviewLayout, Settings, ShadingMode, TransitionView } from './Settings.js';
import { exportSettings } from './SettingsIO.js';
import { commandKey } from './Shortcuts.js';
import { randomClip, type ViewState } from './State.js';
import { descriptions } from './Tooltips.js';

const repositoryUrl = 'https://github.com/agargaro/simplify-geometry';
const packageUrl = 'https://www.npmjs.com/package/@three.ez/simplify-geometry';

export interface ModelTab {
  id: ModelId;
  label: string;
}

export interface ToolbarCallbacks {
  onModel: (id: ModelId) => void;
  onRemoveModel: (id: ModelId) => void;
  onRestoreModels: () => void;
  onOpenFiles: (files: FileSet) => void;
  onImport: (text: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
}

export interface ViewportBarCallbacks {
  onChange: () => void;
  onHighlight: () => void;
  onResetCamera: () => void;
  onCameraHint: () => void;
}

export interface TransportCallbacks {
  onPlay: () => void;
  onClip: (clip: number) => void;
}

export class Toolbar {
  private readonly callbacks: ToolbarCallbacks;
  private readonly modelPicker = createElement('div', 'model-picker');
  private readonly openButton = createToolButton('open', 'Open model', descriptions.openModel);
  private readonly openFolderButton = createToolButton('open', 'Open folder', descriptions.openFolder);
  private readonly restoreButton = createIconButton('reset', 'Restore sample models', descriptions.restoreModels);
  private readonly undoButton = createIconButton('undo', 'Undo', descriptions.undo);
  private readonly redoButton = createIconButton('redo', 'Redo', descriptions.redo);
  private readonly models = createElement('div', 'segmented models');

  constructor(root: HTMLElement, settings: Settings, callbacks: ToolbarCallbacks) {
    this.callbacks = callbacks;

    const brand = createElement('div', 'brand');
    const files = createElement('div', 'files');
    const history = createElement('div', 'history');
    const links = createElement('div', 'links');
    const fileInput = createElement('input');
    const modelInput = createFilesInput(callbacks.onOpenFiles);
    const folderInput = createFilesInput(callbacks.onOpenFiles);
    const importButton = createToolButton('upload', 'Import', descriptions.import);
    const exportButton = createToolButton('download', 'Export', descriptions.export);
    const resetButton = createToolButton('reset', 'Reset', descriptions.resetSettings);

    brand.innerHTML = `${icon('layers')}<h1 class="brand-title">LOD Editor</h1><span class="brand-package">@three.ez/simplify-geometry</span>`;
    modelInput.accept = modelFileAccept;
    modelInput.multiple = true;
    folderInput.webkitdirectory = true;
    this.openButton.addEventListener('click', () => {
      modelInput.click();
    });
    this.openFolderButton.addEventListener('click', () => {
      folderInput.click();
    });
    this.restoreButton.hidden = true;
    this.restoreButton.addEventListener('click', callbacks.onRestoreModels);
    this.models.setAttribute('role', 'group');
    this.models.setAttribute('aria-label', 'Model');
    this.models.dataset['tooltip'] = descriptions.model;
    this.modelPicker.append(this.models, this.openButton, this.openFolderButton, this.restoreButton, modelInput, folderInput);
    root.append(this.modelPicker);

    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.hidden = true;
    fileInput.addEventListener('change', () => void readFile(fileInput, callbacks.onImport));
    importButton.addEventListener('click', () => {
      fileInput.click();
    });
    exportButton.addEventListener('click', () => {
      downloadText(exportSettings(settings), 'lod-playground.json');
    });
    resetButton.addEventListener('click', callbacks.onReset);
    files.append(resetButton, importButton, exportButton, fileInput);
    links.append(createLink('github', 'GitHub', repositoryUrl, descriptions.github), createLink('npm', 'npm', packageUrl, descriptions.npm, true), ...createAbout());
    this.undoButton.dataset['shortcut'] = `${commandKey} Z`;
    this.redoButton.dataset['shortcut'] = `${commandKey} Y`;
    this.undoButton.addEventListener('click', callbacks.onUndo);
    this.redoButton.addEventListener('click', callbacks.onRedo);
    history.append(this.undoButton, this.redoButton);
    root.prepend(brand, links);
    root.append(history, createElement('span', 'spacer'), files);
  }

  setModelsDisabled(disabled: boolean): void {
    for (const button of this.models.querySelectorAll('button')) button.disabled = disabled;

    this.openButton.disabled = disabled;
    this.restoreButton.disabled = disabled;
  }

  /**
   * Shows a tab with a remove button for every model, with `active` pressed (none when null), and the restore button when `canRestore`.
   */
  setModels(tabs: ModelTab[], active: ModelId | null, canRestore: boolean): void {
    this.models.replaceChildren(...tabs.map((tab) => this.createModelTab(tab, tab.id === active)));
    this.models.hidden = tabs.length === 0;
    this.restoreButton.hidden = !canRestore;
  }

  private createModelTab(tab: ModelTab, isActive: boolean): HTMLElement {
    const item = createElement('span', 'model-tab');
    const select = createElement('button', 'segment');
    const remove = createElement('button', 'model-remove');

    select.type = 'button';
    select.textContent = tab.label;
    select.setAttribute('aria-pressed', String(isActive));
    select.addEventListener('click', () => {
      for (const other of this.models.querySelectorAll('.segment')) other.setAttribute('aria-pressed', String(other === select));

      this.callbacks.onModel(tab.id);
    });
    remove.type = 'button';
    remove.innerHTML = icon('close');
    remove.dataset['tooltip'] = descriptions.removeModel;
    remove.setAttribute('aria-label', `Remove ${tab.label}`);
    remove.addEventListener('click', () => {
      this.callbacks.onRemoveModel(tab.id);
    });
    item.append(select, remove);

    return item;
  }

  setHistory(canUndo: boolean, canRedo: boolean): void {
    this.undoButton.disabled = !canUndo;
    this.redoButton.disabled = !canRedo;
  }
}

/**
 * Play button and clip choice over the bottom right corner of the viewport, shown only for animated models.
 */
export class Transport {
  private readonly view: ViewState;
  private readonly root = createElement('div', 'transport');
  private readonly play = createElement('button', 'icon-button play');
  private readonly clip = createElement('select', 'select');

  constructor(viewport: HTMLElement, view: ViewState, callbacks: TransportCallbacks) {
    this.view = view;
    this.play.type = 'button';
    this.play.dataset['tooltip'] = descriptions.play;
    this.play.dataset['shortcut'] = 'Space';
    this.play.addEventListener('click', callbacks.onPlay);
    this.clip.dataset['tooltip'] = descriptions.clip;
    this.clip.setAttribute('aria-label', 'Clip');
    this.clip.addEventListener('change', () => {
      callbacks.onClip(Number(this.clip.value));
    });
    this.root.hidden = true;
    this.root.append(this.play, this.clip);
    viewport.append(this.root);
    this.setPlaying(view.playing);
  }

  setModel(model: Model): void {
    const names = model.skin?.clipNames ?? [];
    const options = names.map((name, index) => createOption(String(index), name));

    if (names.length > 1) options.unshift(createOption(String(randomClip), 'Random'));

    const isRandom = this.view.clip === randomClip && names.length > 1;

    this.clip.replaceChildren(...options);
    this.clip.value = String(isRandom ? randomClip : Math.min(Math.max(this.view.clip, 0), Math.max(names.length - 1, 0)));
    this.clip.hidden = names.length === 0;
    this.root.hidden = names.length === 0 && model.morph === null;
  }

  setPlaying(playing: boolean): void {
    this.play.innerHTML = icon(playing ? 'pause' : 'play');
    this.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    this.play.setAttribute('aria-pressed', String(playing));
  }
}

const shadingOptions: { value: ShadingMode; label: string; tooltip: string }[] = [
  { value: 'clay', label: 'Clay', tooltip: descriptions.shadingClay },
  { value: 'uv', label: 'UV', tooltip: descriptions.shadingUv },
  { value: 'material', label: 'Material', tooltip: descriptions.shadingMaterial },
  { value: 'texture', label: 'Texture', tooltip: descriptions.shadingTexture },
  { value: 'wireframe', label: 'Wireframe', tooltip: descriptions.shadingWireframe }
];

const layoutValues: PreviewLayout[] = ['distance', 'levels', 'transitions'];
const transitionViewValues: TransitionView[] = ['pair', 'flip'];

export class ViewportBar {
  private readonly view: ViewState;
  private readonly settings: Settings;
  private readonly forced = createElement('select', 'select');
  private readonly forcedField = createElement('label', 'forced');
  private readonly layout: HTMLElement;
  private readonly transitionView: HTMLElement;
  private readonly shading: HTMLElement;
  private readonly colorByLevel: HTMLButtonElement;
  private readonly flatShading: HTMLButtonElement;
  private readonly isolate: HTMLButtonElement;
  private readonly cameraHint = createIconButton('mouse', 'Camera controls', cameraHintText);
  private readonly resetView = createToolButton('focus', 'Reset view', descriptions.resetCamera);
  private model: Model | null = null;
  private levelsCount = 0;

  constructor(root: HTMLElement, settings: Settings, view: ViewState, callbacks: ViewportBarCallbacks) {
    this.view = view;
    this.settings = settings;

    const toggles = createElement('div', 'toggles');

    this.layout = createChoice<PreviewLayout>(root, {
      tooltip: descriptions.layout,
      value: settings.layout,
      options: [{ value: 'distance', label: 'Crowd' }, { value: 'levels', label: 'Side by side' }, { value: 'transitions', label: 'Transitions' }],
      onInput: (value) => {
        settings.layout = value;
        this.updateLayout();
        callbacks.onChange();
      }
    });
    this.layout.setAttribute('aria-label', 'Layout');
    this.layout.dataset['shortcut'] = 'L';

    this.transitionView = createChoice<TransitionView>(root, {
      tooltip: descriptions.transitionView,
      value: settings.transitionView,
      options: [{ value: 'pair', label: 'Pair', tooltip: descriptions.transitionPair }, { value: 'flip', label: 'Flip', tooltip: descriptions.transitionFlip }],
      onInput: (value) => {
        settings.transitionView = value;
        callbacks.onChange();
      }
    });
    this.transitionView.setAttribute('aria-label', 'Transition view');

    this.shading = createChoice<ShadingMode>(root, {
      tooltip: descriptions.shading,
      value: settings.shading,
      options: shadingOptions,
      onInput: (value) => {
        settings.shading = value;
        this.updateShading();
        callbacks.onChange();
      }
    });
    this.shading.setAttribute('aria-label', 'Shading');

    this.colorByLevel = createToggleButton('Color by level', descriptions.colorByLevel, settings.colorByLevel, (value) => {
      settings.colorByLevel = value;
      callbacks.onChange();
    });

    this.flatShading = createToggleButton('Flat', descriptions.flatShading, settings.flatShading, (value) => {
      settings.flatShading = value;
      callbacks.onChange();
    });

    this.isolate = createToggleButton(`Isolate L${view.selectedLevel}`, descriptions.isolate, view.isolate, (value) => {
      view.isolate = value;
      callbacks.onHighlight();
    });

    this.colorByLevel.dataset['shortcut'] = 'C';
    this.isolate.dataset['shortcut'] = 'I';
    this.forcedField.dataset['shortcut'] = 'F';
    this.resetView.dataset['shortcut'] = 'R';
    this.cameraHint.dataset['shortcut'] = '?';
    toggles.append(this.colorByLevel, this.isolate, this.flatShading);

    this.forced.addEventListener('change', () => {
      view.forcedLevel = Number(this.forced.value);
      callbacks.onChange();
    });
    this.forcedField.dataset['tooltip'] = descriptions.forcedLevel;
    this.forcedField.append(createText('Force'), this.forced);
    this.resetView.addEventListener('click', callbacks.onResetCamera);
    this.cameraHint.setAttribute('aria-pressed', 'false');
    this.cameraHint.addEventListener('click', callbacks.onCameraHint);
    root.append(toggles, createElement('span', 'spacer'), this.forcedField, this.cameraHint, this.resetView);
    this.updateLayout();
  }

  /**
   * Marks the camera controls button as pressed while the legend is shown.
   */
  setCameraHint(visible: boolean): void {
    this.cameraHint.setAttribute('aria-pressed', String(visible));
  }

  /**
   * Disables the shadings the model does not support and shows the one drawn.
   */
  setModel(model: Model): void {
    this.model = model;
    this.updateShading();
  }

  /**
   * Names the selected level on the isolate button.
   */
  setSelectedLevel(level: number): void {
    this.isolate.textContent = `Isolate L${level}`;
  }

  /**
   * Shows the settings changed elsewhere, for example by undo.
   */
  sync(): void {
    selectChoice<PreviewLayout>(this.layout, layoutValues, this.settings.layout);
    selectChoice<TransitionView>(this.transitionView, transitionViewValues, this.settings.transitionView);
    this.updateLayout();
    this.colorByLevel.setAttribute('aria-pressed', String(this.settings.colorByLevel));
    this.flatShading.setAttribute('aria-pressed', String(this.settings.flatShading));
    this.updateShading();
  }

  /**
   * Switches to the layout after the current one.
   */
  nextLayout(): void {
    const next = layoutValues[(layoutValues.indexOf(this.settings.layout) + 1) % layoutValues.length];

    this.layout.querySelectorAll('button')[layoutValues.indexOf(next)].click();
  }

  toggleIsolate(): void {
    this.isolate.click();
  }

  toggleColorByLevel(): void {
    this.colorByLevel.click();
  }

  /**
   * Forces the level after the forced one, back to Auto after the last level.
   */
  nextForcedLevel(): void {
    if (this.forcedField.hidden === true) return;

    const next = this.view.forcedLevel + 1 < this.levelsCount ? this.view.forcedLevel + 1 : -1;

    this.forced.value = String(next);
    this.forced.dispatchEvent(new Event('change'));
  }

  resetCamera(): void {
    if (this.resetView.hidden === false) this.resetView.click();
  }

  /**
   * Shows the Pair / Flip choice only in the Transitions layout, where the forced level and the camera reset do not apply.
   */
  private updateLayout(): void {
    const isTransitions = this.settings.layout === 'transitions';

    this.transitionView.hidden = !isTransitions;
    this.forcedField.hidden = isTransitions;
    this.resetView.hidden = isTransitions;
  }

  private updateShading(): void {
    const model = this.model;
    const drawn = model === null ? this.settings.shading : getDrawnShading(model, this.settings.shading);
    const buttons = this.shading.querySelectorAll('button');

    for (let i = 0; i < buttons.length; i++) {
      const value = shadingOptions[i].value;

      buttons[i].disabled = model !== null && !isShadingAvailable(model, value);
      buttons[i].setAttribute('aria-pressed', String(value === drawn));
    }

    this.colorByLevel.disabled = drawn !== 'clay' && drawn !== 'wireframe';
  }

  setLevelsCount(count: number): void {
    if (count === this.levelsCount) return;

    this.levelsCount = count;

    const options = [createOption('-1', 'Auto')];

    for (let level = 0; level < count; level++) options.push(createOption(String(level), `L${level}`));

    this.forced.replaceChildren(...options);
    this.forced.value = String(this.view.forcedLevel);
  }
}

/**
 * Returns the About button and the popover it opens, with the credits of the library and of the sample models.
 */
function createAbout(): [HTMLButtonElement, HTMLElement] {
  const button = createIconButton('info', 'About', descriptions.about);
  const panel = createElement('div', 'about');

  panel.id = 'about';
  panel.popover = 'auto';
  panel.innerHTML = '<h2 class="about-title">LOD Editor</h2>'
    + '<p>Simplified with <a href="https://github.com/zeux/meshoptimizer" target="_blank" rel="noopener">meshoptimizer</a>'
    + ' and drawn with <a href="https://github.com/agargaro/instanced-mesh" target="_blank" rel="noopener">InstancedMesh2</a>.</p>'
    + '<p>Imp and Puglin by <a href="https://quaternius.com" target="_blank" rel="noopener">Quaternius</a> (CC0).'
    + ' Horse by <a href="https://mirada.com/" target="_blank" rel="noopener">mirada</a> for <a href="http://www.ro.me" target="_blank" rel="noopener">ROME</a>,'
    + ' from the <a href="https://threejs.org/examples/#webgl_morphtargets_horse" target="_blank" rel="noopener">three.js examples</a>.</p>';
  button.popoverTargetElement = panel;

  return [button, panel];
}

function createToolButton(name: IconName, label: string, tooltip: string): HTMLButtonElement {
  const button = createElement('button', 'tool-button');

  button.type = 'button';
  button.innerHTML = `${icon(name)}<span>${label}</span>`;
  button.dataset['tooltip'] = tooltip;

  return button;
}

/**
 * Returns a toolbar link that opens `href` in a new tab.
 */
function createLink(name: IconName, label: string, href: string, tooltip: string, iconOnly = false): HTMLAnchorElement {
  const link = createElement('a', 'tool-button');

  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener';
  link.innerHTML = iconOnly ? icon(name) : `${icon(name)}<span>${label}</span>`;
  link.setAttribute('aria-label', label);
  link.dataset['tooltip'] = tooltip;

  return link;
}

/**
 * Returns a hidden file input that passes the chosen files to `onFiles` and is emptied, so that choosing the same files again works.
 */
function createFilesInput(onFiles: (files: FileSet) => void): HTMLInputElement {
  const input = createElement('input');

  input.type = 'file';
  input.hidden = true;
  input.addEventListener('change', () => {
    const files = input.files;

    if (files !== null && files.length > 0) onFiles(readFileList(files));

    input.value = '';
  });

  return input;
}

function createIconButton(name: IconName, label: string, tooltip: string): HTMLButtonElement {
  const button = createElement('button', 'icon-button');

  button.type = 'button';
  button.innerHTML = icon(name);
  button.dataset['tooltip'] = tooltip;
  button.setAttribute('aria-label', label);

  return button;
}

function createToggleButton(label: string, tooltip: string, pressed: boolean, onInput: (value: boolean) => void): HTMLButtonElement {
  const button = createElement('button', 'chip');

  button.type = 'button';
  button.textContent = label;
  button.dataset['tooltip'] = tooltip;
  button.setAttribute('aria-pressed', String(pressed));
  button.addEventListener('click', () => {
    const value = button.getAttribute('aria-pressed') !== 'true';

    button.setAttribute('aria-pressed', String(value));
    onInput(value);
  });

  return button;
}

function createOption(value: string, label: string): HTMLOptionElement {
  const option = createElement('option');

  option.value = value;
  option.textContent = label;

  return option;
}

function createText(text: string): HTMLSpanElement {
  const span = createElement('span', 'field-label');

  span.textContent = text;

  return span;
}

function downloadText(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = createElement('a');

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function readFile(input: HTMLInputElement, onRead: (text: string) => void): Promise<void> {
  const file = input.files?.[0];

  input.value = '';

  if (file !== undefined) onRead(await file.text());
}
