export interface ShortcutCallbacks {
  onLevel: (level: number) => void;
  onLayout: () => void;
  onIsolate: () => void;
  onColorByLevel: () => void;
  onForce: () => void;
  onResetCamera: () => void;
  onPlay: () => void;
  onLegend: () => void;
}

export interface Shortcut {
  keys: string[];
  action: string;
}

const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
/** Inputs that do not take typed letters, so shortcuts still work while they are focused. */
const keyFreeInputs = new Set(['checkbox', 'radio', 'range', 'button']);

/** Modifier of the undo and redo shortcuts on this platform. */
export const commandKey = isMac ? '⌘' : 'Ctrl';

/**
 * Shortcuts listed in the controls legend, in the order shown.
 */
export const shortcuts: Shortcut[] = [
  { keys: ['0–9'], action: 'Select level' },
  { keys: ['L'], action: 'Next layout' },
  { keys: ['I'], action: 'Isolate level' },
  { keys: ['C'], action: 'Color by level' },
  { keys: ['F'], action: 'Next forced level' },
  { keys: ['R'], action: 'Reset view' },
  { keys: ['Space'], action: 'Play / pause' },
  { keys: [commandKey, 'Z'], action: 'Undo' },
  { keys: [commandKey, 'Y'], action: 'Redo' },
  { keys: ['?'], action: 'Show this legend' }
];

/**
 * Listens to the single-key shortcuts of the playground. Keys typed in a text field or pressed with Ctrl, ⌘ or Alt are ignored, and
 * Space is left to the focused button, link or checkbox.
 */
export function initShortcuts(callbacks: ShortcutCallbacks): void {
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || isTextField(event.target)) return;

    const key = event.key;

    if (key === ' ' && isActivatable(event.target)) return;

    if (key >= '0' && key <= '9' && key.length === 1) callbacks.onLevel(Number(key));
    else if (key === '?') callbacks.onLegend();
    else if (key === ' ') callbacks.onPlay();
    else if (!runLetter(key.toLowerCase(), callbacks)) return;

    event.preventDefault();
  });
}

function runLetter(key: string, callbacks: ShortcutCallbacks): boolean {
  if (key === 'l') callbacks.onLayout();
  else if (key === 'i') callbacks.onIsolate();
  else if (key === 'c') callbacks.onColorByLevel();
  else if (key === 'f') callbacks.onForce();
  else if (key === 'r') callbacks.onResetCamera();
  else return false;

  return true;
}

function isTextField(target: EventTarget | null): boolean {
  if (target instanceof HTMLInputElement) return !keyFreeInputs.has(target.type);
  if (!(target instanceof HTMLElement)) return false;

  return target.isContentEditable || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

function isActivatable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  return target.tagName === 'BUTTON' || target.tagName === 'A' || target.tagName === 'SUMMARY' || target.tagName === 'INPUT';
}
