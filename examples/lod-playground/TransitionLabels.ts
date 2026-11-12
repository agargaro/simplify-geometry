import { type PerspectiveCamera, Vector3 } from 'three';
import { createElement } from './Controls.js';
import { icon, type IconName } from './Icons.js';
import { levelColors } from './LODPreview.js';
import { descriptions } from './Tooltips.js';

export interface TransitionLabel {
  anchor: Vector3;
  from: number;
  to: number;
  detail: string;
}

const projected = new Vector3();

/**
 * Labels of the switches of the Transitions layout over the viewport, with the buttons that move the camera from one switch to the next.
 * The camera is locked in this layout, so the switches always have their real size on screen.
 */
export class TransitionLabels {
  private readonly root = createElement('div', 'transition-labels');
  private readonly badge = createElement('div', 'transition-badge');
  private readonly message = createElement('div', 'transition-message');
  private readonly nav = createElement('div', 'transition-nav');
  private readonly previousButton = createIconButton('previous', 'Previous switch', descriptions.previousTransition);
  private readonly nextButton = createIconButton('next', 'Next switch', descriptions.nextTransition);
  private readonly navLabel = createElement('span', 'transition-nav-label');
  private items: HTMLElement[] = [];
  private labels: TransitionLabel[] = [];
  private focused = -1;

  /**
   * `onFocus` is called with the index of the switch to move the camera to.
   */
  constructor(viewport: HTMLElement, onFocus: (index: number) => void) {
    this.root.hidden = true;
    this.badge.textContent = 'Real size on screen';
    this.badge.dataset['tooltip'] = descriptions.realSize;
    this.message.textContent = 'No level switch to show: add a level or make the switch values follow each other.';
    this.previousButton.addEventListener('click', () => {
      onFocus(this.focused - 1);
    });
    this.nextButton.addEventListener('click', () => {
      onFocus(this.focused + 1);
    });
    this.navLabel.setAttribute('aria-live', 'polite');
    this.nav.append(this.previousButton, this.navLabel, this.nextButton);
    this.root.append(this.badge, this.message, this.nav);
    viewport.append(this.root);
  }

  /**
   * Shows `labels`, with the switch at `focused` in the middle of the view. Without labels, shows that there is no switch.
   */
  show(labels: TransitionLabel[], focused: number): void {
    for (const item of this.items) item.remove();

    this.labels = labels;
    this.items = labels.map(createLabel);
    this.message.hidden = labels.length > 0;
    this.nav.hidden = labels.length === 0;
    this.root.append(...this.items);
    this.root.hidden = false;
    this.setFocus(focused);
  }

  hide(): void {
    this.root.hidden = true;
  }

  /**
   * Shows the switch at `index` as the one in the middle of the view.
   */
  setFocus(index: number): void {
    const label = this.labels.at(index);

    this.focused = index;
    this.previousButton.disabled = index <= 0;
    this.nextButton.disabled = index >= this.labels.length - 1;
    this.navLabel.replaceChildren();

    if (label === undefined) return;

    this.navLabel.append(createLevel(label.from), ' → ', createLevel(label.to), ` · ${index + 1} / ${this.labels.length}`);
  }

  /**
   * Moves every label above its switch, as seen by `camera` in a viewport of `width` × `height` pixels.
   */
  update(camera: PerspectiveCamera, width: number, height: number): void {
    if (this.root.hidden !== false) return;

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];

      projected.copy(this.labels[i].anchor).project(camera);

      const isVisible = projected.z > -1 && projected.z < 1;

      item.hidden = !isVisible;

      if (!isVisible) continue;

      item.style.transform = `translate(${(projected.x + 1) * width / 2}px, ${(1 - projected.y) * height / 2}px) translate(-50%, -100%)`;
    }
  }
}

function createLabel(label: TransitionLabel): HTMLElement {
  const item = createElement('div', 'transition-label');
  const title = createElement('span', 'transition-title');
  const detail = createElement('span', 'transition-detail');

  item.setAttribute('aria-hidden', 'true');
  title.append(createLevel(label.from), ' → ', createLevel(label.to));
  detail.textContent = label.detail;
  item.append(title, detail);

  return item;
}

function createLevel(level: number): HTMLElement {
  const element = createElement('span', 'transition-level');

  element.textContent = `L${level}`;
  element.style.color = levelColors[level % levelColors.length];

  return element;
}

function createIconButton(name: IconName, label: string, tooltip: string): HTMLButtonElement {
  const button = createElement('button', 'icon-button');

  button.type = 'button';
  button.innerHTML = icon(name);
  button.setAttribute('aria-label', label);
  button.dataset['tooltip'] = tooltip;

  return button;
}
