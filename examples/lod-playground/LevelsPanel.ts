import { createElement } from './Controls.js';
import { formatCount, formatDecimal, formatDistance, formatPercent, formatTime } from './Format.js';
import type { RendererInfo } from './GpuTimer.js';
import { icon } from './Icons.js';
import { levelColors, type PreviewStats } from './LODPreview.js';
import { getLevels, getModelSettings, maxLevels, type Settings } from './Settings.js';
import { getTriangles } from './Simplification.js';
import type { Snapshot, ViewState } from './State.js';
import { getSwitchDistance, getSwitchScreenSize } from './Thresholds.js';
import { descriptions } from './Tooltips.js';

export interface LevelsPanelCallbacks {
  onSelect: (level: number) => void;
  onHover: (level: number) => void;
  onAdd: () => void;
  onRemove: () => void;
  onMeasure: () => void;
}

export class LevelsPanel {
  private readonly settings: Settings;
  private readonly view: ViewState;
  private readonly callbacks: LevelsPanelCallbacks;
  private readonly count = createElement('span', 'dock-count');
  private readonly addButton = createElement('button', 'icon-button');
  private readonly removeButton = createElement('button', 'icon-button');
  private readonly list = createElement('ol', 'level-list');
  private readonly buildButton = createElement('button', 'tool-button build-button');
  private readonly buildTime = createElement('span', 'build-time');
  /** Holds the settings shared by every level, under the list. */
  readonly settingsContainer = createElement('div', 'levels-settings');
  private readonly drawn = createElement('span', 'drawn-value');
  private readonly drawnBar = createElement('i');
  private rows: HTMLButtonElement[] = [];
  private liveCells: HTMLElement[] = [];
  private liveValues: number[] = [];
  private timeCells: HTMLElement[] = [];
  private levelTimes: number[] = [];
  private drawnText = '';
  private readonly gpuTime = createElement('span', 'frame-value');
  private readonly rendererName = createElement('span', 'frame-value frame-renderer');
  private readonly fps = createElement('span', 'frame-value');
  private gpuText = '';
  private fpsText = '';

  constructor(root: HTMLElement, settings: Settings, view: ViewState, callbacks: LevelsPanelCallbacks) {
    this.settings = settings;
    this.view = view;
    this.callbacks = callbacks;

    const header = createElement('header', 'dock-header');
    const title = createElement('h2', 'dock-title');
    const actions = createElement('div', 'dock-actions');
    const heads = createElement('div', 'level-heads');
    const footer = createElement('footer', 'dock-footer');
    const drawnRow = createElement('div', 'drawn');
    const drawnLabel = createElement('span', 'drawn-label');
    const drawnTrack = createElement('span', 'drawn-track');
    const frameRow = createElement('div', 'frame');
    const gpuLabel = createElement('span', 'drawn-label');
    const fpsLabel = createElement('span', 'drawn-label');
    const rendererLabel = createElement('span', 'drawn-label');
    const buildRow = createElement('div', 'build');

    title.textContent = 'Levels';
    setIconButton(this.removeButton, 'minus', 'Remove level', descriptions.removeLevel);
    setIconButton(this.addButton, 'plus', 'Add level', descriptions.addLevel);
    this.removeButton.addEventListener('click', callbacks.onRemove);
    this.addButton.addEventListener('click', callbacks.onAdd);
    actions.append(this.removeButton, this.addButton);
    header.append(title, this.count, actions);

    heads.innerHTML = `<span>Level</span><span data-tooltip="${descriptions.levelTriangles}">Triangles</span><span data-tooltip="${descriptions.levelShare}">Share</span>`
      + `<span data-tooltip="${descriptions.levelInstances}">Inst.</span>`;

    this.list.setAttribute('aria-label', 'Levels');
    this.list.addEventListener('keydown', (event) => {
      this.onKeyDown(event);
    });
    this.list.addEventListener('pointerleave', () => {
      callbacks.onHover(-1);
    });

    drawnLabel.textContent = 'Triangles drawn';
    drawnLabel.dataset['tooltip'] = descriptions.drawn;
    drawnTrack.append(this.drawnBar);
    drawnRow.append(drawnLabel, this.drawn, drawnTrack);
    gpuLabel.textContent = 'GPU render time';
    gpuLabel.dataset['tooltip'] = descriptions.gpuTime;
    fpsLabel.textContent = 'FPS';
    fpsLabel.dataset['tooltip'] = descriptions.fps;
    rendererLabel.textContent = 'Renderer';
    this.gpuTime.textContent = '–';
    this.fps.textContent = '–';
    frameRow.append(gpuLabel, this.gpuTime, fpsLabel, this.fps, rendererLabel, this.rendererName);
    this.buildButton.type = 'button';
    this.buildButton.textContent = 'Measure build time';
    this.buildButton.dataset['tooltip'] = descriptions.measureBuild;
    this.buildButton.addEventListener('click', callbacks.onMeasure);
    buildRow.append(this.buildButton, this.buildTime);
    footer.append(drawnRow, frameRow, buildRow);
    root.append(header, heads, this.list, this.settingsContainer, footer);
  }

  render(snapshot: Snapshot): void {
    const { lod, thresholds, used, fov, warnings } = snapshot;
    const levels = lod.levels;
    const settingsCount = getLevels(this.settings).length;
    const fullTriangles = getTriangles(levels[0].geometry);

    this.rows = [];
    this.liveCells = [];
    this.liveValues = [];
    this.timeCells = [];

    for (let level = 0; level < levels.length; level++) {
      const triangles = getTriangles(levels[level].geometry);
      const item = createElement('li');
      const row = createElement('button', 'level-row');
      const live = createElement('span', 'level-live');
      const hasWarning = warnings.some((warning) => warning.level === level);
      const isUnused = level > 0 && !used[level - 1];
      const meta: string[] = [];

      if (level === 0) meta.push('<span>source mesh</span>');
      else if (isUnused) meta.push('<span class="is-warn">never used</span>');
      else meta.push(`<span data-tooltip="${descriptions.levelSwitch}">${this.formatSwitch(thresholds[level - 1], lod.radius, fov)}</span>`);

      if (level > 0) meta.push(`<span data-tooltip="${descriptions.levelError}">error ${this.formatError(levels[level].error)}</span>`);

      row.type = 'button';
      row.dataset['level'] = String(level);
      row.setAttribute('aria-pressed', String(level === this.view.selectedLevel));
      row.classList.toggle('is-unused', isUnused);
      row.style.setProperty('--level', levelColors[level % levelColors.length]);
      row.innerHTML = `<span class="level-id"><i class="swatch"></i>L${level}${hasWarning ? icon('alert') : ''}</span>`
        + `<span class="level-tris">${formatCount(triangles)}</span>`
        + `<span class="level-share">${formatPercent(triangles / fullTriangles)}</span>`
        + `<span class="level-bar"><i style="width:${(triangles / fullTriangles) * 100}%"></i></span>`
        + `<span class="level-meta">${meta.join('')}</span>`;
      live.textContent = '0';
      row.insertBefore(live, row.children[3]);

      const time = createElement('span', 'level-time');

      time.dataset['tooltip'] = descriptions.levelBuildTime;
      row.querySelector('.level-meta')!.append(time);
      this.timeCells.push(time);
      row.addEventListener('click', () => {
        this.callbacks.onSelect(level);
      });
      row.addEventListener('pointerenter', (event) => {
        if (event.pointerType !== 'mouse') return;

        this.callbacks.onHover(level);
      });

      item.append(row);
      this.rows.push(row);
      this.liveCells.push(live);
      this.liveValues.push(0);
    }

    for (let i = 1; i < this.timeCells.length; i++) this.renderLevelTime(i);

    this.timeCells[0].hidden = true;
    this.list.replaceChildren(...this.rows.map((row) => row.parentElement!));
    this.count.textContent = String(levels.length);
    this.addButton.disabled = settingsCount >= maxLevels;
    this.removeButton.disabled = settingsCount === 0;
  }

  /**
   * Shows the result of the last build measurement, or clears it with an empty text when the settings change.
   */
  setBuildTime(text: string, isMeasuring = false, levelTimes: number[] = []): void {
    this.buildTime.textContent = text;
    this.buildButton.disabled = isMeasuring;
    this.levelTimes = levelTimes;

    for (let i = 1; i < this.timeCells.length; i++) this.renderLevelTime(i);
  }

  private renderLevelTime(level: number): void {
    const cell = this.timeCells[level];
    const time = this.levelTimes.at(level - 1);

    cell.hidden = time === undefined;
    cell.textContent = time === undefined ? '' : `build ${formatTime(time)}`;
  }

  select(level: number): void {
    for (const row of this.rows) row.setAttribute('aria-pressed', String(row.dataset['level'] === String(level)));
  }

  renderStats(stats: PreviewStats): void {
    const counts = stats.instancesPerLevel;

    for (let i = 0; i < this.liveCells.length && i < counts.length; i++) {
      if (this.liveValues[i] === counts[i]) continue;

      this.liveValues[i] = counts[i];
      this.liveCells[i].textContent = String(counts[i]);
      this.liveCells[i].classList.toggle('is-zero', counts[i] === 0);
    }

    const ratio = stats.fullTriangles > 0 ? stats.drawnTriangles / stats.fullTriangles : 0;
    const text = `${formatCount(stats.drawnTriangles)} / ${formatCount(stats.fullTriangles)}`;

    if (text === this.drawnText) return;

    this.drawnText = text;
    this.drawn.textContent = text;
    this.drawnBar.style.width = `${Math.min(ratio, 1) * 100}%`;
  }

  renderGpuTime(milliseconds: number): void {
    const text = milliseconds < 1 ? `${milliseconds.toFixed(2)} ms` : formatTime(milliseconds);

    if (text === this.gpuText) return;

    this.gpuText = text;
    this.gpuTime.textContent = text;
  }

  renderFrameRate(fps: number): void {
    const text = fps < 0 ? 'idle' : fps.toFixed(0);

    if (text === this.fpsText) return;

    this.fpsText = text;
    this.fps.textContent = text;
  }

  setRenderer(info: RendererInfo, isTimerSupported: boolean): void {
    this.rendererName.textContent = info.label;
    this.rendererName.dataset['tooltip'] = info.detail;

    if (isTimerSupported) return;

    this.gpuTime.textContent = 'n/a';
    this.gpuTime.dataset['tooltip'] = descriptions.gpuTimeUnavailable;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = Math.min(Math.max(this.view.selectedLevel + step, 0), this.rows.length - 1);

    event.preventDefault();
    this.callbacks.onSelect(next);
    this.rows[next].focus();
  }

  private formatError(error: number): string {
    return getModelSettings(this.settings).errorAbsolute ? `${formatDecimal(error)} units` : `${formatPercent(error)} of size`;
  }

  private formatSwitch(threshold: number, radius: number, fov: number): string {
    const distance = formatDistance(getSwitchDistance(threshold, radius, getModelSettings(this.settings), fov));
    const screenSize = formatPercent(getSwitchScreenSize(threshold, radius, getModelSettings(this.settings), fov));

    return `camera ≥ ${distance} units · screen size ≤ ${screenSize}`;
  }
}

function setIconButton(button: HTMLButtonElement, name: Parameters<typeof icon>[0], label: string, tooltip: string): void {
  button.type = 'button';
  button.innerHTML = icon(name);
  button.setAttribute('aria-label', label);
  button.dataset['tooltip'] = tooltip;
}
