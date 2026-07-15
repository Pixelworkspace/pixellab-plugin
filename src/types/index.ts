// Types barrel — import everything type-ish from '../types'.
// Runtime enums (compiled into the bundle) + domain interfaces.
export * from './widget-type';
export * from './action';

// Domain types for the plugin. (The global `px`, `Widget`, `Color` … come from
// the ../types/pixelworkspace.d.ts ambient declarations.)

/** All persisted user settings, as read from px.storage. */
export interface Settings {
  apiKey: string;
  baseUrl: string;
  size: number;
  noBg: boolean;
  description: string;
  repaintDesc: string;
  // animate-with-text-v3 options
  action: string;
  frameCount: number;
  /** Where the first_frame comes from: the active cel, or a layer group's composite. */
  inputSource: 'cel' | 'group';
  inputFrame: number;
  /** Layer group id used when inputSource === 'group' (empty → first group). */
  inputGroup: string;
  /** -1 none · -2 loop (= input frame) · >=0 a specific frame index. */
  lastFrame: number;
  enhance: boolean;
  seed: string;
}

export type JobKind = 'generate' | 'animate' | 'repaint';
export type JobStatus = 'processing' | 'completed' | 'failed';

/** One tracked generation, persisted so it survives reloads. */
export interface JobRecord {
  seq: number;
  status: JobStatus;
  kind: JobKind;
  jobId: string;
  label: string;
  width?: number;
  height?: number;
  frameCount?: number;
  request?: unknown;
  enhancedPrompt?: string | null;
  enhanceGens?: number;
  fileKey?: string;
  generations?: number;
  costIfPaid?: number;
  seed?: number;
  createdAt?: string;
  error?: string;
}

/** The result of a single image generation. */
export interface GenerationResult {
  base64: string;
  width: number;
  height: number;
  generations?: number;
  request: unknown;
  jobId: string;
  key?: string;
  jobSeq?: number;
}

/** Transient panel state (not persisted; lives in the plugin's context). */
export interface TransientUi {
  tab: number;
  error: string;
  preview: GenerationResult | null;
  balance: string | null;
  detailJob: number | null;
}
