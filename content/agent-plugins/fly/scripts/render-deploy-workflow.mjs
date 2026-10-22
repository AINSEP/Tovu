#!/usr/bin/env node
/**
 * @file Renders `skills/fly/references/fly-deploy.template.yml` into a GitHub Actions deploy workflow.
 *
 * One template serves two readers. An operator's assistant copies it by hand and fills its
 * `<<PLACEHOLDER: ...>>` values; Tovu's own production deploy (`.github/workflows/fly-deploy.yml` in
 * the Tovu repo) is rendered from it with `tovu-production.values.json`, so the hand-written parts of
 * that workflow live here in the Fly plugin rather than in core. The committed workflow is OUTPUT:
 * `__tests__/render-deploy-workflow.test.mjs` fails while it differs from a fresh render.
 *
 * Template regions, one marker per line:
 * - `#>> <name>` ... `#<< <name>` — kept only when block `<name>` is enabled. Lines prefixed `#| `
 *   are YAML kept commented in the raw template (so the operator copy parses without them) and
 *   un-commented on render; other lines (comments, blanks) pass through unchanged.
 * - `#>> !<name>` ... `#<< !<name>` — the operator version a render with `<name>` enabled drops.
 * Regions do not nest. Every placeholder must have a value; a missing one throws rather than
 * shipping a workflow that deploys `<<PLACEHOLDER: ...>>`.
 *
 * Usage: `node content/agent-plugins/fly/scripts/render-deploy-workflow.mjs [--check]` writes the
 * values file's `output` (repo-relative), or with `--check` exits 1 when the committed file differs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OPEN = /^#>> (!?)([a-z0-9-]+)$/;
const CLOSE = /^#<< (!?)([a-z0-9-]+)$/;
const PLACEHOLDER = /<<PLACEHOLDER:[^>]+>>/g;

export const PLUGIN_ROOT = path.resolve(import.meta.dirname, "..");
export const TEMPLATE_PATH = path.join(PLUGIN_ROOT, "skills", "fly", "references", "fly-deploy.template.yml");
export const TOVU_VALUES_PATH = path.join(PLUGIN_ROOT, "scripts", "tovu-production.values.json");
/** The Tovu checkout this bundled plugin ships in (`content/agent-plugins/fly` -> repo root). */
export const DEFAULT_REPO_ROOT = path.resolve(PLUGIN_ROOT, "..", "..", "..");

function regionKey(match) {
  return `${match[1]}${match[2]}`;
}

/** Opens a region; a second open before the first closes is a template error. */
function openRegion({ current, match, lineNumber }) {
  if (current) throw new Error(`Line ${lineNumber}: region '${regionKey(match)}' opened inside '${current.key}'`);
  return { key: regionKey(match), negated: match[1] === "!", name: match[2] };
}

function closeRegion({ current, match, lineNumber }) {
  if (!current || current.key !== regionKey(match)) throw new Error(`Line ${lineNumber}: '#<< ${regionKey(match)}' does not close an open region`);
  return null;
}

/** keep | unwrap | drop for a line inside `region` (null = outside every region). */
function lineAction({ region, enabled }) {
  if (!region) return "keep";
  const on = enabled.has(region.name);
  if (region.negated) return on ? "drop" : "keep";
  return on ? "unwrap" : "drop";
}

function unwrap(line) {
  if (line.startsWith("#| ")) return line.slice(3);
  return line === "#|" ? "" : line;
}

function substitute({ line, placeholders }) {
  return line.replace(PLACEHOLDER, (token) => {
    if (!Object.hasOwn(placeholders, token)) throw new Error(`No value for ${token}`);
    return placeholders[token];
  });
}

/**
 * Renders the template text. `placeholders` maps each full `<<PLACEHOLDER: ...>>` token to its value;
 * `blocks` names the regions to enable.
 * @complexity O(lines).
 */
export function renderDeployWorkflow({ template, placeholders }, { blocks = [] } = {}) {
  const enabled = new Set(blocks);
  const out = [];
  let region = null;
  template.split("\n").forEach((line, index) => {
    const lineNumber = index + 1;
    const open = OPEN.exec(line);
    const close = open ? null : CLOSE.exec(line);
    if (open) region = openRegion({ current: region, match: open, lineNumber });
    else if (close) region = closeRegion({ current: region, match: close, lineNumber });
    else {
      const action = lineAction({ region, enabled });
      if (action !== "drop") out.push(substitute({ line: action === "unwrap" ? unwrap(line) : line, placeholders }));
    }
  });
  if (region) throw new Error(`Region '${region.key}' is never closed`);
  return out.join("\n");
}

/** Renders Tovu's own production workflow from the committed template and values file. */
export function renderTovuDeployWorkflow({ readFile }, { templatePath = TEMPLATE_PATH, valuesPath = TOVU_VALUES_PATH } = {}) {
  const values = JSON.parse(readFile(valuesPath));
  const contents = renderDeployWorkflow({ template: readFile(templatePath), placeholders: values.placeholders }, { blocks: values.blocks });
  return { output: values.output, contents };
}

/** CLI: write (default) or `--check` the rendered workflow under `repoRoot`. Returns the exit code. */
export function main({ argv, readFile, writeFile, log }, { repoRoot = DEFAULT_REPO_ROOT } = {}) {
  const { output, contents } = renderTovuDeployWorkflow({ readFile });
  const target = path.join(repoRoot, output);
  if (!argv.includes("--check")) {
    writeFile(target, contents);
    log(`Rendered ${output}`);
    return 0;
  }
  if (readFile(target) === contents) return 0;
  log(`${output} differs from its render; run node content/agent-plugins/fly/scripts/render-deploy-workflow.mjs`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main({
    argv: process.argv.slice(2),
    readFile: (file) => readFileSync(file, "utf8"),
    writeFile: (file, text) => writeFileSync(file, text),
    log: (message) => console.log(message),
  });
}
