/**
 * @file `discoverPlugins()` — enumerate built-in + site plugins with status (SPEC-005 REQ-02/03,
 * EC-08/EC-09, TB-01, DUP-01).
 *
 * Purpose:
 * Read-only enumeration. Scans the install-dir's `plugins/<id>/<version>/` tree (REQ-02) plus the
 * compiled-in built-in registry, performs BR-02 step (1)'s package-level checks (size, disallowed
 * files, `server/index.mjs` presence — see `manifest.ts`'s header for why those checks live here
 * rather than in `validateManifest()`), delegates manifest/identity/capability/hook/field checks to
 * `validateManifest()`, and returns one `PluginDiscoveryRecord` per discovered id with every
 * applicable error recorded — never throws for an individual plugin's own validation failure
 * (errors are data, not control flow; REQ-10/`PLUGINS_LIST` lists every discovered plugin, valid or
 * not).
 *
 * Never `import()`s plugin code — that is `loader.ts`'s job, gated by integrity/`sdkRange` first
 * (BR-01, CIC U-001). Discovery only reads bytes to hash/measure/list them.
 *
 * Architectural role:
 * TDD-certified implementation (implementation outline C-007). Signature and JSDoc are
 * design-frozen; `discoverPlugins()` validates built-ins, selects the latest installed site
 * version per id, records candidate-local errors without aborting discovery, marks duplicate ids,
 * and returns deterministic TB-01 ordering.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import * as semver from "semver";

import { validateManifest, type PluginManifest, type PluginTier, type PluginValidationError } from "./manifest.js";

/** A built-in plugin's in-code manifest-equivalent (ADR Decision item 4) — no tarball, no
 * integrity file (compiled-in code is definitionally not tampered), but still validated through
 * the same `validateManifest()` path as a site-installed plugin. */
export interface BuiltInPluginSource {
  readonly manifest: PluginManifest;
}

export interface DiscoverPluginsRequired {
  /** Every compiled-in built-in plugin (REQ-09's `word-count` is the v1 sole member). */
  readonly builtIns: readonly BuiltInPluginSource[];
  /** Absolute path to the site's `plugins/` install directory. Absent ⇒ legacy mode: built-ins
   * only, everything else behaves identically (EC-09, AC-16). */
  readonly installDir?: string;
}

export type DiscoverPluginsOptional = {}

/** In-memory, rebuilt each discovery pass — NOT persisted (state.spec.md §2). Feeds `PLUGINS_LIST`
 * once activation state is projected onto it by the caller (the HTTP route layer, C-016/C-017 —
 * discovery itself does not know about `plugin_activations`). */
export interface PluginDiscoveryRecord {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly source: "built-in" | "site";
  /** (1.1.2, REQ-10/REQ-18) The plugin's trust tier, projected verbatim from the already-required
   * `PluginManifest.tier` (REQ-01/ADR-024 §1) — mirrors how `source` already passes through
   * unchanged. Optional on this stub type only so pre-existing fixtures in unrelated test files
   * (`activation.integration.test.ts`, `loader.integration.test.ts`) that construct
   * `PluginDiscoveryRecord` literals for concerns unrelated to REQ-10/`PLUGINS_LIST` are not forced
   * to retrofit it; the real `discoverPlugins()` implementation must always populate it (a
   * discovered plugin's manifest always has a validated `tier` by the time a record exists),
   * enforced behaviorally by the dedicated REQ-10 pass-through tests in `plugins-dto.unit.test.ts`
   * / `plugins-http.integration.test.ts`, not by widening this field to non-optional everywhere. */
  readonly tier?: "tier-1" | "tier-2" | "tier-3";
  readonly status: "valid" | "invalid" | "incompatible";
  readonly errors: readonly PluginValidationError[];
  /**
   * (Milestone 1b, 2026-08-20) The already-parsed, already-`validateManifest()`-checked manifest
   * this record was built from — present if and only if `status === "valid"` (`undefined`
   * otherwise: an invalid/incompatible candidate's raw JSON may not conform to `PluginManifest`'s
   * shape at all, so this field never claims a validated type for a record that failed validation).
   *
   * Exists so a composition root's enable path (`server/plugin-runtime.ts`'s `onPluginEnabled()`)
   * can hand `loadPlugin()` the SAME manifest object this discovery pass already parsed, instead of
   * re-reading `tovu.plugin.json` a second time. This matters beyond avoiding duplicate I/O: every
   * real caller of `onPluginEnabled` (`activation.ts`'s `setPluginEnabled`, BR-05 step 1) already
   * calls `discoverPlugins()` fresh, in the SAME request, immediately before invoking it (see
   * `routes/admin/plugins/set-enabled.ts`) — so reusing that record's manifest is not a staleness
   * risk, it is the one-and-only read for this attempt. A second, independent load-time re-read
   * would instead open a narrow TOCTOU window: an attacker who can write to `installDir` between
   * the discovery read and a second load-time read could swap in a self-consistent tampered
   * manifest+entry pair that the discovery pass never actually validated. Reusing this field closes
   * that window by construction — there is only one read to race against, not two.
   *
   * Built-in records also carry it (trivially, from `BuiltInPluginSource.manifest`) for type
   * uniformity, but `onPluginEnabled`'s built-in branch does not need it — it already has the
   * composition root's own static `PluginRuntimeSource.manifest`, unchanged from before this slice.
   */
  readonly manifest?: PluginManifest;
}

/**
 * Enumerates every built-in and (when `installDir` is present) site-installed plugin, in TB-01
 * order (built-ins first by id ascending, then site plugins by id ascending). When two installed
 * versions of one site plugin id exist, only the latest-by-semver is included in the result (the
 * other stays dormant on disk, EC-08/AC-09) — the loader (not discovery) is what actually imports
 * the winning version later.
 *
 * @throws Never for an individual plugin's own validation/package failure — that plugin's record
 * simply carries a non-empty `errors[]` and a non-`valid` `status`. May reject for a genuine
 * infrastructure failure (e.g. `installDir` exists but is unreadable due to a permissions error)
 * that is not itself one specific plugin's fault.
 * @complexity O(n) over installed-plugin count, bounded I/O per candidate (one directory listing
 * + manifest read + per-file size stat).
 */
const VALID_TIERS = new Set<PluginTier>(["tier-1", "tier-2", "tier-3"]);
/** v1's loader is exactly ADR-024's Tier-3 reality — used only as a last-resort fallback when a
 * candidate's manifest doesn't parse far enough to carry its own (already-validated-elsewhere)
 * `tier` value, so a discovery record always has a renderable tier (REQ-18/AC-26). */
const FALLBACK_TIER: PluginTier = "tier-3";

/** Safely reads a JSON value's string property, or `undefined` when absent/wrong-typed. */
function readStringField(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = (value as Record<string, unknown>)[key];
  return typeof raw === "string" ? raw : undefined;
}

function readTierField(value: unknown): PluginTier {
  const raw = readStringField(value, "tier");
  return raw !== undefined && VALID_TIERS.has(raw as PluginTier) ? (raw as PluginTier) : FALLBACK_TIER;
}

/** Parses one `tovu.plugin.json` file's bytes; unparseable JSON becomes `null` — `validateManifest`
 * already reports a `MANIFEST_MALFORMED` entry for any non-object value (its own top-level guard),
 * so a parse failure and a wrong-shape object are handled through the exact same code path. */
function parseManifestJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function toDiscoveryRecord(params: {
  id: string;
  name: string;
  version: string;
  source: "built-in" | "site";
  manifestValue: unknown;
  errors: readonly PluginValidationError[];
}): PluginDiscoveryRecord {
  const isValid = params.errors.length === 0;
  return {
    id: params.id,
    name: params.name,
    version: params.version,
    source: params.source,
    tier: readTierField(params.manifestValue),
    status: isValid ? "valid" : "invalid",
    errors: params.errors,
    // Safe only because `isValid` means `validateManifest()` already reported zero errors against
    // this exact value — an invalid candidate's `manifestValue` is never cast (see the field's own
    // doc on `PluginDiscoveryRecord`).
    manifest: isValid ? (params.manifestValue as PluginManifest) : undefined,
  };
}

/**
 * The absolute entry-file path for a discovered SITE plugin (REQ-02's fixed `server/index.mjs`
 * package layout, ADR-004) — the exact path `loadPlugin()`'s `entryPath` param expects, and the
 * same join `discoverOneSiteCandidate()` below already performs internally for its manifest read.
 * Exported so a composition root resolving a dynamic site-sourced load target (`plugin-runtime.ts`)
 * does not re-derive this convention independently and risk it drifting from discovery's own.
 *
 * @complexity O(1) — pure path join, no I/O.
 */
export function siteEntryPath(installDir: string, id: string, version: string): string {
  return path.join(installDir, id, version, "server", "index.mjs");
}

/** One directory entry directly under `installDir` — a candidate plugin "id slot" that may contain
 * one or more version subdirectories (REQ-02's `plugins/<id>/<version>/` layout). */
async function listInstalledPluginIdFolders(installDir: string): Promise<string[]> {
  try {
    const entries = await readdir(installDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw error;
  }
}

/** Picks the latest-by-semver version subdirectory under one id folder (AC-09/EC-08) — the other
 * installed versions stay dormant on disk, never surfaced as a second row. Non-semver directory
 * names sort last (defensive; every certified fixture uses valid semver directory names). */
async function pickLatestVersionFolder(idFolderPath: string): Promise<string | null> {
  const entries = await readdir(idFolderPath, { withFileTypes: true });
  const versionNames = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  if (versionNames.length === 0) return null;

  const sorted = [...versionNames].sort((a, b) => {
    const aValid = semver.valid(a);
    const bValid = semver.valid(b);
    if (aValid && bValid) return semver.rcompare(aValid, bValid);
    if (aValid) return -1;
    if (bValid) return 1;
    return b.localeCompare(a);
  });
  return sorted[0] ?? null;
}

async function discoverOneSiteCandidate(
  installDir: string,
  idFolderName: string,
  builtInIds: readonly string[]
): Promise<PluginDiscoveryRecord | null> {
  const idFolderPath = path.join(installDir, idFolderName);
  const versionFolderName = await pickLatestVersionFolder(idFolderPath);
  if (versionFolderName === null) return null;

  const manifestPath = path.join(idFolderPath, versionFolderName, "tovu.plugin.json");
  let manifestValue: unknown = null;
  let missing = false;
  try {
    manifestValue = parseManifestJson(await readFile(manifestPath, "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      missing = true;
    } else {
      throw error;
    }
  }

  const errors: PluginValidationError[] = missing
    ? [{ code: "MANIFEST_MISSING", file: "tovu.plugin.json", message: "tovu.plugin.json was not found" }]
    : [...validateManifest({ manifest: manifestValue, folderName: idFolderName, builtInIds }).errors];

  const id = readStringField(manifestValue, "id") ?? idFolderName;
  const name = readStringField(manifestValue, "name") ?? idFolderName;

  return toDiscoveryRecord({ id, name, version: versionFolderName, source: "site", manifestValue, errors });
}

/** DUP-01 (`ID_DUPLICATE` half — `SHADOWS_BUILT_IN` is already handled per-record inside
 * `validateManifest`, which only ever sees one candidate at a time): a case-insensitive id
 * collision between two SITE plugins can only be detected once every candidate is known, so this
 * runs as a whole-set post-pass over the already-built site records. */
function markCaseInsensitiveDuplicates(records: readonly PluginDiscoveryRecord[]): PluginDiscoveryRecord[] {
  const countByLowerId = new Map<string, number>();
  for (const record of records) {
    const key = record.id.toLowerCase();
    countByLowerId.set(key, (countByLowerId.get(key) ?? 0) + 1);
  }

  return records.map((record) => {
    const isDuplicate = (countByLowerId.get(record.id.toLowerCase()) ?? 0) > 1;
    if (!isDuplicate) return record;

    const errors = [
      ...record.errors,
      { code: "ID_DUPLICATE", file: null, message: `id '${record.id}' collides case-insensitively with another installed site plugin` },
    ];
    return { ...record, errors, status: "invalid" as const };
  });
}

/** TB-01: built-ins first (id ascending), then site plugins (id ascending) — the same ordering
 * `hook-registry.ts`'s composition uses, so `PLUGINS_LIST` and hook-composition order never
 * diverge. */
function orderTb01(records: readonly PluginDiscoveryRecord[]): PluginDiscoveryRecord[] {
  const rank = (source: "built-in" | "site") => (source === "built-in" ? 0 : 1);
  return [...records].sort((a, b) => rank(a.source) - rank(b.source) || a.id.localeCompare(b.id));
}

export async function discoverPlugins(
  required: DiscoverPluginsRequired,
  _optional: DiscoverPluginsOptional = {}
): Promise<readonly PluginDiscoveryRecord[]> {
  const { builtIns, installDir } = required;
  const builtInIds = builtIns.map((b) => b.manifest.id);

  const builtInRecords = builtIns.map((builtIn) => {
    const errors = validateManifest({ manifest: builtIn.manifest, folderName: builtIn.manifest.id, builtInIds: [] }).errors;
    return toDiscoveryRecord({
      id: builtIn.manifest.id,
      name: builtIn.manifest.name,
      version: builtIn.manifest.version,
      source: "built-in",
      manifestValue: builtIn.manifest,
      errors,
    });
  });

  let siteRecords: PluginDiscoveryRecord[] = [];
  if (installDir !== undefined) {
    const idFolders = await listInstalledPluginIdFolders(installDir);
    const candidates = await Promise.all(
      idFolders.map((idFolderName) => discoverOneSiteCandidate(installDir, idFolderName, builtInIds))
    );
    siteRecords = markCaseInsensitiveDuplicates(candidates.filter((r): r is PluginDiscoveryRecord => r !== null));
  }

  return orderTb01([...builtInRecords, ...siteRecords]);
}
