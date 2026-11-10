---
version: 1
slug: "lod-playground-html"
primary_target: "lod-playground.html"
related_targets: ["examples/lod-playground"]
---

Scope: lod-playground.html, the single-mesh LOD playground. Visitor mode: Operate.

Audience and job: three.js developers on desktop tuning LOD levels of one mesh (Imp, Puglin, Horse) for InstancedMesh2, checking them at real switch distances, copying the code.

## Direction contract

THESIS: The playground is a captured frame. Each LOD level is a draw you inspect (triangles, error, switch) in a dense event list docked beside the viewport. It refuses the floating GUI over a three.js canvas.

OWN-WORLD: Docked graphite panels, 1px splitters, no cards, no radius above 3px. System UI text, monospace tabular numerals. One blue selection, one amber warning; level colours appear only as event markers and timeline bars.

STORY: Pick a model, step through levels, see viewport and timeline answer, tune the selected level in the inspector, copy the code.

FIRST VIEWPORT: 36px toolbar (name, model tabs, animation, import/export/link). Left dock: Levels event list. Centre: viewport, full height. Right dock: inspector. Under the viewport: Distance timeline, Code and Warnings tabs. Signature: selecting a level selects it in list, viewport, timeline and inspector.

FORM: GPU frame debugger, pick card (position 1), seed 40caf3f4.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
