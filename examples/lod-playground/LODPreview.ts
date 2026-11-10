import { InstancedMesh2 } from '@three.ez/instanced-mesh';
import {
  type BufferGeometry,
  type Camera,
  CanvasTexture,
  Color,
  GridHelper,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type PerspectiveCamera,
  RepeatWrapping,
  type Scene,
  SRGBColorSpace,
  type Texture,
  Vector3
} from 'three';
import { isShadingAvailable, type Model } from './Models.js';
import { instanceSpacing, type Settings, type ShadingMode } from './Settings.js';
import { getTriangles, type GeometryLOD } from './Simplification.js';
import { randomClip } from './State.js';
import type { FieldLayout } from './Thresholds.js';

export interface PreviewStats {
  instancesPerLevel: Uint32Array;
  drawnTriangles: number;
  fullTriangles: number;
}

export interface DefaultView {
  position: Vector3;
  target: Vector3;
  far: number;
}

export interface PreviewInput {
  model: Model;
  lod: GeometryLOD;
  geometries: BufferGeometry[];
  thresholds: number[];
  used: boolean[];
  field: FieldLayout;
  settings: Settings;
  forcedLevel: number;
}

export const levelColors = ['#9aa3ad', '#4fd1a5', '#b78cff', '#e86fd0', '#a8d65a', '#3cc8d8', '#f59a7a', '#2fae8f', '#d3a6ff'];

const dimColor = new Color('#2c2f35');
const strongDim = 0.72;
const lightDim = 0.45;
const plainColor = new Color('#c4c7ce');
const noLevel = -1;
const uncolored = 254;
const checkerSize = 512;
const checkerCells = 8;
const clipSeed = 0.5;

/**
 * Returns the shading drawn for the model: `shading`, or clay when the model does not support it.
 */
export function getDrawnShading(model: Model, shading: ShadingMode): ShadingMode {
  return isShadingAvailable(model, shading) ? shading : 'clay';
}

export class LODPreview {
  onStats: ((stats: PreviewStats) => void) | null = null;
  private readonly scene: Scene;
  private readonly clayMaterial = new MeshStandardMaterial({ metalness: 0.05, roughness: 0.62 });
  private readonly uvMaterial = new MeshStandardMaterial({ map: createCheckerTexture(), metalness: 0, roughness: 0.8 });
  private readonly levelColors = levelColors.map((color) => new Color(color));
  private readonly dimmedColors = levelColors.map((color) => new Color(color).lerp(dimColor, strongDim));
  private readonly softColors = levelColors.map((color) => new Color(color).lerp(dimColor, lightDim));
  private readonly softPlainColor = plainColor.clone().lerp(dimColor, lightDim);
  private readonly whiteColors = [new Color('white'), new Color('white').lerp(dimColor, lightDim), new Color('white').lerp(dimColor, strongDim)];
  private material: Material = this.clayMaterial;
  private isClay = true;
  private environment: Texture | null = null;
  private readonly grid = new GridHelper(1, 1, '#33363d', '#202227');
  private readonly morphTarget = new Mesh();
  private meshes: InstancedMesh2[] = [];
  private input: PreviewInput | null = null;
  private levelMap: number[] = [];
  private instanceLevels = new Int8Array(0);
  private instanceColors = new Uint8Array(0);
  private phases = new Float32Array(0);
  private stats: PreviewStats = { instancesPerLevel: new Uint32Array(1), drawnTriangles: 0, fullTriangles: 0 };
  private colorByLevel = true;
  private highlightedLevel = noLevel;
  private isolate = false;
  private time = 0;
  private clip = randomClip;
  private getView: (camera: PerspectiveCamera) => DefaultView = getEmptyView;

  constructor(scene: Scene) {
    this.scene = scene;
    scene.add(this.grid);
  }

  get isAnimated(): boolean {
    return this.input !== null && (this.input.model.skin !== null || this.input.model.morph !== null);
  }

  build(input: PreviewInput): void {
    this.dispose();
    this.input = input;
    this.morphTarget.morphTargetInfluences = new Array<number>(input.model.morph?.targetsCount ?? 0).fill(0);

    const levelsCount = input.lod.levels.length;

    this.stats = { instancesPerLevel: new Uint32Array(levelsCount), drawnTriangles: 0, fullTriangles: 0 };
    this.material = this.getMaterial(input.model, getDrawnShading(input.model, input.settings.shading));
    this.isClay = this.material === this.clayMaterial;
    this.scene.environment = this.material === input.model.material ? this.environment : null;
    this.setMaterialShading(input.settings.flatShading || input.model.morph !== null);

    if (input.settings.layout === 'levels') this.buildLevelsLayout(input);
    else this.buildDistanceLayout(input);

    for (const mesh of this.meshes) this.scene.add(mesh);

    this.applyAnimation();
  }

  /**
   * Sets the environment map that lights the material of the model, so that its metallic and glossy parts reflect something.
   */
  setEnvironment(texture: Texture): void {
    this.environment = texture;
  }

  getDefaultView(camera: PerspectiveCamera): DefaultView {
    return this.getView(camera);
  }

  setColorByLevel(value: boolean): void {
    if (value === this.colorByLevel) return;

    this.colorByLevel = value;
    this.instanceColors.fill(uncolored);
  }

  /**
   * Dims the instances that do not draw `level`: lightly to mark the selection, strongly to isolate it. -1 dims nothing.
   */
  setHighlightedLevel(level: number, isolate: boolean): void {
    if (level === this.highlightedLevel && isolate === this.isolate) return;

    this.highlightedLevel = level;
    this.isolate = isolate;
    this.instanceColors.fill(uncolored);
  }

  setFlatShading(value: boolean): void {
    this.setMaterialShading(value || this.input?.model.morph != null);
  }

  setClip(clip: number): void {
    if (clip === this.clip) return;

    this.clip = clip;
    this.applyAnimation();
  }

  /**
   * Advances the animation clock of every instance by `delta` seconds.
   */
  advance(delta: number): void {
    this.time += delta;

    for (const mesh of this.meshes) {
      if (mesh.animationBake !== null) mesh.animationTime = this.time;
    }

    this.updateMorphs();
  }

  /**
   * Selects the instances and levels to draw. Call before each render: the meshes do not cull on their own.
   */
  cull(camera: Camera): void {
    this.resetStats();

    for (const mesh of this.meshes) mesh.performFrustumCulling(camera, camera);

    this.onStats?.(this.stats);
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.removeFromParent();

    this.meshes = [];
    this.input = null;
    this.instanceLevels = new Int8Array(0);
    this.instanceColors = new Uint8Array(0);
    this.phases = new Float32Array(0);
  }

  private buildDistanceLayout(input: PreviewInput): void {
    const { lod, geometries, thresholds, used, field, settings, forcedLevel } = input;
    const radius = lod.radius;
    const center = lod.levels[0].geometry.boundingSphere!.center;
    const positions = field.positions;
    const count = positions.length / 2;
    const isForced = forcedLevel >= 0;
    const mesh = this.createMesh(geometries[isForced ? forcedLevel : 0], count, settings.thresholdMode === 'distance');
    const levels = settings.models[settings.model].levels;

    this.levelMap = [isForced ? forcedLevel : 0];

    if (!isForced) {
      for (let i = 1; i < geometries.length; i++) {
        if (!used[i - 1]) continue;

        mesh.addLOD(geometries[i], this.material, thresholds[i - 1], levels[i - 1].hysteresis);
        this.levelMap.push(i);
      }
    }

    mesh.addInstances(count, (instance, id) => {
      instance.position.set(positions[id * 2] - center.x, 0, positions[id * 2 + 1] - center.z);
    });

    this.setupInstances(mesh, count, -1);
    this.meshes = [mesh];
    this.updateGrid(field.depth, radius);
    this.grid.visible = true;
    this.getView = () => getOverheadView(center.y, field);
  }

  private buildLevelsLayout(input: PreviewInput): void {
    const { lod, geometries } = input;
    const radius = lod.radius;
    const center = lod.levels[0].geometry.boundingSphere!.center;
    const spacing = radius * instanceSpacing;
    const count = geometries.length;

    this.levelMap = [];
    this.meshes = [];

    for (let level = 0; level < count; level++) {
      const mesh = this.createMesh(geometries[level], 1, false);

      mesh.addInstances(1, (instance) => {
        instance.position.set(getColumnX(level, count, spacing) - center.x, 0, -center.z);
      });

      this.setupInstances(mesh, 1, level);
      this.meshes.push(mesh);
    }

    this.grid.visible = true;
    this.grid.scale.setScalar(Math.max(count * spacing * 1.6, radius * 8));
    this.grid.position.set(0, 0, 0);
    this.getView = (camera) => getRowView(count * spacing, center.y, radius, camera);
  }

  private createMesh(geometry: BufferGeometry, capacity: number, useDistanceForLOD: boolean): InstancedMesh2 {
    const input = this.input!;
    const mesh = new InstancedMesh2(geometry, this.material, { capacity, useDistanceForLOD });
    const skin = input.model.skin;

    mesh.autoFrustumCulling = false;

    if (skin !== null) {
      mesh.initSkeleton(skin.skeleton, true, skin.bindMatrix);
      mesh.bindMode = skin.bindMode;
      mesh.setAnimationBake(skin.bake);
    }

    return mesh;
  }

  /**
   * Gives every instance a random animation phase and a color slot. `fixedLevel` is the level drawn by every instance of the mesh, or
   * -1 when the mesh picks it.
   */
  private setupInstances(mesh: InstancedMesh2, count: number, fixedLevel: number): void {
    const offset = this.instanceLevels.length;
    const levels = new Int8Array(offset + count).fill(fixedLevel);
    const colors = new Uint8Array(offset + count).fill(uncolored);
    const phases = new Float32Array(offset + count);

    levels.set(this.instanceLevels);
    phases.set(this.phases);

    for (let i = offset; i < offset + count; i++) phases[i] = random(i) * 10;

    this.instanceLevels = levels;
    this.instanceColors = colors;
    this.phases = phases;

    mesh.userData['offset'] = offset;
    mesh.onFrustumEnter = (id, _camera, _cameraLOD, lodIndex) => {
      const index = offset + id;
      const fixed = this.instanceLevels[index];
      const level = fixed >= 0 ? fixed : this.levelMap[lodIndex ?? 0];

      this.countInstance(level);
      this.updateInstanceColor(mesh, id, index, level);

      return true;
    };

    for (let id = 0; id < count; id++) mesh.setColorAt(id, plainColor);
  }

  private applyAnimation(): void {
    const input = this.input;

    if (input === null) return;

    const skin = input.model.skin;

    for (const mesh of this.meshes) {
      const offset = mesh.userData['offset'] as number;

      if (skin !== null) {
        const clipCount = skin.bake.clipCount;
        const fixedClip = Math.min(this.clip, clipCount - 1);

        mesh.animationTime = this.time;

        for (let id = 0; id < mesh.instancesCount; id++) {
          const index = offset + id;
          const clip = this.clip === randomClip ? Math.floor(random(index + clipSeed) * clipCount) : fixedClip;

          mesh.playAnimationAt(id, clip, this.phases[index] % skin.bake.getClipDuration(clip));
        }
      }
    }

    this.updateMorphs();
  }

  private updateMorphs(): void {
    const morph = this.input?.model.morph;

    if (morph == null) return;

    const influences = this.morphTarget.morphTargetInfluences!;

    for (const mesh of this.meshes) {
      const offset = mesh.userData['offset'] as number;

      for (let id = 0; id < mesh.instancesCount; id++) {
        const values = morph.interpolant.evaluate((this.time + this.phases[offset + id]) % morph.duration);

        for (let i = 0; i < influences.length; i++) influences[i] = values[i];

        mesh.setMorphAt(id, this.morphTarget);
      }
    }
  }

  private countInstance(level: number): void {
    const levels = this.input!.geometries;

    this.stats.instancesPerLevel[level]++;
    this.stats.drawnTriangles += getTriangles(levels[level]);
    this.stats.fullTriangles += getTriangles(levels[0]);
  }

  private updateInstanceColor(mesh: InstancedMesh2, id: number, index: number, level: number): void {
    const isDimmed = this.highlightedLevel !== noLevel && level !== this.highlightedLevel;
    const dim = isDimmed ? (this.isolate ? 2 : 1) : 0;
    const byLevel = this.colorByLevel && this.isClay;
    const slot = byLevel ? level * 3 + dim : dim;

    if (this.instanceColors[index] === slot) return;

    this.instanceColors[index] = slot;
    mesh.setColorAt(id, byLevel ? this.getLevelColor(level, dim) : this.isClay ? this.getPlainColor(dim) : this.whiteColors[dim]);
  }

  private getMaterial(model: Model, shading: ShadingMode): Material {
    if (shading === 'material') return model.material;
    if (shading === 'texture') return model.textureMaterial!;
    if (shading === 'clay') return this.clayMaterial;

    this.uvMaterial.side = model.material.side;

    return this.uvMaterial;
  }

  private getLevelColor(level: number, dim: number): Color {
    const index = level % this.levelColors.length;

    return dim === 2 ? this.dimmedColors[index] : dim === 1 ? this.softColors[index] : this.levelColors[index];
  }

  private getPlainColor(dim: number): Color {
    return dim === 2 ? dimColor : dim === 1 ? this.softPlainColor : plainColor;
  }

  private setMaterialShading(flatShading: boolean): void {
    const material = this.material as Material & { flatShading?: boolean };

    if (material.flatShading === flatShading) return;

    material.flatShading = flatShading;
    material.needsUpdate = true;
  }

  private resetStats(): void {
    this.stats.instancesPerLevel.fill(0);
    this.stats.drawnTriangles = 0;
    this.stats.fullTriangles = 0;
  }

  private updateGrid(depth: number, radius: number): void {
    const size = Math.max(depth * 2.2, radius * 12);

    this.grid.scale.setScalar(size);
    this.grid.position.set(0, 0, -size / 2 + radius * 4);
  }
}

/**
 * Places the camera above the start of the lanes, at the height and pitch of the row layout, so that every row is in view.
 */
function getOverheadView(centerY: number, field: FieldLayout): DefaultView {
  const height = centerY + field.height;

  return {
    position: new Vector3(0, height, 0),
    target: new Vector3(0, centerY, -field.height / Math.tan(field.pitch)),
    far: Math.hypot(field.depth, height) * 2
  };
}

function getRowView(width: number, centerY: number, radius: number, camera: PerspectiveCamera): DefaultView {
  const tanHalfFov = Math.tan((camera.fov * Math.PI) / 360);
  const distance = Math.max(radius * 1.3 / tanHalfFov, width / 2 / (tanHalfFov * camera.aspect)) * 1.1 + radius;

  return {
    position: new Vector3(0, centerY + radius * 0.35, distance),
    target: new Vector3(0, centerY, 0),
    far: distance * 6
  };
}

/**
 * Draws a checker of 8 × 8 labeled cells, hue along U, for glTF texture coordinates (no vertical flip).
 */
function createCheckerTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  const cell = checkerSize / checkerCells;

  canvas.width = checkerSize;
  canvas.height = checkerSize;
  context.font = `600 ${cell * 0.3}px ui-monospace, monospace`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 2;
  context.strokeStyle = 'rgba(0, 0, 0, 0.35)';

  for (let y = 0; y < checkerCells; y++) {
    for (let x = 0; x < checkerCells; x++) {
      const isLight = (x + y) % 2 === 0;

      context.fillStyle = `hsl(${(x / checkerCells) * 300} 55% ${isLight ? 68 : 40}%)`;
      context.fillRect(x * cell, y * cell, cell, cell);
      context.strokeRect(x * cell, y * cell, cell, cell);
      context.fillStyle = isLight ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.85)';
      context.fillText(`${String.fromCharCode(65 + x)}${y + 1}`, (x + 0.5) * cell, (y + 0.5) * cell);
    }
  }

  const texture = new CanvasTexture(canvas);

  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.flipY = false;
  texture.anisotropy = 8;

  return texture;
}

function getEmptyView(): DefaultView {
  return { position: new Vector3(0, 0, 10), target: new Vector3(), far: 100 };
}

function getColumnX(column: number, columns: number, spacing: number): number {
  return (column - (columns - 1) / 2) * spacing;
}

function random(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;

  return value - Math.floor(value);
}
