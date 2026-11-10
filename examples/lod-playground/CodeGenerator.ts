import type { SimplifyGeometryLevelParams, SimplifyGeometryLODParams } from '@three.ez/simplify-geometry';
import type { Model } from './Models.js';
import { getLevels, type Settings } from './Settings.js';
import { getLevelParams, getSharedFlags, getSimplifyParams } from './Simplification.js';

interface CodeOptions {
  ts: boolean;
  isPixelError: boolean;
  isDistance: boolean;
  hasHysteresis: boolean;
  isSkinned: boolean;
  reducesSkin: boolean;
}

export function generateCode(settings: Settings, model: Model): string {
  const levels = getLevels(settings);
  const options: CodeOptions = {
    ts: settings.language === 'ts',
    isPixelError: settings.thresholdMode === 'pixelError',
    isDistance: settings.thresholdMode === 'distance',
    hasHysteresis: levels.some((level) => level.hysteresis > 0),
    isSkinned: model.skin !== null,
    reducesSkin: model.skin !== null && settings.skinError > 0
  };
  const lines: string[] = [];
  const sharedFlags = getSharedFlags(levels);

  lines.push(...getImports(settings, options), '', 'await simplifyReady();', '');
  lines.push(`const params${options.ts ? ': SimplifyGeometryLODParams' : ''} = ${formatParams(getSimplifyParams(settings, levels))};`, '');
  lines.push(`const levels${options.ts ? ': SimplifyGeometryLevelParams[]' : ''} = ${formatLevels(getLevelParams(levels, sharedFlags, settings))};`, '');
  lines.push(...getConstants(settings, options), '');

  if (options.isSkinned && options.ts) lines.push(...getSkinInterface(), '');

  lines.push(...getCreateFunction(settings, options));

  return lines.join('\n');
}

/**
 * Returns the parameters of `simplifyGeometryLOD` and the values that choose when each level is drawn, as JSON.
 */
export function generateJson(settings: Settings, model: Model): string {
  const levels = getLevels(settings);
  const config: Record<string, unknown> = {
    params: getSimplifyParams(settings, levels),
    levels: getLevelParams(levels, getSharedFlags(levels), settings),
    thresholdMode: settings.thresholdMode
  };

  if (settings.thresholdMode === 'pixelError') config['maxPixelError'] = settings.pixelError;
  if (settings.thresholdMode === 'screenSize') config['screenSizes'] = levels.map((level) => level.screenSize);
  if (settings.thresholdMode === 'distance') config['distances'] = levels.map((level) => level.distance);
  if (levels.some((level) => level.hysteresis > 0)) config['hysteresis'] = levels.map((level) => level.hysteresis);
  if (model.skin !== null && settings.skinError > 0) config['maxSkinError'] = settings.skinError;

  return JSON.stringify(config, null, 2)
    .replace(/\{\n\s+([^{}[\]]*?)\n\s*\}/g, (_match, body: string) => `{ ${body.split(/,\n\s+/).join(', ')} }`)
    .replace(/\[\n\s+([^{}[\]]*?)\n\s*\]/g, (_match, body: string) => `[${body.split(/,\n\s+/).join(', ')}]`);
}

function getImports(settings: Settings, options: CodeOptions): string[] {
  const instancedImports = ['InstancedMesh2'];
  const simplifyImports = ['simplifyGeometryLOD', 'simplifyReady'];
  const threeImports = ['BufferGeometry', 'Material'];

  if (options.reducesSkin) instancedImports.push('reduceSkinInfluences');
  if (options.isSkinned && options.ts) instancedImports.push('type SkeletalAnimationBake');
  if (options.isPixelError && !settings.errorAbsolute) simplifyImports.unshift('getScale');
  if (options.ts) simplifyImports.push('type SimplifyGeometryLevelParams', 'type SimplifyGeometryLODParams');
  if (options.isSkinned) threeImports.push('Matrix4', 'Skeleton');

  const lines = [
    `import { ${instancedImports.join(', ')} } from '@three.ez/instanced-mesh';`,
    `import { ${simplifyImports.join(', ')} } from '@three.ez/simplify-geometry';`
  ];

  if (options.ts) lines.push(`import type { ${threeImports.join(', ')} } from 'three';`);

  return lines;
}

function getConstants(settings: Settings, options: CodeOptions): string[] {
  const levels = getLevels(settings);
  const lines: string[] = [];

  if (options.isPixelError) lines.push(`const maxPixelError = ${formatNumber(settings.pixelError)};`);
  if (settings.thresholdMode === 'screenSize') lines.push(`const screenSizes = [${levels.map((level) => formatNumber(level.screenSize)).join(', ')}];`);
  if (options.isDistance) lines.push(`const distances = [${levels.map((level) => formatNumber(level.distance)).join(', ')}];`);
  if (options.hasHysteresis) lines.push(`const hysteresis = [${levels.map((level) => formatNumber(level.hysteresis)).join(', ')}];`);
  if (options.reducesSkin) lines.push(`const maxSkinError = ${formatNumber(settings.skinError)};`);

  return lines;
}

function getSkinInterface(): string[] {
  return ['interface SkinOptions {', '  skeleton: Skeleton;', '  bindMatrix: Matrix4;', '  bake: SkeletalAnimationBake;', '}'];
}

function getCreateFunction(settings: Settings, options: CodeOptions): string[] {
  const { ts, isPixelError, isDistance, reducesSkin, isSkinned } = options;
  const needsViewport = isPixelError || reducesSkin;
  const needsFov = isDistance && reducesSkin;
  const params = [ts ? 'geometry: BufferGeometry' : 'geometry', ts ? 'material: Material' : 'material', ts ? 'capacity: number' : 'capacity'];

  if (needsViewport) params.push(ts ? 'viewportHeight: number' : 'viewportHeight');
  if (needsFov) params.push(ts ? 'fov: number' : 'fov');
  if (isSkinned) params.push(ts ? 'skin: SkinOptions' : 'skin');

  const lines = [
    `export function createLODMesh(${params.join(', ')})${ts ? ': InstancedMesh2' : ''} {`,
    '  const lods = simplifyGeometryLOD(geometry, levels, params);',
    '  const lod0 = lods[0].geometry;',
    '',
    '  lod0.computeBoundingSphere();',
    '',
    `  const mesh = new InstancedMesh2(lod0, material, { capacity${isDistance ? ', useDistanceForLOD: true' : ', useDistanceForLOD: false'} });`
  ];

  if (isPixelError || (reducesSkin && isDistance)) lines.push(`  const radius = lod0.boundingSphere${ts ? '!' : ''}.radius;`);
  if (isPixelError) lines.push(...getScreenSizeScale(settings, ts));

  lines.push('', '  for (let i = 1; i < lods.length; i++) {', ...getLoopBody(settings, options), '  }');

  if (isSkinned) lines.push('', '  mesh.initSkeleton(skin.skeleton, true, skin.bindMatrix);', '  mesh.setAnimationBake(skin.bake);');

  lines.push('', '  return mesh;', '}');

  return lines;
}

function getScreenSizeScale(settings: Settings, ts: boolean): string[] {
  if (settings.errorAbsolute) return ['  const screenSizeScale = (2 * maxPixelError * radius) / viewportHeight;', '  let lastMetric = Infinity;'];

  return [
    `  const meshScale = getScale(lod0.getAttribute('position').array${ts ? ' as Float32Array' : ''});`,
    '  const screenSizeScale = (2 * maxPixelError * radius) / (meshScale * viewportHeight);',
    '  let lastMetric = Infinity;'
  ];
}

function getLoopBody(settings: Settings, options: CodeOptions): string[] {
  const lines: string[] = [];
  const hysteresis = options.hasHysteresis ? ', hysteresis[i - 1]' : '';

  if (options.isPixelError) {
    lines.push('    const metric = screenSizeScale / lods[i].error;', '', '    if (!(metric < lastMetric)) continue;', '', '    lastMetric = metric;');
  } else {
    lines.push(`    const metric = ${options.isDistance ? 'distances' : 'screenSizes'}[i - 1];`);
  }

  if (!options.reducesSkin) {
    lines.push(`    mesh.addLOD(lods[i].geometry, material, metric${hysteresis});`);

    return lines;
  }

  const screenSize = options.isDistance ? 'radius / (metric * Math.tan((fov * Math.PI) / 360))' : 'metric';

  lines.push(
    `    const screenSize = ${screenSize};`,
    '    const reduced = reduceSkinInfluences(lods[i].geometry, skin.bake, { error: maxSkinError / (screenSize * viewportHeight), bindMatrix: skin.bindMatrix });',
    '',
    `    mesh.addLOD(reduced.geometry, material, metric${hysteresis});`
  );

  return lines;
}

function formatParams(params: SimplifyGeometryLODParams): string {
  const entries = Object.entries(params).map(([key, value]) => `  ${key}: ${formatValue(value)}`);

  return `{\n${entries.join(',\n')}\n}`;
}

function formatLevels(levels: SimplifyGeometryLevelParams[]): string {
  const entries = levels.map((level) => `  ${formatObject(level)}`);

  return `[\n${entries.join(',\n')}\n]`;
}

function formatValue(value: unknown): string {
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'string') return `'${value}'`;
  if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`;
  if (typeof value === 'object' && value !== null) return formatObject(value);

  return String(value);
}

function formatObject(object: object): string {
  const entries = Object.entries(object).map(([key, value]) => `${key}: ${formatValue(value)}`);

  return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
}

function formatNumber(value: number): string {
  return String(Number(value.toPrecision(6)));
}
