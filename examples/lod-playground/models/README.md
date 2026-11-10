# LOD playground models

| File | Model | Author | License |
| --- | --- | --- | --- |
| `imp.glb` | Imp, Bestiary pack | [Quaternius](https://quaternius.com) | CC0 |
| `puglin.glb` | Puglin, Bestiary pack | [Quaternius](https://quaternius.com) | CC0 |
| `horse.glb` | Horse, from the [three.js examples](https://threejs.org/examples/#webgl_morphtargets_horse) | [mirada](https://mirada.com/), from [ROME](http://www.ro.me) | as distributed with three.js |

The animations of `imp.glb` and `puglin.glb` (`Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`, `Dance_Loop`) come from the
Universal Animation Library by [Quaternius](https://quaternius.com) (CC0).

`horse.glb` is copied unchanged from `three.js/examples/models/gltf/Horse.glb`: 15 morph targets and one morph animation.

`imp.glb` and `puglin.glb` were created from the models and the animation library used by the instanced-mesh showcase with:

```sh
node examples/lod-playground/models/convert.mjs <Model>.glb UAL1_Standard.glb <model>.glb Idle_Loop Walk_Loop Jog_Fwd_Loop Dance_Loop
```

The script merges the skinned parts into one mesh (position, normal, uv, joints, weights), drops materials and textures,
and retargets the clips onto the rig: bone rotations, and the pelvis translation scaled by the ratio of the pelvis heights.

The material is then copied from the KTX2-compressed versions of the same models (from the instanced-mesh WebGPU
experiment), which keep the same UVs at a fraction of the size of the PNG textures:

```sh
node examples/lod-playground/models/add-material.mjs <model>.glb <Model-ktx2>.glb <model>.glb
```

The playground decodes KTX2 textures (and Draco geometry in opened files) with the decoders of three.js 0.186.1 from jsDelivr.
