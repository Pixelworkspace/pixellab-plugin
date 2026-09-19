#!/usr/bin/env node
// Manifest validator for a pixelworkspace plugin.
//
//   1. Structure — plugin.yaml has the required fields and a well-formed
//      `contributes` block (unique ids; menus reference declared commands).
//   2. Two-track consistency — every id declared in `contributes` is registered
//      in the code, and every px.register* call in the code is declared. The
//      manifest and the code must agree (that's the whole point of declaring).
//   3. Repo identity — the checkout is the repository `package.json` says it is.
//      A plugin started as a FORK of the template can be pull-requested straight
//      back into it (GitHub pre-fills the upstream as the PR target), which
//      silently turns the template into a copy of the plugin. That happened
//      once; this check makes it fail loudly instead.
//
// Exits non-zero on any error. Run: `node scripts/validate.mjs`.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// --- load manifest ----------------------------------------------------------
let manifest;
try {
  manifest = yaml.load(readFileSync(join(root, 'plugin.yaml'), 'utf8'));
} catch (e) {
  console.error('✗ Could not read/parse plugin.yaml: ' + e.message);
  process.exit(1);
}
if (!manifest || typeof manifest !== 'object') {
  console.error('✗ plugin.yaml is empty or not a mapping.');
  process.exit(1);
}

// --- structure --------------------------------------------------------------
const str = (v) => typeof v === 'string' && v.trim().length > 0;
if (!str(manifest.name)) err('`name` is required (non-empty string).');
if (!str(manifest.version)) err('`version` is required (non-empty string).');
if (!str(manifest.entry)) err('`entry` is required (path to the built entry file).');
if (manifest.api == null) warn('`api` is missing — declare `api: 1` (the plugin API version this plugin targets).');
else if (!Number.isInteger(manifest.api) || manifest.api < 1) err('`api` must be a positive integer (the plugin API version).');

// The gateable px namespaces. `px.tool` rides with `editor` (stroke primitives).
const CAPABILITIES = ['editor', 'rig', 'paperdoll', 'masks', 'canvas', 'effects', 'files', 'assets', 'game'];
if (manifest.capabilities != null) {
  if (!Array.isArray(manifest.capabilities) || !manifest.capabilities.every(str)) err('`capabilities` must be an array of capability names.');
  else for (const c of manifest.capabilities) if (!CAPABILITIES.includes(c)) err(`Unknown capability: ${c}. Valid: ${CAPABILITIES.join(', ')}.`);
}
if (manifest.hosts != null && !(Array.isArray(manifest.hosts) && manifest.hosts.every(str)))
  err('`hosts` must be an array of hostname strings.');

const contributes = manifest.contributes || {};
const declared = { commands: new Set(), panels: new Set(), tools: new Set() };

function checkList(kind, list, extra = () => {}) {
  if (list == null) return;
  if (!Array.isArray(list)) return err(`contributes.${kind} must be a list.`);
  for (const [i, item] of list.entries()) {
    if (!item || typeof item !== 'object') { err(`contributes.${kind}[${i}] must be a mapping.`); continue; }
    if (!str(item.id)) { err(`contributes.${kind}[${i}] needs a string \`id\`.`); continue; }
    if (!str(item.title)) err(`contributes.${kind}[${i}] (${item.id}) needs a \`title\`.`);
    if (declared[kind].has(item.id)) err(`Duplicate ${kind} id: ${item.id}`);
    declared[kind].add(item.id);
    extra(item, i);
  }
}
checkList('commands', contributes.commands);
checkList('panels', contributes.panels);
checkList('tools', contributes.tools);

// menus reference a declared command
if (contributes.menus != null) {
  if (!Array.isArray(contributes.menus)) err('contributes.menus must be a list.');
  else
    for (const [i, m] of contributes.menus.entries()) {
      if (!m || typeof m !== 'object') { err(`contributes.menus[${i}] must be a mapping.`); continue; }
      if (!str(m.path)) err(`contributes.menus[${i}] needs a \`path\`.`);
      if (!str(m.command)) err(`contributes.menus[${i}] needs a \`command\`.`);
      else if (!declared.commands.has(m.command)) err(`contributes.menus[${i}] references undeclared command: ${m.command}`);
    }
}

// --- scan the source for px.register* calls ---------------------------------
const registered = { commands: new Set(), panels: new Set(), tools: new Set() };
const srcDir = join(root, 'src');
const RE = /px\.register(Command|Panel|Tool)\s*\(\s*['"]([^'"]+)['"]/g;
const kindOf = { Command: 'commands', Panel: 'panels', Tool: 'tools' };

function scan(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) scan(p);
    else if (/\.(ts|js|mjs)$/.test(name)) {
      const code = readFileSync(p, 'utf8');
      let m;
      while ((m = RE.exec(code))) registered[kindOf[m[1]]].add(m[2]);
    }
  }
}
try {
  scan(srcDir);
} catch {
  warn('No src/ directory found — skipping the code cross-check.');
}

// --- two-track cross-check --------------------------------------------------
for (const kind of ['commands', 'panels', 'tools']) {
  for (const id of declared[kind]) if (!registered[kind].has(id)) err(`${kind}: "${id}" declared in plugin.yaml but never px.register…('${id}') in the code.`);
  for (const id of registered[kind]) if (!declared[kind].has(id)) err(`${kind}: "${id}" is registered in the code but not declared in plugin.yaml.`);
}

// --- capabilities ↔ code cross-check ----------------------------------------
// The app installs ONLY declared namespaces — code touching an undeclared one
// throws at runtime, so catch it here. (`px.tool` counts as `editor`.)
const usedCaps = new Set();
const CAP_RE = /\bpx\.(editor|tool|rig|paperdoll|masks|canvas|effects|files|assets|game)\b/g;
function scanCaps(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) scanCaps(p);
    else if (/\.(ts|js|mjs)$/.test(name)) {
      const code = readFileSync(p, 'utf8');
      let m;
      while ((m = CAP_RE.exec(code))) usedCaps.add(m[1] === 'tool' ? 'editor' : m[1]);
    }
  }
}
try {
  scanCaps(srcDir);
} catch {
  /* already warned above */
}
if (manifest.capabilities == null) {
  const list = usedCaps.size ? Array.from(usedCaps).join(', ') : '';
  warn(`\`capabilities\` is missing — declare what the plugin uses${list ? ` (detected: [${list}])` : ' (detected: none)'}. Without it the app grants everything.`);
} else {
  for (const c of usedCaps) if (!manifest.capabilities.includes(c)) err(`Code uses px.${c} but \`capabilities\` does not declare "${c}" — it would not exist in the sandbox.`);
  for (const c of manifest.capabilities) if (!usedCaps.has(c)) warn(`Capability "${c}" is declared but the code never touches px.${c}.`);
}

// --- repo identity ----------------------------------------------------------
// `package.json` declares which repository this plugin belongs to; the check
// compares it with the checkout's actual `origin`. A fork merged back into its
// upstream brings its own package.json along, so the two stop matching and this
// fails — which is exactly the accident it exists to catch.
//
// Both halves are optional: a plugin without the field, or a checkout without a
// remote (a downloaded zip, some CI setups), only gets a warning. The check
// should protect the repos that opt in, not block everyone else.
const declaredRepo = (() => {
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))?.pixelworkspace?.repo ?? null;
  } catch {
    return null;
  }
})();

/** `owner/name` from any git URL form (ssh, https, with or without .git). */
function repoSlug(url) {
  const m = String(url).trim().match(/[/:]([^/:]+)\/([^/]+?)(?:\.git)?\s*$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

if (!declaredRepo) {
  warn('`pixelworkspace.repo` is missing from package.json — add "Owner/repo" so a fork merged back into the template is caught here.');
} else {
  let originUrl = null;
  try {
    originUrl = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    /* no git, no remote — handled below */
  }
  const actual = originUrl ? repoSlug(originUrl) : null;
  if (!actual) {
    warn(`No git origin to check against — package.json claims this is ${declaredRepo}.`);
  } else if (actual.toLowerCase() !== declaredRepo.toLowerCase()) {
    err(
      `This checkout is ${actual}, but package.json says the plugin belongs to ${declaredRepo}. ` +
        'Either the wrong repository was merged in (a fork into its template does exactly this), ' +
        'or `pixelworkspace.repo` was not updated after forking.'
    );
  }
}

// --- report -----------------------------------------------------------------
for (const w of warnings) console.warn('⚠ ' + w);
if (errors.length) {
  for (const e of errors) console.error('✗ ' + e);
  console.error(`\n${errors.length} error(s). Manifest and code are out of sync.`);
  process.exit(1);
}
console.log(
  `✓ plugin.yaml OK — ${declared.commands.size} command(s), ${declared.panels.size} panel(s), ${declared.tools.size} tool(s); manifest ↔ code consistent.`
);
