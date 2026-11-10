export type BuiltInModelName = 'imp' | 'puglin' | 'horse';
export type ModelName = BuiltInModelName | 'custom';
export type VerticesMode = 'reordered' | 'shared' | 'compact';
export type ThresholdMode = 'pixelError' | 'screenSize' | 'distance';
export type CodeLanguage = 'ts' | 'js';
export type PreviewLayout = 'distance' | 'levels';
export type ShadingMode = 'clay' | 'uv' | 'material' | 'texture' | 'wireframe';
export type SimplifyFlag = 'lockBorder' | 'sparse' | 'prune' | 'regularize' | 'regularizeLight' | 'permissive' | 'preserveFolds';

export type LevelFlags = Record<SimplifyFlag, boolean>;

export interface LevelSettings extends LevelFlags {
  ratio: number;
  limitError: boolean;
  error: number;
  sloppy: boolean;
  updateVertices: boolean;
  /** Bone influences per vertex drawn by the level: 0 picks them from the skin error. */
  maxInfluences: number;
  /** Whether the level blends the two nearest baked frames or reads the nearest one. */
  interpolateFrames: boolean;
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
  protectNormalSeams: boolean;
  protectUvSeams: boolean;
  skinError: number;
  thresholdMode: ThresholdMode;
  pixelError: number;
  models: Record<ModelName, ModelSettings>;
  /** Instances scattered by the distance layout. */
  instances: number;
  /** Smallest distance between two instances of the distance layout, in mesh radii. */
  spread: number;
  layout: PreviewLayout;
  shading: ShadingMode;
  colorByLevel: boolean;
  flatShading: boolean;
  /** Whether the environment map lights the material of the model. */
  environment: boolean;
  language: CodeLanguage;
}

export const builtInModelNames: BuiltInModelName[] = ['imp', 'puglin', 'horse'];
export const modelNames: ModelName[] = ['imp', 'puglin', 'horse', 'custom'];
export const modelLabels: Record<ModelName, string> = { imp: 'Imp', puglin: 'Puglin', horse: 'Horse', custom: 'Custom' };
export const simplifyFlags: SimplifyFlag[] = ['lockBorder', 'sparse', 'prune', 'regularize', 'regularizeLight', 'permissive', 'preserveFolds'];
export const maxLevels = 8;
export const instanceSpacing = 2.2;
export const instancesRange: [number, number] = [50, 5000];
export const spreadRange: [number, number] = [1.2, 8];

const defaultErrors = [0.005, 0.01, 0.02, 0.04];
const defaultScreenSizes = [0.4, 0.2, 0.1, 0.05];
const defaultDistances = [10, 20, 40, 80];

export function createDefaultSettings(): Settings {
  return {
    model: 'imp',
    vertices: 'reordered',
    errorAbsolute: false,
    protectNormalSeams: false,
    protectUvSeams: false,
    skinError: 1,
    thresholdMode: 'pixelError',
    pixelError: 1,
    models: { imp: createModelSettings(), puglin: createModelSettings(), horse: createModelSettings(), custom: createModelSettings() },
    instances: 1000,
    spread: 2.2,
    layout: 'distance',
    shading: 'clay',
    colorByLevel: true,
    flatShading: false,
    environment: true,
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
    maxInfluences: 0,
    interpolateFrames: true,
    lockBorder: false,
    sparse: false,
    prune: true,
    regularize: false,
    regularizeLight: false,
    permissive: false,
    preserveFolds: false,
    screenSize,
    distance,
    hysteresis: 0
  };
}
