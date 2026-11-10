---
name: LOD playground
description: Docked graphite workbench for tuning the LOD levels of one mesh, read like a GPU frame capture.
colors:
  graphite-bg: "#0e0f11"
  viewport: "#121316"
  panel: "#17181b"
  panel-raised: "#1d1f23"
  panel-pressed: "#24262b"
  line: "#2a2d33"
  line-soft: "#222429"
  line-strong: "#3a3e46"
  text: "#d7d9de"
  muted: "#8b909a"
  faint: "#5d626c"
  selection-blue: "#7aa2ff"
  selection-blue-bg: "rgba(122, 162, 255, 0.14)"
  selection-blue-line: "rgba(122, 162, 255, 0.45)"
  warning-amber: "#e6b450"
  warning-amber-bg: "rgba(230, 180, 80, 0.1)"
  danger: "#f0707a"
  level-0: "#9aa3ad"
  level-1: "#4fd1a5"
  level-2: "#b78cff"
  level-3: "#e86fd0"
  level-4: "#a8d65a"
  level-5: "#3cc8d8"
  level-6: "#f59a7a"
  level-7: "#2fae8f"
  level-8: "#d3a6ff"
typography:
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tnum"
  caption:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
  value:
    fontFamily: "ui-monospace, 'Cascadia Mono', 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tnum"
  code:
    fontFamily: "ui-monospace, 'Cascadia Mono', 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "11.5px"
    fontWeight: 400
    lineHeight: 1.6
  label-mono:
    fontFamily: "ui-monospace, 'Cascadia Mono', 'SF Mono', Menlo, Consolas, monospace"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: "15px"
rounded:
  marker: "1px"
  control: "2px"
  button: "3px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
components:
  control:
    height: "22px"
  tool-button:
    textColor: "{colors.muted}"
    rounded: "{rounded.button}"
    padding: "0 8px"
    height: "24px"
  tool-button-hover:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.text}"
  icon-button:
    textColor: "{colors.muted}"
    rounded: "{rounded.button}"
    size: "24px"
  chip:
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "0 8px"
    height: "22px"
  chip-pressed:
    backgroundColor: "{colors.selection-blue-bg}"
    textColor: "{colors.text}"
  flag-chip:
    textColor: "{colors.muted}"
    typography: "{typography.value}"
    rounded: "{rounded.control}"
    padding: "0 7px"
    height: "22px"
  flag-chip-checked:
    backgroundColor: "{colors.selection-blue-bg}"
    textColor: "{colors.text}"
  number-input:
    backgroundColor: "{colors.graphite-bg}"
    typography: "{typography.value}"
    rounded: "{rounded.control}"
    padding: "0 6px"
    height: "22px"
  select:
    backgroundColor: "{colors.graphite-bg}"
    typography: "{typography.value}"
    rounded: "{rounded.control}"
    padding: "0 22px 0 7px"
    height: "22px"
  segmented:
    backgroundColor: "{colors.graphite-bg}"
    rounded: "{rounded.button}"
  segment-pressed:
    backgroundColor: "{colors.panel-pressed}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 9px"
  level-row:
    textColor: "{colors.text}"
    padding: "9px 12px"
  level-row-selected:
    backgroundColor: "{colors.selection-blue-bg}"
  tab-selected:
    backgroundColor: "{colors.panel-raised}"
    textColor: "{colors.text}"
    padding: "0 12px"
  section-title:
    backgroundColor: "{colors.panel-raised}"
    typography: "{typography.title}"
    padding: "0 12px"
    height: "30px"
  tooltip:
    textColor: "{colors.text}"
    rounded: "{rounded.button}"
    padding: "6px 8px"
    width: "300px"
---

# Design System: LOD playground

## Overview

**Creative North Star: "The Captured Frame"**

The page reads like a GPU frame debugger: each LOD level is a draw you inspect, listed as an event in a dense docked list beside the viewport, with its triangles, error and switch distance printed as numbers. Panels are docked graphite slabs separated by 1px splitters; nothing floats over the canvas except the error banner and tooltips.

Density is high and deliberate: 12px system UI text, 22px controls, 32px dock headers. Colour carries meaning, not decoration. Blue is the selection, amber is a warning, and the level colours are data markers that tie a list row to its timeline span and to the tinted instances in the viewport.

**Key Characteristics:**
- Docked grid, 1px splitters, no cards, no floating GUI over the canvas.
- One blue for selection and focus, one amber for warnings, a separate data palette for levels.
- Monospace tabular numerals for every number and every line of code.
- Square-ish forms: nothing rounder than 3px.
- One selection, echoed everywhere: list, timeline, inspector, viewport.

## Colors

A near-black graphite neutral ramp carrying two semantic accents and a nine-step categorical palette reserved for levels.

### Primary
- **Selection Blue** (`selection-blue`): selection and keyboard focus only. Focus rings (1px outline, 1px offset), the 1px/2px underline of the pressed segment and selected tab, the checked checkbox fill, the selected timeline span ring, the brand mark. Its tint (`selection-blue-bg`) and line (`selection-blue-line`) fill and outline the selected level row, pressed chips and checked flag chips.

### Secondary
- **Warning Amber** (`warning-amber`): warnings only. The warning icon on a level row, warning text in level meta, warning icons in the Warnings list, and the Warnings tab count (on `warning-amber-bg`).
- **Error Red** (`danger`): the blocking error banner only (icon; border at 45% alpha over a `#241518` field).

### Tertiary: level data palette
- **Level markers** (`level-0` to `level-8`): one colour per level index, cycled modulo 9. L0 is a neutral steel grey (the source geometry); the rest are mint, violet, magenta, lime, cyan, salmon, teal, lilac. Used for the 8px swatch, the 2px share bar, the timeline span (2px top border and a 13% mix into `graphite-bg`, 22% on hover, 24% selected) and the instance tint in the viewport.

### Neutral
- **Graphite** (`graphite-bg`): page and splitter-gap background, and the inset field of inputs, selects, segmented controls and the timeline track.
- **Viewport** (`viewport`): the canvas backdrop, one step lighter than the page.
- **Panel / Raised / Pressed** (`panel`, `panel-raised`, `panel-pressed`): dock surfaces; hover and section-title band; pressed segment and count badge.
- **Lines** (`line`, `line-soft`, `line-strong`): splitters and control borders; row and list dividers; hover border of inputs and the unchecked checkbox border.
- **Text / Muted / Faint** (`text`, `muted`, `faint`): values and active labels; field labels and idle controls; column heads, captions, zero counts, disabled labels.

### Named Rules
**The Two Signals Rule.** Blue means "selected or focused", amber means "warning". Neither appears for emphasis, branding of a section, or decoration. A new state that is neither gets a neutral treatment.

**The Data Palette Rule.** Level colours are data, never UI. They mark a level (swatch, bar, timeline span, viewport tint) and nothing else, and new entries must stay out of the blue and amber hue families so a level can never read as selected or warned.

**The Selection Is A Ring Rule.** Selecting a level never recolours it. The level keeps its own colour; selection is added on top as a blue tint and 1px blue ring (row, timeline span), or a blue underline (tabs, segments).

## Typography

**Body Font:** system-ui (with -apple-system, Segoe UI, Roboto, Helvetica Neue, sans-serif)
**Mono Font:** ui-monospace (with Cascadia Mono, SF Mono, Menlo, Consolas, monospace)

**Character:** Tool-native system text for labels and prose; monospace for anything you might compare across rows. Tabular numerals are on globally (`font-variant-numeric: tabular-nums` on body).

### Hierarchy
- **Title** (600, 12px, 1.4): dock titles, section titles, brand name. There is no larger size in the system.
- **Body** (400, 12px, 1.4): labels, buttons, tabs, list text.
- **Caption** (400, 11px): column heads, captions, hints, subsection titles (600).
- **Value** (mono, 11px): inputs, selects, flag chips, facts, level meta, counts, timeline span labels.
- **Code** (mono, 11.5px, 1.6, tab-size 2): the generated code panel.
- **Label mono** (mono 600, 10px): tab count badges, brand badge, timeline axis ticks.

### Named Rules
**The Mono Numbers Rule.** Every number (triangles, share, instance count, error, distance, pixel size) and every code identifier is set in the mono stack with tabular numerals, right-aligned in columns. Sans text never carries a measured value.

**The Flat Ramp Rule.** Hierarchy comes from weight (600), colour (text, muted, faint) and the section-title band, not from size. Stay within 10 to 12px.

## Layout

A full-height docked grid: columns 288px | flexible | 304px, rows 36px toolbar | flexible stage | 164px bottom dock. Levels dock spans the left column, the inspector spans the right, the bottom dock sits under the viewport only. Panels sit on a 1px `gap` over the `line` colour, which draws the splitters; no borders between docks.

Fixed rhythm: toolbar 36px; dock headers, viewport bar and tab bar 32px; section title 30px; controls 22px; buttons 24px. Inner padding is 12px horizontally on every dock; gaps use 4, 6, 8 and 12px. Field rows are a 100px label column plus control; number fields are a slider plus a 64px number box.

Under 860px the page scrolls and collapses to one column in story order: toolbar (wrapping, 8px 12px padding), stage at 64vh, levels, inspector, bottom dock at 280px. Inner lists stop scrolling independently; the viewport bar wraps.

## Elevation & Depth

Flat. Depth is tonal: graphite page, panel, raised, pressed, with the canvas a separate step. Selection is shown with inset rings and underlines, not lift. The only shadow is the tooltip (`0 6px 18px rgba(0, 0, 0, 0.4)`), the one element that floats.

### Named Rules
**The Docked Rule.** Everything is docked. Only transient overlays (tooltip, error banner) float, and the 3D canvas is never covered by persistent controls.

## Shapes

Hard-edged. Radii: 1px for markers (swatches, slider thumb), 2px for controls (inputs, selects, chips, flags, segments, checkbox, badges), 3px for buttons, segmented containers, the error banner and the tooltip. Bars and tracks are square: 2px share bars, 4px drawn track, 2px slider track. Unused levels draw their share bar dashed (3px on, 3px off). Icons are 16px stroke SVGs on a 16 grid, 1.5px stroke, round caps and joins, `currentColor`.

## Components

### Buttons
- **Tool button:** transparent, muted text, 24px tall, 3px radius; hover fills `panel-raised` and lifts text to `text`. The Play button is the outlined variant (1px `line` border, min-width 76px).
- **Icon button:** 24px square, same states; disabled at 35% opacity.

### Chips and flags
- **Chip** (viewport bar toggles): 22px, 1px `line` border, muted. Pressed: blue tint, blue line, `text`.
- **Flag chip** (simplify flags): the same shape in mono 11px wrapping a hidden checkbox; checked takes the pressed treatment, keyboard focus draws the blue outline on the chip.

### Segmented control
Inset `graphite-bg` track with 1px padding and border. Segments are 18px tall; the pressed segment fills `panel-pressed` with a 1px blue inset underline. The model picker in the toolbar uses taller 22px segments.

### Inputs / Fields
- **Number field:** slider plus mono right-aligned number box on `graphite-bg`. Slider: 2px `line` track, 10px square `text` thumb (white on hover).
- **Focus:** the number box swaps its border to blue instead of an outline; everything else uses the global 1px blue outline.
- **Checkbox:** 12px square, `line-strong` border; checked fills blue with a graphite tick (120ms colour transition, removed under reduced motion).
- **Disabled:** label to `faint`, control at 35 to 50% opacity.
- **Select:** mono 11px on `graphite-bg`, custom muted chevron.

### Navigation (tabs)
Bottom dock tabs (Distance, Code, Warnings) are full-height cells divided by `line-soft`. Selected: `panel-raised` with a 2px blue inset underline. Counts sit in a mono badge; the Warnings count turns amber when warnings exist.

### Levels event list (signature)
A four-column grid row per level: id (mono 600, swatch, optional amber warning icon), triangles, share, instances, right-aligned mono. Below, a full-width 2px share bar in the level colour and a mono meta line (error, switch, influences). Hover fills `panel-raised`; selected takes the blue tint and 1px inset blue ring. A footer shows drawn vs full triangles with a 4px track.

### Distance timeline (signature)
A 44px track of spans, one per level, each with its level colour as a 2px top edge and a 13% fill, mono distance labels inside, a 1px row of instance ticks below and a log-scale mono axis. Selected span: 24% fill plus 1px blue inset ring.

### Linked selection
Selecting a level selects it in the list, the timeline and the inspector at once, and lightly dims the other levels in the viewport (level colour lerped 45% toward `#2c2f35`). Isolate or hover dims them strongly (72%). Any new view of levels must join this selection.

### Inspector sections
Each section opens with a 30px `panel-raised` title band (12px 600, optional 10px level swatch), then a body of 6px-gapped field rows with 12px padding. Read-only data uses a facts grid: muted terms, mono values.

### Tooltips
Every control carries a `data-tooltip`, rendered by one fixed tooltip (max 300px, 11.5px, 3px radius, `#202227` on `#353941` border, the only shadow). Tooltip-bearing non-buttons show the help cursor.

### Code panel
Mono 11.5px/1.6 on the panel, base text `#c3c6cd`. Syntax tokens are a muted code-only palette: keywords `#9db4ff`, strings `#a9cf96`, numbers `#d9b38a`, types `#e6e8ec`. They live inside the code block only and are not UI signals.

## Do's and Don'ts

### Do:
- **Do** dock every new panel into the grid and let the 1px `gap` draw the splitter.
- **Do** set every number and code fragment in the mono stack with tabular numerals, right-aligned in columns.
- **Do** keep controls at the 22px control height and buttons at 24px, with 12px dock padding.
- **Do** give every new control a `data-tooltip`.
- **Do** route any new level view through the shared selection: list, timeline, inspector and viewport dimming move together.
- **Do** mark a level only with its `level-N` colour, and show selection on top of it with blue tint and ring.

### Don't:
- **Don't** use blue for anything but selection and focus, or amber for anything but warnings.
- **Don't** add a level colour in the blue or amber hue families.
- **Don't** use a radius above 3px.
- **Don't** add cards, drop shadows or floating panels over the canvas; the tooltip is the only shadowed element.
- **Don't** set measured values in the sans face or grow type beyond 12px for hierarchy.
