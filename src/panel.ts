// The panel: how the whole UI is assembled (render) and how interactions are
// routed (handleEvent). render() returns a tabbed widget tree; each tab's body
// comes from its feature module. handleEvent() maps a widget's `action` to
// either a stored setting or a feature call.

import { TABS, JOBS_TAB, BASE_DEFAULT } from './config';
import { ui } from './state';
import { getSettings } from './storage';
import { checkBalance } from './api';
import { loadThumbs, removeJob } from './job-store';
import { WidgetType, Action } from './types';
import { generateTab, generateImage, insertPreview } from './features/generate';
import { animate, animateTab } from './features/animate';
import { repaintTab, runRepaint } from './features/repaint';
import { jobsTab, jobDetailView, openJob, resumeJob } from './features/jobs';
import { settingsTab } from './features/settings';

/** Build the panel widget tree (called on every change; immediate-mode). */
export function renderPanel(): Widget {
  const children: Widget[] = [{ type: WidgetType.Heading, text: 'Pixellab AI' }];
  if (ui.error) children.push({ type: WidgetType.Label, text: '⚠ ' + ui.error });
  children.push({
    type: WidgetType.Tabs,
    active: ui.tab,
    action: Action.Tab,
    tabs: [
      { label: 'Generate', children: generateTab() },
      { label: 'Animate', children: animateTab() },
      { label: 'Repaint', children: repaintTab() },
      { label: 'Jobs', children: ui.detailJob != null ? jobDetailView(ui.detailJob) : jobsTab() },
      { label: 'Settings', children: settingsTab() },
    ],
  });
  return { type: WidgetType.VStack, gap: 10, children };
}

/** Handle a widget interaction; surfaces any error on the panel. */
export async function handleEvent(action: string, value: any): Promise<void> {
  ui.error = '';
  try {
    await route(action, value);
  } catch (e) {
    ui.error = (e as Error)?.message || String(e);
    try {
      px.editor.clearMask();
    } catch {
      /* ignore */
    }
  }
}

async function route(action: string, value: any): Promise<void> {
  switch (action) {
    // --- navigation ---
    case Action.Tab:
      ui.tab = value;
      ui.detailJob = null;
      if (value === JOBS_TAB) await loadThumbs();
      return;
    case Action.JobDetail:
      ui.detailJob = Number(value);
      await loadThumbs();
      return;
    case Action.JobBack:
      ui.detailJob = null;
      return;
    case Action.GotoSettings:
      ui.tab = TABS.indexOf('settings');
      return;

    // --- settings persistence (input/select/checkbox → px.storage) ---
    case Action.Desc: px.storage.set('description', value); return;
    case Action.RepaintDesc: px.storage.set('repaintDesc', value); return;
    case Action.Size: px.storage.set('size', Number(value)); return;
    case Action.NoBg: px.storage.set('noBg', value); return;
    case Action.ApiKey: px.storage.set('apiKey', value); return;
    case Action.BaseUrl: px.storage.set('baseUrl', value || BASE_DEFAULT); return;
    case Action.AnimAction: px.storage.set('action', value); return;
    case Action.FrameCount: px.storage.set('frameCount', Number(value)); return;
    case Action.InputSource: px.storage.set('inputSource', value === 'group' ? 'group' : 'cel'); return;
    case Action.InputFrame: px.storage.set('inputFrame', Number(value)); return;
    case Action.InputGroup: px.storage.set('inputGroup', value); return;
    case Action.LastFrame: px.storage.set('lastFrame', Number(value)); return;
    case Action.Enhance: px.storage.set('enhance', value); return;
    case Action.Seed: px.storage.set('seed', value); return;

    // --- actions ---
    case Action.Generate: {
      const s = getSettings();
      ui.preview = await generateImage(s.description, s.size, s.size);
      return;
    }
    case Action.Insert:
      ui.error = await insertPreview(false);
      return;
    case Action.SaveAsset:
      ui.error = await insertPreview(true);
      return;
    case Action.Repaint:
      ui.error = await runRepaint();
      return;
    case Action.Animate: {
      const r = await animate();
      ui.error =
        'Animated · ' + r.frames + ' frames' +
        (r.generations != null ? ' · ' + r.generations + ' generations' : '') +
        (r.sizeMatch ? ' (written to timeline)' : ' (size differed — saved to Jobs only)');
      return;
    }
    case Action.Balance:
      ui.balance = await checkBalance();
      return;
    case Action.JobInsert:
      ui.error = await openJob(Number(value), false);
      return;
    case Action.JobAsset:
      ui.error = await openJob(Number(value), true);
      return;
    case Action.JobResume:
      await resumeJob(Number(value));
      await loadThumbs();
      ui.error = 'Job updated';
      return;
    case Action.JobDelete:
      removeJob(Number(value));
      return;
  }
}
