import { createChoice, createElement, createFlag, createNumberField, createSection, createToggle } from './Controls.js';
import { formatCount, formatDecimal, formatPercent } from './Format.js';
import { levelColors } from './LODPreview.js';
import type { Model } from './Models.js';
import { fovRange, getLevels, getModelSettings, instancesRange, simplifyFlags, spreadRange, type LevelSettings, type Settings, type ThresholdMode, type VerticesMode } from './Settings.js';
import { canUpdateVertices, getTriangles, getVertices } from './Simplification.js';
import type { Snapshot, ViewState } from './State.js';
import { descriptions, flagDescriptions } from './Tooltips.js';

const highlightDuration = 1600;
const highlightKeyframes: Keyframe[] = [
  { backgroundColor: 'rgba(230, 180, 80, 0.22)', boxShadow: '0 0 0 1px rgba(230, 180, 80, 0.8)' },
  { backgroundColor: 'rgba(230, 180, 80, 0)', boxShadow: '0 0 0 1px rgba(230, 180, 80, 0)' }
];

/**
 * Edits the settings: the selected level and the simplification in the inspector, the switch and the scene under the levels list.
 */
export class Inspector {
  private readonly container: HTMLElement;
  private readonly globalContainer: HTMLElement;
  private readonly settings: Settings;
  private readonly view: ViewState;
  private readonly onChange: () => void;
  private model: Model | null = null;
  private snapshot: Snapshot | null = null;
  private result: HTMLElement | null = null;
  private resultLevel = 0;

  constructor(container: HTMLElement, globalContainer: HTMLElement, settings: Settings, view: ViewState, onChange: () => void) {
    this.container = container;
    this.globalContainer = globalContainer;
    this.settings = settings;
    this.view = view;
    this.onChange = onChange;
  }

  render(model: Model): void {
    const scrollTop = this.container.scrollTop;
    const globalScrollTop = this.globalContainer.scrollTop;
    const active = document.activeElement;
    const focusKey = active instanceof HTMLElement ? active.dataset['key'] : undefined;
    const focusContainer = active instanceof HTMLElement && this.globalContainer.contains(active) ? this.globalContainer : this.container;

    this.model = model;
    this.result = null;
    this.container.replaceChildren();
    this.globalContainer.replaceChildren();

    const levels = getLevels(this.settings);
    const selected = Math.min(this.view.selectedLevel, levels.length);

    if (selected === 0) this.renderSource(model);
    else this.renderLevel(levels[selected - 1], selected);

    this.renderSwitch(this.container);
    this.renderShared();
    this.renderScene(this.globalContainer);
    this.container.scrollTop = scrollTop;
    this.globalContainer.scrollTop = globalScrollTop;

    if (focusKey !== undefined) focusContainer.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`)?.focus();
  }

  /**
   * Shows the triangles and the error that the selected level reached in `snapshot`, and what stopped its simplification.
   */
  setSnapshot(snapshot: Snapshot): void {
    this.snapshot = snapshot;
    this.renderResult();
  }

  /**
   * Scrolls to the control whose `data-key` is `key` and flashes it, to point at the setting a warning is about.
   */
  highlight(key: string): void {
    const control = this.container.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);

    if (control === null) return;

    const target = control.closest<HTMLElement>('.field, .flag') ?? control;

    target.scrollIntoView({ block: 'nearest' });
    target.animate(highlightKeyframes, { duration: highlightDuration, easing: 'ease-out' });
    control.focus({ preventScroll: true });
  }

  private rerender(): void {
    if (this.model !== null) this.render(this.model);

    this.onChange();
  }

  private renderResult(): void {
    const result = this.result;
    const snapshot = this.snapshot;

    if (result === null) return;

    const levels = getLevels(this.settings);
    const index = this.resultLevel;
    const lodLevels = snapshot?.lod.levels;

    if (snapshot === null || snapshot.model !== this.model || lodLevels === undefined || index >= lodLevels.length || index > levels.length) {
      result.replaceChildren();

      return;
    }

    const level = levels[index - 1];
    const sourceTriangles = getTriangles(lodLevels[0].geometry);
    const triangles = getTriangles(lodLevels[index].geometry);
    const ratioTriangles = Math.floor(level.ratio * sourceTriangles);
    const isRatioReached = level.ratio > 0 && triangles <= ratioTriangles;
    const errorAbsolute = getModelSettings(this.settings).errorAbsolute;
    let stop = 'Error target';

    if (isRatioReached) stop = `Ratio target (${formatCount(ratioTriangles)} tri)`;
    else if (level.ratio > 0) stop = `Error target, ratio ${formatCount(ratioTriangles)} tri not reached`;

    result.replaceChildren(createFacts([
      ['Result', `${formatCount(triangles)} tri · ${formatPercent(triangles / sourceTriangles)}`, descriptions.levelResult],
      ['Error', `${formatError(lodLevels[index].error, errorAbsolute)} of ${formatError(level.error, errorAbsolute)}`, descriptions.levelResultError],
      ['Stopped by', stop, descriptions.levelStop]
    ]));
  }

  private renderSource(model: Model): void {
    const body = createSection(this.container, 'Level 0 · source');
    const geometry = model.geometry;
    const rows: [string, string][] = [
      ['Triangles', getTriangles(geometry).toLocaleString('en-US')],
      ['Vertices', getVertices(geometry).toLocaleString('en-US')],
      ['Attributes', Object.keys(geometry.attributes).join(', ')]
    ];

    if (model.skin !== null) rows.push(['Bones', String(model.skin.skeleton.bones.length)], ['Influences', `${model.skin.influences} per vertex`]);
    if (model.morph !== null) rows.push(['Morph targets', String(model.morph.targetsCount)]);

    body.append(createFacts(rows));

    const hint = createElement('p', 'hint');

    hint.textContent = 'Level 0 is the source geometry. Select another level to edit it.';
    body.append(hint);
  }

  private renderLevel(level: LevelSettings, index: number): void {
    const body = createSection(this.container, `Level ${index}`);
    const heading = body.previousElementSibling as HTMLElement;
    const swatch = createElement('i', 'swatch');
    const settings = getModelSettings(this.settings);

    swatch.style.background = levelColors[index % levelColors.length];
    heading.prepend(swatch);
    this.result = createElement('div', 'level-result');
    this.resultLevel = index;
    body.append(this.result);
    this.renderResult();

    createNumberField(body, {
      label: 'Ratio', tooltip: descriptions.ratio, value: level.ratio, min: 0, max: 1, step: 0.001, increment: 0.005, onInput: (value) => {
        level.ratio = value;
        this.onChange();
      }
    });
    createNumberField(body, {
      label: 'Error', tooltip: descriptions.error, value: level.error, min: 0, max: 1, step: 0.0005, increment: 0.002, onInput: (value) => {
        level.error = value;
        this.onChange();
      }
    });
    createToggle(body, {
      label: 'Sloppy', tooltip: descriptions.sloppy, checked: level.sloppy, onInput: (checked) => {
        level.sloppy = checked;
        this.rerender();
      }
    });
    createToggle(body, {
      label: 'Update vertices', tooltip: descriptions.updateVertices, checked: level.updateVertices, disabled: !canUpdateVertices(level, settings), onInput: (checked) => {
        level.updateVertices = checked;
        this.onChange();
      }
    });

    if (settings.thresholdMode === 'screenSize') {
      createNumberField(body, {
        label: 'Screen size', tooltip: descriptions.screenSize, value: level.screenSize, min: 0.001, max: 4, step: 0.001, onInput: (value) => {
          level.screenSize = value;
          this.onChange();
        }
      });
    }

    if (settings.thresholdMode === 'distance') {
      createNumberField(body, {
        label: 'Distance', tooltip: descriptions.distance, value: level.distance, min: 0.1, max: 2000, step: 0.1, increment: 10, onInput: (value) => {
          level.distance = value;
          this.onChange();
        }
      });
    }

    createNumberField(body, {
      label: 'Hysteresis', tooltip: descriptions.hysteresis, value: level.hysteresis, min: 0, max: 0.95, step: 0.01, onInput: (value) => {
        level.hysteresis = value;
        this.onChange();
      }
    });

    const flagsTitle = createElement('h4', 'subsection-title');
    const flags = createElement('div', 'flags');

    flagsTitle.textContent = 'Flags';
    flagsTitle.dataset['tooltip'] = descriptions.flags;
    body.append(flagsTitle, flags);

    for (const flag of simplifyFlags) {
      createFlag(flags, {
        label: flag, tooltip: flagDescriptions[flag], checked: level[flag], disabled: level.sloppy, onInput: (checked) => {
          level[flag] = checked;
          this.onChange();
        }
      });
    }
  }

  private renderSwitch(parent: HTMLElement): void {
    const body = createSection(parent, 'Level switching', descriptions.thresholdMode);
    const settings = getModelSettings(this.settings);

    createChoice<ThresholdMode>(body, {
      tooltip: descriptions.thresholdMode,
      value: settings.thresholdMode,
      options: [
        { value: 'pixelError', label: 'Auto', tooltip: descriptions.modePixelError },
        { value: 'screenSize', label: 'Manual · screen size', tooltip: descriptions.modeScreenSize },
        { value: 'distance', label: 'Manual · distance', tooltip: descriptions.modeDistance }
      ],
      onInput: (value) => {
        settings.thresholdMode = value;
        this.rerender();
      }
    });

    if (settings.thresholdMode !== 'pixelError') return;

    createNumberField(body, {
      label: 'Max error (px)', tooltip: descriptions.pixelError, value: settings.pixelError, min: 0.1, max: 16, step: 0.05, increment: 0.05, onInput: (value) => {
        settings.pixelError = value;
        this.onChange();
      }
    });
  }

  private renderShared(): void {
    const body = createSection(this.container, 'Simplification (all levels)');
    const settings = getModelSettings(this.settings);

    createChoice<VerticesMode>(body, {
      label: 'Vertices',
      tooltip: descriptions.vertices,
      value: settings.vertices,
      options: [
        { value: 'reordered', label: 'Reordered' },
        { value: 'shared', label: 'Shared' },
        { value: 'compact', label: 'Compact' }
      ],
      onInput: (value) => {
        settings.vertices = value;
        this.rerender();
      }
    });
    createToggle(body, {
      label: 'Absolute error', tooltip: descriptions.errorAbsolute, checked: settings.errorAbsolute, onInput: (checked) => {
        settings.errorAbsolute = checked;
        this.onChange();
      }
    });
    createToggle(body, {
      label: 'Protect normal seams', tooltip: descriptions.protectNormalSeams, checked: settings.protectNormalSeams, onInput: (checked) => {
        settings.protectNormalSeams = checked;
        this.onChange();
      }
    });
    createToggle(body, {
      label: 'Protect UV seams', tooltip: descriptions.protectUvSeams, checked: settings.protectUvSeams, onInput: (checked) => {
        settings.protectUvSeams = checked;
        this.onChange();
      }
    });
  }

  private renderScene(parent: HTMLElement): void {
    const body = createSection(parent, 'Preview scene');
    const settings = this.settings;

    createNumberField(body, {
      label: 'Instances', tooltip: descriptions.instances, value: settings.instances, min: instancesRange[0], max: instancesRange[1], step: 50, increment: 100, onInput: (value) => {
        settings.instances = clampCount(value, instancesRange);
        this.onChange();
      }
    });
    createNumberField(body, {
      label: 'Spread (radii)', tooltip: descriptions.spread, value: settings.spread, min: spreadRange[0], max: spreadRange[1], step: 0.1, onInput: (value) => {
        settings.spread = value;
        this.onChange();
      }
    });
    createNumberField(body, {
      label: 'FOV (°)', tooltip: descriptions.fov, value: settings.fov, min: fovRange[0], max: fovRange[1], step: 1, increment: 5, onInput: (value) => {
        settings.fov = value;
        this.onChange();
      }
    });
    createToggle(body, {
      label: 'Environment map', tooltip: descriptions.environment, checked: settings.environment, onInput: (checked) => {
        settings.environment = checked;
        this.onChange();
      }
    });
  }
}

/**
 * Returns `value` rounded to an integer, inside `range`.
 */
function clampCount(value: number, range: [number, number]): number {
  return Math.min(Math.max(Math.round(value), range[0]), range[1]);
}

function formatError(error: number, errorAbsolute: boolean): string {
  return errorAbsolute ? `${formatDecimal(error)} units` : formatPercent(error);
}

/**
 * Returns a list of terms and values, with the tooltip of each term when given.
 */
function createFacts(rows: [string, string, string?][]): HTMLElement {
  const list = createElement('dl', 'facts');

  for (const [term, value, tooltip] of rows) {
    const dt = createElement('dt');
    const dd = createElement('dd');

    dt.textContent = term;
    dd.textContent = value;

    if (tooltip !== undefined) dt.dataset['tooltip'] = tooltip;

    list.append(dt, dd);
  }

  return list;
}
