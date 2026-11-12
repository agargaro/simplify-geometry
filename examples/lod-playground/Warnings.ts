import type { Model } from './Models.js';
import { simplifyFlags, type LevelSettings, type ModelSettings } from './Settings.js';
import { canUpdateVertices, getTriangles, type GeometryLOD } from './Simplification.js';

export interface Warning {
  /** Level the warning is about, or -1 for the whole model. */
  level: number;
  text: string;
  /** `data-key` of the inspector control that causes the warning. */
  field?: string;
}

export function getSettingsWarnings(modelSettings: ModelSettings, model: Model): Warning[] {
  const warnings: Warning[] = model.notes.map((text) => ({ level: -1, text }));
  const levels = modelSettings.levels;
  const hasProtectSeams = modelSettings.protectNormalSeams || modelSettings.protectUvSeams;

  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    const number = i + 1;
    const ignored = getIgnoredBySloppy(level);

    if (level.updateVertices && !canUpdateVertices(level, modelSettings)) warnings.push({ level: number, text: 'Update vertices needs compact vertices and no sloppy: it is ignored.', field: 'Update vertices' });
    if (level.sloppy && ignored.length > 0) warnings.push({ level: number, text: `Sloppy ignores ${ignored.join(', ')}.`, field: 'Sloppy' });
    if (level.sloppy) continue;
    if (level.regularize && level.regularizeLight) warnings.push({ level: number, text: 'Regularize and regularizeLight are both enabled: use only one of them.', field: 'flag:regularizeLight' });
    if (hasProtectSeams && !level.permissive) warnings.push({ level: number, text: 'Protect seams has no effect without permissive.', field: 'flag:permissive' });
  }

  if (modelSettings.vertices === 'compact' && model.morph !== null) {
    warnings.push({ level: -1, text: 'Compact vertices copy the morph targets into every level: more memory than shared or reordered.', field: 'Vertices:Compact' });
  }

  addThresholdOrderWarnings(modelSettings, levels, warnings);

  return warnings;
}

export function getResultWarnings(lod: GeometryLOD, used: boolean[], modelSettings: ModelSettings): Warning[] {
  const warnings: Warning[] = [];
  const levels = lod.levels;

  for (let i = 1; i < levels.length; i++) {
    if (getTriangles(levels[i].geometry) >= getTriangles(levels[i - 1].geometry)) warnings.push({ level: i, text: `Not simpler than level ${i - 1}.`, field: 'Error' });

    if (modelSettings.thresholdMode !== 'pixelError' || used[i - 1]) continue;

    const reason = levels[i].error === 0 ? 'its error is 0' : `its error is not larger than the error of the level before it`;

    warnings.push({ level: i, text: `Never used: ${reason}.`, field: 'Error' });
  }

  return warnings;
}

function getIgnoredBySloppy(level: LevelSettings): string[] {
  return simplifyFlags.filter((flag) => level[flag]);
}

function addThresholdOrderWarnings(modelSettings: ModelSettings, levels: LevelSettings[], warnings: Warning[]): void {
  if (modelSettings.thresholdMode === 'pixelError') return;

  const isScreenSize = modelSettings.thresholdMode === 'screenSize';
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

    warnings.push({ level: i + 1, text: `Never used: its ${threshold} must be ${order} the one of the previous used level.`, field: isScreenSize ? 'Screen size' : 'Distance' });
  }
}
