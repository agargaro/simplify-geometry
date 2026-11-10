import { createChoice, createElement, selectChoice } from './Controls.js';
import { icon, type IconName } from './Icons.js';
import { getDrawnShading } from './LODPreview.js';
import { isShadingAvailable, type Model } from './Models.js';
import { modelLabels, modelNames, type ModelName, type PreviewLayout, type Settings, type ShadingMode } from './Settings.js';
import { exportSettings } from './SettingsIO.js';
import { randomClip, type ViewState } from './State.js';
import { descriptions } from './Tooltips.js';

const repositoryUrl = 'https://github.com/agargaro/simplify-geometry';
const packageUrl = 'https://www.npmjs.com/package/@three.ez/simplify-geometry';

export interface ToolbarCallbacks {
  onModel: (name: ModelName) => void;
  onOpenFile: (file: File) => void;
  onPlay: () => void;
  onClip: (clip: number) => void;
  onImport: (text: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
}

export interface ViewportBarCallbacks {
  onChange: () => void;
  onHighlight: () => void;
  onResetCamera: () => void;
}

export class Toolbar {
  private readonly view: ViewState;
  private readonly play = createElement('button', 'tool-button play');
  private readonly clip = createElement('select', 'select');
  private readonly clipField = createElement('label', 'clip');
  private readonly settings: Settings;
  private readonly callbacks: ToolbarCallbacks;
  private readonly modelPicker = createElement('div', 'model-picker');
  private readonly openButton = createToolButton('open', 'Open GLB', descriptions.openModel);
  private readonly undoButton = createIconButton('undo', 'Undo', descriptions.undo);
  private readonly redoButton = createIconButton('redo', 'Redo', descriptions.redo);
  private models: HTMLElement = createElement('div');
  private customLabel: string | null = null;

  constructor(root: HTMLElement, settings: Settings, view: ViewState, callbacks: ToolbarCallbacks) {
    this.view = view;
    this.settings = settings;
    this.callbacks = callbacks;

    const brand = createElement('div', 'brand');
    const transport = createElement('div', 'transport');
    const files = createElement('div', 'files');
    const history = createElement('div', 'history');
    const links = createElement('div', 'links');
    const fileInput = createElement('input');
    const modelInput = createElement('input');
    const importButton = createToolButton('upload', 'Import', descriptions.import);
    const exportButton = createToolButton('download', 'Export', descriptions.export);
    const resetButton = createToolButton('reset', 'Reset', descriptions.resetSettings);

    brand.innerHTML = `${icon('layers')}<span>@three.ez/simplify-geometry</span>`;
    modelInput.type = 'file';
    modelInput.accept = '.glb,model/gltf-binary';
    modelInput.hidden = true;
    modelInput.addEventListener('change', () => {
      const file = modelInput.files?.[0];

      modelInput.value = '';

      if (file !== undefined) callbacks.onOpenFile(file);
    });
    this.openButton.addEventListener('click', () => {
      modelInput.click();
    });
    this.modelPicker.append(this.openButton, modelInput);
    root.append(this.modelPicker);
    this.renderModels();

    this.play.type = 'button';
    this.play.dataset['tooltip'] = descriptions.play;
    this.play.addEventListener('click', callbacks.onPlay);
    this.clip.addEventListener('change', () => {
      callbacks.onClip(Number(this.clip.value));
    });
    this.clipField.dataset['tooltip'] = descriptions.clip;
    this.clipField.append(createText('Clip'), this.clip);
    transport.append(this.play, this.clipField);

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
    links.append(createLink('github', 'GitHub', repositoryUrl, descriptions.github), createLink('npm', 'npm', packageUrl, descriptions.npm, true));
    this.undoButton.addEventListener('click', callbacks.onUndo);
    this.redoButton.addEventListener('click', callbacks.onRedo);
    history.append(this.undoButton, this.redoButton);
    root.prepend(brand, links);
    root.append(history, transport, createElement('span', 'spacer'), files);
    this.setPlaying(view.playing);
  }

  setModel(model: Model): void {
    const names = model.skin?.clipNames ?? [];
    const options = names.map((name, index) => createOption(String(index), name));

    if (names.length > 1) options.unshift(createOption(String(randomClip), 'Random'));

    const isRandom = this.view.clip === randomClip && names.length > 1;

    this.clip.replaceChildren(...options);
    this.clip.value = String(isRandom ? randomClip : Math.min(Math.max(this.view.clip, 0), Math.max(names.length - 1, 0)));
    this.clipField.hidden = names.length === 0;
  }

  setModelsDisabled(disabled: boolean): void {
    for (const button of this.models.querySelectorAll('button')) button.disabled = disabled;

    this.openButton.disabled = disabled;
  }

  /**
   * Shows the tab of the model loaded from a file, labeled with the file name.
   */
  setCustomModel(label: string): void {
    this.customLabel = label;
    this.renderModels();
  }

  private renderModels(): void {
    const names = modelNames.filter((name) => name !== 'custom' || this.customLabel !== null);
    const picker = createElement('div');
    const choice = createChoice<ModelName>(picker, {
      tooltip: descriptions.model,
      value: this.settings.model,
      options: names.map((name) => ({ value: name, label: name === 'custom' ? this.customLabel! : modelLabels[name] })),
      onInput: this.callbacks.onModel
    });

    choice.classList.add('models');
    choice.setAttribute('aria-label', 'Model');
    this.models.replaceWith(choice);
    this.models = choice;

    if (choice.parentElement !== this.modelPicker) this.modelPicker.prepend(choice);
  }

  setHistory(canUndo: boolean, canRedo: boolean): void {
    this.undoButton.disabled = !canUndo;
    this.redoButton.disabled = !canRedo;
  }

  setPlaying(playing: boolean): void {
    this.play.innerHTML = `${icon(playing ? 'pause' : 'play')}<span>${playing ? 'Pause' : 'Play'}</span>`;
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

const layoutValues: PreviewLayout[] = ['distance', 'levels'];

export class ViewportBar {
  private readonly view: ViewState;
  private readonly settings: Settings;
  private readonly forced = createElement('select', 'select');
  private readonly layout: HTMLElement;
  private readonly shading: HTMLElement;
  private readonly colorByLevel: HTMLButtonElement;
  private readonly flatShading: HTMLButtonElement;
  private readonly isolate: HTMLButtonElement;
  private model: Model | null = null;
  private levelsCount = 0;

  constructor(root: HTMLElement, settings: Settings, view: ViewState, callbacks: ViewportBarCallbacks) {
    this.view = view;
    this.settings = settings;

    const toggles = createElement('div', 'toggles');
    const forcedField = createElement('label', 'forced');
    const reset = createToolButton('focus', 'Reset view', descriptions.resetCamera);

    this.layout = createChoice<PreviewLayout>(root, {
      tooltip: descriptions.layout,
      value: settings.layout,
      options: [{ value: 'distance', label: 'Crowd' }, { value: 'levels', label: 'Side by side' }],
      onInput: (value) => {
        settings.layout = value;
        callbacks.onChange();
      }
    });
    this.layout.setAttribute('aria-label', 'Layout');

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

    toggles.append(this.colorByLevel, this.isolate, this.flatShading);

    this.forced.addEventListener('change', () => {
      view.forcedLevel = Number(this.forced.value);
      callbacks.onChange();
    });
    forcedField.dataset['tooltip'] = descriptions.forcedLevel;
    forcedField.append(createText('Force'), this.forced);
    reset.addEventListener('click', callbacks.onResetCamera);
    root.append(toggles, createElement('span', 'spacer'), forcedField, reset);
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
    this.colorByLevel.setAttribute('aria-pressed', String(this.settings.colorByLevel));
    this.flatShading.setAttribute('aria-pressed', String(this.settings.flatShading));
    this.updateShading();
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
