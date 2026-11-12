import { InstancedMesh2 } from '@three.ez/instanced-mesh';
import {
  type BufferGeometry,
  type Camera,
  CanvasTexture,
  Color,
  GridHelper,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type PerspectiveCamera,
  RepeatWrapping,
  type Scene,
  SRGBColorSpace,
  type Texture,
  Vector3
} from 'three';
import { isShadingAvailable, type Model } from './Models.js';
import { getModelSettings, instanceSpacing, type Settings, type ShadingMode } from './Settings.js';
import { getTriangles, type GeometryLOD } from './Simplification.js';
import { randomClip } from './State.js';
import { getSwitchScreenSize, type FieldLayout } from './Thresholds.js';

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

/**
 * A switch between two levels in the Transitions layout.
 */
export interface PreviewTransition {
  from: number;
  to: number;
  /** Size on screen of the switch, as a fraction of the viewport height. */
  screenSize: number;
  /** Top of the bounding spheres of the switch, where its label goes. */
  anchor: Vector3;
  /** Center of the bounding spheres of the switch, where the camera looks when the switch is focused. */
  center: Vector3;
}

export const levelColors = ['#9aa3ad', '#4fd1a5', '#b78cff', '#e86fd0', '#a8d65a', '#3cc8d8', '#f59a7a', '#2fae8f', '#d3a6ff'];

const dimColor = new Color('#2c2f35');
const strongDim = 0.72;
const plainColor = new Color('#c4c7ce');
const noLevel = -1;
const uncolored = 254;
const checkerSize = 512;
const checkerCells = 8;
const clipSeed = 0.5;
const gridDivisions: [number, number] = [8, 160];
const farScale = 8;
/** Camera distance of the Transitions layout, in mesh radii: the levels are scaled to their switch size at this distance. */
const transitionDistance = 10;
/** Gap between the two levels of a switch, as a fraction of their size. */
const pairGap = 0.12;
/** Gap between two switches, as a fraction of the size of the next one and of the view height. */
const transitionGap: [number, number] = [0.35, 0.04];
/** Smallest distance between the centers of two switches, as a fraction of the view height, so that their labels do not overlap. */
const minTransitionSpacing = 0.24;
/** Angle above the horizon of the Transitions camera, enough for the orbit controls to accept it. */
const transitionPitch = 0.03;
/** Time each level of a switch stays on screen in the Flip view, in milliseconds. */
const flipPeriod = 600;
const transitionSeed = 1000;

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
  private readonly wireframeMaterial = new MeshBasicMaterial({ wireframe: true });
  private readonly levelColors = levelColors.map((color) => new Color(color));
  private readonly dimmedColors = levelColors.map((color) => new Color(color).lerp(dimColor, strongDim));
  private readonly whiteColors = [new Color('white'), new Color('white').lerp(dimColor, strongDim)];
  private material: Material = this.clayMaterial;
  private isClay = true;
  private environment: Texture | null = null;
  private grid = createGrid(gridDivisions[0]);
  private readonly morphTarget = new Mesh();
  private meshes: InstancedMesh2[] = [];
  private input: PreviewInput | null = null;
  private levelMap: number[] = [];
  private instanceLevels = new Int8Array(0);
  private instanceColors = new Uint8Array(0);
  private phases = new Float32Array(0);
  private seeds = new Float32Array(0);
  private transitionsList: PreviewTransition[] = [];
  private focusLevel = 1;
  private isFlip = false;
  private flipPhase = 0;
  private stats: PreviewStats = { instancesPerLevel: new Uint32Array(1), drawnTriangles: 0, fullTriangles: 0 };
  private colorByLevel = true;
  private highlightedLevel = noLevel;
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
    this.isClay = this.material === this.clayMaterial || this.material === this.wireframeMaterial;
    this.scene.environment = input.settings.environment && this.material === input.model.material ? this.environment : null;
    this.setMaterialShading(input.settings.flatShading || input.model.morph !== null);

    if (input.settings.layout === 'levels') this.buildLevelsLayout(input);
    else if (input.settings.layout === 'transitions') this.buildTransitionsLayout(input);
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

  /**
   * The switches shown by the Transitions layout, empty in the other layouts.
   */
  get transitions(): readonly PreviewTransition[] {
    return this.transitionsList;
  }

  /**
   * Index in `transitions` of the switch that the default view of the Transitions layout centers, -1 without switches.
   */
  get focusedTransition(): number {
    const transitions = this.transitionsList;

    for (let i = 0; i < transitions.length; i++) {
      if (transitions[i].to >= this.focusLevel) return i;
    }

    return transitions.length - 1;
  }

  /**
   * Sets the level whose switch the default view of the Transitions layout centers. Returns whether that switch changed.
   */
  setFocusLevel(level: number): boolean {
    const previous = this.focusedTransition;

    this.focusLevel = level;

    return this.focusedTransition !== previous;
  }

  /**
   * Alternates the two levels of every switch in the Flip view, with `time` in milliseconds. Returns whether the drawn levels changed.
   */
  updateFlip(time: number): boolean {
    if (!this.isFlip) return false;

    const phase = Math.floor(time / flipPeriod) % 2;

    if (phase === this.flipPhase) return false;

    this.setFlipPhase(phase);

    return true;
  }

  setColorByLevel(value: boolean): void {
    if (value === this.colorByLevel) return;

    this.colorByLevel = value;
    this.instanceColors.fill(uncolored);
  }

  /**
   * Dims the instances that do not draw `level`. -1 dims nothing.
   */
  setHighlightedLevel(level: number): void {
    if (level === this.highlightedLevel) return;

    this.highlightedLevel = level;
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

    for (const mesh of this.meshes) {
      if (mesh.visible) mesh.performFrustumCulling(camera, camera);
    }

    this.onStats?.(this.stats);
  }

  dispose(): void {
    for (const mesh of this.meshes) mesh.removeFromParent();

    this.meshes = [];
    this.input = null;
    this.instanceLevels = new Int8Array(0);
    this.instanceColors = new Uint8Array(0);
    this.phases = new Float32Array(0);
    this.seeds = new Float32Array(0);
    this.transitionsList = [];
    this.isFlip = false;
  }

  private buildDistanceLayout(input: PreviewInput): void {
    const { lod, geometries, thresholds, used, field, settings, forcedLevel } = input;
    const radius = lod.radius;
    const center = lod.levels[0].geometry.boundingSphere!.center;
    const positions = field.positions;
    const count = positions.length / 2;
    const isForced = forcedLevel >= 0;
    const mesh = this.createMesh(geometries[isForced ? forcedLevel : 0], count, getModelSettings(settings).thresholdMode === 'distance');
    const levels = getModelSettings(settings).levels;

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

    const size = Math.max(field.depth * 2.2, radius * 12);

    this.setGrid(size, radius * settings.spread, -size / 2 + radius * 4);
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

    this.setGrid(Math.max(count * spacing * 1.6, radius * 8), radius, 0);
    this.getView = (camera) => getRowView(count * spacing, center.y, radius, camera);
  }

  /**
   * Shows every switch between two used levels, with both levels scaled so that, seen from `transitionDistance` radii, they are as tall
   * on screen as when the switch happens. The switches stand in a row, from the first one, the largest, to the last one.
   */
  private buildTransitionsLayout(input: PreviewInput): void {
    const { lod, settings } = input;
    const distance = lod.radius * transitionDistance;
    const viewHeight = 2 * distance * Math.tan((settings.fov * Math.PI) / 360);
    const isFlip = settings.transitionView === 'flip';
    const transitions = getTransitionList(input);
    const sizes = transitions.map((transition) => transition.screenSize * viewHeight);
    const widths = sizes.map((size) => (isFlip ? size : size * (2 + pairGap)));
    let x = 0;

    for (let i = 0; i < sizes.length; i++) x += widths[i] + (i === 0 ? 0 : getTransitionGap(sizes[i], widths[i - 1] + widths[i], viewHeight));

    const totalWidth = x;

    this.levelMap = [];
    this.meshes = [];
    this.transitionsList = transitions;
    this.isFlip = isFlip;
    x = -totalWidth / 2;

    for (let i = 0; i < transitions.length; i++) {
      if (i > 0) x += getTransitionGap(sizes[i], widths[i - 1] + widths[i], viewHeight);

      this.addTransition(input, transitions[i], x + widths[i] / 2, sizes[i], isFlip ? 0 : sizes[i] * (1 + pairGap) / 2, i);
      x += widths[i];
    }

    if (isFlip) this.setFlipPhase(0);

    this.setGrid(Math.max(totalWidth * 1.4, viewHeight * 3), viewHeight / 10, 0);
    this.getView = () => getTransitionView(this.transitionsList.at(this.focusedTransition) ?? null, distance, Math.max(totalWidth, distance));
  }

  /**
   * Adds the two levels of `transition` around `x`, `offset` apart from it, with diameter `size`, and places its label and focus point.
   */
  private addTransition(input: PreviewInput, transition: PreviewTransition, x: number, size: number, offset: number, index: number): void {
    const center = input.lod.levels[0].geometry.boundingSphere!.center;
    const scale = size / (2 * input.lod.radius);
    const centerY = center.y * scale;

    this.addTransitionLevel(input.geometries[transition.from], transition.from, x - offset - center.x * scale, -center.z * scale, scale, index);
    this.addTransitionLevel(input.geometries[transition.to], transition.to, x + offset - center.x * scale, -center.z * scale, scale, index);
    transition.center.set(x, centerY, 0);
    transition.anchor.set(x, centerY + size / 2, 0);
  }

  private addTransitionLevel(geometry: BufferGeometry, level: number, x: number, z: number, scale: number, index: number): void {
    const mesh = this.createMesh(geometry, 1, false);

    mesh.addInstances(1, (instance) => {
      instance.position.set(x, 0, z);
      instance.scale.setScalar(scale);
    });

    this.setupInstances(mesh, 1, level, transitionSeed + index);
    this.meshes.push(mesh);
  }

  /**
   * Shows the finer level of every switch for phase 0 and the coarser one for phase 1: the meshes alternate between the two.
   */
  private setFlipPhase(phase: number): void {
    this.flipPhase = phase;

    for (let i = 0; i < this.meshes.length; i++) this.meshes[i].visible = i % 2 === phase;
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
   * Gives every instance a random animation phase and clip, from consecutive seeds starting at `seed`, and a color slot. Instances with the
   * same seed play the same animation in sync. `fixedLevel` is the level drawn by every instance of the mesh, or -1 when the mesh picks
   * it.
   */
  private setupInstances(mesh: InstancedMesh2, count: number, fixedLevel: number, seed = this.instanceLevels.length): void {
    const offset = this.instanceLevels.length;
    const levels = new Int8Array(offset + count).fill(fixedLevel);
    const colors = new Uint8Array(offset + count).fill(uncolored);
    const phases = new Float32Array(offset + count);
    const seeds = new Float32Array(offset + count);

    levels.set(this.instanceLevels);
    phases.set(this.phases);
    seeds.set(this.seeds);

    for (let i = offset; i < offset + count; i++) {
      seeds[i] = seed + i - offset;
      phases[i] = random(seeds[i]) * 10;
    }

    this.instanceLevels = levels;
    this.instanceColors = colors;
    this.phases = phases;
    this.seeds = seeds;

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
          const clip = this.clip === randomClip ? Math.floor(random(this.seeds[index] + clipSeed) * clipCount) : fixedClip;

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
    const dim = this.highlightedLevel !== noLevel && level !== this.highlightedLevel ? 1 : 0;
    const byLevel = this.colorByLevel && this.isClay && !this.isFlip;
    const slot = byLevel ? level * 2 + dim : dim;

    if (this.instanceColors[index] === slot) return;

    this.instanceColors[index] = slot;
    mesh.setColorAt(id, byLevel ? this.getLevelColor(level, dim) : this.isClay ? this.getPlainColor(dim) : this.whiteColors[dim]);
  }

  private getMaterial(model: Model, shading: ShadingMode): Material {
    if (shading === 'material') return model.material;
    if (shading === 'texture') return model.textureMaterial!;
    if (shading === 'clay') return this.clayMaterial;
    if (shading === 'wireframe') return this.wireframeMaterial;

    this.uvMaterial.side = model.material.side;

    return this.uvMaterial;
  }

  private getLevelColor(level: number, dim: number): Color {
    const index = level % this.levelColors.length;

    return dim === 1 ? this.dimmedColors[index] : this.levelColors[index];
  }

  private getPlainColor(dim: number): Color {
    return dim === 1 ? dimColor : plainColor;
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

  /**
   * Shows a ground grid `size` wide centered at `z`, with cells close to `cellSize`, rebuilding it when its division count changes.
   */
  private setGrid(size: number, cellSize: number, z: number): void {
    const divisions = Math.min(Math.max(Math.round(size / cellSize), gridDivisions[0]), gridDivisions[1]);

    if (divisions !== this.grid.userData['divisions']) {
      this.scene.remove(this.grid);
      this.grid.dispose();
      this.grid = createGrid(divisions);
      this.scene.add(this.grid);
    }

    this.grid.visible = true;
    this.grid.scale.setScalar(size);
    this.grid.position.set(0, 0, z);
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
    far: Math.hypot(field.depth, height) * farScale
  };
}

function getRowView(width: number, centerY: number, radius: number, camera: PerspectiveCamera): DefaultView {
  const tanHalfFov = Math.tan((camera.fov * Math.PI) / 360);
  const distance = Math.max(radius * 1.3 / tanHalfFov, width / 2 / (tanHalfFov * camera.aspect)) * 1.1 + radius;

  return {
    position: new Vector3(0, centerY + radius * 0.35, distance),
    target: new Vector3(0, centerY, 0),
    far: distance * farScale * 4
  };
}

/**
 * Returns the switches between consecutive used levels, with their size on screen. The positions are set when the layout places them.
 */
function getTransitionList(input: PreviewInput): PreviewTransition[] {
  const { lod, thresholds, used, settings } = input;
  const modelSettings = getModelSettings(settings);
  const transitions: PreviewTransition[] = [];
  let from = 0;

  for (let to = 1; to < lod.levels.length; to++) {
    if (!used[to - 1]) continue;

    const screenSize = getSwitchScreenSize(thresholds[to - 1], lod.radius, modelSettings, settings.fov);

    transitions.push({ from, to, screenSize, anchor: new Vector3(), center: new Vector3() });
    from = to;
  }

  return transitions;
}

/**
 * Returns the gap before a switch of diameter `size`, with `widths` the widths of the switch and of the previous one: proportional to the
 * size, and enough to keep the centers of two small switches far apart for their labels.
 */
function getTransitionGap(size: number, widths: number, viewHeight: number): number {
  return Math.max(size * transitionGap[0] + viewHeight * transitionGap[1], viewHeight * minTransitionSpacing - widths / 2);
}

/**
 * Places the camera `distance` in front of the focused switch, slightly above it, so that every switch has its real size on screen.
 */
function getTransitionView(focus: PreviewTransition | null, distance: number, width: number): DefaultView {
  const target = focus === null ? new Vector3() : focus.center.clone();
  const position = new Vector3(target.x, target.y + distance * Math.sin(transitionPitch), distance * Math.cos(transitionPitch));

  return { position, target, far: Math.max(width, distance) * farScale };
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

function createGrid(divisions: number): GridHelper {
  const grid = new GridHelper(1, divisions, '#3a3d45', '#24262c');

  grid.userData['divisions'] = divisions;

  return grid;
}

function random(seed: number): number {
  const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;

  return value - Math.floor(value);
}
