---
name: excalidraw-diagram
description: Create or edit Excalidraw scenes or clipboard payloads by producing valid Excalidraw JSON (type/version/source/elements/appState/files) to render diagrams; use when asked to draw, update, or share Excalidraw diagrams.
---

# Excalidraw Diagram Skill

Use this skill to generate or edit Excalidraw `.excalidraw` files or clipboard payloads. Keep JSON minimal and valid; prefer small examples and only the properties needed for the diagram.

## Quick workflow
- Choose format: full file (`type: "excalidraw"`, include `version`, `source`, `appState`) or clipboard (`type: "excalidraw/clipboard"`, no `version`/`source`/`appState`).
- Sketch elements: rectangles/ellipses/diamonds/lines/arrows/text. Set `id`, `type`, `x`, `y`, `width`, `height` (or `points` for lines/arrows), and `text` for labels.
- Set styling only if needed: `strokeColor`, `backgroundColor`, `strokeWidth`, `roughness`, `opacity`, `roundness`.
- For arrows/lines: include `points` (array of [dx, dy]) and `startBinding`/`endBinding` if connecting IDs.
- Optional appState: `gridSize`, `viewBackgroundColor`, `scrollX`, `scrollY`, `zoom.value`.
- For images: add file entry under `files` keyed by `id` with `mimeType`, `id`, `dataURL`, `created`, `lastRetrieved`; reference that `id` in an `image` element.

## Clipboard vs file payloads
- File: `type: "excalidraw"`, include `version` (number), `source` (URL), `elements`, `appState`, `files`.
- Clipboard: `type: "excalidraw/clipboard"`, include `elements`, optional `files`; omit `version`, `source`, `appState`.

## Validation checklist
## Validation checklist (enforced)
- Unique `id` per element; coordinates in pixels; `width`/`height` positive.
- Keep `elements` ordered for intended z-index.
- If using `files`, ensure matching `id` in both `files` map and `image` element.
- Text fit: size boxes (or `containerId` hosts) so text is not clipped; prefer multiline with `\n` over over-wide boxes.
- Arrows: bind to edges (`startBinding`/`endBinding`) and route around shapes (no crossing over objects); arrow paths must terminate at edges, not centers.
- Palette: pick and reuse a minimal palette (at least one background fill for nodes and a consistent stroke color). Do not leave everything default white; ensure contrast with text.

## Visual guidelines (mandatory for generation)
- These are required, not optional. Apply them when generating or editing diagrams.
- Text fit: give text boxes a comfortable width/height; for labels inside shapes set `containerId` to the host shape and center with `textAlign: "center"`, `verticalAlign: "middle"`. Break long labels with `\n` instead of over-wide boxes.
- Consistent sizing: keep related nodes similar width/height and align them on a grid (e.g., multiples of 10/20) to prevent jittery layouts.
- Spacing: leave at least ~20px padding between shapes; keep arrow gaps small (`gap` 4–8) so connectors appear attached but not overlapping borders.
- Arrows: route connectors around shapes (avoid crossing over objects). Bind to edges via `startBinding`/`endBinding` so arrows terminate at shape edges, not centers; adjust points to keep paths clear. Prefer gently curved paths (multiple points) over sharp zigzags.
- Palette: always set non-white fills for nodes (e.g., light neutrals/pastels) and a consistent stroke color; reuse stroke widths. Avoid all-default white/black unless contrast is verified.
- Z-order: order `elements` from background to foreground so lanes/frames render first, then shapes, then text, then arrows.
- Text sizing: prefer `fontSize` 16–20 for labels; increase for titles; ensure contrast between `strokeColor` and `backgroundColor`.
- Text sizing: prefer `fontSize` 16–20 for labels; increase for titles; ensure contrast between `strokeColor` and `backgroundColor`.

## References
- See [references/schema.md](references/schema.md) for attribute tables and full JSON examples from the Excalidraw docs.

## Bundled examples and scripts
- When editing or generating diagrams, treat the bundled assets/scripts below as part of the skill context (reuse palettes/layout ideas as needed).
- Example scene: [assets/example-flow.excalidraw](assets/example-flow.excalidraw) shows a start → process → end flow with arrows and labels.
- Generator script: [scripts/generate-basic-diagram.js](scripts/generate-basic-diagram.js) emits a similar flow to stdout. Usage: `node scripts/generate-basic-diagram.js > diagram.excalidraw`. Adjust coordinates/text in the arrays inside the script to change the layout.
- Swimlanes template: [assets/example-swimlanes.excalidraw](assets/example-swimlanes.excalidraw) with two lanes (Ops, Engineering) and cross-lane arrows.
- State machine template: [assets/example-state-machine.excalidraw](assets/example-state-machine.excalidraw) with Idle → Processing → Done plus an error/retry loop.
