// How storage is done: everything persistent goes through `px.storage`, a
// per-plugin, cloud-synced key-value store. We never hold settings in module
// state — we read them fresh so the panel always reflects what's saved.

import { BASE_DEFAULT } from './config';
import type { Settings } from './types';

/** Read all settings from px.storage, applying defaults. */
export function getSettings(): Settings {
  return {
    apiKey: px.storage.get('apiKey') || '',
    baseUrl: px.storage.get('baseUrl') || BASE_DEFAULT,
    size: px.storage.get('size') || 128,
    noBg: px.storage.get('noBg') !== false, // default on
    description: px.storage.get('description') || '',
    repaintDesc: px.storage.get('repaintDesc') || '',
    action: px.storage.get('action') || '',
    frameCount: px.storage.get('frameCount') || 8,
    inputSource: px.storage.get('inputSource') === 'group' ? 'group' : 'cel',
    inputFrame: px.storage.get('inputFrame') || 0,
    inputGroup: px.storage.get('inputGroup') || '',
    lastFrame: px.storage.get('lastFrame') == null ? -1 : px.storage.get('lastFrame'),
    enhance: px.storage.get('enhance') === true,
    seed: px.storage.get('seed') || '',
  };
}

/** Persist a single setting. */
export function setSetting(key: keyof Settings, value: unknown): void {
  px.storage.set(key, value);
}

/** Authorization header for the Pixellab API. */
export function authHeader(): Record<string, string> {
  return { Authorization: 'Bearer ' + getSettings().apiKey };
}

/** A monotonic counter used for unique job + file ids (persisted). */
export function nextSeq(): number {
  const n = (px.storage.get('seq') || 0) + 1;
  px.storage.set('seq', n);
  return n;
}
