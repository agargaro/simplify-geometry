import { builtInModelNames, createDefaultSettings, createModelSettings, instancesRange, maxLevels, modelNames, spreadRange, type LevelSettings, type ModelSettings, type Settings } from './Settings.js';

type Values = Record<string, unknown>;

const fileVersion = 2;
const storageKey = 'lod-playground-settings';
const maxInfluences = 4;

const enumValues: Partial<Record<keyof Settings, readonly string[]>> = {
  model: modelNames,
  vertices: ['reordered', 'shared', 'compact'],
  thresholdMode: ['pixelError', 'screenSize', 'distance'],
  language: ['ts', 'js'],
  layout: ['distance', 'levels'],
  shading: ['clay', 'uv', 'material', 'texture', 'wireframe']
};

/**
 * Reads the settings of a shared link and removes them from the address bar, or else the settings saved in this browser.
 */
export function readInitialSettings(): Settings {
  const hash = window.location.hash.slice(1);

  if (hash !== '') {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);

    const linked = parseSettings(() => decodeURIComponent(hash));

    if (linked !== null) return linked;
  }

  return parseSettings(() => localStorage.getItem(storageKey)) ?? createDefaultSettings();
}

/**
 * Saves the settings in this browser, so that a reload keeps them.
 */
export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(settings));
  } catch {
    return;
  }
}

/**
 * Returns a link to this page that holds only the settings that differ from the defaults.
 */
export function createShareLink(settings: Settings): string {
  const url = new URL(window.location.href);
  const values = getChangedValues(settings);

  url.hash = Object.keys(values).length === 0 ? '' : encodeURIComponent(JSON.stringify(values));

  return url.href;
}

export function exportSettings(settings: Settings): string {
  return JSON.stringify({ version: fileVersion, settings }, null, 2);
}

/**
 * Reads a file written by `exportSettings`. Values with a wrong type or outside the allowed options fall back to the defaults.
 */
export function importSettings(text: string): Settings {
  let values: unknown;

  try {
    values = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }

  if (!isValues(values) || !isValues(values['settings'])) throw new Error('The file is not a LOD playground configuration.');
  if (values['version'] !== fileVersion) throw new Error(`The file was saved by another version of the LOD playground (version ${String(values['version'])}, expected ${fileVersion}).`);

  return createSettings(values['settings']);
}

function parseSettings(read: () => string | null): Settings | null {
  try {
    const text = read();

    if (text === null) return null;

    const values: unknown = JSON.parse(text);

    return isValues(values) ? createSettings(values) : null;
  } catch {
    return null;
  }
}

function getChangedValues(settings: Settings): Values {
  const defaults = createDefaultSettings();
  const current = settings as unknown as Values;
  const reference = defaults as unknown as Values;
  const values: Values = {};
  const models: Values = {};

  for (const key of Object.keys(current)) {
    if (key === 'models' || (key === 'model' && settings.model === 'custom')) continue;
    if (current[key] !== reference[key]) values[key] = current[key];
  }

  for (const name of builtInModelNames) {
    const levels = settings.models[name].levels;
    const defaultLevels = defaults.models[name].levels;

    if (JSON.stringify(levels) === JSON.stringify(defaultLevels)) continue;

    models[name] = { levels: levels.map((level, i) => getChangedLevelValues(level, defaultLevels[Math.min(i, defaultLevels.length - 1)])) };
  }

  if (Object.keys(models).length > 0) values['models'] = models;

  return values;
}

function getChangedLevelValues(level: LevelSettings, reference: LevelSettings): Values {
  const current = level as unknown as Values;
  const defaults = reference as unknown as Values;
  const values: Values = {};

  for (const key of Object.keys(current)) {
    if (current[key] !== defaults[key]) values[key] = current[key];
  }

  return values;
}

function createSettings(values: Values): Settings {
  const settings = createDefaultSettings();
  const target = settings as unknown as Values;

  for (const key of Object.keys(settings) as (keyof Settings)[]) {
    if (key === 'models') continue;

    const value = values[key];
    const allowed = enumValues[key];
    const isAllowed = allowed === undefined || allowed.includes(value as string);

    if (isSameType(value, target[key]) && isAllowed) target[key] = value;
  }

  const models = values['models'];

  if (isValues(models)) {
    for (const name of modelNames) settings.models[name] = readModel(models[name]);
  }

  settings.instances = clamp(Math.round(settings.instances), instancesRange);
  settings.spread = clamp(settings.spread, spreadRange);

  return settings;
}

function readModel(value: unknown): ModelSettings {
  const model = createModelSettings();

  if (!isValues(value)) return model;

  const levels = value['levels'];

  if (Array.isArray(levels) && levels.length > 0) model.levels = readLevels(levels, model.levels);

  return model;
}

function readLevels(values: unknown[], defaults: LevelSettings[]): LevelSettings[] {
  const levels: LevelSettings[] = [];
  const count = Math.min(values.length, maxLevels);

  for (let i = 0; i < count; i++) {
    const level = { ...defaults[Math.min(i, defaults.length - 1)] };
    const value = values[i];

    if (isValues(value)) mergeLevel(level, value);

    levels.push(level);
  }

  return levels;
}

function mergeLevel(level: LevelSettings, values: Values): void {
  const target = level as unknown as Values;

  for (const key of Object.keys(level)) {
    const value = values[key];

    if (isSameType(value, target[key])) target[key] = value;
  }

  level.hysteresis = Math.min(level.hysteresis, 0.95);
  level.maxInfluences = Math.min(Math.round(level.maxInfluences), maxInfluences);
}

function clamp(value: number, range: [number, number]): number {
  return Math.min(Math.max(value, range[0]), range[1]);
}

function isSameType(value: unknown, reference: unknown): boolean {
  if (typeof value !== typeof reference) return false;

  return typeof value !== 'number' || (Number.isFinite(value) && value >= 0);
}

function isValues(value: unknown): value is Values {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
