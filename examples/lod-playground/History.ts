import { modelNames, type ModelName, type ModelSettings, type Settings } from './Settings.js';

interface Change {
  key: string;
  before: string;
  after: string;
}

interface Entry {
  changes: Change[];
  time: number;
}

interface ModelHistory {
  undo: Entry[];
  redo: Entry[];
}

type State = Map<string, string>;

const modelKeyPrefix = 'models.';
const mergeDelay = 600;
const maxEntries = 200;

/**
 * Undo and redo of the settings, with a separate history for every model. A change is recorded in the history of the model shown when
 * it is made. Changes of the same settings closer than `mergeDelay` milliseconds, like dragging a slider, are merged into one entry.
 */
export class History {
  private readonly settings: Settings;
  private readonly histories = new Map<ModelName, ModelHistory>();
  private state: State;
  private openEntry: Entry | null = null;

  constructor(settings: Settings) {
    this.settings = settings;
    this.state = readState(settings);
  }

  get canUndo(): boolean {
    return this.getHistory().undo.length > 0;
  }

  get canRedo(): boolean {
    return this.getHistory().redo.length > 0;
  }

  /**
   * Records the settings changed since the last call. Returns false when nothing changed.
   */
  record(): boolean {
    const next = readState(this.settings);
    const changes = getChanges(this.state, next);

    this.state = next;

    if (changes.length === 0) return false;

    const history = this.getHistory();
    const now = performance.now();
    const open = this.openEntry;

    if (open !== null && open === history.undo.at(-1) && now - open.time < mergeDelay && hasSameKeys(open.changes, changes)) {
      mergeChanges(open, changes);
      touchAfterTask(open);

      if (open.changes.length === 0) {
        history.undo.pop();
        this.openEntry = null;
      }

      return true;
    }

    const entry: Entry = { changes, time: now };

    history.undo.push(entry);
    history.redo.length = 0;

    if (history.undo.length > maxEntries) history.undo.shift();

    this.openEntry = entry;
    touchAfterTask(entry);

    return true;
  }

  undo(): boolean {
    const history = this.getHistory();
    const entry = history.undo.pop();

    if (entry === undefined) return false;

    this.apply(entry, true);
    history.redo.push(entry);

    return true;
  }

  redo(): boolean {
    const history = this.getHistory();
    const entry = history.redo.pop();

    if (entry === undefined) return false;

    this.apply(entry, false);
    history.undo.push(entry);

    return true;
  }

  /**
   * Forgets the history of `model` and takes the current settings as the starting point, for example after a new file replaces it.
   */
  clear(model: ModelName): void {
    this.histories.delete(model);
    this.state = readState(this.settings);
    this.openEntry = null;
  }

  private apply(entry: Entry, isUndo: boolean): void {
    const target = this.settings as unknown as Record<string, unknown>;

    for (const change of entry.changes) {
      const value: unknown = JSON.parse(isUndo ? change.before : change.after);

      if (change.key.startsWith(modelKeyPrefix)) this.settings.models[change.key.slice(modelKeyPrefix.length) as ModelName] = value as ModelSettings;
      else target[change.key] = value;
    }

    this.state = readState(this.settings);
    this.openEntry = null;
  }

  private getHistory(): ModelHistory {
    let history = this.histories.get(this.settings.model);

    if (history === undefined) {
      history = { undo: [], redo: [] };
      this.histories.set(this.settings.model, history);
    }

    return history;
  }
}

function readState(settings: Settings): State {
  const state: State = new Map();

  for (const key of Object.keys(settings) as (keyof Settings)[]) {
    if (key === 'model' || key === 'models') continue;

    state.set(key, JSON.stringify(settings[key]));
  }

  for (const name of modelNames) state.set(modelKeyPrefix + name, JSON.stringify(settings.models[name]));

  return state;
}

function getChanges(previous: State, next: State): Change[] {
  const changes: Change[] = [];

  for (const [key, after] of next) {
    const before = previous.get(key);

    if (before !== undefined && before !== after) changes.push({ key, before, after });
  }

  return changes;
}

function hasSameKeys(a: Change[], b: Change[]): boolean {
  return a.length === b.length && a.every((change) => b.some((other) => other.key === change.key));
}

function mergeChanges(entry: Entry, changes: Change[]): void {
  for (const change of changes) {
    const merged = entry.changes.find((other) => other.key === change.key)!;

    merged.after = change.after;
  }

  entry.changes = entry.changes.filter((change) => change.before !== change.after);
}

/**
 * Stamps `entry` when the current task ends, after the simplification that follows the change, so that a slow update does not split a
 * slider drag into several entries.
 */
function touchAfterTask(entry: Entry): void {
  queueMicrotask(() => {
    entry.time = performance.now();
  });
}
