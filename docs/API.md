# `px` API reference

Everything a plugin can do goes through the global **`px`**. All types below are
declared in [`../types/pixelworkspace.d.ts`](../types/pixelworkspace.d.ts) for
editor autocomplete.

Conventions:

- **Color** — a packed RGBA `uint32` (little-endian, byte order R, G, B, A).
  Build with `px.rgba(r, g, b, a?)`; split with `px.unpack(color)`.
- **async** — methods marked async return a `Promise`; `await` them (top-level
  `await` is available in the entry script and in command/panel handlers).

---

## Registration

### `px.registerCommand(id, title, run)`

Registers a runnable command. `run` may be sync or async. Commands show up in the
command palette and the editor's Plugins menu.

```js
px.registerCommand('invert', 'Invert colors', function () {
  const buf = px.editor.pixels();
  for (let i = 0; i < buf.length; i++) {
    const c = px.unpack(buf[i]);
    if (c.a) buf[i] = px.rgba(255 - c.r, 255 - c.g, 255 - c.b, c.a);
  }
  px.editor.commit(buf);
});
```

### `px.registerMenu(path, commandId)`

Adds a menu entry pointing at a command. `path` groups it, e.g.
`'My Plugin/Invert colors'` — the first segment becomes the menu, the rest the
label.

### `px.registerPanel(id, title, render)`

Registers a dockable panel. `render` returns a [Widget](#widgets) tree and is
re-invoked whenever the document or your state changes (immediate-mode).

### `px.onPanelEvent(panelId, handler)`

`handler(action, value)` receives the `action` of the widget the user
interacted with, plus its `value` (already parsed). May be async.

### `px.registerTool(id, title, options)`

Registers a canvas tool. `options.icon` is a character/emoji; the pointer
callbacks receive pixel coordinates and mouse button:

```js
px.registerTool('spray', 'Spray', {
  icon: '✷',
  onPointerDown: paint,
  onPointerMove: paint,
});
function paint(x, y /*, button */) {
  px.tool.plot(x, y, px.editor.color()); // valid only inside a tool handler
}
```

`px.tool.*` (`plot`, `read`, `sample`, `setColor`) is valid **only** during a
tool pointer callback; the whole stroke folds into one undo step.

### `px.on(event, handler)`

Subscribe to editor events. `handler(payload)` gets a parsed payload. Common
event: `'documentChange'`.

---

## `px.editor`

The active document. Pixel edits go through `pixels()` → mutate → `commit()`,
which is one undo step.

| Method                                   | Returns        | Notes                                    |
| ---------------------------------------- | -------------- | ---------------------------------------- |
| `width()` / `height()`                   | `number`       | Canvas size.                             |
| `color()`                                | `Color`        | Current drawing color.                   |
| `setColor(color)`                        | —              | Set the current color.                   |
| `getPalette()` / `setPalette(arr)`       | `Color[]` / —  | The document palette.                    |
| `getSelection()`                         | `{x,y,w,h}\|null` | Current rectangular selection.        |
| `pixels()`                               | `Uint32Array`  | Copy of the active cel.                  |
| `commit(pixels)`                         | —              | Write pixels back (one undo step).       |
| `getPixel(x, y)`                         | `Color`        | 0 outside bounds.                        |
| `getRegion(x, y, w, h)`                  | `Uint32Array`  | Crop a sub-rect.                         |
| `putRegion(x, y, w, h, pixels)`          | —              | Paste a sub-rect (one undo step).        |
| `setMask(cells)` / `clearMask()`         | —              | Non-destructive highlight (inpaint mask).|
| `frameCount()` / `setFrame(i)` / `addFrame()` | —         | Timeline.                                |
| `layerCount()` / `addLayer()`            | —              | Layers.                                  |
| `layers()`                               | `LayerInfo[]`  | Flat layer list, bottom→top (`{id,name,visible,opacity,blendMode}`). |
| `activeLayer()` / `setActiveLayer(i)`    | `number` / —   | Active layer index.                      |
| `removeLayer(i)` / `renameLayer(i,name)` | —              | Layer structure.                         |
| `setLayerVisible(layerId, visible)`      | —              | Show/hide a layer **by id** (drives paperdoll variants). |
| `setLayerOpacity(i, o)` / `setLayerLocked(i, b)` | —      | Layer props.                             |
| `addGroup(name?)` / `setGroupVisible(id, b)` | —          | Group folders.                           |
| `groups()`                               | `LayerGroupInfo[]` | Layer groups, each with its child `layers` (bottom→top). |
| `groupPixels(groupId, frameIndex?)`      | `Uint32Array`  | Composited result of one group (its visible layers flattened), width×height. Defaults to the active frame. |
| `save()` **async**                       | `Promise`      | Persist the document to the server.      |

**Taking a layer group as input.** Let the user pick a group, then flatten it to
one raster and send that to your API:

```js
const groups = px.editor.groups();            // [{ id, name, visible, layers:[…] }]
const g = groups[0];
const pixels = px.editor.groupPixels(g.id);   // Uint32Array, width×height
const dataUrl = await px.image.encode(pixels, px.editor.width(), px.editor.height());
// dataUrl → your request body (e.g. an animate/first_frame image)
```

`groupPixels()` renders the group's individually-visible layers regardless of the
group's own visibility toggle, so an explicitly-picked hidden group still yields
its pixels. Unknown id / empty group → a fully transparent buffer.

---

## `px.rig` — bones (pose aid + slots)

Read/mutate the rig-lite skeleton. Bones are a pixel-native posing aid and the
source of paperdoll slots — not a runtime skeleton.

| Method                              | Returns  | Notes                                              |
| ----------------------------------- | -------- | -------------------------------------------------- |
| `bones()`                           | `Bone[]` | Snapshot of the active document's bones.           |
| `addBone(name?, parentId?)`         | —        | Root bone, or a child of `parentId` (at its tip).  |
| `updateBone(id, patch)`             | —        | Patch `{x,y,angle,length,name,type,size,layerId,slot}`. |
| `removeBone(id)`                    | —        | Children re-parent to the removed bone's parent.   |
| `setSlot(id, slot)`                 | —        | Set/clear (`''`) the bone's paperdoll slot label.  |
| `select(id)`                        | —        | Select a bone (null clears).                       |

```js
const [torso] = px.rig.bones();
px.rig.updateBone(torso.id, { angle: torso.angle + 0.1 }); // nudge the pose
```

---

## `px.paperdoll` — slots × variants

Slots are named positions (optionally anchored to a bone); variants are looks
backed by a layer. Switching a variant toggles layer visibility.

| Method                                    | Returns          | Notes                             |
| ----------------------------------------- | ---------------- | --------------------------------- |
| `slots()`                                 | `PaperdollSlot[]`| `{id,name,boneId?,variants,activeVariantId}`. |
| `setActiveVariant(slotId, variantId)` **async** | `Promise`  | Show a variant (null hides the slot). Persists to the asset. |

---

## `px.masks` — reusable selection masks

Masks are stored on the asset, so one mask applies across every frame/animation.

| Method                          | Returns              | Notes                                   |
| ------------------------------- | -------------------- | --------------------------------------- |
| `list()`                        | `MaskMeta[]`         | `{id,name,w,h}`.                        |
| `get(id)`                       | `Uint8Array \| null` | One 0/1 byte per pixel (row-major).     |
| `apply(id)`                     | —                    | Load a mask into the current selection. |
| `create(name)` **async**        | `Promise<string>`    | Save the current selection; resolves to the new id. |
| `remove(id)` **async**          | `Promise`            | Delete a mask.                          |

---

## `px.canvas` — interactive gizmos

Draw overlay elements (handles + segments + discs) on the pixel canvas and get
drag callbacks. Dragging works while the **Move** tool is active.

| Method                  | Notes                                                                 |
| ----------------------- | --------------------------------------------------------------------- |
| `set(elements)`         | Replace the plugin's gizmo list (`CanvasElementSpec[]`).              |
| `clear()`               | Remove them.                                                          |
| `onDrag(handler)`       | `(elementId, handleId \| null, x, y)` — handleId null = body drag.   |

```js
let p = { x: 8, y: 8 };
const draw = () => px.canvas.set([
  { id: 'dot', handles: [{ id: 'c', x: p.x, y: p.y, kind: 'point' }] },
]);
px.canvas.onDrag((elId, handleId, x, y) => { p = { x, y }; draw(); });
draw();
```

Your `set()` is declarative: on each drag, update your own model and call `set()`
again. Elements persist until `clear()` or the plugin unloads.

---

## `px.http` — async, allowlisted

Only hosts listed in `plugin.json` `"hosts"` are reachable.

```js
const res = await px.http.post('https://api.example.com/v1/thing', { prompt: 'x' }, {
  headers: { Authorization: 'Bearer ' + px.storage.get('token') },
});
if (res.ok) {
  const data = res.json();
}
```

- `get(url, options?)` / `post(url, body, options?)` / `request(url, options?)`
- Response: `{ status, ok, headers, body, json() }`. `post` JSON-encodes object
  bodies and sets `Content-Type`.
- `px.sleep(ms)` **async** — delay (≤ 60s), for polling loops.

---

## `px.image` — async

- `decode(base64)` → `{ width, height, pixels: Uint32Array }`
- `encode(pixels, width, height)` → PNG data-URL

---

## `px.files` — async

Per-plugin file store for artifacts + metadata (e.g. save a generation together
with its request/response).

- `list()` → `PluginFileMeta[]` (no payloads)
- `get(key)` → `PluginFileFull` (incl. `data`)
- `put(key, { data, name, mimeType, meta })` → `PluginFileMeta`
- `delete(key)`

---

## `px.assets` — mixed

- `current()` → `{ projectId, assetId, name, type, width, height } | null` (sync)
- `create({ name, type?, width, height, pixels })` → new asset (**async**)
- `open(assetId)` → navigate the editor to an asset (sync)

---

## `px.storage`

Persistent, per-plugin, cloud-synced key-value store.

- `get(key)` · `set(key, value)` · `delete(key)` · `keys()`

---

## `px.ui` & logging

- `px.ui.progress(fraction | null, label?)` — panel progress bar (`null` =
  indeterminate). Safe to call between `await`s during long work.
- `px.log(message)` — print to the plugin log.

---

## Color helpers

- `px.rgba(r, g, b, a = 255)` → `Color`
- `px.unpack(color)` → `{ r, g, b, a }`

---

## Widgets

A panel's `render()` returns a tree of widget objects `{ type, ... }`. Container
widgets have `children`. Interactive widgets carry an `action` that is delivered
to `onPanelEvent`.

| `type`                          | Key props                                             |
| ------------------------------- | ----------------------------------------------------- |
| `vstack` / `hstack`             | `children`                                            |
| `heading` / `text` / `label`    | `text`                                                |
| `button`                        | `text`, `action`                                      |
| `input` / `textarea`            | `value`, `placeholder`, `inputType`, `rows`, `action` |
| `slider`                        | `value`, `min`, `max`, `step`, `action`               |
| `checkbox`                      | `value` (bool), `text`, `action`                      |
| `select`                        | `options: [{label,value}]`, `value`, `action`         |
| `color` / `colorbar`            | `value` (Color), `action`                             |
| `swatches`                      | `colors: Color[]`, `action` (fires with the color)    |
| `image`                         | `pixels`+`width`+`height`, or `src` (data-URL); `smooth` |
| `progress`                      | `value` (0..1 or `'indeterminate'`)                   |
| `tabs`                          | `tabs: [{label, children}]`, `active` (index), `action` |
| `separator` / `spacer`          | —                                                     |

Panels are stateless from the host's view: you drive values (a slider position,
the active tab, an input's text) from your own `px.storage` and re-render.

```js
function render() {
  return {
    type: 'vstack',
    children: [
      { type: 'heading', text: 'Generate' },
      { type: 'textarea', value: px.storage.get('prompt') || '', placeholder: 'a knight', action: 'prompt', rows: 3 },
      { type: 'button', text: 'Go', action: 'go' },
      px.storage.get('busy') ? { type: 'progress', value: 'indeterminate' } : { type: 'spacer' },
    ],
  };
}
```
