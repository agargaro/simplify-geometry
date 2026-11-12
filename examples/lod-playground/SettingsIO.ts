import { builtInModelNames, createDefaultSettings, createModelSettings, fovRange, instancesRange, isBuiltInModel, maxLevels, spreadRange, type BuiltInModelName, type LevelSettings, type ModelSettings, type Settings } from './Settings.js';

type Values = Record<string, unknown>;

const fileVersion = 3;
/** Version 2 kept the simplification and switching settings outside the models: every model gets them. */
const readableVersions = [2, 3];
const storageKey = 'lod-playground-settings';
const removedModelsKey = 'lod-playground-removed-models';
const fileModelId = /^file-\d+$/;

const modelEnumValues: Partial<Record<keyof ModelSettings, readonly string[]>> = {
  vertices: ['reordered', 'shared', 'compact'],
  thresholdMode: ['pixelError', 'screenSize', 'distance']
};

const enumValues: Partial<Record<keyof Settings, readonly string[]>> = {
  language: ['ts', 'js'],
  layout: ['distance', 'levels'],
  shading: ['clay', 'uv', 'material', 'texture', 'wireframe']
};

/**
 * Reads the settings saved in this browser, or the defaults. Models opened from files do not survive a reload: their settings are dropped
 * and, when one was shown, the first built-in model is shown instead.
 */
export function readInitialSettings(): Settings {
  const settings = parseSettings(() => localStorage.getItem(storageKey)) ?? createDefaultSettings();
  const models = settings.models;

  settings.models = {};

  for (const name of builtInModelNames) settings.models[name] = models[name];

  if (!isBuiltInModel(settings.model)) settings.model = builtInModelNames[0];

  return settings;
}

/**
 * Reads the built-in models removed in this browser.
 */
export function readRemovedModels(): BuiltInModelName[] {
  try {
    const values: unknown = JSON.parse(localStorage.getItem(removedModelsKey) ?? '[]');

    return Array.isArray(values) ? builtInModelNames.filter((name) => values.includes(name)) : [];
  } catch {
    return [];
  }
}

export function saveRemovedModels(names: BuiltInModelName[]): void {
  try {
    localStorage.setItem(removedModelsKey, JSON.stringify(names));
  } catch {
    return;
  }
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
 * Reads a file written by `exportSettings`, also by the previous version. Values with a wrong type or outside the allowed options fall back
 * to the defaults.
 */
export function importSettings(text: string): Settings {
  let values: unknown;

  try {
    values = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }

  if (!isValues(values) || !isValues(values['settings'])) throw new Error('The file is not a LOD playground configuration.');
  if (!readableVersions.includes(values['version'] as number)) throw new Error(`The file was saved by another version of the LOD playground (version ${String(values['version'])}, expected ${fileVersion}).`);

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
  const models = isValues(values['models']) ? values['models'] : {};

  mergeValues(settings as unknown as Values, values, enumValues, 'models');

  for (const name of builtInModelNames) settings.models[name] = readModel(models[name], values);

  for (const id of Object.keys(models)) {
    if (fileModelId.test(id)) settings.models[id] = readModel(models[id], values);
  }

  if (!Object.hasOwn(settings.models, settings.model)) settings.model = builtInModelNames[0];

  settings.instances = clamp(Math.round(settings.instances), instancesRange);
  settings.spread = clamp(settings.spread, spreadRange);
  settings.fov = clamp(settings.fov, fovRange);

  return settings;
}

/**
 * Reads the settings of one model. `legacy` holds the values that version 2 kept outside the models, used when the model has none. Levels
 * read from the file are kept as they are; without them, the levels are computed from the geometry when the model is shown.
 */
function readModel(value: unknown, legacy: Values): ModelSettings {
  const model = createModelSettings();

  mergeValues(model as unknown as Values, legacy, modelEnumValues, 'levels');

  if (!isValues(value)) return model;

  mergeValues(model as unknown as Values, value, modelEnumValues, 'levels');

  const levels = value['levels'];

  const hasLevels = Array.isArray(levels) && levels.length > 0;

  model.levelsPending = !hasLevels || value['levelsPending'] === true;

  if (hasLevels) model.levels = readLevels(levels, model.levels);

  return model;
}

/**
 * Copies into `target` the values of its keys, except `model` and `skipped`, that have the same type and, for enumerations, an allowed
 * option.
 */
function mergeValues(target: Values, values: Values, enums: Partial<Record<string, readonly string[]>>, skipped: string): void {
  for (const key of Object.keys(target)) {
    const value = values[key];
    const allowed = enums[key];
    const isAllowed = allowed === undefined || allowed.includes(value as string);

    if (key !== skipped && key !== 'model' && isSameType(value, target[key]) && isAllowed) target[key] = value;
  }
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
