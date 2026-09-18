# pixelworkspace plugin — base template

A minimal, working starting point for a **pixelworkspace** plugin: TypeScript
source, bundled to a single file with esbuild, a `plugin.yaml` manifest that
declares its contributions, and a validator that keeps the two in sync.

Use it as the base repo you fork for every new plugin.

## What a plugin is

A plugin is a git repository with a **`plugin.yaml`** manifest at its root and a
built **entry script**. The app clones your repo, reads the manifest, and runs
the entry (a single bundled JS file) in a **sandbox** whose only connection to
the host is the global **`px`** object — no DOM, no `window`, no `fetch`.
Network access is limited to the hosts you declare.

The manifest **declares** what the plugin contributes (panels, commands, menus,
tools); the code **implements** them by id. So the app knows a plugin's
capabilities without executing anything.

## Develop

```bash
npm install
npm run typecheck   # tsc --noEmit (strict)
npm run validate    # manifest structure + manifest ↔ code consistency
npm run build       # esbuild src/main.ts → output/entry.js  (commit the result)
npm run check       # all three
```

Your editor gets full autocomplete for `px` from `types/pixelworkspace.d.ts`
(wired via `tsconfig.json`).

## Layout

```
plugin.yaml                 manifest — name/version/api/entry/hosts/capabilities
                            + `contributes`. `api: 1` = the px API version this
                            plugin targets (the app refuses plugins needing a
                            newer one); `capabilities` lists the px namespaces
                            the code uses — the app installs ONLY those
                            (`npm run validate` cross-checks against the source)
output/entry.js             built bundle (what the app runs) — committed
src/
  types/
    widget-type.ts          WidgetType — widget-kind constants (as-const, scaffold)
    action.ts               Action — panel action constants (as-const)
    index.ts                barrel (import { WidgetType, Action } from './types')
  storage.ts                how storage is done (px.storage)
  actions.ts                a command implementation (editor pixels)
  panel.ts                  how UI is made — render() + event router
  main.ts                   entry — wires panel/command/menu to their code
scripts/validate.mjs        manifest validator (structure + code cross-check)
types/pixelworkspace.d.ts   px type definitions (dev-only autocomplete)
tsconfig.json               strict TS, ambient px types
docs/README.md              docs landing page (rendered on GitHub)
docs/API.md                 the full px API reference
```

## Manifest ↔ code (the two tracks)

```yaml
# plugin.yaml
contributes:
  panels:   [{ id: main, title: My Plugin }]
  commands: [{ id: fill, title: Fill with current color }]
  menus:    [{ path: My Plugin/Fill with current color, command: fill }]
```

```ts
// src/main.ts
px.registerPanel('main', 'My Plugin', renderPanel);
px.registerCommand('fill', 'Fill with current color', fillCanvas);
```

`npm run validate` fails if the two drift apart (declared-but-not-registered, or
registered-but-not-declared), and the host warns at load time.

## Publish

1. Push this folder to a git repo (public or private).
2. In pixelworkspace: **Plugins → My plugins → ＋ New plugin**.
3. Enter the **git URL**, optionally a **branch/ref** and an **access token** for
   private repos (stored encrypted).
4. Publish. You can use it immediately; it appears in **Browse** once approved.

To update: push (bump `version` in `plugin.yaml`), then hit **Pull**.

See **[docs/API.md](docs/API.md)** for the full `px` reference and widget catalog.
