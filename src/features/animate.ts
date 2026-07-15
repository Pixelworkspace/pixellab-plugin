// Animate: a frame → animation (endpoint animate-with-text-v3). The returned
// frames are written onto the editor timeline, and a horizontal sprite-strip is
// saved to the file store with request/response metadata. v3 (unlike
// generate-image-v2) supports enhance_prompt + seed + frame_count.

import { FRAME_COUNTS, animateCost } from '../config';
import { getSettings, nextSeq } from '../storage';
import { submit, jobIdOf, poll } from '../api';
import { addJob, updateJob } from '../job-store';
import { needsKeyBanner } from '../widgets';
import { message } from './generate';
import { WidgetType, Action } from '../types';

/** Encode a specific timeline frame's pixels as a PNG data-URL. */
async function encodeFrame(index: number, w: number, h: number): Promise<string> {
  px.editor.setFrame(index);
  return px.image.encode(px.editor.pixels(), w, h);
}

/** Encode a layer group's composited result as a PNG data-URL. */
async function encodeGroup(groupId: string, w: number, h: number): Promise<string> {
  return px.image.encode(px.editor.groupPixels(groupId), w, h);
}

/**
 * Resolve the group id to use: the saved one if it still exists, else the first
 * group. Throws when the document has no groups. `groups` is the current list.
 */
function resolveGroupId(groups: LayerGroupInfo[], saved: string): string {
  if (!groups.length) throw new Error('This document has no layer groups.');
  return saved && groups.some((g) => g.id === saved) ? saved : groups[0].id;
}

/** Pack N equal-size frames side by side into one horizontal strip buffer. */
function toStrip(frames: DecodedImage[]): { pixels: Uint32Array; width: number; height: number } {
  const fw = frames[0].width;
  const fh = frames[0].height;
  const n = frames.length;
  const strip = new Uint32Array(fw * n * fh);
  for (let i = 0; i < n; i++) {
    const f = frames[i];
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) strip[y * (fw * n) + i * fw + x] = f.pixels[y * fw + x];
  }
  return { pixels: strip, width: fw * n, height: fh };
}

export interface AnimateResult {
  frames: number;
  generations?: number;
  sizeMatch: boolean;
}

export async function animate(): Promise<AnimateResult> {
  const s = getSettings();
  if (!s.apiKey) throw new Error('No API key yet — open the Settings tab.');
  if (!s.action) throw new Error('Enter an action (e.g. "walking", "attacking").');

  const w = px.editor.width();
  const h = px.editor.height();
  const fcount = px.editor.frameCount();

  // The first_frame image comes from either the active cel of a chosen timeline
  // frame, or the composited result of a whole layer group.
  let firstFrame: string;
  if (s.inputSource === 'group') {
    const gid = resolveGroupId(px.editor.groups(), s.inputGroup);
    firstFrame = await encodeGroup(gid, w, h);
  } else {
    const inputIdx = Math.min(s.inputFrame || 0, fcount - 1);
    firstFrame = await encodeFrame(inputIdx, w, h);
  }

  const req: Record<string, unknown> = {
    first_frame: { type: 'base64', base64: firstFrame },
    action: s.action,
    frame_count: s.frameCount,
    no_background: s.noBg,
    enhance_prompt: s.enhance,
  };
  if (s.seed) req.seed = Number(s.seed);
  // Optional last_frame: -2 loop (= input frame), >=0 a specific frame.
  if (s.lastFrame === -2) req.last_frame = { type: 'base64', base64: firstFrame };
  else if (s.lastFrame >= 0) req.last_frame = { type: 'base64', base64: await encodeFrame(Math.min(s.lastFrame, fcount - 1), w, h) };

  px.ui.progress(null, 'Submitting…');
  const body = await submit('/animate-with-text-v3', req);
  const jobId = jobIdOf(body);
  const job = addJob({
    kind: 'animate',
    jobId,
    label: s.action.slice(0, 60),
    width: w,
    height: h,
    frameCount: s.frameCount,
    request: req,
    enhancedPrompt: body.enhanced_prompt || null,
    enhanceGens: (body.enhance_usage || {}).generations,
  });

  try {
    const done = await poll(jobId, 'Animating');
    px.ui.progress(null, 'Writing frames…');
    const lr = done.last_response || done;
    const images = lr.images || [];
    if (!images.length) throw new Error('No frames returned.');

    const frames: DecodedImage[] = [];
    for (const img of images) frames.push(await px.image.decode(img.base64));
    const n = frames.length;
    const fw = frames[0].width;
    const fh = frames[0].height;

    // Write onto the timeline when the frame size matches the document.
    let wrote = false;
    if (fw === w && fh === h) {
      while (px.editor.frameCount() < n) px.editor.addFrame();
      for (let i = 0; i < n; i++) {
        px.editor.setFrame(i);
        px.editor.commit(frames[i].pixels);
      }
      px.editor.setFrame(0);
      wrote = true;
    }

    // Always save a strip to the file store (with request/response metadata).
    const strip = toStrip(frames);
    const key = 'anim/' + (s.action.slice(0, 20).replace(/[^a-z0-9]+/gi, '_') || 'anim') + '_' + nextSeq() + '.png';
    const gens = (lr.billing_usage || {}).generations;
    await px.files.put(key, {
      data: await px.image.encode(strip.pixels, strip.width, strip.height),
      mimeType: 'image/png',
      name: 'anim ' + s.action,
      meta: { request: req, response: { generations: gens, jobId, frames: n }, width: strip.width, height: strip.height, animation: true, frameW: fw, frameH: fh },
    });
    updateJob(job.seq, { status: 'completed', fileKey: key, generations: gens, costIfPaid: (lr.usage || {}).cost_if_paid, seed: lr.seed, createdAt: done.created_at });

    if (wrote) {
      try {
        await px.editor.save(); // persist the new frames so they survive a reload
      } catch {
        /* best effort */
      }
    }
    return { frames: n, generations: gens, sizeMatch: wrote };
  } catch (e) {
    updateJob(job.seq, { status: 'failed', error: message(e) });
    throw e;
  }
}

/** The Animate tab UI. */
export function animateTab(): Widget[] {
  const s = getSettings();
  const fc = px.editor.frameCount();
  const kids: Widget[] = [];
  if (!s.apiKey) kids.push(...needsKeyBanner());

  const isGroup = s.inputSource === 'group';
  const groups = px.editor.groups();
  const groupOpts = groups.map((g) => ({ label: g.name + ' (' + g.layers.length + ' layer' + (g.layers.length === 1 ? '' : 's') + ')', value: g.id }));
  const groupVal = s.inputGroup && groups.some((g) => g.id === s.inputGroup) ? s.inputGroup : groups[0]?.id ?? '';

  const frameOpts = Array.from({ length: fc }, (_, i) => ({ label: 'Frame ' + (i + 1), value: i }));
  const lastOpts = [
    { label: '— none —', value: -1 },
    { label: 'Loop (= input)', value: -2 },
    ...frameOpts,
  ];

  kids.push(
    { type: WidgetType.Text, text: 'Animate the current sprite → timeline frames. Endpoint: animate-with-text-v3.' },
    { type: WidgetType.TextArea, label: 'Action', value: s.action, rows: 2, action: Action.AnimAction, placeholder: 'walking · attacking · idle sway (keep it short)' },
    {
      type: WidgetType.Select,
      label: 'Input',
      value: s.inputSource,
      action: Action.InputSource,
      options: [
        { label: 'Active cel', value: 'cel' },
        { label: 'Layer group (composited)', value: 'group' },
      ],
    },
    {
      type: WidgetType.HStack,
      gap: 8,
      children: [
        { type: WidgetType.Select, label: 'Frames', value: s.frameCount, action: Action.FrameCount, options: FRAME_COUNTS.map((n) => ({ label: '' + n, value: n })) },
        isGroup
          ? {
              type: WidgetType.Select,
              label: 'Layer group',
              value: groupVal,
              action: Action.InputGroup,
              options: groupOpts.length ? groupOpts : [{ label: '— no groups —', value: '' }],
            }
          : { type: WidgetType.Select, label: 'Input frame', value: Math.min(s.inputFrame, Math.max(0, fc - 1)), action: Action.InputFrame, options: frameOpts },
      ],
    },
    { type: WidgetType.Select, label: 'Last frame (optional — for seamless loops)', value: s.lastFrame, action: Action.LastFrame, options: lastOpts },
    {
      type: WidgetType.HStack,
      gap: 8,
      children: [
        { type: WidgetType.Checkbox, label: 'Enhance prompt', value: s.enhance, action: Action.Enhance },
        { type: WidgetType.Input, label: 'Seed (optional)', inputType: 'number', value: s.seed, action: Action.Seed, placeholder: 'random' },
      ],
    },
    { type: WidgetType.Checkbox, label: 'No background', value: s.noBg, action: Action.NoBg },
    { type: WidgetType.Label, muted: true, text: 'Cost: ~' + animateCost(s.frameCount) + ' generations (' + s.frameCount + ' frames)' },
    { type: WidgetType.Button, variant: 'primary', text: 'Animate → timeline', action: Action.Animate }
  );
  return kids;
}
