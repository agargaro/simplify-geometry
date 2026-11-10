import { createDefaultSettings, createModelSettings, fovRange, instancesRange, maxLevels, modelNames, spreadRange, type LevelSettings, type ModelSettings, type Settings } from './Settings.js';

type Values = Record<string, unknown>;

const fileVersion = 2;
const storageKey = 'lod-playground-settings';

const enumValues: Partial<Record<keyof Settings, readonly string[]>> = {
  model: modelNames,
  vertices: ['reordered', 'shared', 'compact'],
  thresholdMode: ['pixelError', 'screenSize', 'distance'],
  language: ['ts', 'js'],
  layout: ['distance', 'levels'],
  shading: ['clay', 'uv', 'material', 'texture', 'wireframe']
};

/**
 * Reads the settings saved in this browser, or the defaults.
 */
export function readInitialSettings(): Settings {
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
  settings.fov = clamp(settings.fov, fovRange);

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
