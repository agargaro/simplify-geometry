# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

three.js developers on desktop who use `@three.ez/simplify-geometry` to build LOD levels for a single mesh drawn with
`@three.ez/instanced-mesh` (`InstancedMesh2`). In the LOD playground they tune the levels, check them on many instances at
real switch distances, and copy the generated code into their project.

## Product Purpose

`@three.ez/simplify-geometry` simplifies three.js `BufferGeometry` and generates LOD levels with meshoptimizer.
The LOD playground (`index.html`, the GitHub Pages homepage) makes the parameters tangible: success means the developer
leaves with levels that look right at the distances where they switch, and with code that reproduces them.

## Operating Context

- Static page built with Vite, deployed to GitHub Pages from master.
- Three bundled models: Imp and Puglin (skinned, animated clips) and Horse (morph targets).
- Settings live in the URL hash and can be exported/imported as JSON.
- The generated code targets `InstancedMesh2`; a BatchedMesh works one mesh at a time only with shared or reordered vertices.

## Capabilities and Constraints

- Priorities of the library: correctness, performance, usability.
- Every simplification parameter of the library is exposed per level or for all levels; every control has a tooltip.
- LOD switch by pixel error (derived from the measured error), manual screen size or manual distance, with hysteresis.
- The source geometry is never mutated; unsupported input fails with an explicit error.

## Brand Commitments

None: the visual design is free (confirmed by the maintainer on 2026-11-10).

## Evidence on Hand

Model credits in `examples/lod-playground/models/README.md`. No testimonials, benchmarks or usage numbers exist.

## Product Principles

- Show the truth of each level: triangles, measured error and where it switches, never a flattering approximation.
- The 3D preview is the evidence; controls serve it and never hide it.
- Generated code must reproduce exactly what the preview shows.
