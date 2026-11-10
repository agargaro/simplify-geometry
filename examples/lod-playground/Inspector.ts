import { createChoice, createElement, createFlag, createNumberField, createSection, createToggle } from './Controls.js';
import { levelColors } from './LODPreview.js';
import type { Model } from './Models.js';
import { getLevels, simplifyFlags, type LevelSettings, type Settings, type ThresholdMode, type VerticesMode } from './Settings.js';
import { canUpdateVertices, getTriangles, getVertices } from './Simplification.js';
import type { ViewState } from './State.js';
import { descriptions, flagDescriptions } from './Tooltips.js';

export class Inspector {
  private readonly container: HTMLElement;
  private readonly settings: Settings;
  private readonly view: ViewState;
  private readonly onChange: () => void;
  private model: Model | null = null;

  constructor(container: HTMLElement, settings: Settings, view: ViewState, onChange: () => void) {
    this.container = container;
    this.settings = settings;
    this.view = view;
    this.onChange = onChange;
  }

  render(model: Model): void {
    const scrollTop = this.container.scrollTop;
    const active = document.activeElement;
    const focusKey = active instanceof HTMLElement && this.container.contains(active) ? active.dataset['key'] : undefined;

    this.model = model;
    this.container.replaceChildren();

    const levels = getLevels(this.settings);
    const selected = Math.min(this.view.selectedLevel, levels.length);

    if (selected === 0) this.renderSource(model);
    else this.renderLevel(levels[selected - 1], selected);

    this.renderSwitch();
    this.renderShared(model);
    this.container.scrollTop = scrollTop;

    if (focusKey !== undefined) this.container.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`)?.focus();
  }

  private rerender(): void {
    if (this.model !== null) this.render(this.model);

    this.onChange();
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
    const settings = this.settings;

    swatch.style.background = levelColors[index % levelColors.length];
    heading.prepend(swatch);

    createNumberField(body, {
      label: 'Ratio', tooltip: descriptions.ratio, value: level.ratio, min: 0, max: 1, step: 0.001, onInput: (value) => {
        level.ratio = value;
        this.onChange();
      }
    });
    createToggle(body, {
      label: 'Limit error', tooltip: descriptions.limitError, checked: level.limitError, onInput: (checked) => {
        level.limitError = checked;
        this.rerender();
      }
    });
    createNumberField(body, {
      label: 'Error', tooltip: descriptions.error, value: level.error, min: 0, max: 0.5, step: 0.0005, disabled: !level.limitError, onInput: (value) => {
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
        label: 'Screen size', tooltip: descriptions.screenSize, value: level.screenSize, min: 0.001, max: 1, step: 0.001, onInput: (value) => {
          level.screenSize = value;
          this.onChange();
        }
      });
    }

    if (settings.thresholdMode === 'distance') {
      createNumberField(body, {
        label: 'Distance', tooltip: descriptions.distance, value: level.distance, min: 0.1, max: 2000, step: 0.1, onInput: (value) => {
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

  private renderSwitch(): void {
    const body = createSection(this.container, 'Switch');
    const settings = this.settings;

    createChoice<ThresholdMode>(body, {
      tooltip: descriptions.thresholdMode,
      value: settings.thresholdMode,
      options: [
        { value: 'pixelError', label: 'Pixel error' },
        { value: 'screenSize', label: 'Screen size' },
        { value: 'distance', label: 'Distance' }
      ],
      onInput: (value) => {
        settings.thresholdMode = value;
        this.rerender();
      }
    });

    if (settings.thresholdMode !== 'pixelError') return;

    createNumberField(body, {
      label: 'Max error (px)', tooltip: descriptions.pixelError, value: settings.pixelError, min: 0.1, max: 16, step: 0.1, onInput: (value) => {
        settings.pixelError = value;
        this.onChange();
      }
    });
  }

  private renderShared(model: Model): void {
    const body = createSection(this.container, 'All levels');
    const settings = this.settings;

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
    createNumberField(body, {
      label: 'Normal weight', tooltip: descriptions.normalWeight, value: settings.normalWeight, min: 0, max: 2, step: 0.01, onInput: (value) => {
        settings.normalWeight = value;
        this.onChange();
      }
    });
    createNumberField(body, {
      label: 'UV weight', tooltip: descriptions.uvWeight, value: settings.uvWeight, min: 0, max: 2, step: 0.01, onInput: (value) => {
        settings.uvWeight = value;
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

    if (model.skin === null) return;

    createNumberField(body, {
      label: 'Skin error (px)', tooltip: descriptions.skinError, value: settings.skinError, min: 0, max: 8, step: 0.1, onInput: (value) => {
        settings.skinError = value;
        this.onChange();
      }
    });
  }
}

function createFacts(rows: [string, string][]): HTMLElement {
  const list = createElement('dl', 'facts');

  for (const [term, value] of rows) {
    const dt = createElement('dt');
    const dd = createElement('dd');

    dt.textContent = term;
    dd.textContent = value;
    list.append(dt, dd);
  }

  return list;
}
