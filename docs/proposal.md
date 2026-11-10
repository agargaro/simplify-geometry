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

## Remeshing and normal generation (experimental)

meshoptimizer 1.3 adds two experimental features that are deferred until their APIs are stable.

- `MeshoptSimplifier.remesh(indices, positions, stride, resolution, flags?)` rebuilds the surface on a voxel grid (`resolution` from 4 to 256, flags `Shell` and `Solve`). It returns a non-indexed triangle soup with positions only (9 floats per triangle): the attributes are lost, so the library would need to weld the vertices, rebuild the index and decide how to handle normals and UVs. It is not documented in the meshoptimizer README yet.
- `MeshoptTangents.generateNormals(indices, positions, stride, creaseAngle, smoothing?)` computes normals from positions, splitting hard edges above the crease angle. It returns one normal per triangle corner, so applying it requires de-indexing the mesh or splitting the vertices with different normals. It lives in the separate `meshoptimizer/tangents` module, so using it adds a second WebAssembly module to the bundle.

Possible uses: `remesh` for the coarsest LOD levels of meshes that simplification cannot reduce, and `generateNormals` to rebuild the normals of remeshed or heavily simplified levels. The same module also provides `generateTangents`, which has the same per-corner output.

## Cascaded LOD generation

Today every LOD level is simplified from the source geometry.

Proposal: optionally simplify each level from the previous one.

- Faster, and with `updateVertices` it needs much less memory, because each level copies only the vertices of the previous level instead of the whole source.
- Trade-off: errors accumulate across levels, so the error returned for a level is no longer measured against the source.

## Per-level compact vertices

Today `vertices` applies to every level: `reordered` and `shared` share one vertex buffer, `compact` gives every level its own. `updateVertices` requires `compact`, so using it on one coarse level forces every level to copy its vertices.

Proposal: a per-level `vertices: 'compact'` in `SimplifyGeometryLevelParams`, valid with `vertices: 'reordered'` or `'shared'`. The compact levels get their own vertex buffer and can use `updateVertices`; the other levels keep sharing the buffer, reordered only on their index arrays.

- The shared buffer keeps the size of the source, because level 0 uses every vertex: each compact level only adds its own vertices.
- Measured with the default playground levels (errors 0.005, 0.01, 0.02, 0.04), compact uses 1.3 to 2.6 times the memory of reordered: Imp 1.45 MB against 0.77 MB, Puglin 0.49 MB against 0.31 MB, Horse 0.49 MB against 0.19 MB because it copies the morph targets into every level.
- With error-limited levels, `updateVertices` did not change the triangle count or the returned error on these models, so the gain is visual only and must be verified before changing the API.
- A compact level cannot be drawn by a `BatchedMesh` that expects one shared vertex buffer.
