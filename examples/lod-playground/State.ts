import type { Model } from './Models.js';
import type { GeometryLOD } from './Simplification.js';
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

/** Value of `ViewState.clip` that gives every instance a random clip. */
export const randomClip = -1;

/**
 * Result of the last update, shared by every panel.
 */
export interface Snapshot {
  model: Model;
  lod: GeometryLOD;
  thresholds: number[];
  used: boolean[];
  field: FieldLayout;
  fov: number;
  warnings: Warning[];
}
