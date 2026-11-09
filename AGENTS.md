# Project guidelines

`@three.ez/simplify-geometry` simplifies three.js `BufferGeometry` and generates LOD levels with [meshoptimizer](https://github.com/zeux/meshoptimizer). Priorities: correctness, performance, usability.

Read [docs/CODE_STYLE.md](docs/CODE_STYLE.md) before writing or reviewing code in `src/`.

## Workflow

- Stop after analysis and wait for approval. Public API changes and material incompatibilities always need agreement first.
- Before a PR run `npm run check`. Report failing or unavailable checks honestly.

## Rules

- The source geometry is never mutated: simplification returns new geometries and index buffers.
- Every unsupported input (non-indexed geometry, groups, unsupported attribute layouts) fails with an explicit error, never with a silently wrong result.

## Performance

Write `src/` for the best V8 optimization. ESLint already enforces the loop style and bans `delete`, `arguments`, `in` and `instanceof`.

- Loops over vertices and indices: no closures, avoidable allocations, spread, destructuring or object/array literals.
- Use typed arrays for numeric data. Keep plain arrays to one element kind (SMI, double or object).
- Never claim a speedup without a before/after measurement on the affected path.

## Conventions

- English for code and docs. No comments except API JSDoc and `/** @internal */`; no `TODO`s, open an issue instead.
- Never commit, push or publish without explicit authorization.
