#!/usr/bin/env node
/**
 * ADR-071 Wiring-section check (Tovu side).
 *
 * Every Jini-bound feature folder (an `apps/<app>/src/features/<name>/` ancestor of an inventory
 * row scoped `bound` or `mixed`) needs an `INFO.md` or `README.md` with a `## Wiring` section, and
 * every port-shaped identifier that section names in backticks must be declared somewhere a host
 * could actually import it from. Ratchet: folders touched since the base ref fail the run; the
 * untouched backlog is only reported, so the check can land before every folder is documented.
 *
 * Usage: node development/scripts/check-wiring-sections.mjs [--root <dir>]
 * Base ref: WIRING_BASE_REF, else EXTRACTION_BASE_REF, else HEAD.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const INVENTORY_PATH = 'development/boundaries/extraction-inventory.json';
const FEATURE_ROOT = /^(apps\/[^/]+\/src\/features\/[^/]+)(?:\/|$)/;
// ADR-071 keeps themes in Tovu, so a theme folder is host-owned even if a row under it is mislabelled.
const THEME_FOLDER = /\/(?:[^/]*-)?themes?$/;
const PORT_NAME = /\b[A-Z][A-Za-z0-9]*(?:Ports?|Deps|Props|Hooks|Kit)\b/g;
const DECLARATION = /\b(?:type|interface|class|const|function|enum)\s+([A-Z][A-Za-z0-9_]*)/g;
const SOURCE_FILE = /\.(?:d\.ts|tsx?|mts|cts|mjs|js)$/;
// Test files are skipped: a fake declared beside a test must not satisfy a port the host has to import.
const SKIP_DIR = new Set(['node_modules', '.git', 'dist', 'coverage', '__tests__', '__fixtures__']);
const ZERO_SHA = /^0+$/;
const BOUND_SCOPES = new Set(['bound', 'mixed']);

/** Rows may sit under any of these keys; reading all of them keeps the check stable while the inventory format settles. */
function inventoryPaths({ inventory }, _options = {}) {
  const lists = Array.isArray(inventory) ? [inventory] : ['rows', 'entries', 'files', 'roots', 'boundRoots'].map((key) => inventory?.[key]);
  return lists.filter(Array.isArray).flat().map((row) => (typeof row === 'string' ? row : row?.path)).filter((path) => typeof path === 'string');
}

/** Distinct feature folders that own at least one bound or mixed path, per the inventory's own classifier. */
export function boundFeatureFolders({ inventory, classifyPath }, _options = {}) {
  const folders = new Set();
  const themeRoots = (Array.isArray(inventory?.themeRoots) ? inventory.themeRoots : []).map((root) => root.replace(/\/?$/, '/'));
  const isTheme = (folder) => THEME_FOLDER.test(folder) || themeRoots.some((root) => `${folder}/`.startsWith(root));
  for (const path of inventoryPaths({ inventory })) {
    const folder = FEATURE_ROOT.exec(path.replace(/^\.\//, ''))?.[1];
    if (!folder || isTheme(folder)) continue;
    // The classifier, not the row's own field, decides: it applies exceptions and host dispositions.
    if (BOUND_SCOPES.has(classifyPath({ inventory, path })?.scope)) folders.add(folder);
  }
  return [...folders].sort();
}

/** The `## Wiring` section body (up to the next level-1/2 heading), or undefined when absent. */
export function wiringSection({ markdown }, _options = {}) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s+Wiring\b/i.test(line));
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,2}\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

/** Port-shaped PascalCase names inside backtick spans; prose outside code spans is not a claim. */
export function namedPorts({ section }, _options = {}) {
  const names = new Set();
  for (const [, span] of section.matchAll(/`([^`\n]+)`/g)) {
    for (const [name] of span.matchAll(PORT_NAME)) names.add(name);
  }
  return [...names];
}

function walkSources({ dir }, _options = {}) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !SKIP_DIR.has(entry.name)) files.push(...walkSources({ dir: join(dir, entry.name) }));
    else if (entry.isFile() && SOURCE_FILE.test(entry.name) && !/\.(?:test|spec)\./.test(entry.name)) files.push(join(dir, entry.name));
  }
  return files;
}

function declaredNames({ dirs }, _options = {}) {
  const names = new Set();
  for (const file of dirs.flatMap((dir) => walkSources({ dir }))) {
    for (const [, name] of readFileSync(file, 'utf8').matchAll(DECLARATION)) names.add(name);
  }
  return names;
}

/** Source dirs of every @jini-ai/* package; a linked checkout resolves to its real `src`, an installed copy to `dist`. */
function jiniSourceDirs({ root }, _options = {}) {
  const scope = join(root, 'node_modules/@jini-ai');
  if (!existsSync(scope)) return [];
  return readdirSync(scope).map((name) => realpathSync(join(scope, name))).map((pkg) => {
    if (existsSync(join(pkg, 'src'))) return join(pkg, 'src');
    return join(pkg, 'dist');
  });
}

/** Lazily built name index; the Jini scan is only paid for when a folder names a port it does not declare itself. */
function createPortIndex({ root }, _options = {}) {
  let shared;
  return {
    has({ folder, name }) {
      if (declaredNames({ dirs: [join(root, folder)] }).has(name)) return true;
      shared ??= declaredNames({ dirs: [join(root, 'packages/contracts/src'), ...jiniSourceDirs({ root })] });
      return shared.has(name);
    },
  };
}

function wiringDoc({ root, folder }, _options = {}) {
  for (const name of ['INFO.md', 'README.md']) {
    const file = join(root, folder, name);
    const section = existsSync(file) ? wiringSection({ markdown: readFileSync(file, 'utf8') }) : undefined;
    if (section !== undefined) return { file: `${folder}/${name}`, section };
  }
  return undefined;
}

/** One folder's finding, or undefined when its Wiring section is present and every named port exists. */
export function inspectFolder({ root, folder, portIndex }, _options = {}) {
  const doc = wiringDoc({ root, folder });
  if (!doc) return { folder, reason: 'no "## Wiring" section in INFO.md or README.md', missing: [] };
  const missing = namedPorts({ section: doc.section }).filter((name) => !portIndex.has({ folder, name }));
  if (missing.length === 0) return undefined;
  return { folder, reason: `${doc.file} names undeclared port(s): ${missing.join(', ')}`, missing };
}

function gitLines({ root, args }, _options = {}) {
  const out = execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return out.split('\n').map((line) => line.trim()).filter(Boolean);
}

/** Committed changes since the base plus staged, unstaged and untracked work, so a local run matches CI. */
export function changedPaths({ root, baseRef }, _options = {}) {
  // A zero SHA is what CI hands over for a new branch; the parent commit is the nearest real base.
  const base = ZERO_SHA.test(baseRef) ? 'HEAD^' : baseRef;
  return new Set([
    ...gitLines({ root, args: ['diff', '--name-only', `${base}...HEAD`] }),
    ...gitLines({ root, args: ['diff', '--name-only', 'HEAD'] }),
    ...gitLines({ root, args: ['ls-files', '--others', '--exclude-standard'] }),
  ]);
}

/** Runs the check; returns the folders checked and their findings split into errors (touched) and warnings. */
export function checkWiringSections({ root }, { inventoryApi, baseRef = 'HEAD' } = {}) {
  const inventory = inventoryApi.loadInventory({ root });
  const checked = boundFeatureFolders({ inventory, classifyPath: inventoryApi.classifyPath });
  const changed = [...changedPaths({ root, baseRef })];
  const portIndex = createPortIndex({ root });
  const errors = [];
  const warnings = [];
  for (const folder of checked) {
    const finding = inspectFolder({ root, folder, portIndex });
    if (!finding) continue;
    const touched = changed.some((path) => path.startsWith(`${folder}/`));
    (touched ? errors : warnings).push(finding);
  }
  return { checked, errors, warnings };
}

function report({ result }, _options = {}) {
  const { checked, errors, warnings } = result;
  console.log(`[check-wiring] ${checked.length} Jini-bound feature folder(s); ${errors.length} error(s), ${warnings.length} warning(s).`);
  for (const finding of errors) console.error(`  ERROR ${finding.folder}: ${finding.reason}`);
  if (warnings.length > 0) {
    console.log(`  ${warnings.length} untouched folder(s) still need a valid Wiring section (ADR-071); first ${Math.min(5, warnings.length)}:`);
    for (const finding of warnings.slice(0, 5)) console.log(`  warn  ${finding.folder}: ${finding.reason}`);
  }
}

async function main(argv) {
  const rootFlag = argv.indexOf('--root');
  const root = resolve(rootFlag === -1 ? process.cwd() : argv[rootFlag + 1]);
  if (!existsSync(join(root, INVENTORY_PATH))) {
    console.error(`[check-wiring] extraction inventory not found at ${relative(process.cwd(), join(root, INVENTORY_PATH)) || INVENTORY_PATH}; the Jini-bound folder list comes from it, so nothing can be checked.`);
    return 1;
  }
  // Resolved beside this script, not under --root, so a fixture root needs only its inventory JSON.
  const inventoryApi = await import(new URL('./lib/extraction-inventory.mjs', import.meta.url).href);
  const baseRef = process.env.WIRING_BASE_REF || process.env.EXTRACTION_BASE_REF || 'HEAD';
  const result = checkWiringSections({ root }, { inventoryApi, baseRef });
  report({ result });
  return result.errors.length > 0 ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await main(process.argv.slice(2));
}
