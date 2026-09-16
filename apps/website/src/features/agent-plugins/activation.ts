/**
 * @file Per-workspace activation state for installed Agent Plugins — the record that makes
 * "bundled but inactive" a real, enforced condition rather than a note in a README.
 *
 * ---------------------------------------------------------------------------
 * Why this exists at all
 * ---------------------------------------------------------------------------
 * Until now there was no such record anywhere: `resolve-agent-plugin-refs.ts`'s own header says so
 * ("There is no record anywhere — confirmed 2026-08-21, zero hits in `src/platform/db/` and `src/server/` —
 * of which installed digest is 'the' current install"), and a package's mere presence under
 * `packages/sha256/*` was the whole of its authorization to be discovered, registered as a tool,
 * and injected into a run's prompt.
 *
 * That was fine while every package on disk got there because an operator ran an install command.
 * It stops being fine the moment Tovu itself pre-places a package (`seed-bundled.ts`), because then
 * presence-implies-consent silently converts a vendor decision into an operator one.
 *
 * ---------------------------------------------------------------------------
 * The default is "absent means active", and that is deliberate
 * ---------------------------------------------------------------------------
 * {@link isAgentPluginActive} treats a plugin with NO record as active. This looks backwards for a
 * feature whose point is inactivity, so the reasoning is stated plainly:
 *
 * - Every plugin already installed on every existing Tovu instance got there by an operator
 *   explicitly running `npm run agent-plugin:install`. That IS the consent. Defaulting those to
 *   inactive would silently break every current install on upgrade, to re-collect consent that was
 *   already given.
 * - A bundled package has no such act behind it. So the seeder writes an explicit
 *   `{ enabled: false, origin: "bundled" }` record AT SEED TIME, before anything can read it — and
 *   because seeding is idempotent and re-runs on every boot, deleting `activations.json` re-creates
 *   the disabled record rather than promoting the bundled plugin to active. The unsafe direction is
 *   closed; the safe one (an operator's own install keeps working) is left open.
 *
 * The net rule, then: **presence implies consent only for packages an operator put there.** The
 * record exists to say "Tovu put this here, and nobody has said yes yet."
 *
 * ---------------------------------------------------------------------------
 * ...but "absent" only means active when the file itself was READ successfully
 * ---------------------------------------------------------------------------
 * {@link readAgentPluginActivations} collapses a missing file, an unreadable one, a malformed one,
 * and one with the wrong envelope into the same empty record — fail-OPEN, for the reason its own
 * doc gives. That is right for the two surfaces that only DISCOVER plugins (a corrupt byte must not
 * silently hide every plugin an operator installed), and wrong for the one surface that decides
 * whether a capability may be SPENT: there, "I could not read the operator's decisions" is not a
 * statement that everything is permitted.
 *
 * {@link resolveAgentPluginActivation} is that stricter reader, added 2026-09-16 for
 * `tool-registrations.ts`'s per-call tool gate. It separates the two things
 * {@link readAgentPluginActivations} folds together:
 *
 * - **no file, or a well-formed file with no entry for this plugin** — nothing was recorded, so the
 *   "absent means active" rule above applies unchanged, and it answers `active`;
 * - **a file that exists but could not be read, parsed, or shape-checked, or an entry for THIS
 *   plugin that fails normalization** — a decision may well have been recorded and cannot be read,
 *   so it answers `undetermined`, and the gate denies.
 *
 * The header's own objection to fail-CLOSED ("no error surface to notice it by") is answered at that
 * call site and only there: a denied invocation is recorded as `denied` in the daemon's audit trail
 * and the gate logs the reason, so a corrupt file is loud rather than silent. Nothing about what
 * "active" MEANS differs between the two readers — only whether a fault is allowed to masquerade as
 * an answer.
 *
 * ---------------------------------------------------------------------------
 * Why a file and not a table
 * ---------------------------------------------------------------------------
 * All three places that must consult it — `capability-source.ts` (discovery),
 * `tool-registrations.ts` (tool registration), `resolve-agent-plugin-refs.ts` (run-start injection)
 * — receive an `AgentPluginWorkspaceLayout` or a `workspaceId`, and NONE of them has a database
 * handle. Threading one through would mean giving three pure-filesystem call paths a repo
 * dependency (and the agent daemon is a second OS process with its own handle over the same WAL —
 * `agent-daemon-server.ts:298-299` — so the two would also have to agree about freshness).
 *
 * Everything else about an installed Agent Plugin already lives on disk under the workspace's own
 * tenant-isolated root; its activation living beside it needs no new seam, no migration, and no
 * cross-process cache-coherence argument. `plugin_activations` (`db/schema.ts`) is the SPEC-005
 * `.tovu-plugin` runtime's table for a different plugin system with a different lifecycle — reusing
 * it would conflate two unrelated things that merely share a word.
 *
 * ---------------------------------------------------------------------------
 * Concurrency
 * ---------------------------------------------------------------------------
 * Writes are write-temp-then-`rename`, so a reader never observes a half-written file. Two
 * concurrent writers still race read-modify-write and the last one wins — acceptable and stated
 * rather than papered over: this record changes when a human toggles a plugin, which is neither
 * frequent nor concurrent, and the failure mode of losing one toggle is a visibly wrong checkbox,
 * not corruption. A lock would be real work for a race nobody has.
 *
 * Architectural role:
 * Filesystem state for one workspace, reached only through `layout.ts`'s `forWorkspace()` root — the
 * same tenant-isolation guarantee every other path in this feature goes through.
 */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/** Where a workspace's activation record lives, relative to its own agent-plugin root. */
export const ACTIVATIONS_FILENAME = "activations.json";

/** How a package came to be on disk. The whole reason the record is not just a boolean: it is what
 *  lets an operator (and a future admin screen) tell "Tovu shipped this, you have not enabled it"
 *  apart from "you installed this and then turned it off". */
export type AgentPluginOrigin = "bundled" | "operator-installed";

export interface AgentPluginActivationRecord {
  readonly enabled: boolean;
  readonly origin: AgentPluginOrigin;
  readonly updatedAt: string;
  /** Who last changed it — an operator identifier, or `"system:seed"` for the seeder's own initial
   *  disabled record. Audit breadcrumb; never used for authorization. */
  readonly updatedBy: string;
}

export interface AgentPluginActivations {
  readonly schemaVersion: 1;
  readonly plugins: Readonly<Record<string, AgentPluginActivationRecord>>;
}

const EMPTY_ACTIVATIONS: AgentPluginActivations = { schemaVersion: 1, plugins: {} };

/** Same grammar `layout.ts` guards path segments with — an id that reaches this module is used as
 *  an object key, not a path, but validating in both places keeps a future caller from being the
 *  first one to find out the two disagreed. */
const SAFE_PLUGIN_ID_PATTERN = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;

/**
 * Whether a plugin may be discovered, registered as a tool, or injected into a run.
 *
 * @param activations - This workspace's record, as returned by {@link readAgentPluginActivations}.
 * @param pluginId - The plugin's manifest `name`.
 * @returns `false` only when an explicit record says `enabled: false`. See this file's header for
 * why an absent record means active.
 * @complexity O(1).
 */
export function isAgentPluginActive(activations: AgentPluginActivations, pluginId: string): boolean {
  const record = activations.plugins[pluginId];
  return record === undefined ? true : record.enabled;
}

/**
 * Filters any list of plugin-shaped values down to the ones this workspace has active.
 *
 * Takes the id accessor rather than a concrete type so the three gate sites — which hold
 * `InstalledAgentPlugin`s, `AgentPluginToolSource`s, and capability cards respectively — all share
 * one implementation of the rule instead of three `filter` calls that could drift apart on what
 * "active" means.
 *
 * @complexity O(n) in the list length.
 */
export function filterActiveAgentPlugins<T>(
  activations: AgentPluginActivations,
  items: readonly T[],
  pluginIdOf: (item: T) => string,
): readonly T[] {
  return items.filter((item) => isAgentPluginActive(activations, pluginIdOf(item)));
}

/**
 * Reads one workspace's activation record.
 *
 * @param workspaceRoot - `AgentPluginWorkspaceLayout.root`, never an instance-level path.
 * @returns The parsed record, or an empty one when the file does not exist yet — which is the
 * normal state for a workspace that has never installed or been seeded anything.
 * @throws Nothing for a missing, unreadable, malformed, or wrong-version file: all of those return
 * an empty record. That is fail-OPEN, and it is the correct direction here specifically because the
 * seeder re-writes the bundled plugin's disabled record on every boot — a corrupted file therefore
 * cannot leave a bundled plugin active, while fail-CLOSED would let one bad byte silently disable
 * every plugin an operator actually installed, with no error surface to notice it by.
 * @complexity O(p) in the recorded plugin count.
 */
export async function readAgentPluginActivations(workspaceRoot: string): Promise<AgentPluginActivations> {
  const document = await readActivationsDocument(workspaceRoot);
  return document.kind === "entries" ? normalizePluginsBag(document.entries) : EMPTY_ACTIVATIONS;
}

/**
 * What one workspace's activations file was found to be — the one place the difference between
 * "there is nothing recorded here" and "something is recorded and I cannot read it" survives.
 * {@link readAgentPluginActivations} deliberately discards that difference; the tool gate's
 * {@link resolveAgentPluginActivation} is the reader that needs it.
 */
type ActivationsDocument =
  | { readonly kind: "absent" }
  | { readonly kind: "entries"; readonly entries: Readonly<Record<string, unknown>> }
  | { readonly kind: "unreadable"; readonly reason: string };

/**
 * Reads and shape-checks the activations file once, for BOTH readers above and below — so the
 * lenient and the strict view can never drift apart on what parses, only on what they do about a
 * fault.
 *
 * @complexity One file read plus one `JSON.parse` in the file's own size.
 */
async function readActivationsDocument(workspaceRoot: string): Promise<ActivationsDocument> {
  let raw: string;
  try {
    raw = await readFile(path.join(workspaceRoot, ACTIVATIONS_FILENAME), "utf8");
  } catch (error) {
    // ENOENT — including a workspace root that does not exist yet — is the ordinary never-recorded
    // state, not a fault. Anything else (EACCES, ENOTDIR, EIO, EMFILE, ...) is a real failure to
    // read a file that may well hold a decision.
    if (errorCode(error) === "ENOENT") return { kind: "absent" };
    return { kind: "unreadable", reason: `${ACTIVATIONS_FILENAME} could not be read (${describeError(error)})` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { kind: "unreadable", reason: `${ACTIVATIONS_FILENAME} is not valid JSON (${describeError(error)})` };
  }

  const entries = extractPluginsBag(parsed);
  if (entries === undefined) {
    return { kind: "unreadable", reason: `${ACTIVATIONS_FILENAME} is not a schemaVersion 1 activations document` };
  }
  return { kind: "entries", entries };
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** A short, log-safe rendering of a thrown value. Carries the error's own message (which for a
 *  filesystem fault names this workspace's own path — a host path, so a caller that surfaces this
 *  must keep it in a server-side log and out of any model- or user-facing payload). */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** One plugin's activation state, or the explicit third answer the other two readers cannot give:
 *  the operator's decisions could not be established at all. */
export type AgentPluginActivationVerdict =
  | { readonly verdict: "active" }
  | { readonly verdict: "inactive" }
  | { readonly verdict: "undetermined"; readonly reason: string };

/**
 * The fail-CLOSED read of ONE plugin's activation state — see this file's header for why the
 * per-call tool gate needs a third answer that {@link isAgentPluginActive} cannot express.
 *
 * `active` still covers the "absent means active" rule unchanged: no file at all, or a well-formed
 * file that simply has no entry for this plugin. `undetermined` covers only genuine faults — a file
 * that exists but cannot be read, parsed, or shape-checked, or an entry for THIS plugin that fails
 * normalization (a non-object entry, a non-boolean `enabled`). A malformed entry is deliberately NOT
 * treated the way {@link normalizeActivations} treats it for discovery, where dropping it and
 * falling back to "absent, therefore active" is harmless: here that fallback would read a garbled
 * decision as consent.
 *
 * @param workspaceRoot - `AgentPluginWorkspaceLayout.root`, never an instance-level path.
 * @param pluginId - The plugin's manifest `name`.
 * @returns The verdict, with a log-safe reason on `undetermined`.
 * @throws Nothing — every failure is folded into `undetermined`.
 * @complexity One file read plus O(1) lookup.
 */
export async function resolveAgentPluginActivation(workspaceRoot: string, pluginId: string): Promise<AgentPluginActivationVerdict> {
  const document = await readActivationsDocument(workspaceRoot);
  if (document.kind === "unreadable") return { verdict: "undetermined", reason: document.reason };
  if (document.kind === "absent") return { verdict: "active" };

  // `Object.hasOwn`, not a plain lookup: the bag comes straight from `JSON.parse`, so it still
  // carries `Object.prototype`, and several ids that pass the name grammar (`constructor`,
  // `toString`, ...) would otherwise resolve to an inherited function rather than a missing entry.
  if (!Object.hasOwn(document.entries, pluginId)) return { verdict: "active" };

  const record = normalizeActivationEntry(pluginId, document.entries[pluginId]);
  if (record === undefined) {
    return { verdict: "undetermined", reason: `${ACTIVATIONS_FILENAME} holds an unreadable record for '${pluginId}'` };
  }
  return record.enabled ? { verdict: "active" } : { verdict: "inactive" };
}

/** Whether `value` is a plain (non-null, non-array) object — the shape every one of this file's
 *  JSON-adjacent values (the activations envelope, and each individual plugin entry) must have
 *  before its own fields are worth looking at. */
function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The `plugins` bag out of an already-`JSON.parse`d activations value, or `undefined` when the
 *  top-level envelope doesn't match this schema version at all (wrong shape, wrong
 *  `schemaVersion`, or a non-object `plugins`) — collapsing the three top-level shape gates
 *  {@link normalizeActivations} used to inline into one lookup its loop can build on. */
function extractPluginsBag(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (!isPlainObject(value) || value.schemaVersion !== 1 || !isPlainObject(value.plugins)) return undefined;
  return value.plugins;
}

/** Fills in an activation record's optional fields from a (validated-boolean-`enabled`) raw entry.
 *  Pure defaulting: no field here can fail validation, only fall back to a safe default — matching
 *  the file's own "fail-OPEN per malformed field, never per entry" discipline (see this file's
 *  header). */
function withActivationDefaults(record: Readonly<Record<string, unknown>>, enabled: boolean): AgentPluginActivationRecord {
  return {
    enabled,
    origin: record.origin === "bundled" ? "bundled" : "operator-installed",
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString(),
    updatedBy: typeof record.updatedBy === "string" ? record.updatedBy : "unknown",
  };
}

/** One `plugins` entry, normalized — or `undefined` when it does not match the shape (bad plugin
 *  id, non-object entry, or a non-boolean `enabled`), so {@link normalizeActivations}'s loop stays a
 *  simple accumulate-or-skip. */
function normalizeActivationEntry(pluginId: string, entry: unknown): AgentPluginActivationRecord | undefined {
  if (!SAFE_PLUGIN_ID_PATTERN.test(pluginId)) return undefined;
  const record = isPlainObject(entry) ? entry : undefined;
  if (record === undefined || typeof record.enabled !== "boolean") return undefined;
  return withActivationDefaults(record, record.enabled);
}

/**
 * Validates an already-`JSON.parse`d activations value, dropping anything that does not match the
 * shape. Pure, so the parsing rules are assertable without touching a filesystem.
 *
 * Per-entry rather than all-or-nothing: one malformed entry must not discard the operator's other,
 * perfectly good decisions.
 *
 * @complexity O(p) in the entry count.
 */
export function normalizeActivations(value: unknown): AgentPluginActivations {
  const plugins = extractPluginsBag(value);
  if (plugins === undefined) return EMPTY_ACTIVATIONS;
  return normalizePluginsBag(plugins);
}

/** The per-entry accumulate-or-skip loop itself, split out of {@link normalizeActivations} so
 *  {@link readAgentPluginActivations} can run it over an ALREADY shape-checked bag rather than
 *  re-deriving one — one implementation of "which entries survive", not two.
 *
 *  @complexity O(p) in the entry count. */
function normalizePluginsBag(plugins: Readonly<Record<string, unknown>>): AgentPluginActivations {
  const normalized: Record<string, AgentPluginActivationRecord> = {};
  for (const [pluginId, entry] of Object.entries(plugins)) {
    const record = normalizeActivationEntry(pluginId, entry);
    if (record !== undefined) normalized[pluginId] = record;
  }

  return { schemaVersion: 1, plugins: normalized };
}

export interface SetAgentPluginActivationRequired {
  readonly workspaceRoot: string;
  readonly pluginId: string;
  readonly enabled: boolean;
  /** Recorded as `updatedBy`. An operator identifier at a real call site. */
  readonly actor: string;
}

export interface SetAgentPluginActivationOptional {
  readonly origin?: AgentPluginOrigin;
  readonly now?: () => Date;
}

/**
 * Records an operator's explicit activation decision for one plugin.
 *
 * @throws {Error} If `pluginId` does not match the Agent Plugins name grammar.
 * @returns The record as written, so a caller does not have to re-read to confirm.
 * @complexity O(p) in the recorded plugin count — the whole (small) file is rewritten.
 */
export async function setAgentPluginActivation(
  required: SetAgentPluginActivationRequired,
  optional: SetAgentPluginActivationOptional = {},
): Promise<AgentPluginActivations> {
  const { workspaceRoot, pluginId, enabled, actor } = required;
  assertPluginId(pluginId);

  const current = await readAgentPluginActivations(workspaceRoot);
  const existing = current.plugins[pluginId];
  const next: AgentPluginActivations = {
    schemaVersion: 1,
    plugins: {
      ...current.plugins,
      [pluginId]: {
        enabled,
        // Provenance is a fact about how the package arrived, not about this decision, so an
        // existing value is preserved rather than overwritten by a toggle.
        origin: optional.origin ?? existing?.origin ?? "operator-installed",
        updatedAt: (optional.now?.() ?? new Date()).toISOString(),
        updatedBy: actor,
      },
    },
  };

  await writeActivationsAtomically(workspaceRoot, next);
  return next;
}

/**
 * Writes the initial `{ enabled: false, origin: "bundled" }` record for a plugin Tovu itself placed
 * on disk — and does nothing at all if any record already exists.
 *
 * The no-overwrite rule is the whole contract: this runs on every boot (see `seed-bundled.ts`), so
 * overwriting would re-disable a plugin the operator had deliberately enabled, every restart.
 *
 * @returns `{ recorded: true }` when it wrote the initial disabled record, `{ recorded: false }`
 * when a decision already existed and was left alone.
 * @throws {Error} If `pluginId` does not match the Agent Plugins name grammar.
 * @complexity O(p) in the recorded plugin count.
 */
export async function recordBundledAgentPluginIfAbsent(
  required: { readonly workspaceRoot: string; readonly pluginId: string },
  optional: { readonly now?: () => Date } = {},
): Promise<{ readonly recorded: boolean }> {
  assertPluginId(required.pluginId);

  const current = await readAgentPluginActivations(required.workspaceRoot);
  if (current.plugins[required.pluginId] !== undefined) return { recorded: false };

  await setAgentPluginActivation(
    { workspaceRoot: required.workspaceRoot, pluginId: required.pluginId, enabled: false, actor: "system:seed" },
    { origin: "bundled", ...(optional.now !== undefined ? { now: optional.now } : {}) },
  );
  return { recorded: true };
}

export interface DeleteAgentPluginActivationRequired {
  readonly workspaceRoot: string;
  readonly pluginId: string;
}

/**
 * Removes a plugin's activation record entirely, rather than leaving a disabled tombstone.
 *
 * The ONLY caller (2026-09-09) is `uninstall.ts`'s `uninstallAgentPlugin()`, on a successful
 * uninstall of an operator-installed plugin — see that file's own header for the full decision.
 * Short version: a tombstone (`enabled: false` left behind after the bytes are gone) would invert
 * this file's own "absent means active, because an operator's own install IS the consent" rule
 * (this file's header, above) the moment the SAME plugin id is ever reinstalled — the fresh install
 * would silently inherit a stale disabled flag about bytes that no longer exist. Deleting the record
 * makes a future reinstall of this id start exactly where any first-ever install starts.
 *
 * A no-op, not an error, when no record exists — matches `recordBundledAgentPluginIfAbsent`'s own
 * idempotent style; a caller uninstalling a plugin that was never explicitly toggled should not have
 * to special-case "there was nothing to clear".
 *
 * @throws {Error} If `pluginId` does not match the Agent Plugins name grammar.
 * @complexity O(p) in the recorded plugin count — the whole (small) file is rewritten, same as every
 * other write in this file.
 */
export async function deleteAgentPluginActivation(required: DeleteAgentPluginActivationRequired): Promise<void> {
  const { workspaceRoot, pluginId } = required;
  assertPluginId(pluginId);

  const current = await readAgentPluginActivations(workspaceRoot);
  if (current.plugins[pluginId] === undefined) return;

  const remaining = { ...current.plugins };
  delete remaining[pluginId];
  const next: AgentPluginActivations = { schemaVersion: 1, plugins: remaining };

  await writeActivationsAtomically(workspaceRoot, next);
}

function assertPluginId(pluginId: string): void {
  if (!SAFE_PLUGIN_ID_PATTERN.test(pluginId) || pluginId.length > 64) {
    throw new Error(`agent-plugin activation: '${pluginId}' is not a valid Agent Plugin id`);
  }
}

/**
 * Write-temp-then-`rename`, so a concurrent reader sees either the whole previous file or the whole
 * new one and never a truncated JSON document. Same discipline `install.ts`'s `publish()` uses for
 * a package tree, applied to a single small file.
 *
 * @complexity One write plus one rename.
 */
async function writeActivationsAtomically(workspaceRoot: string, activations: AgentPluginActivations): Promise<void> {
  await mkdir(workspaceRoot, { recursive: true, mode: 0o700 });
  const finalPath = path.join(workspaceRoot, ACTIVATIONS_FILENAME);
  const tempPath = `${finalPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await writeFile(tempPath, `${JSON.stringify(activations, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(tempPath, finalPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}
