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
