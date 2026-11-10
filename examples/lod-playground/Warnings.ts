import type { Model } from './Models.js';
import { getLevels, simplifyFlags, type LevelSettings, type Settings } from './Settings.js';
import { canUpdateVertices, getTriangles, type GeometryLOD } from './Simplification.js';

export interface Warning {
  level: number;
  text: string;
}

export function getSettingsWarnings(settings: Settings, model: Model): Warning[] {
  const warnings: Warning[] = model.notes.map((text) => ({ level: -1, text }));
  const levels = getLevels(settings);
  const hasProtectSeams = settings.protectNormalSeams || settings.protectUvSeams;

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    const number = i + 1;
    const ignored = getIgnoredBySloppy(level);

    if (!level.limitError && level.ratio === 0) warnings.push({ level: number, text: 'Set a ratio or enable the error limit.' });
    if (level.updateVertices && !canUpdateVertices(level, settings)) warnings.push({ level: number, text: 'Update vertices needs compact vertices and no sloppy: it is ignored.' });
    if (level.sloppy && ignored.length > 0) warnings.push({ level: number, text: `Sloppy ignores ${ignored.join(', ')}.` });
    if (level.sloppy) continue;
    if (level.regularize && level.regularizeLight) warnings.push({ level: number, text: 'Regularize and regularizeLight are both enabled: use only one of them.' });
    if (hasProtectSeams && !level.permissive) warnings.push({ level: number, text: 'Protect seams has no effect without permissive.' });
  }

  if (settings.vertices === 'compact' && model.morph !== null) {
    warnings.push({ level: -1, text: 'Compact vertices copy the morph targets into every level: more memory than shared or reordered.' });
  }

  addThresholdOrderWarnings(settings, levels, warnings);

  return warnings;
}

export function getResultWarnings(lod: GeometryLOD, used: boolean[], settings: Settings): Warning[] {
  const warnings: Warning[] = [];
  const levels = lod.levels;

  for (let i = 1; i < levels.length; i++) {
    if (getTriangles(levels[i].geometry) >= getTriangles(levels[i - 1].geometry)) warnings.push({ level: i, text: `Not simpler than level ${i - 1}.` });

    if (settings.thresholdMode !== 'pixelError' || used[i - 1]) continue;

    const reason = levels[i].error === 0 ? 'its error is 0' : `its error is not larger than the error of the level before it`;

    warnings.push({ level: i, text: `Never used: ${reason}.` });
  }

  return warnings;
}

function getIgnoredBySloppy(level: LevelSettings): string[] {
  return simplifyFlags.filter((flag) => level[flag]);
}

function addThresholdOrderWarnings(settings: Settings, levels: LevelSettings[], warnings: Warning[]): void {
  if (settings.thresholdMode === 'pixelError') return;

  const isScreenSize = settings.thresholdMode === 'screenSize';
  let last = isScreenSize ? Infinity : 0;

  for (let i = 0; i < levels.length; i++) {
    const value = isScreenSize ? levels[i].screenSize : levels[i].distance;
    const isOrdered = isScreenSize ? value < last : value > last;

    if (isOrdered) {
      last = value;
      continue;
    }

    const order = isScreenSize ? 'smaller than' : 'larger than';
    const threshold = isScreenSize ? 'screen size' : 'distance';

    warnings.push({ level: i + 1, text: `Never used: its ${threshold} must be ${order} the one of the previous used level.` });
  }
}
