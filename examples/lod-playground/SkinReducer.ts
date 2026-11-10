import { reduceSkinInfluences, type ReducedSkinInfluences } from '@three.ez/instanced-mesh';
import type { BufferGeometry } from 'three';
import type { SkinData } from './Models.js';

const maxInfluences = 4;

interface LevelReductions {
  results: (ReducedSkinInfluences | null)[];
  lowerBounds: Float64Array;
}

/**
 * Caches `reduceSkinInfluences` for the levels of one LOD. Every call fixes the error of the count it returns and tells that every
 * smaller count exceeds the tolerance, so later tolerances are often answered without measuring the poses again.
 */
export class SkinReducer {
  private readonly geometries: BufferGeometry[];
  private readonly skin: SkinData;
  private readonly levels: LevelReductions[] = [];

  constructor(geometries: BufferGeometry[], skin: SkinData) {
    this.geometries = geometries;
    this.skin = skin;
  }

  reduce(level: number, tolerance: number): ReducedSkinInfluences {
    const reductions = this.getLevel(level);

    for (let count = 1; count < maxInfluences; count++) {
      const result = reductions.results[count - 1];

      if (result !== null) {
        if (result.error <= tolerance) return result;
        continue;
      }

      if (tolerance > reductions.lowerBounds[count - 1]) return this.measure(level, reductions, tolerance);
    }

    return reductions.results[maxInfluences - 1] ?? this.measure(level, reductions, tolerance);
  }

  dispose(): void {
    for (const reductions of this.levels as (LevelReductions | undefined)[]) {
      if (reductions === undefined) continue;

      for (const result of reductions.results) result?.geometry.dispose();
    }

    this.levels.length = 0;
  }

  private getLevel(level: number): LevelReductions {
    let reductions = this.levels[level] as LevelReductions | undefined;

    if (reductions === undefined) {
      reductions = { results: new Array<ReducedSkinInfluences | null>(maxInfluences).fill(null), lowerBounds: new Float64Array(maxInfluences).fill(-Infinity) };
      this.levels[level] = reductions;
    }

    return reductions;
  }

  private measure(level: number, reductions: LevelReductions, tolerance: number): ReducedSkinInfluences {
    const result = reduceSkinInfluences(this.geometries[level], this.skin.bake, { error: tolerance, bindMatrix: this.skin.bindMatrix });
    const count = result.error <= tolerance ? result.influences : maxInfluences;

    for (let i = 0; i < count - 1; i++) reductions.lowerBounds[i] = Math.max(reductions.lowerBounds[i], tolerance);

    const cached = reductions.results[count - 1];

    if (cached !== null) {
      result.geometry.dispose();

      return cached;
    }

    reductions.results[count - 1] = result;

    return result;
  }
}
