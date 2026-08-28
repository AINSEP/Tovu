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
  let raw: string;
  try {
    raw = await readFile(path.join(workspaceRoot, ACTIVATIONS_FILENAME), "utf8");
  } catch {
    return EMPTY_ACTIVATIONS;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_ACTIVATIONS;
  }

  return normalizeActivations(parsed);
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
  if (typeof value !== "object" || value === null || Array.isArray(value)) return EMPTY_ACTIVATIONS;

  const raw = value as Readonly<Record<string, unknown>>;
  if (raw.schemaVersion !== 1) return EMPTY_ACTIVATIONS;

  const plugins = raw.plugins;
  if (typeof plugins !== "object" || plugins === null || Array.isArray(plugins)) return EMPTY_ACTIVATIONS;

  const normalized: Record<string, AgentPluginActivationRecord> = {};
  for (const [pluginId, entry] of Object.entries(plugins as Record<string, unknown>)) {
    if (!SAFE_PLUGIN_ID_PATTERN.test(pluginId)) continue;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) continue;
    const record = entry as Readonly<Record<string, unknown>>;
    if (typeof record.enabled !== "boolean") continue;
    normalized[pluginId] = {
      enabled: record.enabled,
      origin: record.origin === "bundled" ? "bundled" : "operator-installed",
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString(),
      updatedBy: typeof record.updatedBy === "string" ? record.updatedBy : "unknown",
    };
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
