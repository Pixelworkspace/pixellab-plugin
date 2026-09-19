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
  const pixels = px.editor.pixels();          // a copy of the active cel
  for (let i = 0; i < pixels.length; i++) {
    const { r, g, b, a } = px.unpack(pixels[i]);
    if (a) pixels[i] = px.rgba(255 - r, 255 - g, 255 - b, a);
  }
  px.editor.commit(pixels);                   // write back = one undo step
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

#### Toolbar placement

`icon` may be SVG path data for a 24×24 box or a plain character. `order` places
the button (built-ins sit at 10–110; a plugin tool is held behind them unless it
joins a group). `group` shares one button with a flyout — pass `'shapes'` to sit
beside line/rectangle/ellipse, or any new name to open your own group.

```js
px.registerTool('star', 'Star', {
  icon: 'M12 3l2.5 6H21l-5 4 2 6-6-3.5L6 19l2-6-5-4h6.5z',
  group: 'shapes',       // fourth entry in the shapes flyout
  order: 63,
  usesColor: true,
  onPointerDown: stamp,
});
```

#### Tool settings

`options` declares the controls in the bar above the canvas — the same
declaration the built-in tools use, so a plugin tool gets the same bar. It is
**data, not callbacks**: the host keeps the values and calls `onOptionChange`.
That is also why `visibleWhen` is an object rather than a predicate function —
a function could not cross into the host.

```js
px.registerTool('spray', 'Spray', {
  icon: '✷',
  usesColor: true,
  options: [
    { kind: 'slider', id: 'radius', label: 'Radius', min: 1, max: 32, unit: 'px', wheelAdjustable: true },
    { kind: 'slider', id: 'density', label: 'Density', min: 1, max: 100, unit: '%' },
    { kind: 'toggle', id: 'jitter', label: 'Jitter' },
    {
      kind: 'choice',
      id: 'falloff',
      label: 'Falloff',
      choices: [
        { value: 'flat', label: 'Flat' },
        { value: 'soft', label: 'Soft' },
      ],
      // Only meaningful once the spray is wider than a pixel.
      visibleWhen: { option: 'radius', atLeast: 2 },
    },
  ],
  onOptionChange(id, value) {
    settings[id] = value;
  },
  onPointerDown: spray,
  onPointerMove: spray,
});
```

A slider marked `wheelAdjustable` is what Ctrl+wheel changes, and a tool whose
brush is wider than one pixel gets the brush cursor automatically.

### `px.on(event, handler)`

Subscribe to editor events. `handler(payload)` gets a parsed payload. Every
event fires only when its payload actually changed:

| Event               | Payload                                | Fires when …                          |
| ------------------- | -------------------------------------- | ------------------------------------- |
| `'documentChange'`  | `{ width, height }`                    | the canvas size changes (incl. opening another document). |
| `'frameChange'`     | `{ frame, frameCount }`                | the active frame or frame count changes. |
| `'selectionChange'` | `Selection \| null`                    | a selection appears or disappears.    |
| `'layerChange'`     | `{ layer, layerCount }`                | the active layer or layer count changes. |
| `'toolChange'`      | `{ tool }`                             | the user picks a different tool.      |

Handlers run synchronously in your sandbox with a short budget — do the minimum
and defer heavy work to a command or panel action.

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

## `px.effects` — custom shaders

Register custom effects/shaders that appear in the editor's **Effects** panel. Declared
`inputs` auto-generate the UI (sliders/color/toggle); `render` runs once per frame during
compositing at loop-phase `t` (0..1). One plugin may register **many** effects.

```js
px.effects.register('shine', {
  name: 'Shine',
  inputs: [
    { key: 'angle', label: 'Angle', type: 'range', min: 0, max: 360, default: 45 },
    { key: 'color', label: 'Color', type: 'color', default: px.rgba(255, 255, 255) },
    { key: 'speed', label: 'Speed', type: 'range', min: 0, max: 4, step: 0.1, default: 1 },
  ],
  // pixels: the layer's packed colors · w, h: its size ·
  // inputs: current values keyed by input key · t: loop phase 0..1
  render(pixels, w, h, inputs, t) {
    const out = new Uint32Array(pixels);       // copy; return a NEW buffer
    // … brighten pixels along a band that moves with t …
    return out;
  },
});
```

| Method                  | Notes                                                            |
| ----------------------- | ---------------------------------------------------------------- |
| `register(id, def)`     | `def = { name, inputs?, render(pixels, w, h, inputs, t) }`. `render` returns a new `Uint32Array`. |

Runs in the sandbox once per frame (pixel loop inside your `render`). Keep it O(w·h);
pixel-art sizes are fine, huge canvases will be slow.

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

## `px.game` — the Game Studio

Scenes are the playable levels built in the Game Studio. A plugin can list
them, open them, and contribute behaviours that every scene can place.

| Method                          | Returns              | Notes                                     |
| ------------------------------- | -------------------- | ----------------------------------------- |
| `scenes()` **async**            | `GameScene[]`        | Scenes of the open asset's project: `{id,name,genre}`. |
| `open(sceneId)`                 | —                    | Show the scene in the studio.             |
| `play(sceneId)`                 | —                    | Open the scene in its own play tab.       |
| `registerBehaviours(source)`    | —                    | Contribute `gs.behaviour(...)` source to every scene. |

**Why source and not callbacks.** Entity behaviour runs in the *game* sandbox,
where the global is `gs`, not `px`. If a plugin passed a function, the engine
would have to call back into the plugin's own sandbox once per entity per
frame — a second boundary crossing on every step. Contributing source means one
sandbox runs everything, and a plugin's enemy costs exactly what a hand-written
one does.

```js
px.game.registerBehaviours(`
  gs.behaviour('homing', {
    label: 'Homing',
    color: '#f6a341',
    // Draws the sight radius on the map, so the number is a distance you can see.
    gizmos: [{ kind: 'radius', param: 'sight', unit: 'tiles' }],
    params: [
      { kind: 'number', id: 'speed', label: 'Speed', default: 50 },
      { kind: 'number', id: 'sight', label: 'Sight', default: 8, unit: 'tiles' },
    ],
    update(self) {
      gs.towardsPlayer(gs.param('speed', 50));
      self.clip = 'walk';
    },
    touch() { gs.damage(1); },
  });
`);
```

Calling it again replaces this plugin's previous contribution rather than
adding a second copy. The full `gs` reference is a separate document — see the
[game API docs](https://pixelwork.space/docs/game-api).

---

## `px.storage`

Persistent, per-plugin, cloud-synced key-value store.

- `get(key)` · `set(key, value)` · `delete(key)` · `keys()`

---

## `px.ui` & logging

- `px.ui.progress(fraction | null, label?)` — panel progress bar (`null` =
  indeterminate). Safe to call between `await`s during long work.
- `px.ui.toast(message, kind?)` — transient toast to the user; `kind` is
  `'info'` (default) | `'success'` | `'error'`. Shown attributed to your plugin.
- `px.ui.confirm(message)` → `Promise<boolean>` — a themed confirm dialog
  (titled with your plugin's name); resolves with the user's decision. Ask
  before anything destructive — never just do it.
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
