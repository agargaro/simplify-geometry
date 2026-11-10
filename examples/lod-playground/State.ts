import type { Model } from './Models.js';
import type { DrawLevels, GeometryLOD } from './Simplification.js';
import type { FieldLayout } from './Thresholds.js';
import type { Warning } from './Warnings.js';

export interface ViewState {
  selectedLevel: number;
  hoveredLevel: number;
  isolate: boolean;
  forcedLevel: number;
  playing: boolean;
  clip: number;
}

/**
 * Result of the last update, shared by every panel.
 */
export interface Snapshot {
  model: Model;
  lod: GeometryLOD;
  draw: DrawLevels;
  thresholds: number[];
  used: boolean[];
  field: FieldLayout;
  fov: number;
  warnings: Warning[];
}
