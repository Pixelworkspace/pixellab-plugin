# Pixellab AI — pixelworkspace plugin

Wraps the [Pixellab AI API](https://api.pixellab.ai) as a pixelworkspace plugin:
generate, animate and repaint sprites from a panel, with job tracking, progress,
cost details, and metadata-tagged file storage. Built entirely on the generic
**`px.*`** extension API — nothing Pixellab-specific lives in the host.

## Develop

TypeScript, bundled to a single `entry.js` with esbuild.

```bash
npm install
npm run typecheck   # tsc --noEmit (strict)
npm run validate    # manifest structure + manifest ↔ code consistency
npm run build       # esbuild src/main.ts → output/entry.js  (commit the result)
npm run check       # all three
```

## Layout

```
plugin.yaml            manifest — name/version/entry/hosts + `contributes`
output/entry.js        built bundle (what the app runs) — committed
src/
  config.ts            constants (endpoints base, sizes, costs, tabs)
  types/
    index.ts           domain types (Settings, JobRecord, …) + barrel
    widget-type.ts     WidgetType — widget-kind constants (as-const, scaffold)
    action.ts          Action — panel action constants (as-const)
  storage.ts           how storage is done — settings, auth header, seq counter
  job-store.ts         job cache (survives reload) + thumbnails
  api.ts               the Pixellab client — submit / poll / balance
  state.ts             transient (non-persisted) panel state
  widgets.ts           shared UI snippets (key banner, status icon)
  panel.ts             render() + the event router (how UI is assembled)
  main.ts              entry — wires panel/command/menu to their code
  features/
    generate.ts        generate-image-v2 + Generate tab + insert
    animate.ts         animate-with-text-v3 → timeline + Animate tab
    repaint.ts         inpaint-style region repaint + Repaint tab
    jobs.ts            Jobs tab, detail view, resume, open
    settings.ts        Settings tab + balance
scripts/validate.mjs   the manifest validator
types/pixelworkspace.d.ts   px type definitions (dev-only autocomplete)
tsconfig.json               strict TS, ambient px types
docs/README.md              docs landing page (rendered on GitHub)
docs/API.md                 the full px API reference
```

## Manifest ↔ code (the two tracks)

`plugin.yaml` **declares** the plugin's contributions so the app knows its
capabilities without executing anything:

```yaml
contributes:
  panels:   [{ id: main, title: Pixellab AI }]
  commands: [{ id: pixellab.generate, title: Generate sprite → canvas }]
  menus:    [{ path: Pixellab/Generate sprite → canvas, command: pixellab.generate }]
```

The code **implements** them by id (`px.registerPanel('main', …)`,
`px.registerCommand('pixellab.generate', …)`). `npm run validate` fails if the
two drift apart (declared-but-not-registered, or registered-but-not-declared),
and the host warns at load time.

## Setup & publish

1. Open the panel → **Settings** → paste your Pixellab API token (kept in
   `px.storage`; the plugin only reaches `api.pixellab.ai`, per `hosts`).
2. Push this folder to a git repo. In pixelworkspace: **Plugins → My plugins →
   ＋ New plugin** → enter the git URL (+ ref / token if private).
3. Update: push (bump `version` in `plugin.yaml`), then **Pull** on the plugin.
