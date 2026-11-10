import type { SimplifyFlag } from './Settings.js';

export const flagDescriptions: Record<SimplifyFlag, string> = {
  lockBorder: 'Keeps the vertices on the open border of the mesh in place, so that separate parts can be stitched together without gaps.',
  sparse: 'Faster when the indices cover only a small part of the vertices. The error becomes relative to that part, so prefer absolute error.',
  prune: 'Removes small disconnected parts of the mesh while simplifying, regardless of the topology inside them. Usually improves quality and triangle count.',
  regularize: 'Produces more regular triangle sizes and shapes, at some cost to geometric and attribute quality. Helps under deformation such as skinning.',
  regularizeLight: 'Like regularize, with a smaller cost to geometric and attribute quality. Use only one of the two.',
  permissive: 'Allows collapses across attribute seams (hard normals, UV islands) for a stronger reduction. Protect seams keeps the selected seams.',
  preserveFolds: 'Experimental: tries to keep the fold lines between triangles that face opposite directions, at a small performance cost.'
};

export const descriptions = {
  model: 'The mesh to simplify. Imp and Puglin are skinned and play baked clips; Horse animates 15 morph targets. A file you open gets its own tab.',
  openModel: 'Opens a .glb file, or drop one on the viewport. Skinned meshes play their clips, morph targets their morph animation. Several meshes are merged into one geometry; the Warnings tab lists every change.',
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
  vertices: 'How the levels store their vertices. Reordered shares one vertex buffer sorted so that coarser levels use a prefix; shared keeps the source order; compact gives every level only the vertices it uses. A BatchedMesh works only with shared or reordered.',
  errorAbsolute: 'Measures the error limits and the results in model units instead of a fraction of the mesh size.',
  protectNormalSeams: 'Keeps the vertices on hard edges (same position, different normals) in place. Works only on levels with permissive.',
  protectUvSeams: 'Keeps the vertices on UV seams in place. Works only on levels with permissive.',
  thresholdMode: 'How InstancedMesh2 picks the level of each instance. Auto computes the switch points from the measured error of the levels; the manual modes take them from each level.',
  modePixelError: 'Auto: each level is drawn from where its measured error shrinks below Max error pixels on screen. The switch points follow the levels.',
  modeScreenSize: 'Manual · screen space: each level sets the screen size (instance height / view height) under which it is drawn.',
  modeDistance: 'Manual: each level sets the camera distance, in model units, from which it is drawn.',
  pixelError: 'Largest error, in CSS pixels on screen, that a level may show before a finer level is used.',
  ratio: 'Target fraction of the triangles of level 0. 0 means no target: only the error stops the simplification. With both, it stops at the first one reached; to aim at the ratio alone, raise the error.',
  error: 'Largest error allowed for this level, as a fraction of the mesh size (in model units with absolute error).',
  sloppy: 'Uses the faster sloppy simplifier. It can merge disconnected parts but ignores seams, borders and flags. Good for far levels.',
  updateVertices: 'Moves the remaining vertices to better approximate the source surface. Needs compact vertices and is not available with sloppy.',
  screenSize: 'Uses this level when the projected diameter of the instance is at most this fraction of the viewport height.',
  distance: 'Uses this level from this camera distance, in model units.',
  hysteresis: 'Fraction of the switch point that relaxes it while an instance already uses this level, so instances near the switch do not flicker between levels.',
  flags: 'meshoptimizer options for this level. Flags enabled on every level go once into the shared params of the code.',
  previousLevel: 'Selects the finer level before this one (Arrow Up in the levels list).',
  nextLevel: 'Selects the coarser level after this one (Arrow Down in the levels list).',
  addLevel: 'Adds a coarser level after the last one, copying its flags.',
  removeLevel: 'Removes the last level.',
  layout: 'Crowd scatters the instances on the ground, from close to the camera to far away, and lets InstancedMesh2 pick the level of each one. Side by side shows every level next to the others.',
  shading: 'How the instances are drawn. Options the model does not support are disabled.',
  shadingClay: 'A plain gray material, to judge the silhouette and the shading of each level.',
  shadingUv: 'A checker grid on the UVs, to spot stretched, flipped or broken texture coordinates in the simplified levels.',
  shadingMaterial: 'The material of the model, with all its textures, as it would appear in a scene.',
  shadingTexture: 'Only the base color texture of the model (or its vertex colors), with plain lighting.',
  shadingWireframe: 'The edges of every triangle, to compare the topology of the levels. Color by level works here too.',
  environment: 'Lights the material of the model with an environment map, so that its metallic and glossy parts reflect something. Only with the Material shading.',
  github: 'Opens the repository on GitHub. A star helps other developers find it.',
  npm: 'Opens the @three.ez/simplify-geometry package on npm.',
  resetSettings: 'Restores every setting to its default. Undo brings them back.',
  colorByLevel: 'Colors every instance with the color of the level it draws. Only with the clay shading.',
  isolate: 'Dims every instance that does not draw the selected level. Hovering a level in the list or the timeline does the same while the pointer stays on it.',
  flatShading: 'Shades every triangle flat, to show the triangles of each level. Always on for the horse, which has no morphed normals.',
  forcedLevel: 'Draws every instance with this level instead of the one InstancedMesh2 picks.',
  resetCamera: 'Moves the camera back to the default view of the current layout.',
  levelTriangles: 'Triangles of the level and their share of level 0.',
  levelError: 'Geometric error measured by meshoptimizer for the level: how far its surface may be from the source, as a share of the mesh size (in model units with absolute error).',
  levelSwitch: 'Where instances start drawing this level: when the camera is at least this far, in model units, that is when the instance (its bounding sphere) fills at most this share of the view height.',
  fov: 'Vertical field of view of the camera. It changes the screen size of the instances at each distance, so the auto switch distances too.',
  instances: 'Instances scattered by the distance layout.',
  spread: 'Smallest distance between two instances of the distance layout, in radii of the mesh bounding sphere.'
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

  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  const left = Math.min(Math.max(rect.left, 8), window.innerWidth - width - 8);
  const below = rect.bottom + 6;
  const top = below + height > window.innerHeight - 8 ? rect.top - height - 6 : below;

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${Math.max(top, 8)}px`;
}
