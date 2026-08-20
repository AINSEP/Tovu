/**
 * @file `uninstallPlugin()` — removes a site-installed plugin's on-disk artifact and activation
 * state (Milestone 2, 2026-08-20 dispatch — SPEC-005 had no install/uninstall route at all;
 * `ui.spec.md` §"On plugin installation" explicitly says REQ-02 install is "a filesystem
 * operation, not an HTTP one" and lists no `DELETE`. This module is the first uninstall surface).
 *
 * Purpose:
 * BR-05-style precondition evaluation (mirrors `activation.ts`'s `setPluginEnabled()` shape and
 * error-channel convention exactly — same `deps: { repo, discovery, on... }` split between
 * business-rule gating here and mechanism in the injected callback) followed by one mechanism
 * call. Two preconditions, evaluated in order:
 *   1. The id must resolve to a `"site"` discovery record — a built-in has no on-disk artifact to
 *      remove (`PluginNotUninstallableError`). Reuses `activation.ts`'s `PluginNotFoundError` for
 *      "id absent from discovery" so this module does not grow a second not-found error type.
 *   2. The plugin must not be enabled in ANY workspace, not only the caller's own — the on-disk
 *      artifact this instance's `installDir` scans is shared across every workspace (mirrors
 *      `builtInThemesDir()`'s themes; `server/deps.ts`'s `pluginsInstallDir()` doc has the full
 *      instance-wide-vs-per-workspace reasoning), so deleting it out from under a DIFFERENT,
 *      still-enabled workspace would silently break that workspace's runtime with no route of its
 *      own having done anything wrong. Checked via `repo.listAll()`, not just the caller's own
 *      `workspaceId` (`PluginEnabledError`).
 *
 * On success, calls the injected `onUninstall` mechanism (the actual filesystem removal — see
 * `server/plugin-runtime.ts`'s `onPluginUninstalled`, which owns the install-dir/path-traversal
 * safety this module does not itself need to know about) FIRST, then deletes every matching
 * activation row across every workspace. Files-first ordering: if the filesystem removal throws,
 * this function has made NO database change yet, so a failed uninstall attempt leaves state
 * exactly as it was (no orphaned "disabled but not really gone" row, no accidental data loss to
 * roll back).
 *
 * Settled policy (verified, not assumed, before writing this file):
 * - `ext.*` fields are never touched — this module has no dependency on `posts`/`post.ts` at all,
 *   by construction (same INV-03 shape `activation.ts` already documents for enable/disable).
 * - Plugin-owned DB tables are never dropped — moot for a v1 SPEC-005 plugin specifically: no
 *   `PluginManifest` field declares dataModule tables at all yet (`ui.spec.md`'s OQ-11, deferred).
 *   `src/features/plugins/data-module.ts`'s drop-avoidance guarantee is a DIFFERENT subsystem
 *   (ADR-023 `dataModule` engine + `newsletter`) that this module never calls.
 * - Plugin ids are "permanently retired at first mint" per `src/features/plugins/plugin-identity.ts`
 *   — verified that file's `checkNamespaceAdoption()`/`_plugin_identity` mechanism has ZERO
 *   callers anywhere in `plugin-runtime`, `discovery.ts`, `loader.ts`, or `activation.ts` (grep,
 *   2026-08-20): it is wired ONLY into the ADR-023 `dataModule` engine and `newsletter`, never into
 *   this SPEC-005 system, which the ADR's own codebase grounding independently calls "confirmed
 *   unrelated". Retirement is therefore NOT enforced for a SPEC-005 plugin id today, by any
 *   mechanism — this module does not newly wire one in (that is properly an INSTALL-time check:
 *   "refuse an upload declaring a previously-retired id", not an uninstall-time one), and no
 *   install route exists yet in this slice to make that check meaningful. Flagged explicitly in
 *   the handoff rather than silently left unaddressed or wired in behind a mismatched
 *   `PluginProvenance` shape (`plugin-identity.ts` requires `publisher: string`; `PluginManifest`'s
 *   own `provenance` field has no `publisher` at all — closing that gap needs a `manifest.ts`
 *   change, out of this session's file ownership).
 *
 * Architectural role:
 * Feature-layer orchestration, no I/O of its own beyond the injected ports — mirrors
 * `setPluginEnabled()`'s division of labor between business rules (here) and mechanism (the
 * composition root's closure) exactly.
 */
import type { UUID } from "@jini-ai/cms/core";
import { PluginNotFoundError } from "./activation.js";
import type { PluginActivationRepoPort } from "./activation.js";
import type { PluginDiscoveryRecord } from "./discovery.js";

/** A built-in plugin has no on-disk artifact — there is nothing for `DELETE .../plugins/:id` to
 * remove. Distinct from `PluginNotFoundError` (id doesn't exist at all) so the route can map each
 * to its own status code (mirrors `PluginInvalidError`/`PluginIncompatibleError` both being
 * distinct from `PluginNotFoundError` in `activation.ts`). */
export class PluginNotUninstallableError extends Error {}

/** The plugin is currently enabled in at least one workspace. Since the on-disk artifact is
 * instance-wide (shared across every workspace this `installDir` serves), uninstalling while ANY
 * workspace still has it enabled would silently break that workspace's runtime. */
export class PluginEnabledError extends Error {}

export interface UninstallPluginDeps {
  readonly repo: PluginActivationRepoPort;
  /** Caller-supplied fresh discovery snapshot — same convention as `SetPluginEnabledDeps.discovery`
   * (`activation.ts`): this function evaluates preconditions over an already-known snapshot rather
   * than calling discovery itself, so it stays deterministic and testable without a real
   * filesystem scan. */
  readonly discovery: readonly PluginDiscoveryRecord[];
  /** The actual filesystem removal (composition-root-owned; see `server/plugin-runtime.ts`'s
   * `onPluginUninstalled`). Invoked exactly once, after both preconditions pass, before any
   * activation row is touched. */
  readonly onUninstall: (pluginId: string) => Promise<void>;
}

export interface UninstallPluginInput {
  readonly pluginId: string;
}

export interface UninstallPluginRequired {
  deps: UninstallPluginDeps;
  input: UninstallPluginInput;
}

export type UninstallPluginOptional = {};

export interface UninstallPluginResult {
  /** Every workspace whose activation row for this plugin was removed (for the route's own
   * response/logging use — empty when the plugin had never been enabled anywhere). */
  readonly clearedWorkspaceIds: readonly UUID[];
}

/**
 * Uninstalls a site-installed plugin: removes its on-disk artifact, then every workspace's
 * activation row for it. Never touches `ext.*` content data or plugin-owned DB tables (see this
 * file's header for the verified settled-policy reasoning).
 *
 * @throws {PluginNotFoundError} `input.pluginId` is absent from `deps.discovery`.
 * @throws {PluginNotUninstallableError} the discovered record's `source` is `"built-in"`.
 * @throws {PluginEnabledError} the plugin is enabled in one or more workspaces.
 * @complexity O(activation rows for this plugin) — one `listAll()` scan (bounded by total
 * activation rows in this instance) plus one `deleteActivation()` per matching row.
 */
export async function uninstallPlugin(
  required: UninstallPluginRequired,
  _optional: UninstallPluginOptional = {}
): Promise<UninstallPluginResult> {
  const { deps, input } = required;

  const record = deps.discovery.find((candidate) => candidate.id === input.pluginId);
  if (!record) {
    throw new PluginNotFoundError(`plugin '${input.pluginId}' was not found in the current discovery snapshot`);
  }
  if (record.source === "built-in") {
    throw new PluginNotUninstallableError(`plugin '${input.pluginId}' is a built-in plugin and cannot be uninstalled`);
  }

  const allActivations = await deps.repo.listAll();
  const matching = allActivations.filter((activation) => activation.pluginId === input.pluginId);
  if (matching.some((activation) => activation.enabled)) {
    throw new PluginEnabledError(
      `plugin '${input.pluginId}' is enabled in at least one workspace and must be disabled everywhere before it can be uninstalled`
    );
  }

  // Files first: if this throws, no activation row has been touched yet, so a failed attempt
  // leaves state exactly as it was (see this file's header for the full ordering rationale).
  await deps.onUninstall(input.pluginId);

  const clearedWorkspaceIds: UUID[] = [];
  for (const activation of matching) {
    await deps.repo.deleteActivation({ workspaceId: activation.workspaceId, pluginId: input.pluginId });
    clearedWorkspaceIds.push(activation.workspaceId);
  }

  return { clearedWorkspaceIds };
}
