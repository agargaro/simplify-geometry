# Proposals

Ideas agreed to be evaluated later. Each one needs an analysis and approval before implementation.

## Draw range support

Today a geometry with a non-default `drawRange` is rejected with an explicit error, because the range refers to the source index and would be meaningless on the simplified one.

Proposal: simplify only the triangles inside `drawRange` and ignore the rest.

- `start` and `count` must be aligned to whole triangles.
- The result uses the default draw range, because its new index only contains the simplified triangles.
- Trade-off: the user can no longer change the draw range on the result.

## Morph target preservation

Today simplification only considers the base positions and the weighted `attributes`. Morph targets are remapped correctly, but they do not influence which edges collapse, so a simplified mesh can deform badly when a target is active.

Proposal: allow weighting morph targets, for example by packing the deltas between each morph attribute and its base attribute (`morph.position - position`) as attributes for `simplifyWithAttributes`.

- Needs a parameter to choose the morph targets and their weights.
- The packed components count toward the meshoptimizer limit of 32 attribute components.

## Direction attributes renormalization

With `updateVertices`, the updated attributes are interpolated, so unit vectors get shorter or longer. Today only the attributes named `normal` and `tangent` are renormalized, because three.js uses those names for its normals and tangents. Direction attributes with other names, for example custom normals for a shader, keep a wrong length.

Proposal: find a way to identify direction attributes without relying on the name, for example a parameter listing the attributes to renormalize.

## Standalone pruning

meshoptimizer `simplifyPrune` removes isolated components smaller than an error threshold without simplifying the rest of the mesh. The `prune` flag cannot replace it: it removes components only while simplifying. On a sphere of 3968 triangles with 800 triangles of floating debris, `simplifyPrune` with error 0.01 removed exactly the debris; the flag with ratio 1 removed nothing, and with ratio 0 it also simplified the sphere (262 triangles at error 0.01).

Proposal: expose it as `simplifyPrune` for arrays and `pruneGeometry` for geometries.

- It is mesh cleanup rather than simplification, mostly useful for 3D scans and isosurfaces, so it is deferred until there is demand.
- meshoptimizer does not return the achieved error, so `pruneGeometry` would return the geometry only.

## Point cloud simplification

meshoptimizer `simplifyPoints` simplifies point clouds rendered with `THREE.Points`, optionally preserving colors. On 500,000 points it kept 49,442 points for ratio 0.1 in 55-82 ms, and 4,745 points for ratio 0.01 in 37 ms; it stops slightly below the requested count.

Proposal: expose it as `simplifyPoints(srcPositionArray, { ratio, optimizeMemory? }, srcColorArray?, colorWeight?)` and `simplifyPointsGeometry(geometry, { ratio, colorWeight?, vertices? })`.

- Only non-indexed geometries, with an explicit error otherwise.
- Colors from the `color` attribute, also normalized `Uint8`, using the RGB components.
- `compact` returns a non-indexed geometry with the kept points; `shared` adds an index and shares the attributes.
- `compactMesh` requires triangle indices, so the remap must be built by the library.
- meshoptimizer does not return an error. LOD generation for point clouds can come later.

## Cascaded LOD generation

Today every LOD level is simplified from the source geometry.

Proposal: optionally simplify each level from the previous one.

- Faster, and with `updateVertices` it needs much less memory, because each level copies only the vertices of the previous level instead of the whole source.
- Trade-off: errors accumulate across levels, so the error returned for a level is no longer measured against the source.
