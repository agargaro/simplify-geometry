import type { SimplifyFlag } from './Settings.js';

export const flagDescriptions: Record<SimplifyFlag, string> = {
  lockBorder: 'Keeps the vertices on the open border of the mesh in place, so that separate parts can be stitched together without gaps.',
  sparse: 'Faster when the indices cover only a small part of the vertices. The error becomes relative to that part, so prefer absolute error.',
  prune: 'Removes small separate pieces of the mesh, like buttons or eyes, once they are smaller than the error of the level. Usually gives fewer triangles with no visible loss.',
  regularize: 'Keeps the triangles more even in size and shape, so the level deforms better under skinning and morphing. Removes a few fewer triangles at the same error.',
  regularizeLight: 'A milder regularize: more even triangles with a smaller cost in triangles. Use only one of the two.',
  permissive: 'Also simplifies across seams, the edges where vertices are split by hard normals or UV islands. Removes many more triangles, but textures and hard edges can distort: Protect seams limits it.',
  preserveFolds: 'Experimental: tries to keep sharp folds of the surface, where neighboring triangles face opposite directions. Slightly slower.'
};

export const descriptions = {
  model: 'The mesh to simplify. Imp and Puglin are skinned and play baked clips; Horse animates 15 morph targets. Every file you open gets its own tab.',
  openFolder: 'Opens every model of a folder and its subfolders, each in its own tab. Buffers and textures the models reference are read from the same folder, also from other subfolders.',
  removeModel: 'Removes this model and its levels. A sample model stays removed after a reload until you restore it; a file must be opened again.',
  restoreModels: 'Restores the removed sample models (Imp, Puglin, Horse).',
  openModel: 'Opens one or more model files (.glb, .gltf, .fbx, .dae, .obj, .stl, .ply), each in its own tab; you can also drop files or folders on the viewport. Skinned meshes play their clips, morph targets their morph animation. Several meshes are merged into one geometry; the Warnings tab lists every change.',
  play: 'Plays or pauses the animation of every instance. Each instance starts at a different time.',
  undo: 'Undoes the last change of this model (Ctrl+Z). Every model keeps its own history.',
  redo: 'Redoes the last undone change of this model (Ctrl+Shift+Z or Ctrl+Y).',
  measureBuild: 'Simplifies every level from scratch, without the cache of the preview, and reports the time.',
  memory: 'Memory of the drawn levels, uploaded to the GPU as is. Shared vertex buffers count once.',
  codeTs: 'Code that builds an InstancedMesh2 with these levels and switch points.',
  codeJson: 'The parameters of simplifyGeometryLOD and the switch points as JSON, to load them in your own code.',
  clip: 'The baked clip played by every instance. Random gives every instance one of the clips.',
  import: 'Loads a configuration saved with Export.',
  export: 'Saves the current configuration as a JSON file.',
  vertices: 'How the levels store their vertices. Reordered: one vertex buffer for all levels, sorted so that simpler levels use its first part (least memory). Shared: one vertex buffer in the source order. Compact: every level keeps only the vertices it uses. A BatchedMesh needs Shared or Reordered.',
  errorAbsolute: 'Measures the errors in model units (for example meters) instead of as a fraction of the mesh size.',
  protectNormalSeams: 'With permissive, keeps hard edges (vertices with the same position but different normals): their vertices can only slide along the edge.',
  protectUvSeams: 'With permissive, keeps the edges of UV islands, so textures do not stretch across them: their vertices can only slide along the edge.',
  thresholdMode: 'How InstancedMesh2 picks the level of each instance. Auto computes the switch points from the error of each level; the manual modes take them from each level.',
  modePixelError: 'Auto: each level is used once its error, seen on screen, is smaller than Max error (px). The switch points follow the levels and the height of the viewport.',
  modeScreenSize: 'Manual · screen size: each level sets how small the instance must be on screen (its height as a fraction of the viewport height) to use it.',
  modeDistance: 'Manual · distance: each level sets the camera distance, in model units, from which it is used. It ignores the field of view and the viewport size.',
  pixelError: 'How many pixels the shape may change on screen when an instance switches to a simpler level. Lower keeps detailed levels longer; higher switches sooner and draws fewer triangles. Pixels are CSS pixels, the unit of the page: on high density displays one is 2 or more physical pixels.',
  ratio: 'Target share of the source triangles, for example 0.25 for a quarter. 0 means no target, so only the error limits the simplification. With both, it stops at the first one reached: to reach the ratio, raise the error.',
  error: 'How far the simplified surface may move from the source, as a fraction of the mesh size (the largest side of its bounding box): 0.01 is 1%. Higher removes more triangles. In model units with Absolute error.',
  sloppy: 'Uses a faster, rougher simplifier that can also merge separate pieces. It ignores seams, borders and flags, so it suits only far levels.',
  updateVertices: 'Moves the remaining vertices to follow the source surface more closely. Needs Compact vertices and does not work with sloppy.',
  screenSize: 'Uses this level when the instance is at most this tall on screen, as a fraction of the viewport height: 1 fills the whole height.',
  distance: 'Uses this level from this camera distance, in model units.',
  hysteresis: 'Margin that keeps an instance on this level a little longer before it switches back, as a fraction of the switch point (0.1 is 10%). Stops instances near a switch point from flickering between two levels.',
  flags: 'meshoptimizer options for this level. Flags enabled on every level are written once in the shared params of the code.',
  previousLevel: 'Selects the finer level before this one (Arrow Up in the levels list).',
  nextLevel: 'Selects the coarser level after this one (Arrow Down in the levels list).',
  addLevel: 'Adds a simpler level after the last one, with the smallest error that gives at least 1.5 times fewer triangles. It keeps the flags of the last level.',
  removeLevel: 'Removes the last level.',
  layout: 'Crowd scatters the instances on the ground, from close to the camera to far away, and lets InstancedMesh2 pick the level of each one. Side by side shows every level next to the others. Transitions shows every switch between two levels at the size on screen where it happens, to judge the popping.',
  transitionView: 'How each switch is compared, always at its real size on screen.',
  previousTransition: 'Moves the camera to the previous switch, a larger one.',
  nextTransition: 'Moves the camera to the next switch, a smaller one.',
  realSize: 'Every switch is as tall on screen as when it happens in a scene. The camera is locked so that it stays so: use the arrows to move from one switch to another.',
  transitionPair: 'Shows the two levels of each switch next to each other.',
  transitionFlip: 'Alternates the two levels of each switch in the same place, as the switch would look in a scene. Color by level is off here, so that only the shape changes.',
  shading: 'How the instances are drawn. Options the model does not support are disabled.',
  shadingClay: 'A plain gray material, to judge the silhouette and the shading of each level.',
  shadingUv: 'A checker grid on the UVs, to spot stretched, flipped or broken texture coordinates in the simplified levels.',
  shadingMaterial: 'The material of the model, with all its textures, as it would appear in a scene.',
  shadingTexture: 'Only the base color texture of the model (or its vertex colors), with plain lighting.',
  shadingWireframe: 'The edges of every triangle, to compare the topology of the levels. Color by level works here too.',
  environment: 'Lights the material of the model with an environment map, so that its metallic and glossy parts reflect something. Only with the Material shading.',
  github: 'Opens the repository on GitHub. A star helps other developers find it.',
  about: 'Credits of the library and of the sample models.',
  npm: 'Opens the @three.ez/simplify-geometry package on npm.',
  resetSettings: 'Recomputes the default levels of this model and restores its simplification, level switching and the preview settings. The other models keep theirs. Undo brings them back.',
  colorByLevel: 'Colors every instance with the color of the level it draws. Only with the clay shading.',
  isolate: 'Dims every instance that does not draw the selected level. Hovering a level in the list or the timeline does the same while the pointer stays on it.',
  flatShading: 'Shades every triangle flat, to show the triangles of each level. Always on for the horse, which has no morphed normals.',
  forcedLevel: 'Draws every instance with this level instead of the one InstancedMesh2 picks.',
  resetCamera: 'Moves the camera back to the default view of the current layout.',
  levelTriangles: 'Triangles of the level.',
  levelShare: 'Triangles of the level as a share of the source triangles.',
  levelInstances: 'Instances drawn with the level in the current frame.',
  drawn: 'Triangles drawn in the current frame, against drawing every visible instance with level 0.',
  gpuTime: 'Time the GPU spends drawing a frame, averaged over the last 30 frames drawn and updated every 10 frames. The viewport draws only when something changes, so when still it is the time of the last frame.',
  fps: 'Frames drawn per second, updated every 10 frames. The browser caps it at the refresh rate of the display. Idle when nothing changes, because the viewport then stops drawing.',
  gpuTimeUnavailable: 'This browser does not expose EXT_disjoint_timer_query_webgl2, which measures the GPU time. Chrome and Edge on desktop do.',
  levelError: 'Error of the level as estimated by meshoptimizer: roughly how far its surface is from the source, as a share of the mesh size (in model units with Absolute error). Auto switching uses it. It is an estimate: thin parts can move more.',
  levelBuildTime: 'Time to simplify this level alone, measured by Measure build time. The levels together take less than the sum, because they share the preparation of the source.',
  levelResult: 'Triangles of the simplified level, and their share of the source triangles.',
  levelResultError: 'Error reached by meshoptimizer, out of the Error target of the level. Auto switching uses the error reached.',
  levelStop: 'Simplification stops at the first limit it meets: the triangles asked by Ratio, or the next collapse exceeding the Error target. When the error reached stays well below the target, locked borders, seams or the topology left no edge to collapse.',
  levelSwitch: 'Where instances switch to this level: from this camera distance, in model units, which is when the instance is at most this tall on screen, as a share of the viewport height.',
  fov: 'Vertical field of view of the camera. A wider view makes the instances smaller on screen, so in Auto and screen size modes they switch levels at shorter distances.',
  instances: 'Number of instances in the Crowd layout.',
  spread: 'Smallest gap between two instances in the Crowd layout, in radii of the mesh bounding sphere.'
} as const;

/**
 * Shows the `data-tooltip` text of the hovered or focused element under or above it.
 */
export function initTooltips(tooltip: HTMLElement): void {
  let owner: HTMLElement | null = null;

  const show = (element: HTMLElement | null): void => {
    if (element === owner) return;

    owner?.removeAttribute('aria-describedby');
    owner = element;
    tooltip.hidden = element === null;

    if (element === null) return;

    element.setAttribute('aria-describedby', tooltip.id);
    placeTooltip(tooltip, element);
  };

  document.addEventListener('pointerover', (event) => {
    show(getOwner(event.target));
  });
  document.addEventListener('focusin', (event) => {
    show(getOwner(event.target));
  });
  document.addEventListener('focusout', () => {
    show(null);
  });
  document.addEventListener('pointerdown', () => {
    show(null);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') show(null);
  });
}

function getOwner(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;

  return target.closest<HTMLElement>('[data-tooltip]');
}

function placeTooltip(tooltip: HTMLElement, element: HTMLElement): void {
  const rect = element.getBoundingClientRect();

  tooltip.textContent = element.dataset['tooltip'] ?? '';

  const shortcut = element.dataset['shortcut'];

  if (shortcut !== undefined) {
    const line = document.createElement('span');

    line.className = 'tooltip-shortcut';
    line.textContent = 'Shortcut';

    for (const key of shortcut.split(' ')) {
      const cap = document.createElement('kbd');

      cap.className = 'keycap';
      cap.textContent = key;
      line.append(cap);
    }

    tooltip.append(line);
  }

  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  const left = Math.min(Math.max(rect.left, 8), window.innerWidth - width - 8);
  const below = rect.bottom + 6;
  const top = below + height > window.innerHeight - 8 ? rect.top - height - 6 : below;

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(top, 8)}px`;
}
