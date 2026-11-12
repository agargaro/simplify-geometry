import { createElement } from './Controls.js';
import { formatCount, formatDecimal, formatDistance, formatPercent } from './Format.js';
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
  private drawnText = '';

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
    const credits = createElement('p', 'credits');
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

    drawnLabel.textContent = 'Drawn';
    drawnLabel.dataset['tooltip'] = descriptions.drawn;
    drawnTrack.append(this.drawnBar);
    drawnRow.append(drawnLabel, this.drawn, drawnTrack);
    credits.innerHTML = 'Simplified with <a href="https://github.com/zeux/meshoptimizer" target="_blank" rel="noopener">meshoptimizer</a>'
      + ' · Imp and Puglin by <a href="https://quaternius.com" target="_blank" rel="noopener">Quaternius</a> (CC0)'
      + ' · Horse by <a href="https://mirada.com/" target="_blank" rel="noopener">mirada</a> for <a href="http://www.ro.me" target="_blank" rel="noopener">ROME</a>,'
      + ' from the <a href="https://threejs.org/examples/#webgl_morphtargets_horse" target="_blank" rel="noopener">three.js examples</a>';
    this.buildButton.type = 'button';
    this.buildButton.textContent = 'Measure build time';
    this.buildButton.dataset['tooltip'] = descriptions.measureBuild;
    this.buildButton.addEventListener('click', callbacks.onMeasure);
    buildRow.append(this.buildButton, this.buildTime);
    footer.append(drawnRow, buildRow, credits);
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

    this.list.replaceChildren(...this.rows.map((row) => row.parentElement!));
    this.count.textContent = String(levels.length);
    this.addButton.disabled = settingsCount >= maxLevels;
    this.removeButton.disabled = settingsCount === 0;
  }

  /**
   * Shows the result of the last build measurement, or clears it with an empty text when the settings change.
   */
  setBuildTime(text: string, isMeasuring = false): void {
    this.buildTime.textContent = text;
    this.buildButton.disabled = isMeasuring;
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
