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
 * Writers never rewrite what they could not read (2026-09-16, t91 F1.1)
 * ---------------------------------------------------------------------------
 * Every writer below used to build its next state from {@link readAgentPluginActivations}'s LENIENT
 * view — the same "unreadable folds to empty" read that is correct for discovery — and then wrote
 * that view straight back out. Against a corrupt file, that laundered every operator decision inside
 * it into a fresh, well-formed file recording NOTHING: a disabled plugin's `enabled: false` record
 * simply vanished, and "absent means active" (this header, above) turned it active again. A second,
 * narrower arm of the same bug survived even a whole-file fix: the writers built their next state
 * from the NORMALIZED bag, which silently drops any single malformed entry — so toggling one
 * unrelated plugin was enough to erase a neighboring entry the gate was correctly treating as
 * `undetermined` (denied), re-admitting it as `active` the moment the rewrite landed.
 *
 * The rule now: every writer reads the RAW `plugins` bag with {@link readPluginsBagStrict} — which
 * throws {@link AgentPluginActivationsUnreadableError} on an unreadable file instead of returning an
 * empty one — and edits that raw bag directly, preserving byte-for-byte every entry it is not the
 * one changing (malformed or not). `absent` (no file yet) still starts empty, so a first boot seeds
 * exactly as before; only a file that EXISTS and cannot be read, parsed, or shape-checked refuses.
 *
 * The boot consequence is `seed-bundled.ts`'s to own (see that file's header): a corrupt file makes
 * the seeder install nothing and report every bundled plugin `failed`, rather than write around the
 * fault. Nothing here throws on the read `readAgentPluginActivations` itself still uses for
 * discovery — that reader, and its "absent/unreadable both fold to empty" contract, are unchanged.
 *
 * ---------------------------------------------------------------------------
 * Concurrency
 * ---------------------------------------------------------------------------
 * Writes are write-temp-then-`rename`, with a uniquely named temp file per write, so a reader never
 * observes a half-written file.
 *
 * Within ONE process every read-modify-write of a workspace's file is serialized
 * ({@link serializeActivationsWrite}). This used to be waved off as "a race nobody has, whose worst
 * case is a visibly wrong checkbox". Both halves were false (t91 review, 2026-09-16): the admin
 * Agent Plugins screen deliberately lets two rows toggle at once, and each row renders its own
 * PATCH response — so when two writes both read the same file and the second `rename` erased the
 * first one's `enabled: false`, the operator saw the plugin OFF while "absent means active" had
 * already turned it back ON. Two writes in the same millisecond also shared one temp path, and one
 * of them failed with `ENOENT`.
 *
 * ACROSS processes (t91, 2026-09-16, plan `agent-reports/2026-09-16-t91-plan-activations-lock.md`):
 * every writer below also takes an exclusive, cross-process lock (`exclusive-file-lock.ts`) on
 * `<root>/activations.json.lock` before its strict read, and holds it until the rename lands. The
 * in-process chain above stays in FRONT of that lock — it still gives same-process writers FIFO
 * order with no polling — and the lock is not reentrant, so the invariant is: **no exported function
 * in this file may be called from inside a chain turn or a lock callback.** Such a call would wait on
 * a lock (or a chain slot) it is already holding, and hang exactly like re-entering the chain would.
 * `recordBundledAgentPluginIfAbsent` keeps using the private `writeActivationDecision` rather than
 * calling `setAgentPluginActivation`, for this reason.
 *
 * A lock is judged stale — and broken, unblocking every waiter — if its holder is a dead process on
 * this same host, or if it is simply older than 10s; see `exclusive-file-lock.ts`'s own header for
 * the full protocol and every failure mode it closes. A writer that cannot take the lock within 15s,
 * or that loses it (a stalled holder judged stale by someone else) right before its own rename,
 * throws {@link AgentPluginActivationsBusyError} and writes NOTHING — never a partial or stale write.
 *
 * Residuals this does NOT close, stated rather than hidden:
 * - R6: the boot seeder still installs a package before recording it inactive; a crash between the
 *   two leaves an unrecorded (and therefore active) bundled package. Pre-flighting the lock clears
 *   any stale lock before anything is installed, which narrows but does not remove this window.
 * - The tiny gap between a holder's own `assertHeld()` and its `rename` — closed to "never a stale
 *   write survives it", not to "zero probability another process ever judged this lock stale in that
 *   instant".
 * - A network filesystem, or a lock left by a crash that is later swept into site source control by
 *   `duplicate-site.ts`'s `cpSync` (this repo does not touch `sites/**` here to fix that).
 * - A killed writer can leave a stray `activations.json.tmp-*` file; nothing currently sweeps those.
 *
 * Architectural role:
 * Filesystem state for one workspace, reached only through `layout.ts`'s `forWorkspace()` root — the
 * same tenant-isolation guarantee every other path in this feature goes through.
 */
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";

import {
  FileLockLostError,
  FileLockTimeoutError,
  withExclusiveFileLock,
  type FileLockHolder,
  type HeldFileLock,
} from "./exclusive-file-lock.js";

/** Where a workspace's activation record lives, relative to its own agent-plugin root. */
export const ACTIVATIONS_FILENAME = "activations.json";

/** The cross-process lock every writer below takes before touching {@link ACTIVATIONS_FILENAME} —
 *  see this file's header, "Concurrency", ACROSS processes. */
export const ACTIVATIONS_LOCK_FILENAME = `${ACTIVATIONS_FILENAME}.lock`;

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
  // `Object.hasOwn`, not a plain lookup: `activations.plugins` comes straight from `JSON.parse` (via
  // `normalizeActivations`), so it still carries `Object.prototype`, and an id like `constructor` or
  // `hasownproperty` passes the plugin-name grammar and would otherwise resolve to an inherited
  // value rather than a missing entry — see `resolveAgentPluginActivation`'s identical guard.
  if (!Object.hasOwn(activations.plugins, pluginId)) return true;
  return activations.plugins[pluginId].enabled;
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
 * an empty record. That is fail-OPEN, and it is the correct direction here specifically because this
 * reader is used for DISCOVERY only — nothing that SPENDS a capability or WRITES the file uses it
 * any more (t91 F1.1, 2026-09-16): the per-call tool gate and run-start injection both use the
 * fail-CLOSED {@link resolveAgentPluginActivation}, and every writer below reads the strict raw bag
 * and refuses outright on an unreadable file (see this file's header, "Writers never rewrite what
 * they could not read").
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

/** A WRITER (or the strict provenance read) found the activations file present but unreadable, and
 *  refused rather than rewrite it — see this file's header, "Writers never rewrite what they could
 *  not read". `message` names the host path: keep it in a server-side log, never in a model- or
 *  user-facing payload. */
export class AgentPluginActivationsUnreadableError extends Error {
  constructor(
    readonly filePath: string,
    readonly reason: string,
  ) {
    super(
      `agent-plugin activation: ${reason} (${filePath}). The file was left untouched and nothing was written, so no ` +
        "recorded enable/disable decision was lost. Until it is repaired, this workspace's Agent Plugin tool calls " +
        "and plugin-pinned runs are refused, and no Agent Plugin can be enabled, disabled, seeded or uninstalled. " +
        "To recover, fix the JSON by hand; or stop Tovu, move the file aside and start Tovu again — bundled plugins " +
        "are then recorded as disabled again, but every operator-installed plugin you had disabled starts enabled " +
        "and must be disabled again.",
    );
    this.name = "AgentPluginActivationsUnreadableError";
  }
}

/** A WRITER could not take (or lost) the cross-process write lock in time — see this file's header,
 *  "Concurrency", ACROSS processes, and `exclusive-file-lock.ts`. `lost: true` means the lock WAS
 *  acquired but was judged stale by another process before this writer's own rename; `lost: false`
 *  means the initial acquisition itself timed out. Either way NOTHING was written. `message` names
 *  the host lock path: keep it in a server-side log, never in a model- or user-facing payload. */
export class AgentPluginActivationsBusyError extends Error {
  constructor(
    readonly lockPath: string,
    readonly holder: FileLockHolder | undefined,
    readonly lost: boolean,
  ) {
    super(
      (lost
        ? `agent-plugin activation: lost the write lock (${lockPath}) before committing — another process judged it stale`
        : `agent-plugin activation: could not take the write lock (${lockPath}) within 15s` +
          (holder !== undefined ? ` — held by pid ${holder.pid} on ${holder.hostname} since ${holder.acquiredAt}` : " — holder unknown")) +
        ". Nothing was written, so no recorded enable/disable decision was changed. This clears by itself when the other " +
        "Tovu process (server, agent daemon, or the agent-plugin:activation CLI) finishes; a lock left by a crashed " +
        "process is removed automatically once that process is gone or the lock is older than 10s. If it persists, stop " +
        `every Tovu process for this site and delete ${lockPath}.`,
    );
    this.name = "AgentPluginActivationsBusyError";
  }
}

/** Turns a lock failure from {@link withExclusiveFileLock} into {@link AgentPluginActivationsBusyError};
 *  any other error (including a thrown {@link AgentPluginActivationsUnreadableError} from the read
 *  inside the callback) passes through unchanged. @complexity O(1). */
function toActivationsBusyError(lockPath: string, error: unknown): unknown {
  if (error instanceof FileLockTimeoutError) return new AgentPluginActivationsBusyError(lockPath, error.holder, false);
  if (error instanceof FileLockLostError) return new AgentPluginActivationsBusyError(lockPath, undefined, true);
  return error;
}

/** Logs a stale lock's removal — server-side only, since the path and pid are host detail.
 *  @complexity O(1). */
function warnStaleActivationsLockRemoved(lockPath: string, holder: FileLockHolder | undefined): void {
  console.warn(
    holder !== undefined
      ? `[agent-plugins] removed a stale activations.json lock left by pid ${holder.pid} on ${holder.hostname} (acquired ${holder.acquiredAt}): ${lockPath}`
      : `[agent-plugins] removed a stale activations.json lock with an unreadable holder: ${lockPath}`,
  );
}

/** Every `plugins` entry exactly as parsed — malformed ones included — which is what a writer edits
 *  so a malformed sibling entry survives a toggle of a different plugin byte-for-byte. */
type RawPluginsBag = Readonly<Record<string, unknown>>;

/**
 * The strict read every writer uses: `absent` (no file yet) is an empty bag, same as
 * {@link readAgentPluginActivations}; a file that exists but cannot be read, parsed, or
 * shape-checked refuses instead of folding to empty.
 *
 * @throws {AgentPluginActivationsUnreadableError} The file exists but cannot be read.
 * @complexity One file read plus one `JSON.parse` in the file's own size.
 */
async function readPluginsBagStrict(workspaceRoot: string): Promise<RawPluginsBag> {
  const document = await readActivationsDocument(workspaceRoot);
  if (document.kind === "unreadable") {
    throw new AgentPluginActivationsUnreadableError(path.join(workspaceRoot, ACTIVATIONS_FILENAME), document.reason);
  }
  return document.kind === "entries" ? document.entries : {};
}

/** Whether the RAW entry for `pluginId` records `origin: "bundled"` — read raw so a malformed
 *  entry's provenance still survives a toggle. `Object.hasOwn`, not a plain lookup, for the same
 *  `Object.prototype` reason {@link resolveAgentPluginActivation} uses it. @complexity O(1). */
function isRecordedAsBundled(bag: RawPluginsBag, pluginId: string): boolean {
  if (!Object.hasOwn(bag, pluginId)) return false;
  const entry = bag[pluginId];
  return isPlainObject(entry) && entry.origin === "bundled";
}

/**
 * Pre-flight for a caller about to do work whose record it must then write — the boot seeder calls
 * this BEFORE installing anything, so a bundled package never lands on disk without the activation
 * record that would keep it inactive.
 *
 * Also proves the cross-process write lock can actually be taken right now, and clears a stale one
 * left by a crashed process — the same lock every real writer below takes (this file's header,
 * "Concurrency", ACROSS processes).
 *
 * @throws {AgentPluginActivationsUnreadableError} The file exists but cannot be read.
 * @throws {AgentPluginActivationsBusyError} The lock could not be taken within 15s.
 * @complexity Same as {@link readPluginsBagStrict}, plus one lock acquisition/release.
 */
export async function assertAgentPluginActivationsWritable(workspaceRoot: string): Promise<void> {
  await lockedActivationsWrite(workspaceRoot, () => readPluginsBagStrict(workspaceRoot));
}

/**
 * The fail-CLOSED provenance read `uninstall.ts`'s bundled refusal uses in place of the lenient
 * {@link readAgentPluginActivations} — so a corrupt file refuses an uninstall rather than reading as
 * "no bundled record, therefore removable".
 *
 * @throws {AgentPluginActivationsUnreadableError} The file exists but cannot be read.
 * @complexity Same as {@link readPluginsBagStrict}.
 */
export async function isAgentPluginRecordedAsBundled(workspaceRoot: string, pluginId: string): Promise<boolean> {
  return isRecordedAsBundled(await readPluginsBagStrict(workspaceRoot), pluginId);
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
 * Reads and writes the RAW `plugins` bag, not the normalized view — see this file's header,
 * "Writers never rewrite what they could not read" — so a malformed sibling entry (or any field a
 * future schema version adds) survives this write byte-for-byte.
 *
 * @throws {Error} If `pluginId` does not match the Agent Plugins name grammar.
 * @throws {AgentPluginActivationsUnreadableError} The file exists but cannot be read.
 * @throws {AgentPluginActivationsBusyError} The cross-process write lock could not be taken or was
 * lost; nothing was written.
 * @returns The record as written, normalized, so a caller does not have to re-read to confirm.
 * @complexity O(p) in the recorded plugin count — the whole (small) file is rewritten.
 */
export async function setAgentPluginActivation(
  required: SetAgentPluginActivationRequired,
  optional: SetAgentPluginActivationOptional = {},
): Promise<AgentPluginActivations> {
  assertPluginId(required.pluginId);
  return lockedActivationsWrite(required.workspaceRoot, async (lock) =>
    writeActivationDecision(await readPluginsBagStrict(required.workspaceRoot), required, optional, lock),
  );
}

/**
 * The write half of {@link setAgentPluginActivation}, over a bag the caller has ALREADY read strictly
 * inside its own {@link lockedActivationsWrite} turn — so {@link recordBundledAgentPluginIfAbsent} can
 * decide and write within one turn instead of re-entering the chain or the lock, either of which
 * would wait on itself (this file's header, "Concurrency").
 *
 * @complexity O(p) in the recorded plugin count — the whole (small) file is rewritten.
 */
async function writeActivationDecision(
  current: RawPluginsBag,
  required: SetAgentPluginActivationRequired,
  optional: SetAgentPluginActivationOptional,
  lock: HeldFileLock,
): Promise<AgentPluginActivations> {
  const { workspaceRoot, pluginId, enabled, actor } = required;
  assertTargetEntryReadable(workspaceRoot, current, pluginId);
  const plugins: RawPluginsBag = {
    ...current,
    [pluginId]: {
      enabled,
      // Provenance is a fact about how the package arrived, not about this decision (comment kept
      // from the pre-F1.1 version): an existing value is preserved rather than overwritten by a
      // toggle. Read raw (`isRecordedAsBundled`), not through normalization, so a malformed sibling
      // entry does not lose its own provenance either.
      origin: optional.origin ?? (isRecordedAsBundled(current, pluginId) ? "bundled" : "operator-installed"),
      updatedAt: (optional.now?.() ?? new Date()).toISOString(),
      updatedBy: actor,
    },
  };

  await writeActivationsAtomically(workspaceRoot, plugins, lock);
  return normalizePluginsBag(plugins);
}

/**
 * N1 (reviewer finding, 2026-09-16, `agent-reports/2026-09-16-t91-review-plugin-part2.md`): refuses
 * a write that would derive `origin` from a MALFORMED entry for the plugin actually being toggled,
 * rather than silently "fixing" it as `operator-installed`.
 *
 * Without this, toggling a plugin whose OWN entry is present but malformed (e.g. its raw value is
 * the bare string `"bundled"`, not `{ origin: "bundled", ... }`) rewrote that entry as a well-formed
 * `operator-installed` record via {@link isRecordedAsBundled}'s `false` fallback — which both defeats
 * `uninstall.ts`'s bundled-refusal for malformed entries (`583d2f5e`) and re-seeds the plugin as
 * bundled-and-inactive on the next boot, since {@link recordBundledAgentPluginIfAbsent}'s own
 * `Object.hasOwn` no-overwrite check can no longer tell "an operator's real decision" apart from "a
 * garbled record this write invented". Consistent with this file's "undetermined means refuse" rule
 * (see the header and {@link resolveAgentPluginActivation}): an existing entry that cannot be read is
 * left exactly as it is, never repaired by a guess. `recordBundledAgentPluginIfAbsent` never reaches
 * this — it only calls {@link writeActivationDecision} when `Object.hasOwn(current, pluginId)` is
 * already `false`.
 *
 * @throws {AgentPluginActivationsUnreadableError} `pluginId`'s own entry exists but does not
 * normalize.
 * @complexity O(1).
 */
function assertTargetEntryReadable(workspaceRoot: string, current: RawPluginsBag, pluginId: string): void {
  if (!Object.hasOwn(current, pluginId)) return;
  if (normalizeActivationEntry(pluginId, current[pluginId]) !== undefined) return;
  throw new AgentPluginActivationsUnreadableError(
    path.join(workspaceRoot, ACTIVATIONS_FILENAME),
    `${ACTIVATIONS_FILENAME} holds an unreadable record for '${pluginId}', so it cannot be safely toggled`,
  );
}

/**
 * Writes the initial `{ enabled: false, origin: "bundled" }` record for a plugin Tovu itself placed
 * on disk — and does nothing at all if any record already exists.
 *
 * The no-overwrite rule is the whole contract: this runs on every boot (see `seed-bundled.ts`), so
 * overwriting would re-disable a plugin the operator had deliberately enabled, every restart.
 *
 * @returns `{ recorded: true }` when it wrote the initial disabled record, `{ recorded: false }`
 * when a decision already existed and was left alone. A present-but-MALFORMED entry still counts as
 * an existing decision — `Object.hasOwn`, not a shape check — because the gate is already answering
 * `undetermined` (deny) for it; overwriting it with a fresh disabled record would be a write this
 * function has no business making just because the entry it found looked wrong.
 * @throws {Error} If `pluginId` does not match the Agent Plugins name grammar.
 * @throws {AgentPluginActivationsUnreadableError} The file exists but cannot be read.
 * @throws {AgentPluginActivationsBusyError} The cross-process write lock could not be taken or was
 * lost; nothing was written.
 * @complexity O(p) in the recorded plugin count.
 */
export async function recordBundledAgentPluginIfAbsent(
  required: { readonly workspaceRoot: string; readonly pluginId: string },
  optional: { readonly now?: () => Date } = {},
): Promise<{ readonly recorded: boolean }> {
  assertPluginId(required.pluginId);

  return lockedActivationsWrite(required.workspaceRoot, async (lock) => {
    const current = await readPluginsBagStrict(required.workspaceRoot);
    if (Object.hasOwn(current, required.pluginId)) return { recorded: false };

    await writeActivationDecision(
      current,
      { workspaceRoot: required.workspaceRoot, pluginId: required.pluginId, enabled: false, actor: "system:seed" },
      { origin: "bundled", ...(optional.now !== undefined ? { now: optional.now } : {}) },
      lock,
    );
    return { recorded: true };
  });
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
 * @throws {AgentPluginActivationsUnreadableError} The file exists but cannot be read — an unreadable
 * file might well hold a record for `pluginId`, so treating that as "nothing to delete" could mean
 * silently leaving a decision in place that this call was supposed to remove.
 * @throws {AgentPluginActivationsBusyError} The cross-process write lock could not be taken or was
 * lost; nothing was written.
 * @complexity O(p) in the recorded plugin count — the whole (small) file is rewritten, same as every
 * other write in this file.
 */
export async function deleteAgentPluginActivation(required: DeleteAgentPluginActivationRequired): Promise<void> {
  const { workspaceRoot, pluginId } = required;
  assertPluginId(pluginId);

  await lockedActivationsWrite(workspaceRoot, async (lock) => {
    const current = await readPluginsBagStrict(workspaceRoot);
    if (!Object.hasOwn(current, pluginId)) return;

    const remaining: Record<string, unknown> = { ...current };
    delete remaining[pluginId];

    await writeActivationsAtomically(workspaceRoot, remaining, lock);
  });
}

function assertPluginId(pluginId: string): void {
  if (!SAFE_PLUGIN_ID_PATTERN.test(pluginId) || pluginId.length > 64) {
    throw new Error(`agent-plugin activation: '${pluginId}' is not a valid Agent Plugin id`);
  }
}

/** The tail of each workspace's in-flight write chain, keyed by resolved root so two spellings of one
 *  directory share a chain. An entry is dropped once its chain drains. */
const pendingActivationWrites = new Map<string, Promise<void>>();

/**
 * Runs one read-modify-write of a workspace's activations file only after every earlier one in this
 * process has settled — see this file's header, "Concurrency", for the erased-decision race this
 * closes and the cross-process race it does not.
 *
 * A write that throws does not jam the chain: the tail swallows the outcome, and the caller still
 * receives its own rejection.
 *
 * @complexity O(1) bookkeeping, plus waiting for the writes queued ahead of it.
 */
async function serializeActivationsWrite<T>(workspaceRoot: string, write: () => Promise<T>): Promise<T> {
  const key = path.resolve(workspaceRoot);
  const result = (pendingActivationWrites.get(key) ?? Promise.resolve()).then(write);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  pendingActivationWrites.set(key, tail);
  try {
    return await result;
  } finally {
    if (pendingActivationWrites.get(key) === tail) pendingActivationWrites.delete(key);
  }
}

/**
 * Composes the in-process chain with the cross-process lock, in that order — see this file's
 * header, "Concurrency", ACROSS processes, for why the chain stays in front and why no exported
 * function here may call another one from inside `write`.
 *
 * @throws {AgentPluginActivationsBusyError} The lock could not be taken within 15s, or was lost
 * before `write` finished — either way nothing `write` did was written.
 * @complexity `serializeActivationsWrite`'s queueing cost, plus one lock acquisition/release.
 */
async function lockedActivationsWrite<T>(workspaceRoot: string, write: (lock: HeldFileLock) => Promise<T>): Promise<T> {
  return serializeActivationsWrite(workspaceRoot, async () => {
    await mkdir(workspaceRoot, { recursive: true, mode: 0o700 });
    const lockPath = path.join(workspaceRoot, ACTIVATIONS_LOCK_FILENAME);
    try {
      return await withExclusiveFileLock(lockPath, write, {
        onStaleLockRemoved: (holder) => warnStaleActivationsLockRemoved(lockPath, holder),
      });
    } catch (error) {
      throw toActivationsBusyError(lockPath, error);
    }
  });
}

/**
 * Write-temp-then-`rename`, so a concurrent reader sees either the whole previous file or the whole
 * new one and never a truncated JSON document. Same discipline `install.ts`'s `publish()` uses for
 * a package tree, applied to a single small file.
 *
 * Takes the RAW `plugins` bag rather than a full {@link AgentPluginActivations} — every caller now
 * builds one from a strict raw read (this file's header, "Writers never rewrite what they could not
 * read"), so this is the one place that wraps it back in the `{ schemaVersion: 1, plugins }`
 * envelope for serialization.
 *
 * Durability (R5, t91 2026-09-16): the temp file is fsync'd before the rename, and the workspace
 * directory is best-effort fsync'd after — see this file's header and `syncDirectoryBestEffort`'s
 * own doc for why a power loss must never leave a 0-byte `activations.json` behind.
 *
 * `lock.assertHeld()` runs immediately before the rename — the fail-closed check that stops a
 * holder who stalled past the stale threshold from committing after another process already judged
 * it stale (this file's header, "failure modes").
 *
 * @throws {FileLockLostError} `lock` no longer owns the cross-process lock; `lockedActivationsWrite`
 * maps this to {@link AgentPluginActivationsBusyError}.
 * @complexity One open, one write, one fsync, one rename, one best-effort directory fsync.
 */
async function writeActivationsAtomically(workspaceRoot: string, plugins: RawPluginsBag, lock: HeldFileLock): Promise<void> {
  const finalPath = path.join(workspaceRoot, ACTIVATIONS_FILENAME);
  const tempPath = `${finalPath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    const handle = await open(tempPath, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify({ schemaVersion: 1, plugins }, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await lock.assertHeld();
    await rename(tempPath, finalPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
  await syncDirectoryBestEffort(workspaceRoot);
}

/**
 * Best-effort fsync of a directory, so a rename that just landed in it survives a power loss rather
 * than leaving a 0-byte or missing `activations.json` on the next boot (R5). Skipped entirely on
 * win32, where a directory cannot be opened for this. Every failure is swallowed: the rename has
 * already landed by the time this runs, so surfacing a failure here would tell the caller its write
 * did not succeed when it did.
 * @complexity One open, one fsync, one close.
 */
async function syncDirectoryBestEffort(dir: string): Promise<void> {
  if (process.platform === "win32") return;
  try {
    const handle = await open(dir, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Best-effort only — see this function's own doc.
  }
}
