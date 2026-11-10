export type BuiltInModelName = 'imp' | 'puglin' | 'horse';
export type ModelName = BuiltInModelName | 'custom';
export type VerticesMode = 'reordered' | 'shared' | 'compact';
export type ThresholdMode = 'pixelError' | 'screenSize' | 'distance';
export type CodeLanguage = 'ts' | 'js';
export type PreviewLayout = 'distance' | 'levels';
export type ShadingMode = 'clay' | 'uv' | 'material' | 'texture';
export type SimplifyFlag = 'lockBorder' | 'sparse' | 'prune' | 'regularize' | 'regularizeLight' | 'permissive' | 'preserveFolds' | 'errorClamped';

export type LevelFlags = Record<SimplifyFlag, boolean>;

export interface LevelSettings extends LevelFlags {
  ratio: number;
  limitError: boolean;
  error: number;
  sloppy: boolean;
  updateVertices: boolean;
  screenSize: number;
  distance: number;
  hysteresis: number;
}

export interface ModelSettings {
  levels: LevelSettings[];
}

export interface Settings {
  model: ModelName;
  vertices: VerticesMode;
  errorAbsolute: boolean;
  normalWeight: number;
  uvWeight: number;
  protectNormalSeams: boolean;
  protectUvSeams: boolean;
  skinError: number;
  thresholdMode: ThresholdMode;
  pixelError: number;
  models: Record<ModelName, ModelSettings>;
  layout: PreviewLayout;
  shading: ShadingMode;
  colorByLevel: boolean;
  flatShading: boolean;
  language: CodeLanguage;
}

export const builtInModelNames: BuiltInModelName[] = ['imp', 'puglin', 'horse'];
export const modelNames: ModelName[] = ['imp', 'puglin', 'horse', 'custom'];
export const modelLabels: Record<ModelName, string> = { imp: 'Imp', puglin: 'Puglin', horse: 'Horse', custom: 'Custom' };
export const simplifyFlags: SimplifyFlag[] = ['lockBorder', 'sparse', 'prune', 'regularize', 'regularizeLight', 'permissive', 'preserveFolds', 'errorClamped'];
export const maxLevels = 8;
export const instancesCount = 500;
export const instanceSpacing = 2.2;
export const instanceSeparation = 3.2;

const defaultErrors = [0.005, 0.01, 0.02, 0.04];
const defaultScreenSizes = [0.4, 0.2, 0.1, 0.05];
const defaultDistances = [10, 20, 40, 80];

export function createDefaultSettings(): Settings {
  return {
    model: 'imp',
    vertices: 'reordered',
    errorAbsolute: false,
    normalWeight: 0,
    uvWeight: 0,
    protectNormalSeams: false,
    protectUvSeams: false,
    skinError: 1,
    thresholdMode: 'pixelError',
    pixelError: 1,
    models: { imp: createModelSettings(), puglin: createModelSettings(), horse: createModelSettings(), custom: createModelSettings() },
    layout: 'distance',
    shading: 'clay',
    colorByLevel: true,
    flatShading: false,
    language: 'ts'
  };
}

export function createModelSettings(): ModelSettings {
  return { levels: createDefaultLevels() };
}

export function createDefaultLevels(): LevelSettings[] {
  const levels: LevelSettings[] = [];

  for (let i = 0; i < defaultErrors.length; i++) {
    levels.push(createLevel(defaultErrors[i], defaultScreenSizes[i], defaultDistances[i]));
  }

  return levels;
}

/**
 * Creates the level that follows `previous`: coarser, used from a smaller screen size or a larger distance, with the same flags.
 */
export function createNextLevel(previous: LevelSettings | undefined): LevelSettings {
  if (previous === undefined) return createLevel(defaultErrors[0], defaultScreenSizes[0], defaultDistances[0]);

  return {
    ...previous,
    ratio: previous.ratio / 2,
    error: Math.min(previous.error * 2.5, 1),
    screenSize: previous.screenSize / 2,
    distance: previous.distance * 2
  };
}

export function getLevels(settings: Settings): LevelSettings[] {
  return settings.models[settings.model].levels;
}

function createLevel(error: number, screenSize: number, distance: number): LevelSettings {
  return {
    ratio: 0,
    limitError: true,
    error,
    sloppy: false,
    updateVertices: false,
    lockBorder: false,
    sparse: false,
    prune: true,
    regularize: false,
    regularizeLight: false,
    permissive: false,
    preserveFolds: false,
    errorClamped: false,
    screenSize,
    distance,
    hysteresis: 0
  };
}
