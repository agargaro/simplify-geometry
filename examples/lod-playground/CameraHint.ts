import { createElement } from './Controls.js';
import { icon, type IconName } from './Icons.js';
import { shortcuts } from './Shortcuts.js';

interface HintRow {
  icon: IconName | null;
  keys: string[];
  gesture: string;
  action: string;
}

const storageKey = 'lod-playground:camera-hint-seen';
const autoHideDelay = 8000;
const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
const altKey = isMac ? '⌥' : 'Alt';

const mouseRows: HintRow[] = [
  { icon: null, keys: ['W', 'A', 'S', 'D'], gesture: '', action: 'Move' },
  { icon: null, keys: ['E', 'Q'], gesture: '', action: 'Up / down' },
  { icon: null, keys: ['Shift'], gesture: 'Hold', action: 'Faster' },
  { icon: 'mouseLeft', keys: [], gesture: 'Drag', action: 'Move' },
  { icon: 'mouseLeft', keys: [altKey], gesture: 'Drag', action: 'Up / down' },
  { icon: 'mouseRight', keys: [], gesture: 'Drag', action: 'Look around' },
  { icon: 'mouseLeft', keys: ['Shift'], gesture: 'Drag', action: 'Look around' },
  { icon: 'mouseWheel', keys: [], gesture: 'Scroll', action: 'Step to the cursor' }
];

const touchRows: HintRow[] = [
  { icon: null, keys: ['1 finger'], gesture: 'Drag', action: 'Move' },
  { icon: null, keys: ['2 fingers'], gesture: 'Pinch', action: 'Forward / back' },
  { icon: null, keys: ['2 fingers'], gesture: 'Twist', action: 'Turn' }
];

/**
 * Text of the camera controls, for the tooltip of the button that shows the legend.
 */
export const cameraHintText = `Camera controls and keyboard shortcuts. W A S D: move. E / Q: up and down. Shift: faster. Drag: move. ${altKey} + drag: up and down. Right drag or Shift + drag: look around. Scroll: step to the cursor. Click to show the legend on the viewport.`;

/**
 * Legend of the camera controls and of the keyboard shortcuts over the viewport. Shown on the first visit until the camera moves, and on
 * demand. The camera group is hidden by CSS while the camera is locked.
 */
export class CameraHint {
  /** Called when the legend is shown or hidden. */
  onVisibility: ((visible: boolean) => void) | null = null;
  private readonly root = createElement('div', 'camera-hint');
  private timeout = 0;
  private visible = false;

  constructor(viewport: HTMLElement) {
    const isTouch = matchMedia('(pointer: coarse)').matches;
    const camera = createGroup('Camera', isTouch ? touchRows : mouseRows);

    camera.classList.add('is-camera');
    this.root.setAttribute('aria-hidden', 'true');
    this.root.append(camera);

    if (!isTouch) {
      const keys = createGroup('Shortcuts', shortcuts.map((shortcut) => ({ icon: null, keys: shortcut.keys, gesture: '', action: shortcut.action })));

      keys.classList.add('is-shortcuts');
      this.root.append(keys);
    }

    viewport.append(this.root);
  }

  /**
   * Shows the legend if the camera has never been moved, then hides it after a few seconds.
   */
  showFirstTime(): void {
    if (readSeen()) return;

    this.show();
    this.timeout = window.setTimeout(() => {
      this.hide();
    }, autoHideDelay);
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  /**
   * Hides the legend once the camera moves, and remembers it.
   */
  onCameraStart(): void {
    if (!this.visible) return;

    saveSeen();
    this.hide();
  }

  private show(): void {
    this.setVisible(true);
  }

  private hide(): void {
    window.clearTimeout(this.timeout);
    this.setVisible(false);
  }

  private setVisible(value: boolean): void {
    if (value === this.visible) return;

    this.visible = value;
    this.root.classList.toggle('is-visible', value);
    this.onVisibility?.(value);
  }
}

function createGroup(title: string, rows: HintRow[]): HTMLElement {
  const group = createElement('div', 'camera-hint-group');
  const heading = createElement('span', 'camera-hint-title');

  heading.textContent = title;
  group.append(heading, ...rows.map(createRow));

  return group;
}

function createRow(row: HintRow): HTMLElement {
  const element = createElement('div', 'camera-hint-row');
  const input = createElement('span', 'camera-hint-input');
  const gesture = createElement('span', 'camera-hint-gesture');
  const action = createElement('span', 'camera-hint-action');

  for (const key of row.keys) {
    const cap = createElement('kbd', 'keycap');

    cap.textContent = key;
    input.append(cap);
    if (row.icon !== null) input.append('+');
  }

  if (row.icon !== null) input.insertAdjacentHTML('beforeend', icon(row.icon));

  gesture.textContent = row.gesture;
  action.textContent = row.action;
  input.append(gesture);
  element.append(input, action);

  return element;
}

function readSeen(): boolean {
  try {
    return localStorage.getItem(storageKey) === '1';
  } catch {
    return false;
  }
}

function saveSeen(): void {
  try {
    localStorage.setItem(storageKey, '1');
  } catch {
    return;
  }
}
