import fs from "node:fs";
import path from "node:path";

import { stripComments } from "#src/platform/db/kernel/__tests__/raw-sqlite-scan";

/**
 * @file Single vendor-text boundary (vendor extraction phase 11, PLAN.md + coordinator REVIEW.md).
 * Plugin manifests own vocabulary; this extends the deploy scanner and absorbs the mail boundary.
 * Structural coupling remains owned by check-hardwiring.mjs. Comments never count.
 * Hosting knowledge belongs in per-host Agent Plugins; core reads descriptor IDs. A vendor branch
 * in core is behavior its plugin did not absorb (deploy plan T7/T8; deploy package removed in B7).
 */
const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../../..");
export const EXCEPTIONS_PATH = path.join(import.meta.dirname, "vendor-exceptions.json");
export const SCAN_ROOTS: readonly string[] = [
  "apps/website/src/", "apps/admin/src/",
  "apps/desktop/src/desktop-agent.ts", "apps/desktop/src/desktop-host-signals.ts",
];

type Io = Pick<typeof fs, "existsSync" | "readFileSync" | "readdirSync">;
type DiskOptions = { repoRoot?: string; io?: Io };
export type Counts = Record<string, Record<string, number>>;
export type VendorRule = { id: string; pattern: RegExp };
export type VendorException = { vendor: string; path: string; count: number; reason: string };
export type VendorPolicy = {
  vocabulary: Record<string, string[]>;
  exceptions: VendorException[];
  outsideScan: { vendor: string; path: string; reason: string }[];
};

// "render" is an ordinary word (and a React verb); "resend" and "replicate" are ordinary verbs.
// Vendor selections and secrets are code coupling. Ordinary verbs and the bundled catalog's
// opaque package IDs do not select a mail implementation. Keep branded mail names case-sensitive.
// Render's generic RENDER_* constants are CMS vocabulary; qualified env reads select the host.
const CONTEXTUAL = new Set(["render", "resend", "replicate"]);

// Owner 10-22: Tovu's first-party plugins are product features, not vendor vocabulary.
const FIRST_PARTY_PLUGINS = new Set(["tovu-theme", "site-import", "ui-ux-design", "site-compliance", "how-tovu-works", "deploy", "jev"]);

function literal({ value }: { value: string }, _options = {}): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compile identifier-bounded literals as one alternation per vendor; overlapping aliases count once.
 * An explicit underscore-suffixed alias denotes a credential/env prefix, not an incidental substring.
 * Pure; O(a log a) alias ordering plus literal text, with O(a + literal text) space.
 */
function vendorRule({ id, aliases }: { id: string; aliases: string[] }, _options = {}): VendorRule {
  const words = [...new Set([id, ...aliases])].sort((a, b) => b.length - a.length);
  const ordinary = words.filter(word => !CONTEXTUAL.has(word));
  const sources = ordinary.map(value => literal({ value }) + (value.endsWith("_") ? "[\\w$]*" : ""));
  if (CONTEXTUAL.has(id)) {
    if (id === "resend") sources.push(`\\b${id}\\b(?!\\s+(?:sign-in|invitation|confirmation|verification)\\b)`);
    if (id === "replicate") sources.push(`\\b${id}\\b`);
    sources.push(`\\b(?:driver|provider)["']?\\s*[:=]\\s*["'\u0060]${id}["'\u0060]`);
    sources.push(id === "render" ? `\\b(?:process\\s*\\.\\s*)?env\\s*\\.\\s*${id}_[a-z0-9_]+\\b` : `\\b${id}_[a-z0-9_]+\\b`);
  }
  // countVendors filters ordinary verbs after the longest contextual alternative has matched.
  const identifier = "[\\p{ID_Continue}$\\u200c\\u200d]";
  return { id, pattern: new RegExp(`(?<!${identifier})(?:${sources.join("|")})(?!${identifier})`, "giu") };
}

/** Reject malformed manifest/policy vocabulary instead of silently weakening the boundary. */
function aliasesOf({ value }: { value: unknown }, _options = {}): string[] {
  if (!Array.isArray(value) || value.some(alias => typeof alias !== "string" || !alias.trim())) {
    throw new TypeError("vendorAliases must be an array of nonblank literal strings");
  }
  return value;
}

/** Read only shipped manifest data; missing manifests are not runtime plugins. Invalid names/aliases throw. */
function manifestVocabulary({ file }: { file: string }, { io = fs }: Pick<DiskOptions, "io"> = {}): { id: string; aliases: string[] } | null {
  if (!io.existsSync(file)) return null;
  const manifest = JSON.parse(io.readFileSync(file, "utf8"));
  if (typeof manifest.name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(manifest.name)) throw new TypeError(`Invalid plugin name: ${file}`);
  const declared = manifest.extensions?.tovu?.vendorAliases;
  return { id: manifest.name, aliases: aliasesOf({ value: declared === undefined ? [] : declared }) };
}

/** Validate supplemental vocabulary against the manifest owner; never override a bundled vendor. */
function supplementalAliases({ id, aliases, vendors }: { id: string; aliases: unknown; vendors: Map<string, string[]> }, _options = {}): string[] {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new TypeError(`Invalid supplemental vendor: ${id}`);
  if (vendors.has(id)) throw new TypeError(`Supplemental vocabulary duplicates plugin: ${id}`);
  return aliasesOf({ value: aliases });
}

/** Read manifests as data, independently of plugin activation. One read per bundled manifest. */
export function loadVendorRules({ vocabulary }: Pick<VendorPolicy, "vocabulary">, { repoRoot = REPO_ROOT, io = fs }: DiskOptions = {}): VendorRule[] {
  const directory = path.join(repoRoot, "content/agent-plugins");
  const vendors = new Map<string, string[]>();
  for (const child of io.readdirSync(directory, { withFileTypes: true })) {
    if (!child.isDirectory()) continue;
    const file = path.join(directory, child.name, "plugin.json");
    const manifest = manifestVocabulary({ file }, { io });
    if (!manifest) continue;
    if (vendors.has(manifest.id)) throw new TypeError(`Duplicate plugin name: ${manifest.id}`);
    vendors.set(manifest.id, manifest.aliases);
  }
  for (const [id, aliases] of Object.entries(vocabulary)) {
    vendors.set(id, supplementalAliases({ id, aliases, vendors }));
  }
  return [...vendors].filter(([id]) => !FIRST_PARTY_PLUGINS.has(id))
    .sort(([a], [b]) => a.localeCompare(b)).map(([id, aliases]) => vendorRule({ id, aliases }));
}

/** Validate the single exception store; semantic path/count validation follows the real scan. */
export function loadVendorPolicy({ file = EXCEPTIONS_PATH }: { file?: string }, { io = fs }: Pick<DiskOptions, "io"> = {}): VendorPolicy {
  const policy = JSON.parse(io.readFileSync(file, "utf8"));
  if (typeof policy.vocabulary !== "object" || policy.vocabulary === null || Array.isArray(policy.vocabulary)) throw new TypeError("Invalid vendor vocabulary");
  if (!Array.isArray(policy.exceptions) || !Array.isArray(policy.outsideScan)) throw new TypeError("Invalid vendor policy");
  return policy;
}

function eligible({ name }: { name: string }, _options = {}): boolean {
  return /\.(ts|tsx|mts|cts)$/.test(name) && !/\.(test|spec|d)\.(ts|tsx|mts|cts)$/.test(name);
}

/** Traverse the existing exclusions. Missing/empty roots fail at scanVendorSources, never disappear. */
export function listSourceFiles({ entry }: { entry: string }, { repoRoot = REPO_ROOT, io = fs }: DiskOptions = {}): string[] {
  const full = path.join(repoRoot, entry);
  if (!io.existsSync(full)) return [];
  if (!entry.endsWith("/")) return eligible({ name: entry }) ? [full] : [];
  return listDirectorySources({ entry, repoRoot, io });
}

/** Recursive traversal keeps parser and filesystem effects separate; O(f log f) ordering for f directory entries. */
function listDirectorySources({ entry, repoRoot, io }: { entry: string; repoRoot: string; io: Io }, _options = {}): string[] {
  const full = path.join(repoRoot, entry);
  const out: string[] = [];
  for (const child of io.readdirSync(full, { withFileTypes: true })) {
    if (["node_modules", "dist", "__tests__", "__fixtures__"].includes(child.name)) continue;
    const relative = `${entry}${child.name}`;
    if (child.isDirectory()) out.push(...listSourceFiles({ entry: `${relative}/` }, { repoRoot, io }));
    else if (eligible({ name: child.name })) out.push(path.join(repoRoot, relative));
  }
  return out.sort();
}

/** Per-vendor counts in comment-stripped source. No mutation; O(v * s) vendor rules/source size. */
export function countVendors({ text, rules }: { text: string; rules: readonly VendorRule[] }, _options = {}): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const { id, pattern } of rules) {
    const hits = [...text.matchAll(new RegExp(pattern.source, pattern.flags))];
    const brand = id[0]!.toUpperCase() + id.slice(1);
    const count = hits.filter(hit => !CONTEXTUAL.has(id) || hit[0].toLowerCase() !== id || hit[0] === brand).length;
    if (count > 0) counts[id] = count;
  }
  return counts;
}

/** Reject vacuous roots before scanning, and deduplicate overlapping entries. O(f) file paths in memory. */
function collectSourceFiles({ roots, repoRoot, io }: { roots: readonly string[]; repoRoot: string; io: Io }, _options = {}): Set<string> {
  const files = new Set<string>();
  for (const entry of roots) {
    const listed = listSourceFiles({ entry }, { repoRoot, io });
    if (listed.length === 0) throw new TypeError(`Vendor scan root missing or empty: ${entry}`);
    for (const file of listed) files.add(file);
  }
  return files;
}

/** Scan each eligible file once, including contracts. I/O and comment parser are injectable. */
export function scanVendorSources({ rules }: { rules: readonly VendorRule[] }, {
  repoRoot = REPO_ROOT, io = fs, roots = SCAN_ROOTS, strip = stripComments,
}: DiskOptions & { roots?: readonly string[]; strip?: typeof stripComments } = {}): Counts {
  const files = collectSourceFiles({ roots, repoRoot, io });
  // Canonical words keep this pre-filter safe when comments separate provider/env syntax.
  const anyRule = new RegExp([
    ...rules.map(rule => rule.pattern.source), ...rules.map(rule => literal({ value: rule.id })),
  ].join("|"), "iu");
  const found: Counts = {};
  for (const file of [...files].sort()) {
    const text = io.readFileSync(file, "utf8");
    if (!anyRule.test(text)) continue;
    const counts = countVendors({ text: strip(file, text), rules });
    if (Object.keys(counts).length > 0) found[path.relative(repoRoot, file).split(path.sep).join("/")] = counts;
  }
  return found;
}

/** Reject absolute/traversing paths and unsupported glob syntax; Node owns glob matching. */
function validPath({ value }: { value: unknown }, _options = {}): boolean {
  if (typeof value !== "string") return false;
  return value.startsWith("apps/") && !value.includes("\\") && !value.split("/").includes("..")
    && !/[\[\]!?]/.test(value) && !value.endsWith("/");
}

function validateException({ entry, ids }: { entry: VendorException; ids: Set<string> }, _options = {}): void {
  if (!ids.has(entry.vendor)) throw new TypeError(`Unknown exception vendor: ${entry.vendor}`);
  if (!validPath({ value: entry.path })) throw new TypeError(`Invalid exception path: ${entry.path}`);
  if (typeof entry.reason !== "string" || !entry.reason.trim()) throw new TypeError("Exception needs a reason");
  if (!Number.isSafeInteger(entry.count) || entry.count <= 0) throw new TypeError("Exception needs a positive count");
}

/** Validate explicit documentation of release infrastructure; YAML is deliberately not scanned. */
export function validateOutsideScan({ policy, rules }: { policy: VendorPolicy; rules: readonly VendorRule[] }, { repoRoot = REPO_ROOT, io = fs }: DiskOptions = {}): void {
  const seen = new Set<string>();
  for (const entry of policy.outsideScan) {
    validateException({ entry: { ...entry, count: 1 }, ids: new Set(rules.map(rule => rule.id)) });
    if (entry.path !== "apps/desktop/electron-builder.yml" || seen.has(entry.path)) throw new TypeError(`Invalid outside-scan entry: ${entry.path}`);
    if (!io.existsSync(path.join(repoRoot, entry.path))) throw new TypeError(`Missing release file: ${entry.path}`);
    seen.add(entry.path);
  }
}

/** Validate the complete policy before accounting, including duplicate entries with disjoint hits. */
function exceptionTotals({ rules, exceptions }: { rules: readonly VendorRule[]; exceptions: readonly VendorException[] }, _options = {}): Map<VendorException, number> {
  const ids = new Set(rules.map(rule => rule.id));
  const totals = new Map<VendorException, number>();
  const seen = new Set<string>();
  for (const entry of exceptions) {
    validateException({ entry, ids });
    const key = `${entry.vendor}:${entry.path}`;
    if (seen.has(key)) throw new TypeError(`Duplicate exception: ${key}`);
    seen.add(key);
    totals.set(entry, 0);
  }
  return totals;
}

/** Mutate only the local accounting map, never scan/policy inputs; return uncovered file/vendor pairs. */
function tallyVendorFile({ file, vendors, exceptions, totals }: {
  file: string; vendors: Record<string, number>; exceptions: readonly VendorException[]; totals: Map<VendorException, number>;
}, _options = {}): string[] {
  const uncovered: string[] = [];
  for (const [vendor, count] of Object.entries(vendors)) {
    const matches = exceptions.filter(entry => entry.vendor === vendor && path.posix.matchesGlob(file, entry.path));
    if (matches.length > 1) throw new TypeError(`Overlapping exceptions: ${file}: ${vendor}`);
    const matched = matches[0];
    if (!matched) uncovered.push(`${file}: ${vendor} ${count}`);
    else totals.set(matched, totals.get(matched)! + count);
  }
  return uncovered;
}

/**
 * Apply pattern-level allowances, rejecting duplicate/overlapping/stale policy and reporting every
 * uncovered (file, vendor, count). Counts ratchet per pattern: moving/replacing a hit within that
 * pattern can preserve its total; this phase deliberately does not introduce occurrence hashes.
 * O(e * h), e exceptions and h file/vendor pairs; no I/O, no input mutation.
 */
export function judgeVendorCounts({ counts, rules, exceptions }: { counts: Counts; rules: readonly VendorRule[]; exceptions: readonly VendorException[] }, _options = {}): { uncovered: string[]; stale: string[] } {
  const totals = exceptionTotals({ rules, exceptions });
  const uncovered = Object.entries(counts).flatMap(([file, vendors]) => tallyVendorFile({ file, vendors, exceptions, totals }));
  const stale: string[] = [];
  for (const [entry, total] of totals) {
    const label = `${entry.path}: ${entry.vendor} ${entry.count} -> ${total}`;
    if (total > entry.count) uncovered.push(label);
    if (total < entry.count) stale.push(label);
  }
  return { uncovered: uncovered.sort(), stale: stale.sort() };
}
