<div align="center">

  <h1>Three.ez - Simplify geometry</h1>
  <p>
    <em>Simplify your <b>three.js</b> application development with <b>three.ez</b>!</em>
  </p>

  <p>
    <a href="https://www.npmjs.com/package/@three.ez/simplify-geometry"><img src="https://img.shields.io/npm/v/@three.ez/simplify-geometry" alt="npm version"></a>
    <a href="https://github.com/agargaro/simplify-geometry/actions/workflows/quality.yml"><img src="https://github.com/agargaro/simplify-geometry/actions/workflows/quality.yml/badge.svg" alt="Quality"></a>
    <a href="LICENSE"><img src="https://img.shields.io/npm/l/@three.ez/simplify-geometry" alt="MIT license"></a>
  </p>

</div>

Simplify three.js `BufferGeometry` and generate LOD levels with [meshoptimizer](https://github.com/zeux/meshoptimizer).

**[Try the LOD playground](https://agargaro.github.io/simplify-geometry/)**

- Returns new geometries: the source geometry is never mutated.
- Generates several LOD levels in one call, optionally sharing the vertex data.
- Preserves attributes (normals, UVs, colors, ...) through per-attribute weights, and can protect seams.
- Fails with an explicit error on unsupported input, never with a silently wrong result.

## Installation

```bash
npm install @three.ez/simplify-geometry three
```

Requires `three >= 0.159.0` and Node.js `>= 22.18.0` for development tooling. The package is ESM only.

## Quick start

meshoptimizer is WebAssembly: wait for `simplifyReady()` once before the first call.

```ts
import { simplifyGeometry, simplifyReady } from '@three.ez/simplify-geometry';

await simplifyReady();

const { geometry, error } = simplifyGeometry(source, { ratio: 0.25 });

mesh.geometry = geometry;
```

### LOD levels

`simplifyGeometryLOD` returns an array of results: index `0` is the source geometry (error `0`), followed by one result for each level.

```ts
import { simplifyGeometryLOD, simplifyReady } from '@three.ez/simplify-geometry';

await simplifyReady();

const levels = simplifyGeometryLOD(
  source,
  [{ ratio: 0.5 }, { ratio: 0.25 }, { ratio: 0.1 }],
  { vertices: 'shared', attributes: { normal: 1, uv: 1 } }
);

const lod = new LOD();
levels.forEach(({ geometry }, i) => lod.addLevel(new Mesh(geometry, material), i * 50));
```

Parameters passed as the third argument are shared by all levels; the ones of a single level override them.

### Preserving attributes

`attributes` maps an attribute name to a weight (a number, or one number per component). Attributes with a higher weight are preserved more; attributes without a positive weight are ignored by the simplifier.

```ts
simplifyGeometry(source, {
  ratio: 0.3,
  attributes: { normal: 1, uv: 1 },
  protectSeams: ['uv'],
  permissive: true,
  updateVertices: true
});
```

## API

### `simplifyReady(): Promise<void>`

Loads the WebAssembly module. Call and await it before any other function.

### `simplifyGeometry(geometry, params): SimplifyGeometryResult`

Simplifies a geometry to a single level. Returns `{ geometry, error }`.

### `simplifyGeometryLOD(geometry, levels, params?): SimplifyGeometryResult[]`

Simplifies a geometry to many levels. Returns `[{ geometry, error: 0 }, ...levels]`.

### Parameters

Every level needs `ratio` or `error`.

| Parameter | Description |
| --- | --- |
| `ratio` | Target fraction of the source indices to keep. |
| `error` | Maximum allowed error. Relative to the mesh extents unless `errorAbsolute` is set. |
| `errorAbsolute` | Interprets `error` as an absolute value. |
| `lockBorder` | Keeps the border vertices of the mesh in place. |
| `sparse`, `prune`, `regularize`, `regularizeLight`, `permissive`, `preserveFolds`, `errorClamped` | meshoptimizer simplification flags. |
| `vertexLock` | `Uint8Array` that locks individual vertices. |
| `sloppy` | Uses `simplifySloppy`: faster and able to merge disconnected parts, but it ignores seams, borders and attributes. Supports only `ratio`, `error`, `errorAbsolute`, `vertexLock` and `optimizeMemory`. Default `false`. |
| `optimizeMemory` | Uses the smallest index type that fits the vertex count. Default `true`. |
| `attributes` | `AttributeWeights`: weights of the attributes to preserve. |
| `protectSeams` | Attribute names whose seams are protected. Only effective with `permissive`. |
| `updateVertices` | Moves the remaining vertices to better approximate the source surface. Requires `vertices: 'compact'`. Bounding box and sphere are reset to `null`. Default `false`. |
| `vertices` | How the vertex data of the result is built (see below). |

For the exact meaning of the flags see the [meshoptimizer documentation](https://github.com/zeux/meshoptimizer#simplification).

### Vertex modes

| `vertices` | Description |
| --- | --- |
| `'compact'` (default) | Each level owns a compact vertex buffer with only the vertices it uses. |
| `'shared'` | Each level only has a new index and reuses the source vertex buffers. |
| `'reordered'` (LOD only) | Vertices are reordered once and shared by all levels. Level `0` is a new geometry, not the source. |

### Low-level functions

Work directly on typed arrays, without a `BufferGeometry`:

- `simplify(indexArray, positionArray, params, attributes?)`: returns `[indexArray, error]`.
- `getScale(positionArray)`: returns the scale used to turn a relative error into an absolute one.
- `generatePositionRemap(positionArray)`: maps each vertex to the first one with the same position. Vertices sharing a position but not their attributes lie on a seam.

## Limitations

The following inputs throw an explicit error:

- non-indexed geometries;
- geometries with groups or a custom draw range;
- a missing, interleaved, instanced or non-`Float32Array` `position` attribute;
- weighted attributes that are missing, instanced or `Float16BufferAttribute`;
- attributes or morph attributes whose count does not match the position count;
- `updateVertices` together with `sloppy` or a vertex mode other than `'compact'`.

Morph targets are not updated by `updateVertices`: absolute morph targets keep the source positions.
