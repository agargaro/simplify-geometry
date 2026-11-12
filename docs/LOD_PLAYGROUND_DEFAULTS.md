# LOD playground: default levels and switch thresholds

How the playground computes the default levels of a model and the switch points of the Auto mode, and every approach tried on the way,
with the measurements that kept or rejected it. Measured on 2026-11-12 with meshoptimizer through `@three.ez/simplify-geometry`.

## Final design

- **Flags**: `prune`, `regularize` and `permissive` on every level. No seam protection, relative errors (`errorAbsolute` off).
- **Levels** ([DefaultLevels.ts](../examples/lod-playground/DefaultLevels.ts)): up to 5. Level *i* starts from the error `0.002, 0.005, 0.01,
  0.02, 0.05` at *i*, or 1.5× the meshoptimizer error of the previous level if larger. The error is then raised by ×1.25 until the level has
  at least 1.5× fewer triangles than the previous one and at least one triangle. Levels stop when no error up to the whole mesh size makes
  one simpler. There is always at least one level. No ratio is set.
- **Add level** uses the same function, starting from the triangles and the error of the last level shown, and keeps its flags.
- **When**: the levels are computed when a model is first shown (`levelsPending` placeholder flag), on Reset, and on import of a file
  without levels.
- **Auto switching** uses the error returned by meshoptimizer, in the playground and in the generated code (`lods[i].error`).
- **Max error (px)** defaults to 0.8.

Result in a 534 px tall viewport, measured at 0.6 px and scaled to 0.8 px (the switch screen size is proportional to Max error):

| model | level | triangles | error | switches at (screen) |
|---|---|---|---|---|
| Imp (15 232) | L1 | 9 442 | 0.25% | 87% |
| | L2 | 4 195 | 0.50% | 43% |
| | L3 | 1 450 | 1.00% | 21% |
| | L4 | 443 | 2.0% | 11% |
| | L5 | 58 | 4.9% | 4.4% |
| Puglin (7 528) | L1 | 4 138 | 0.49% | 39% |
| | L5 | 68 | 4.9% | 3.9% |
| Horse (984) | L1 | 598 | 0.75% | 29% |
| | L5 | 36 | 5.0% | 4.5% |

## Test set

27 glTF models from 208 to 135k triangles: the playground models (Imp, Puglin, Horse), three.js examples (Flamingo, Parrot, Stork,
Soldier, Xbot, Michelle, readyplayer.me, DragonAttenuation, BoomBox, coffeeMug, AnisotropyBarnLamp, SheenChair, ShaderBall,
PrimaryIonDrive, steampunk_camera, dungeon_warkarma, collision-world, facecap, DispersionTest), the instanced-mesh trees and
low_poly_space_ship, and UAL1_Standard. Draco models were skipped, because the benchmark ran in Node without a Draco decoder.
Simplification used the same meshoptimizer calls as the playground, on positions only, keeping the attribute seams of the index.

## Approaches

### 1. Fixed error schedule (rejected)

The first defaults had 4 levels with errors 0.002, 0.005, 0.01 and 0.02, `prune` on all of them and `regularize` and `permissive` from 0.01.

The same error gives very different reductions (prune + regularize + permissive):

| model | triangles | 0.002 | 0.005 | 0.01 | 0.02 | 0.05 | 0.1 |
|---|---|---|---|---|---|---|---|
| Xbot | 49k | 2.6× | 10× | 33× | 110× | 1116× | empty |
| Imp | 15k | 1.4× | 3.6× | 10× | 34× | 262× | empty |
| Horse | 984 | 1.0× | 1.3× | 2.1× | 4.9× | 27× | 123× |
| tree | 208 | 1.0× | 1.0× | 1.1× | 1.1× | 2.7× | 9× |
| space ship | 280 | 1.0× | 1.0× | 1.1× | 1.4× | 4.7× | 16× |

Low poly models got 4 levels almost equal to the source; dense ones were emptied by `prune` from 0.05–0.1.

Flag findings:

- `permissive` is needed: without it seams lock many models. DragonAttenuation stops at 4.2× and DispersionTest at 5.2× at any error,
  PrimaryIonDrive reaches 1.1× at 0.01, and the tree and the space ship stay at 1×.
- `regularize` removes fewer triangles at the same error (Imp at 0.002: 2.3× → 1.4×), which the later steps compensate.
- Protecting UV seams made hard-surface models much worse (steampunk_camera levels used only below 7 px) and made the forced ratio
  collapse the mesh (see 2). Left off.

### 2. Error with a forced ratio (rejected)

When the scheduled error did not remove 1.5× the triangles of the previous level, the level was simplified to half the previous triangles
with `ratio` and error 1. Up to 5 levels, stopping at 100 triangles, with a 100-triangle ratio floor on error levels.

- With protected seams, error 1 + `prune` emptied meshes that cannot simplify: dungeon_warkarma went to 48 triangles and the space ship
  to 0. Without protection it never happened on the 27 models.
- The levels with a forced ratio popped visibly more. The ratio itself was not the cause (see 3): those levels came from low poly models,
  where the meshoptimizer error is least reliable, and made larger jumps.

### 3. Measuring the real error (finding)

The two-sided distance between level and source, sampled on the surfaces, compared with the error returned by meshoptimizer:

| model | level | meshoptimizer | measured max | ratio |
|---|---|---|---|---|
| Horse | error 0.0098 | 0.0098 | 0.018 | 1.9× |
| Horse | error 0.03 | 0.030 | 0.176 | 5.9× |
| Flamingo | error 0.025 | 0.025 | 0.315 | 12.7× |
| Parrot | error 0.0097 | 0.0097 | 0.021 | 2.2× |
| space ship | error 0.027 | 0.027 | 0.079 | 3.0× |

- At equal meshoptimizer error, ratio and error levels have similar ratios (Horse 1.4× vs 1.9×, Flamingo 7.9× vs 5.6×).
- `prune` changes nothing; without `regularize` the ratio grows a lot (Parrot 2.2× → 28×).

### 4. Error raised in steps (kept)

Instead of a forced ratio, the error is raised by ×1.25 until the level is 1.5× simpler. Levels stay defined by an error, with smaller
steps and lower errors: Horse L1 has 598 triangles at 0.0075 instead of 490 at 0.0098 with the ratio. This is the final selection.

### 5. Dropping a fifth level of 100 triangles or fewer (rejected)

The fifth level was dropped when it had at most 100 triangles, and levels stopped at 100 triangles. Rejected: Imp's level of about 100
triangles looks fine at the distance where it is used, and the 100-triangle ratio floor is gone with it.

### 6. Auto thresholds from the measured maximum distance (rejected)

The playground measured the maximum distance of each level (a triangle grid with early exit; validated against brute force on 5 models;
93 ms on Imp, 334 ms on DragonAttenuation for 5 levels) and used it for the Auto thresholds, writing the values as constants in the
generated code. Max error (px) was raised from 0.7 to 1.25 to put Imp L1 at about 67% of the screen.

Two levels with the same measured error made the second one never used (Horse L2 and L3, both 0.0419), so a level whose measured error
did not grow replaced the previous one. Then Imp's L2 and L3 switched at 15% and 13%: the maximum grows in steps, because one isolated
point decides it. Imp, % of the mesh size:

| triangles | meshoptimizer | max | p99 | p95 | mean |
|---|---|---|---|---|---|
| 5 996 | 0.39 | 0.74 | 0.37 | 0.25 | 0.06 |
| 4 341 | 0.49 | 2.27 | 1.30 | 0.73 | 0.16 |
| 2 366 | 0.75 | 2.53 | 1.59 | 1.01 | 0.26 |
| 1 117 | 1.20 | 3.02 | 1.86 | 1.36 | 0.46 |
| 351 | 2.26 | 7.62 | 5.43 | 3.03 | 1.10 |

The maximum barely moves from 4.3k to 1.1k triangles, while the 95th percentile and the mean grow 2–3×, which is the visible
difference. The meshoptimizer error follows the 95th percentile (0.7–1×) and grows smoothly.

A selection of levels on the curve of the measured maximum (cheapest level within 2× the smallest reachable error, at least 1.5× above the
previous one) was prototyped and dropped, because it relied on the maximum.

### 7. Back to the meshoptimizer error (kept)

Auto thresholds and generated code use the meshoptimizer error again, which also keeps the generated code free of constants. With it,
Max error 1.25 would put Imp L1 beyond 100% of the screen; 0.6 puts it at 65%, and the levels switch at about half the size of the
previous one (65%, 32%, 16%, 8.2%).

The 534 px playground pane is shorter than a typical app viewport, and the generated code uses the real viewport height, where the same
budget switches later (0.6 px puts Imp L1 at about 32% in a 1080 px viewport). The default became 0.8 px: Imp L1 at about 87% in the
pane and 43% in a 1080 px viewport. 0.7, 0.75 and 1 px (about 54% at 1080 px) were also tried.

### 8. 95th percentile as a check (rejected)

The 95th percentile of the measured distance was shown per level, computed 300 ms after a change (290 ms on Imp, 560 ms on
DragonAttenuation, at most 50 000 samples per direction). A warning appeared above 2× the meshoptimizer error, and the default levels
stopped before such a level. It caught only collapsed levels, like Horse at 98 triangles (95th percentile 15% against 3.1%). Removed, to
keep the meshoptimizer error as the only criterion: the extra measure cost time and only removed the last level of a few models.

## Notes

- The switch screen size is proportional to Max error (px) and inversely proportional to the viewport height, so the same budget gives
  smaller percentages in a taller window.
- Saved settings keep their levels: Reset recomputes them for the shown model.
