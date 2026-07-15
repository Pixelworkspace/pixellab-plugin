# pixelworkspace plugin docs

Reference documentation for building **pixelworkspace** plugins. (GitHub renders
this page when you open the `docs/` folder.)

## Contents

- **[API.md](API.md)** — the full `px` API reference: commands, menus, panels,
  tools, events, and every sub-API (`px.editor`, `px.http`, `px.storage`,
  `px.image`, `px.files`, `px.assets`, `px.ui`) with its methods and the widget
  catalog.

## Quick orientation

A plugin runs in a sandbox whose only bridge to the host is the global **`px`**
object — no DOM, no `window`, no `fetch`. You declare contributions in
`plugin.yaml` and implement them by id in `src/`. See the root
**[README](../README.md)** for the develop/validate/build/publish workflow.

The type stubs in **[`types/pixelworkspace.d.ts`](../types/pixelworkspace.d.ts)**
give your editor autocomplete for the whole `px` surface and mirror this
reference — treat them as the machine-readable companion to `API.md`.

## Working with layers & layer groups

The editor document is layers grouped into folders. From a plugin:

- `px.editor.groups()` → the layer groups, each with its child `layers`
  (bottom→top).
- `px.editor.groupPixels(groupId, frameIndex?)` → the **composited result** of one
  group as a `width×height` packed-RGBA `Uint32Array` (its visible layers
  flattened), which you can `px.image.encode(...)` and send to an API as image
  input. Defaults to the active frame.

See the `px.editor` section of [API.md](API.md#pxeditor) for the full method list.
