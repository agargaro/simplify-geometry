export type BuiltInModelName = 'imp' | 'puglin' | 'horse';
/** A built-in model, or `file-<n>` for a model opened from a file. */
export type ModelId = string;
export type VerticesMode = 'reordered' | 'shared' | 'compact';
export type ThresholdMode = 'pixelError' | 'screenSize' | 'distance';
export type CodeLanguage = 'ts' | 'js';
export type PreviewLayout = 'distance' | 'levels';
export type ShadingMode = 'clay' | 'uv' | 'material' | 'texture' | 'wireframe';
export type SimplifyFlag = 'lockBorder' | 'sparse' | 'prune' | 'regularize' | 'regularizeLight' | 'permissive' | 'preserveFolds';

export type LevelFlags = Record<SimplifyFlag, boolean>;

export interface LevelSettings extends LevelFlags {
  ratio: number;
  error: number;
  sloppy: boolean;
  updateVertices: boolean;
  screenSize: number;
  distance: number;
  hysteresis: number;
}

/**
 * Everything that defines the LOD of one model: its levels, how they are simplified and how instances switch between them.
 */
export interface ModelSettings {
  levels: LevelSettings[];
  /** True while `levels` are placeholders, replaced by levels computed from the geometry when the model is shown. */
  levelsPending: boolean;
  vertices: VerticesMode;
  errorAbsolute: boolean;
  protectNormalSeams: boolean;
  protectUvSeams: boolean;
  thresholdMode: ThresholdMode;
  pixelError: number;
}

/**
 * The LOD of every model, in `models`, and the preview settings shared by all of them.
 */
export interface Settings {
  model: ModelId;
  models: Record<ModelId, ModelSettings>;
  /** Instances scattered by the Crowd layout. */
  instances: number;
  /** Smallest distance between two instances of the Crowd layout, in mesh radii. */
  spread: number;
  /** Vertical field of view of the camera, in degrees. */
  fov: number;
  layout: PreviewLayout;
  shading: ShadingMode;
  colorByLevel: boolean;
  flatShading: boolean;
  /** Whether the environment map lights the material of the model. */
  environment: boolean;
  language: CodeLanguage;
}

export const builtInModelNames: BuiltInModelName[] = ['imp', 'puglin', 'horse'];
export const modelLabels: Record<BuiltInModelName, string> = { imp: 'Imp', puglin: 'Puglin', horse: 'Horse' };
export const simplifyFlags: SimplifyFlag[] = ['lockBorder', 'sparse', 'prune', 'regularize', 'regularizeLight', 'permissive', 'preserveFolds'];
export const maxLevels = 8;
export const instanceSpacing = 2.2;
export const instancesRange: [number, number] = [50, 5000];
export const spreadRange: [number, number] = [1.2, 8];
export const fovRange: [number, number] = [20, 90];

/** Errors of the placeholder levels, and the smallest errors tried by the levels computed from the geometry. */
export const defaultErrors = [0.002, 0.005, 0.01, 0.02, 0.05];
const firstScreenSize = 0.8;
const firstDistance = 5;
const defaultHysteresis = 0.1;

export function createDefaultSettings(): Settings {
  return {
    model: 'imp',
    models: { imp: createModelSettings(), puglin: createModelSettings(), horse: createModelSettings() },
    instances: 500,
    spread: 2.2,
    fov: 50,
    layout: 'distance',
    shading: 'clay',
    colorByLevel: true,
    flatShading: false,
    environment: true,
    language: 'ts'
  };
}

export function createModelSettings(): ModelSettings {
  return {
    levels: createPlaceholderLevels(),
    levelsPending: true,
    vertices: 'reordered',
    errorAbsolute: false,
    protectNormalSeams: false,
    protectUvSeams: false,
    thresholdMode: 'pixelError',
    pixelError: 0.8
  };
}

/**
 * Levels that do not depend on the geometry: used until the model is shown, and for the values missing from a file.
 */
export function createPlaceholderLevels(): LevelSettings[] {
  const levels: LevelSettings[] = [];

  for (let i = 0; i < defaultErrors.length; i++) levels.push(createLevel(i, defaultErrors[i], 0));

  return levels;
}

/**
 * Creates the level at `index` (0 is the first level after the source) with prune, regularize and permissive. The screen size halves and
 * the distance doubles at every level.
 */
export function createLevel(index: number, error: number, ratio: number): LevelSettings {
  return {
    ratio,
    error,
    sloppy: false,
    updateVertices: false,
    lockBorder: false,
    sparse: false,
    prune: true,
    regularize: true,
    regularizeLight: false,
    permissive: true,
    preserveFolds: false,
    screenSize: firstScreenSize / 2 ** index,
    distance: firstDistance * 2 ** index,
    hysteresis: defaultHysteresis
  };
}

/**
 * Creates the level that follows `previous` with `error` and `ratio`: used from a smaller screen size or a larger distance, with the same
 * flags. Without `previous`, it is the first level with the default flags.
 */
export function createNextLevel(previous: LevelSettings | undefined, error: number, ratio: number): LevelSettings {
  if (previous === undefined) return createLevel(0, error, ratio);

  return { ...previous, ratio, error, screenSize: previous.screenSize / 2, distance: previous.distance * 2 };
}

/**
 * The LOD settings of the shown model.
 */
export function getModelSettings(settings: Settings): ModelSettings {
  return settings.models[settings.model];
}

export function getLevels(settings: Settings): LevelSettings[] {
  return getModelSettings(settings).levels;
}

export function isBuiltInModel(id: ModelId): id is BuiltInModelName {
  return (builtInModelNames as ModelId[]).includes(id);
}
