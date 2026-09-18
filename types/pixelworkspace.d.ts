// Ambient type definitions for pixelworkspace plugin entry scripts.
//
// This file exists purely so classic editors (VS Code, WebStorm, …) offer
// autocomplete + docs for the global `px` API while you write your plugin. It is
// NOT bundled with your plugin — only your entry file (see plugin.json "entry")
// runs, inside a sandbox whose single host bridge is `px`.
//
// Keep it referenced from your entry file:  /// <reference path="./types/pixelworkspace.d.ts" />
// (a jsconfig.json that includes this file works too).

/** A packed RGBA color as a little-endian uint32 (byte order R,G,B,A). Build with px.rgba(). */
type Color = number;

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** A rectangular selection in pixel coordinates. */
interface Selection {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface HttpOptions {
  method?: string;
  headers?: Record<string, string>;
  /** Object bodies are JSON-encoded automatically by http.post. */
  body?: string | object | null;
}

interface HttpResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  /** Raw response text. */
  body: string;
  /** Parses `body` as JSON. */
  json(): any;
}

interface DecodedImage {
  width: number;
  height: number;
  pixels: Uint32Array;
}

interface PluginFileMeta {
  id: string;
  key: string;
  name: string;
  mimeType: string;
  size: number;
  meta: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface PluginFileFull extends PluginFileMeta {
  /** The stored payload (typically base64 or a data-URL). */
  data: string;
}

interface PluginFilePut {
  /** The payload to store (base64 / data-URL / text). */
  data?: string;
  name?: string;
  mimeType?: string;
  /** Arbitrary metadata stored alongside the file (e.g. the request/response). */
  meta?: Record<string, any>;
}

interface AssetContext {
  projectId: string;
  assetId: string;
  name: string;
  type: string;
  width: number;
  height: number;
}

interface CreateAssetInput {
  name: string;
  /** Asset type key (e.g. 'sprite', 'character', 'tileset'). Defaults server-side. */
  type?: string;
  width: number;
  height: number;
  pixels: Uint32Array;
}

interface CreatedAsset {
  id: string;
  name: string;
  type: string;
  projectId: string;
  documentId: string;
}

interface MaskCell {
  x: number;
  y: number;
}

/** A layer inside a group (see LayerGroupInfo). */
interface LayerInfo {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blendMode: 'normal' | 'multiply' | 'screen';
}

/** A layer group with its child layers, as returned by px.editor.groups(). */
interface LayerGroupInfo {
  id: string;
  name: string;
  visible: boolean;
  collapsed: boolean;
  /** Child layers, bottom→top. */
  layers: LayerInfo[];
}

/** Widget kinds understood by the panel renderer. */
type WidgetKind =
  | 'vstack'
  | 'hstack'
  | 'label'
  | 'text'
  | 'heading'
  | 'button'
  | 'slider'
  | 'input'
  | 'checkbox'
  | 'select'
  | 'color'
  | 'colorbar'
  | 'swatches'
  | 'image'
  | 'textarea'
  | 'progress'
  | 'tabs'
  | 'separator'
  | 'spacer';

/**
 * A declarative UI node returned by a panel's render function. Panels are
 * immediate-mode: your render() returns a fresh tree; interactions call back
 * into onPanelEvent, you update your storage/state, and the panel re-renders.
 */
interface Widget {
  /**
   * The widget kind. Either a raw string (checked against WidgetKind) or the
   * named `WidgetType` constant from src/types, e.g. `type: WidgetType.VStack` —
   * both are validated. Unknown kinds simply don't render.
   */
  type: WidgetKind;
  /** Children for vstack / hstack. */
  children?: Widget[];
  /** Text for label / text / heading / button. */
  text?: string;
  /** Action name delivered to onPanelEvent when this widget is used. */
  action?: string;
  /** Current value (slider / input / checkbox / select / color). */
  value?: any;
  placeholder?: string;
  /** input kind: 'text' | 'password' | 'number'. */
  inputType?: string;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  /** Options for select. */
  options?: Array<{ label: string; value: any } | string>;
  /** Colors for swatches / palette. */
  colors?: Color[];
  /** image: packed pixels + size … */
  pixels?: Uint32Array;
  width?: number;
  height?: number;
  /** … or an image data-URL. */
  src?: string;
  /** image: nearest-neighbour by default; set true for smooth scaling. */
  smooth?: boolean;
  /** tabs: [{ label, children }] with `active` index. */
  tabs?: Array<{ label: string; children?: Widget[] }>;
  active?: number;
  /** progress: a number 0..1, or 'indeterminate'. */
  [key: string]: any;
}

/** A value a tool setting can hold. */
type ToolOptionValue = string | number | boolean;

/**
 * Shows a setting only while another one is in a given state. Plain data, not a
 * function — the declaration crosses into the host, and a callback would not.
 * Use exactly one of the three tests.
 */
interface ToolOptionCondition {
  option: string;
  equals?: ToolOptionValue;
  notEquals?: ToolOptionValue;
  /** For numeric settings, e.g. show a brush shape only from size 1 upwards. */
  atLeast?: number;
}

/** One control in the options bar above the canvas. */
type ToolOption =
  | { kind: 'toggle'; id: string; label: string; visibleWhen?: ToolOptionCondition }
  | {
      kind: 'slider';
      id: string;
      label: string;
      min: number;
      max: number;
      step?: number;
      /** Appended to the readout, e.g. 'px' or '%'. */
      unit?: string;
      /** Ctrl+wheel adjusts this one. At most one per tool. */
      wheelAdjustable?: boolean;
      visibleWhen?: ToolOptionCondition;
    }
  | {
      kind: 'choice';
      id: string;
      label: string;
      choices: Array<{ value: string; label: string }>;
      visibleWhen?: ToolOptionCondition;
    };

interface ToolOptions {
  /** SVG path data for a 24×24 icon, or a single character / emoji. */
  icon?: string;
  /** Single-letter keyboard shortcut. */
  shortcut?: string;
  /**
   * Toolbar position; lower comes first. Built-ins occupy 10–110 and a plugin
   * tool is held behind them — unless it joins a group, where its position counts.
   */
  order?: number;
  /**
   * Share a toolbar button with other tools, opened by a flyout. Use 'shapes' to
   * sit beside line/rectangle/ellipse, or any new name for your own group.
   */
  group?: string;
  /** Label for the group's button. Set it on any one member. */
  groupName?: string;
  /** True if the tool paints with the editor's current colour (shown in the bar). */
  usesColor?: boolean;
  /**
   * Settings rendered into the options bar. The host keeps the values and calls
   * `onOptionChange` — read them there, the declaration itself stays data.
   */
  options?: ToolOption[];
  onOptionChange?(optionId: string, value: ToolOptionValue): void;
  onPointerDown?(x: number, y: number, button: number): void;
  onPointerMove?(x: number, y: number, button: number): void;
  onPointerUp?(x: number, y: number, button: number): void;
}

/** The active document. Pixel edits via pixels()/commit() fold into one undo step. */
interface EditorApi {
  width(): number;
  height(): number;
  /** The current drawing color. */
  color(): Color;
  setColor(color: Color): void;
  getPalette(): Color[];
  setPalette(palette: Color[]): void;
  getSelection(): Selection | null;
  /** A copy of the active cel's pixels. */
  pixels(): Uint32Array;
  /** Write a pixel buffer back to the active cel (one undo step). */
  commit(pixels: Uint32Array): void;
  getPixel(x: number, y: number): Color;
  getRegion(x: number, y: number, w: number, h: number): Uint32Array;
  putRegion(x: number, y: number, w: number, h: number, pixels: Uint32Array): void;
  /** Non-destructive highlight overlay (e.g. an inpaint mask). */
  setMask(cells: MaskCell[]): void;
  clearMask(): void;
  frameCount(): number;
  setFrame(index: number): void;
  addFrame(): void;
  layerCount(): number;
  addLayer(): void;
  /**
   * The document's layer groups, each with its child layers (bottom→top). Use it
   * to let the user pick a group as input, then read its composited pixels with
   * groupPixels().
   */
  groups(): LayerGroupInfo[];
  /**
   * The composited "result" of one layer group as a width×height packed RGBA
   * buffer — the group's individually-visible layers flattened, independent of
   * the group's own visibility toggle. Defaults to the active frame. Unknown id /
   * empty group → a fully transparent buffer.
   */
  groupPixels(groupId: string, frameIndex?: number): Uint32Array;
  /** The document's layers, bottom→top (flat; see groups() for the grouped view). */
  layers(): LayerInfo[];
  /** Index of the active layer. */
  activeLayer(): number;
  setActiveLayer(index: number): void;
  removeLayer(index: number): void;
  renameLayer(index: number, name: string): void;
  /** Show/hide a layer by id (e.g. to drive paperdoll variants). */
  setLayerVisible(layerId: string, visible: boolean): void;
  setLayerOpacity(index: number, opacity: number): void;
  setLayerLocked(index: number, locked: boolean): void;
  /** Create a new layer group (folder). */
  addGroup(name?: string): void;
  setGroupVisible(groupId: string, visible: boolean): void;
  /** Persist the active document to the server. */
  save(): Promise<void>;
}

/** Stroke primitives — valid ONLY inside a plugin tool's pointer handler. */
interface ToolApi {
  plot(x: number, y: number, color: Color): void;
  read(x: number, y: number): Color;
  sample(x: number, y: number): Color;
  setColor(color: Color): void;
}

/** Persistent per-plugin key-value store (cloud-synced). */
interface StorageApi {
  get(key: string): any;
  set(key: string, value: any): void;
  delete(key: string): void;
  keys(): string[];
}

/** HTTP client. Only hosts declared in plugin.json "hosts" are reachable. */
interface HttpApi {
  request(url: string, options?: HttpOptions): Promise<HttpResponse>;
  get(url: string, options?: HttpOptions): Promise<HttpResponse>;
  /** JSON POST — object bodies are stringified and Content-Type set. */
  post(url: string, body: any, options?: HttpOptions): Promise<HttpResponse>;
}

interface ImageApi {
  /** Decode a base64 (or data-URL) PNG into packed pixels. */
  decode(base64: string): Promise<DecodedImage>;
  /** Encode packed pixels as a PNG data-URL. */
  encode(pixels: Uint32Array, width: number, height: number): Promise<string>;
}

/** Per-plugin file store for artifacts + metadata. */
interface FilesApi {
  list(): Promise<PluginFileMeta[]>;
  get(key: string): Promise<PluginFileFull>;
  put(key: string, file?: PluginFilePut): Promise<PluginFileMeta>;
  delete(key: string): Promise<void>;
}

interface AssetsApi {
  /** The asset currently open in the editor, or null. */
  current(): AssetContext | null;
  /** Create a new editable asset from pixels in the current project. */
  create(input: CreateAssetInput): Promise<CreatedAsset>;
  /** Navigate the editor to an asset. */
  open(assetId: string): void;
}

/** A Game Studio scene, as a plugin sees it. */
interface GameScene {
  id: string;
  name: string;
  genre: 'topdown' | 'sidescroller' | 'isometric';
}

/**
 * The Game Studio, from the editor side.
 *
 * Note what is NOT here: a way to run an entity yourself. Entity behaviour
 * executes in the GAME sandbox, where `gs` lives, so a plugin contributes
 * behaviour SOURCE with registerBehaviours() rather than callbacks. Reaching
 * back into the plugin per entity per frame would cost a second sandbox
 * crossing on every step.
 */
interface GameApi {
  /** Scenes of the project the open asset belongs to. */
  scenes(): Promise<GameScene[]>;
  /** Open a scene in the studio. */
  open(sceneId: string): void;
  /** Open a scene in its own play tab. */
  play(sceneId: string): void;
  /**
   * Contribute `gs.behaviour(...)` source, available to every scene. Called
   * again with new source replaces this plugin's previous contribution.
   */
  registerBehaviours(source: string): void;
}

interface UiApi {
  /** Show a progress bar on the plugin panel. `null` = indeterminate. */
  progress(fraction: number | null, label?: string): void;
  /** Show a transient toast, attributed to your plugin. */
  toast(message: string, kind?: 'info' | 'success' | 'error'): void;
  /** Themed confirm dialog (titled with your plugin's name). Ask before anything destructive. */
  confirm(message: string): Promise<boolean>;
}

/** Visual kind of a bone (affects how the rig gizmo draws it). */
type BoneType = 'limb' | 'line' | 'circle';

/** A rig bone: a joint (x,y) + absolute angle & length, in a parent/child tree. */
interface Bone {
  id: string;
  name: string;
  parentId: string | null;
  x: number;
  y: number;
  angle: number;
  length: number;
  /** Bound layer id (the slot this bone controls), or null. */
  layerId: string | null;
  type?: BoneType;
  size?: number;
  /** Paperdoll slot label, if this bone marks a slot. */
  slot?: string;
}

/** Read/write the rig-lite skeleton (pixel-native bones — a posing aid + slot source). */
interface RigApi {
  /** All bones in the active document (a snapshot copy). */
  bones(): Bone[];
  /** Add a root bone (or a child when parentId is given) at the canvas centre / parent tip. */
  addBone(name?: string | null, parentId?: string | null): void;
  /** Patch a bone's fields (position, angle, length, name, type, size, layerId, slot). */
  updateBone(id: string, patch: Partial<Bone>): void;
  removeBone(id: string): void;
  /** Set (or clear, with '') the bone's paperdoll slot label. */
  setSlot(id: string, slot: string): void;
  /** Select a bone in the rig panel (null clears). */
  select(id: string | null): void;
}

interface PaperdollVariant {
  id: string;
  name: string;
  /** The document layer that IS this variant. */
  layerId: string;
}
interface PaperdollSlot {
  id: string;
  name: string;
  boneId?: string | null;
  variants: PaperdollVariant[];
  activeVariantId: string | null;
}

/** Read/switch paperdoll slots (composable equipment/body parts). */
interface PaperdollApi {
  slots(): PaperdollSlot[];
  /** Show a slot's variant (hiding its siblings), or hide the slot with null. Persists. */
  setActiveVariant(slotId: string, variantId: string | null): Promise<void>;
}

/** Metadata of a reusable asset mask (see px.masks). */
interface MaskMeta {
  id: string;
  name: string;
  w: number;
  h: number;
}

/** Reusable selection masks stored on the asset. */
interface MasksApi {
  list(): MaskMeta[];
  /** The mask's pixels as a 0/1 byte per pixel (row-major, w×h), or null if unknown. */
  get(id: string): Uint8Array | null;
  /** Load a saved mask into the current selection. */
  apply(id: string): void;
  /** Save the current selection as a new mask; resolves to its id. Persists. */
  create(name: string): Promise<string>;
  remove(id: string): Promise<void>;
}

/** A draggable control point of a plugin gizmo. */
interface CanvasHandleSpec {
  id: string;
  x: number;
  y: number;
  kind?: 'joint' | 'tip' | 'point' | 'pivot';
}
/** A line segment of a plugin gizmo (document-space). */
interface CanvasSegmentSpec {
  from: { x: number; y: number };
  to: { x: number; y: number };
  width?: number;
  dashed?: boolean;
  color?: string;
}
/** A filled circle of a plugin gizmo (document-space). */
interface CanvasDiscSpec {
  x: number;
  y: number;
  r: number;
}
/** A plugin-drawn interactive overlay element (bones, guides, custom handles). */
interface CanvasElementSpec {
  id: string;
  color?: string;
  handles: CanvasHandleSpec[];
  segments?: CanvasSegmentSpec[];
  discs?: CanvasDiscSpec[];
}

/**
 * Draw interactive gizmos over the pixel canvas. Push a fresh element list with
 * set(); dragging a handle (with the Move tool active) calls your onDrag handler
 * with the new document-space position — update your model and set() again.
 */
interface CanvasApi {
  set(elements: CanvasElementSpec[]): void;
  clear(): void;
  /** handleId is null when the element body (not a specific handle) is dragged. */
  onDrag(handler: (elementId: string, handleId: string | null, x: number, y: number) => void): void;
}

/** A declared input of a custom effect — drives the auto-generated UI (a slider/color/toggle). */
interface EffectInput {
  key: string;
  label?: string;
  type: 'range' | 'color' | 'bool';
  min?: number;
  max?: number;
  step?: number;
  /** Initial value (a packed Color for 'color'). */
  default?: number | boolean;
}

interface EffectDef {
  name: string;
  inputs?: EffectInput[];
  /**
   * Per-frame render — transform the layer's packed pixels at loop-phase `t` (0..1) into
   * a NEW Uint32Array. `inputs` holds the current param values (keyed by EffectInput.key;
   * 'color' inputs are packed Colors). Runs once per frame during compositing.
   */
  render(pixels: Uint32Array, width: number, height: number, inputs: Record<string, number | boolean>, t: number): Uint32Array;
}

/** Register custom effects/shaders. ONE plugin may register many (no plugin-per-shader). */
interface EffectsApi {
  register(id: string, def: EffectDef): void;
}

/**
 * The one global your plugin gets. Register commands/menus/panels/tools/events,
 * and reach the editor, network, files and assets through the sub-APIs.
 */
interface Px {
  /** Register a runnable command (appears in the command palette / Plugins menu). */
  registerCommand(id: string, title: string, run: () => void | Promise<void>): void;
  /** Add a menu entry pointing at a command. Path like 'My Plugin/Do the thing'. */
  registerMenu(path: string, commandId: string): void;
  /** Register a dockable panel; `render` returns a Widget tree (re-called on change). */
  registerPanel(id: string, title: string, render: () => Widget): void;
  /** Handle interactions from a panel's widgets. */
  onPanelEvent(panelId: string, handler: (action: string, value: any) => void | Promise<void>): void;
  /** Register a tool that receives raw pointer events (use px.tool.* inside). */
  registerTool(id: string, title: string, options: ToolOptions): void;
  /**
   * Subscribe to an editor event. Each fires only when its payload changed:
   * 'documentChange' { width, height } · 'frameChange' { frame, frameCount } ·
   * 'selectionChange' Selection|null · 'layerChange' { layer, layerCount } ·
   * 'toolChange' { tool }. Handlers run synchronously with a short budget.
   */
  on(event: string, handler: (payload: any) => void): void;
  /** Print to the plugin log. */
  log(message: string): void;
  /** Await a delay (for polling loops). Capped at 60s. */
  sleep(ms: number): Promise<void>;
  /** Pack a color. Alpha defaults to 255. */
  rgba(r: number, g: number, b: number, a?: number): Color;
  /** Unpack a color into channels. */
  unpack(color: Color): Rgba;

  editor: EditorApi;
  tool: ToolApi;
  storage: StorageApi;
  http: HttpApi;
  image: ImageApi;
  files: FilesApi;
  assets: AssetsApi;
  /** The Game Studio: scenes, and behaviours contributed to them. */
  game: GameApi;
  ui: UiApi;
  /** Rig-lite bones (pose aid + slot source). */
  rig: RigApi;
  /** Paperdoll slots × variants. */
  paperdoll: PaperdollApi;
  /** Reusable asset selection masks. */
  masks: MasksApi;
  /** Interactive canvas gizmos. */
  canvas: CanvasApi;
  /** Register custom effects/shaders (with declared inputs). */
  effects: EffectsApi;
}

/** The global plugin API. */
declare const px: Px;
