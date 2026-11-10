import { generateCode, generateJson } from './CodeGenerator.js';
import { createChoice, createElement, selectChoice } from './Controls.js';
import { formatDistance } from './Format.js';
import { icon } from './Icons.js';
import { levelColors } from './LODPreview.js';
import type { CodeLanguage, Settings } from './Settings.js';
import type { Snapshot, ViewState } from './State.js';
import { getSwitchDistance } from './Thresholds.js';
import { descriptions } from './Tooltips.js';

type DockTab = 'timeline' | 'code' | 'json' | 'warnings';
type CodeTab = 'code' | 'json';

export interface BottomDockCallbacks {
  onSelect: (level: number) => void;
  onHover: (level: number) => void;
  onLanguage: () => void;
}

interface Span {
  level: number;
  start: number;
  end: number;
}

const tabStorageKey = 'lod-playground-tab';
const tabLabels: Record<DockTab, string> = { timeline: 'Distance', code: 'InstancedMesh2', json: 'JSON', warnings: 'Warnings' };
const tabNames: DockTab[] = ['timeline', 'code', 'json', 'warnings'];
const codeTabs: CodeTab[] = ['code', 'json'];
const languages: CodeLanguage[] = ['ts', 'js'];
const keywords = new Set(['import', 'from', 'export', 'function', 'const', 'let', 'return', 'for', 'if', 'continue', 'new', 'await', 'type', 'interface', 'true', 'false']);
const tokenPattern = /('[^']*'|"[^"]*")|(\b\d+(?:\.\d+)?(?:e-?\d+)?\b)|(\b[A-Za-z_]\w*\b)/g;

export class BottomDock {
  private readonly settings: Settings;
  private readonly view: ViewState;
  private readonly callbacks: BottomDockCallbacks;
  private readonly tabs = new Map<DockTab, HTMLButtonElement>();
  private readonly panels = new Map<DockTab, HTMLElement>();
  private readonly tools = new Map<DockTab, HTMLElement>();
  private readonly warningsCount = createElement('span', 'tab-count');
  private readonly timelineCaption = createElement('span', 'tool-caption');
  private readonly track = createElement('div', 'timeline-track');
  private readonly ticks = createElement('div', 'timeline-rows');
  private readonly axis = createElement('div', 'timeline-axis');
  private readonly codes = new Map<CodeTab, HTMLElement>();
  private readonly codeTexts = new Map<CodeTab, string>();
  private readonly warnings = createElement('ul', 'warning-list');
  private language: HTMLElement | null = null;
  private spans: HTMLButtonElement[] = [];
  private active: DockTab = 'timeline';

  constructor(root: HTMLElement, settings: Settings, view: ViewState, callbacks: BottomDockCallbacks) {
    this.settings = settings;
    this.view = view;
    this.callbacks = callbacks;

    const bar = createElement('div', 'tab-bar');
    const tabList = createElement('div', 'tab-list');
    const timeline = createElement('div', 'timeline');

    tabList.setAttribute('role', 'tablist');
    tabList.setAttribute('aria-label', 'Details');
    tabList.addEventListener('keydown', (event) => {
      this.onTabKeyDown(event);
    });

    for (const name of tabNames) {
      const tab = createElement('button', 'tab');
      const panel = createElement('div', `tab-panel panel-${name}`);

      tab.type = 'button';
      tab.id = `tab-${name}`;
      tab.textContent = tabLabels[name];
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', `panel-${name}`);
      tab.addEventListener('click', () => {
        this.setTab(name);
      });
      panel.id = `panel-${name}`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      this.tabs.set(name, tab);
      this.panels.set(name, panel);
      tabList.append(tab);
    }

    this.tabs.get('warnings')!.append(this.warningsCount);
    bar.append(tabList, this.createTimelineTools(), this.createCodeTools('code', descriptions.codeTs), this.createCodeTools('json', descriptions.codeJson));
    timeline.append(this.track, this.ticks, this.axis);
    timeline.addEventListener('pointerleave', () => {
      callbacks.onHover(-1);
    });
    this.panels.get('timeline')!.append(timeline);
    for (const tab of codeTabs) this.panels.get(tab)!.append(this.createCodeBlock(tab));

    this.panels.get('warnings')!.append(this.warnings);
    root.append(bar, ...this.panels.values());
    this.setTab(readStoredTab());
  }

  render(snapshot: Snapshot): void {
    this.renderTimeline(snapshot);
    this.renderWarnings(snapshot);
    this.renderCode(snapshot);
  }

  select(level: number): void {
    for (const span of this.spans) span.setAttribute('aria-pressed', String(span.dataset['level'] === String(level)));
  }

  renderCode(snapshot: Snapshot): void {
    this.setCode('code', generateCode(this.settings, snapshot.model));
    this.setCode('json', generateJson(this.settings, snapshot.model));
  }

  /**
   * Shows the settings changed elsewhere, for example by undo.
   */
  sync(): void {
    if (this.language !== null) selectChoice<CodeLanguage>(this.language, languages, this.settings.language);
  }

  private setCode(tab: CodeTab, text: string): void {
    if (text === this.codeTexts.get(tab)) return;

    this.codeTexts.set(tab, text);
    this.codes.get(tab)!.innerHTML = highlight(text);
  }

  private createCodeBlock(tab: CodeTab): HTMLElement {
    const pre = createElement('pre', 'code');
    const code = createElement('code');

    pre.append(code);
    pre.tabIndex = 0;
    pre.setAttribute('aria-label', tab === 'json' ? 'Generated JSON' : 'Generated code');
    this.codes.set(tab, code);

    return pre;
  }

  private setTab(name: DockTab): void {
    this.active = name;

    for (const tab of tabNames) {
      const isActive = tab === name;

      this.tabs.get(tab)!.setAttribute('aria-selected', String(isActive));
      this.tabs.get(tab)!.tabIndex = isActive ? 0 : -1;
      this.panels.get(tab)!.hidden = !isActive;

      const tools = this.tools.get(tab);

      if (tools !== undefined) tools.hidden = !isActive;
    }

    try {
      localStorage.setItem(tabStorageKey, name);
    } catch {
      return;
    }
  }

  private onTabKeyDown(event: KeyboardEvent): void {
    const index = tabNames.indexOf(this.active);
    let next: number;

    if (event.key === 'ArrowRight') next = (index + 1) % tabNames.length;
    else if (event.key === 'ArrowLeft') next = (index + tabNames.length - 1) % tabNames.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabNames.length - 1;
    else return;

    event.preventDefault();
    this.setTab(tabNames[next]);
    this.tabs.get(tabNames[next])!.focus();
  }

  private createTimelineTools(): HTMLElement {
    const tools = createElement('div', 'tab-tools');

    tools.append(this.timelineCaption);
    this.tools.set('timeline', tools);

    return tools;
  }

  private createCodeTools(tab: CodeTab, description: string): HTMLElement {
    const tools = createElement('div', 'tab-tools');
    const caption = createElement('span', 'tool-caption');
    const copy = createElement('button', 'tool-button');

    caption.textContent = description;
    tools.append(caption);

    if (tab === 'code') {
      this.language = createChoice<CodeLanguage>(tools, {
        tooltip: 'Language of the generated code.',
        value: this.settings.language,
        options: [{ value: 'ts', label: 'TS' }, { value: 'js', label: 'JS' }],
        onInput: (value) => {
          this.settings.language = value;
          this.callbacks.onLanguage();
        }
      });
    }

    copy.type = 'button';
    copy.innerHTML = `${icon('copy')}<span>Copy</span>`;
    copy.dataset['tooltip'] = tab === 'json' ? 'Copies the generated JSON.' : 'Copies the generated code.';
    copy.addEventListener('click', () => void copyText(this.codeTexts.get(tab) ?? '', copy));
    tools.append(copy);
    this.tools.set(tab, tools);

    return tools;
  }

  private renderTimeline(snapshot: Snapshot): void {
    const { lod, thresholds, used, field, fov } = snapshot;
    const switches: Span[] = [];

    for (let i = 0; i < thresholds.length; i++) {
      if (!used[i]) continue;

      switches.push({ level: i + 1, start: getSwitchDistance(thresholds[i], lod.radius, this.settings, fov), end: 0 });
    }

    const distances = Array.from(field.distances);
    const nearest = Math.min(...distances);
    const farthest = Math.max(...distances);
    const firstSwitch = switches.length > 0 ? switches[0].start : nearest;
    const lastSwitch = switches.length > 0 ? switches[switches.length - 1].start : farthest;
    const min = Math.min(nearest, firstSwitch) * 0.8;
    const max = Math.max(farthest, lastSwitch) * 1.25;
    const scale = (distance: number): number => (Math.log(distance / min) / Math.log(max / min)) * 100;
    const spans: Span[] = [{ level: 0, start: min, end: switches.length > 0 ? switches[0].start : max }];

    for (let i = 0; i < switches.length; i++) {
      switches[i].end = i + 1 < switches.length ? switches[i + 1].start : max;
      spans.push(switches[i]);
    }

    this.spans = spans.map((span) => this.createSpan(span, scale));
    this.track.replaceChildren(...this.spans);
    this.ticks.replaceChildren(...distances.map((distance) => createRowTick(distance, scale, spans)));
    this.axis.replaceChildren(...getAxisTicks(min, max).map((distance) => createAxisTick(distance, scale)));
    this.timelineCaption.textContent = `Camera distance, log scale · ${distances.length} instances · fov ${formatDistance(fov)}°`;
  }

  private createSpan(span: Span, scale: (distance: number) => number): HTMLButtonElement {
    const button = createElement('button', 'timeline-span');
    const left = scale(span.start);
    const width = scale(span.end) - left;
    const range = span.level === 0 ? `to ${formatDistance(span.end)}` : `${formatDistance(span.start)}+`;

    button.type = 'button';
    button.dataset['level'] = String(span.level);
    button.style.left = `${left}%`;
    button.style.width = `${width}%`;
    button.style.setProperty('--level', levelColors[span.level % levelColors.length]);
    button.setAttribute('aria-pressed', String(span.level === this.view.selectedLevel));
    button.setAttribute('aria-label', `Level ${span.level}, ${range}`);
    button.innerHTML = `<b>L${span.level}</b><span>${range}</span>`;
    button.addEventListener('click', () => {
      this.callbacks.onSelect(span.level);
    });
    button.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;

      this.callbacks.onHover(span.level);
    });

    return button;
  }

  private renderWarnings(snapshot: Snapshot): void {
    const warnings = snapshot.warnings;
    const items: HTMLLIElement[] = [];

    for (const warning of warnings) {
      const item = createElement('li');
      const button = createElement('button', 'warning');
      const tag = createElement('span', 'warning-tag');
      const text = createElement('span');

      button.type = 'button';
      tag.innerHTML = warning.level < 0 ? 'All' : `<i class="swatch" style="background:${levelColors[warning.level % levelColors.length]}"></i>L${warning.level}`;
      text.textContent = warning.text;
      button.prepend(createIcon());
      button.append(tag, text);
      button.disabled = warning.level < 0;
      button.addEventListener('click', () => {
        this.callbacks.onSelect(warning.level);
      });
      item.append(button);
      items.push(item);
    }

    if (items.length === 0) {
      const empty = createElement('li', 'empty');

      empty.textContent = 'No warnings for this configuration.';
      items.push(empty);
    }

    this.warnings.replaceChildren(...items);
    this.warningsCount.textContent = String(warnings.length);
    this.warningsCount.hidden = warnings.length === 0;
    this.tabs.get('warnings')!.classList.toggle('has-warnings', warnings.length > 0);

    if (this.active === 'warnings') this.panels.get('warnings')!.scrollTop = 0;
  }
}

function createRowTick(distance: number, scale: (distance: number) => number, spans: Span[]): HTMLElement {
  const tick = createElement('i');
  let level = 0;

  for (const span of spans) {
    if (distance >= span.start) level = span.level;
  }

  tick.style.left = `${scale(distance)}%`;
  tick.style.background = levelColors[level % levelColors.length];

  return tick;
}

function createAxisTick(distance: number, scale: (distance: number) => number): HTMLElement {
  const tick = createElement('span');

  tick.style.left = `${scale(distance)}%`;
  tick.textContent = formatDistance(distance);

  return tick;
}

/**
 * Returns the 1, 2, 5 steps of every decade between `min` and `max`, keeping at most about eight of them.
 */
function getAxisTicks(min: number, max: number): number[] {
  const ticks: number[] = [];
  const steps = Math.log10(max / min) > 3 ? [1] : [1, 2, 5];

  for (let exponent = Math.floor(Math.log10(min)); exponent <= Math.ceil(Math.log10(max)); exponent++) {
    for (const step of steps) {
      const value = step * 10 ** exponent;

      if (value >= min && value <= max) ticks.push(value);
    }
  }

  return ticks;
}

function createIcon(): HTMLElement {
  const wrapper = createElement('span', 'warning-icon');

  wrapper.innerHTML = icon('alert');

  return wrapper;
}

function highlight(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return escaped.replace(tokenPattern, (match: string, string?: string, number?: string) => {
    if (string !== undefined) return `<span class="tok-string">${match}</span>`;
    if (number !== undefined) return `<span class="tok-number">${match}</span>`;
    if (keywords.has(match)) return `<span class="tok-keyword">${match}</span>`;
    if (/^[A-Z]/.test(match)) return `<span class="tok-type">${match}</span>`;

    return match;
  });
}

function readStoredTab(): DockTab {
  try {
    const value = localStorage.getItem(tabStorageKey);

    return value === 'code' || value === 'json' || value === 'warnings' ? value : 'timeline';
  } catch {
    return 'timeline';
  }
}

export async function copyText(text: string, button: HTMLElement): Promise<void> {
  const label = button.querySelector('span');
  const previous = label?.textContent ?? '';

  try {
    await navigator.clipboard.writeText(text);

    if (label !== null) label.textContent = 'Copied';
  } catch {
    if (label !== null) label.textContent = 'Copy failed';
  }

  setTimeout(() => {
    if (label !== null) label.textContent = previous;
  }, 1400);
}
