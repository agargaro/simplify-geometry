import { createElement } from './Controls.js';
import { icon, type IconName } from './Icons.js';
import { levelColors } from './LODPreview.js';
import { descriptions } from './Tooltips.js';

/**
 * Previous and next buttons around the selected level, in the inspector header.
 */
export class LevelNav {
  private readonly previousButton = createIconButton('previous', 'Previous level', descriptions.previousLevel);
  private readonly nextButton = createIconButton('next', 'Next level', descriptions.nextLevel);
  private readonly label = createElement('span', 'level-nav-label');
  private level = 0;

  constructor(root: HTMLElement, onSelect: (level: number) => void) {
    const nav = createElement('div', 'level-nav');

    this.previousButton.addEventListener('click', () => {
      onSelect(this.level - 1);
    });
    this.nextButton.addEventListener('click', () => {
      onSelect(this.level + 1);
    });
    this.label.setAttribute('aria-live', 'polite');
    nav.append(this.previousButton, this.label, this.nextButton);
    root.append(nav);
  }

  /**
   * Shows `level` as selected among `count` levels, the source included.
   */
  update(level: number, count: number): void {
    this.level = level;
    this.label.textContent = `L${level}`;
    this.label.style.setProperty('--level', levelColors[level % levelColors.length]);
    this.previousButton.disabled = level <= 0;
    this.nextButton.disabled = level >= count - 1;
  }
}

function createIconButton(name: IconName, label: string, tooltip: string): HTMLButtonElement {
  const button = createElement('button', 'icon-button');

  button.type = 'button';
  button.innerHTML = icon(name);
  button.setAttribute('aria-label', label);
  button.dataset['tooltip'] = tooltip;

  return button;
}
