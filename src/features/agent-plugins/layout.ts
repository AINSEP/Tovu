/**
 * @file Filesystem layout for installed Agent Plugins (the agent-plugins.org package format).
 *
 * ---------------------------------------------------------------------------
 * TENANT-GRADE ISOLATION (owner decision, 2026-08-12) — supersedes this module's original design
 * ---------------------------------------------------------------------------
 * The owner's exact words: "if I have one Tovu website, it should not have anything to do with
 * another Tovu website." This module originally shared one content-addressed `packages/sha256/`
 * across every workspace on an instance, matching `plugin-runtime/discovery.ts`'s own `installDir`
 * (no workspace segment) and `FederatedMcpConnectionConfig` (no `workspaceId`). That design does not
 * hold under a tenant-grade reading, for two reasons argued in full in the handoff's tenancy
 * analysis and summarized here:
 *
 * 1. **Existence leak.** A shared `packages/sha256/<digest>/` directory is `stat`-able. Digests for
 *    any publicly-distributed plugin archive are trivially precomputable (hash the archive, check
 *    whether that digest exists on disk) — a working oracle for "did some OTHER workspace on this
 *    instance install plugin X," with no need to read a single byte of that workspace's own data.
 *    Frozen-read-only and content-addressed closes TAMPERING, not EXISTENCE.
 * 2. **The leak cannot be closed durably by policy alone.** Closing it without restructuring would
 *    require every future code path touching `packages/` to prove it only ever resolves a digest
 *    present in the CALLING workspace's own activation record, and never exposes raw listing — an
 *    invariant enforced by review discipline, not the type system, and exactly the kind of thing
 *    that erodes as more code touches this tree. A per-workspace layout makes the same guarantee
 *    true by construction: there is no shared enumerable path, so there is nothing to leak through.
 *
 * This is also, incidentally, SIMPLER than the shared design, not merely safer: the shared design
 * needs a refcount (or equivalent) so uninstalling plugin X from workspace A doesn't delete bytes
 * workspace B still points at — a real bug class the per-workspace design does not have. Uninstall
 * is `rm -rf ws/<workspaceId>/packages/sha256/<digest>/`, full stop.
 *
 * Given "anyone can author plugins" (owner decision, same round) — an installed archive is
 * genuinely hostile third-party input, not a curated bundle — the marginal safety this buys is
 * worth the marginal disk/CPU cost of re-extracting a popular plugin once per workspace instead of
 * once per instance. That cost is bounded by this module's own extraction caps
 * (`install.ts`'s `LIMITS`: 32MB archive, 64MB total extracted) and scales with the number of
 * workspaces on one instance, which for a self-hostable product is expected to be small.
 *
 * Content-addressing is KEPT, but scoped to one workspace's own tree: if the same workspace
 * reinstalls, or two of ITS OWN plugins happen to share identical bytes, that dedup is still free
 * and never crosses a tenant boundary.
 *
 * `PLUGIN_DATA` was already workspace-scoped before this revision and is unchanged in spirit — now
 * simply nested under the same workspace root as everything else, rather than living in a separate
 * `data/ws/<workspaceId>/` branch alongside a shared `packages/`.
 *
 * ---------------------------------------------------------------------------
 * Env override and `sites/<name>/` convention (root moved 2026-08-27; shape unchanged)
 * ---------------------------------------------------------------------------
 * `mediaUploadsDir()` (`src/server/deps.ts`) defaults to `join(siteDir(), "uploads")`, overridable
 * by `TOVU_MEDIA_UPLOADS_DIR`; `siteThemesDir()` follows the identical `TOVU_*_DIR` shape.
 * `sites/<name>/` is the SITE's own gitignored runtime-data root (`.gitignore`, `sites/README.md`)
 * and already contains a `ws/<workspaceId>/` shape for per-workspace state
 * (`<site>/uploads/ws/<workspaceId>/blobs`) — this module's `ws/<workspaceId>/` segment is the SAME
 * existing convention, just applied one level higher (to the whole plugin tree, not only a data
 * subdirectory) than the module's original design used it.
 *
 * The root itself was `<cwd>/infra/agent-plugins` until 2026-08-27. That was wrong for the same
 * reason the whole `infra/` -> `sites/` move exists: an installed plugin is SITE data, so it must
 * travel with the site and survive an upgrade rather than sit beside the repo checkout. The default
 * now comes from {@link resolveSiteRoot}, so `TOVU_SITE`/`TOVU_SITE_DIR` move it along with
 * everything else the site owns. `TOVU_AGENT_PLUGINS_DIR` still overrides it outright.
 *
 * `TOVU_AGENT_PLUGINS_DIR` is required to be ABSOLUTE, stricter than `TOVU_MEDIA_UPLOADS_DIR`/
 * `TOVU_THEMES_DIR` (neither validates this) — a relative override resolved against an unpredictable
 * `cwd` would be a correctness/security footgun specific to a feature whose whole point is a
 * `chmod 0o555`-frozen "trusted, per-tenant" root. Production should set this to an absolute path
 * outside the repo tree (e.g. `/var/lib/tovu/agent-plugins`).
 *
 * Architectural role:
 * Pure path computation. No I/O — `install.ts` and its callers create directories as needed.
 */
import path from "node:path";

import { resolveSiteRoot } from "../../site-dir/index.js";

/**
 * One safe, indivisible path segment: lowercase alphanumerics in `-`/`.`-separated runs, with no
 * leading, trailing, or doubled separator. Matches the Agent Plugins spec's own `name` grammar
 * (§5.5), and — by construction — cannot be `.`, `..`, empty, or contain a `/`, `\`, or whitespace,
 * which is the entire property this module needs before using a caller-supplied string in a
 * `path.join`.
 *
 * WORKSPACE IDS, revised 2026-08-21 (owner decision, option B). `forWorkspace` previously required a
 * syntactic UUID. That was wrong about this product's own data: the real workspace id in
 * `<site>/content.db` is the literal string `workspace-local`, so the UUID rule could never pass on a
 * real caller's input and made `installAgentPluginFromUrl` unreachable outside tests. The check's
 * actual job was never "is this a UUID" — it was "can this string escape or split the path segment
 * I am about to build". This pattern does that job directly, still accepts every UUID the old rule
 * accepted (so no previously-valid id became invalid), and matches the shape this repo already
 * writes to disk elsewhere (`<site>/uploads/ws/workspace-local/`).
 *
 * Deliberately NOT relaxed further: `_`, uppercase (normalized before this is applied, never
 * accepted raw), and any Unicode remain rejected, because each would let two distinct ids collide
 * onto one directory on a case-insensitive or normalizing filesystem.
 */
const SAFE_ID_SEGMENT_PATTERN = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;

/** Bounds the segment so a caller cannot drive a pathological path length. Applied to both ids. */
const MAX_ID_SEGMENT_LENGTH = 64;

/** One workspace's ENTIRE Agent Plugins tree — packages, data, and staging, all rooted under the
 * same `ws/<workspaceId>/` directory, so nothing in it is reachable from another workspace's own
 * layout without walking `..` out of it (see `layout.unit.test.ts`'s disjointness assertion). */
export interface AgentPluginWorkspaceLayout {
  /** `<instance root>/ws/<workspaceId>` */
  readonly root: string;
  /** `<root>/packages/sha256` — immutable, content-addressed WITHIN this workspace only. */
  readonly packages: string;
  /** `<root>/staging` — private atomic-extraction directories for this workspace's own installs. */
  readonly staging: string;
  /**
   * This workspace's writable `PLUGIN_DATA` root for one installed plugin: `<root>/data/<pluginId>`.
   *
   * @throws {Error} If `pluginId` does not match the Agent Plugins name grammar — used as a raw
   * path segment, so an unvalidated caller must not be able to smuggle a traversal segment through.
   */
  pluginDataDir(pluginId: string): string;
}

export interface AgentPluginLayout {
  /** `<site>/agent-plugins` (or `TOVU_AGENT_PLUGINS_DIR`) — the whole tree this feature owns. Not,
   * by itself, a usable install/data location for any workspace — see `forWorkspace`. */
  readonly root: string;
  /**
   * Resolves the fully workspace-scoped layout for one workspace. This is the ONLY way to reach a
   * `packages`/`staging`/`pluginDataDir` path — there is deliberately no instance-level equivalent
   * of any of them, so a caller cannot accidentally hand `install.ts` a path shared across tenants.
   *
   * @throws {Error} If `workspaceId` is not a syntactically valid UUID.
   */
  forWorkspace(workspaceId: string): AgentPluginWorkspaceLayout;
}

export interface ResolveAgentPluginLayoutOptional {
  /** Defaults to `process.cwd()`, matching `mediaUploadsDir()`'s own default base — injectable so
   * this function is testable without `process.chdir()`. */
  readonly cwd?: string;
  /** Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Resolves the Agent Plugins filesystem layout for this Tovu instance.
 *
 * @throws {Error} If `TOVU_AGENT_PLUGINS_DIR` is set to a relative path.
 * @complexity O(1).
 */
export function resolveAgentPluginLayout(optional: ResolveAgentPluginLayoutOptional = {}): AgentPluginLayout {
  const cwd = optional.cwd ?? process.cwd();
  const env = optional.env ?? process.env;
  const override = env.TOVU_AGENT_PLUGINS_DIR;

  if (override !== undefined && !path.isAbsolute(override)) {
    throw new Error(`TOVU_AGENT_PLUGINS_DIR must be an absolute path, got '${override}'`);
  }

  const root = path.resolve(override ?? path.join(resolveSiteRoot({ cwd, env }), "agent-plugins"));

  return {
    root,
    forWorkspace(workspaceId: string): AgentPluginWorkspaceLayout {
      // Normalize BEFORE validating, not after: the pattern is deliberately lowercase-only (see its
      // own doc), so validating the raw string would reject an uppercase id that the old UUID rule
      // accepted — and the normalized value is the one that actually becomes the path segment, so it
      // is the only value worth asserting about.
      const normalizedWorkspaceId = workspaceId.toLowerCase();
      if (!SAFE_ID_SEGMENT_PATTERN.test(normalizedWorkspaceId) || normalizedWorkspaceId.length > MAX_ID_SEGMENT_LENGTH) {
        // Quotes the RAW input, not the normalized one, so the message names what the caller passed.
        throw new Error(`forWorkspace: '${workspaceId}' is not a valid workspace id`);
      }
      const workspaceRoot = path.join(root, "ws", normalizedWorkspaceId);

      return {
        root: workspaceRoot,
        packages: path.join(workspaceRoot, "packages", "sha256"),
        staging: path.join(workspaceRoot, "staging"),
        pluginDataDir(pluginId: string): string {
          if (!SAFE_ID_SEGMENT_PATTERN.test(pluginId) || pluginId.length > MAX_ID_SEGMENT_LENGTH) {
            throw new Error(`pluginDataDir: '${pluginId}' is not a valid Agent Plugin id`);
          }
          return path.join(workspaceRoot, "data", pluginId);
        },
      };
    },
  };
}
