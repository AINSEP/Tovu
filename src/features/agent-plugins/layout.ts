/**
 * @file Filesystem layout for installed Agent Plugins (the agent-plugins.org package format).
 *
 * Purpose:
 * Answers exactly one question — where do the bytes live — and answers it by following this
 * codebase's own existing convention rather than inventing one. `mediaUploadsDir()`
 * (`src/server/deps.ts:129-135`) defaults to `join(process.cwd(), "infra", "uploads")`, overridable
 * by `TOVU_MEDIA_UPLOADS_DIR`; `builtInThemesDir()` (`deps.ts:143-145`) follows the identical
 * `TOVU_*_DIR` shape. `infra/` is the repo's own gitignored runtime-data root (`.gitignore:17-22`,
 * `infra/README.md`) and already contains a `ws/<workspaceId>/` shape for per-workspace state
 * (`infra/uploads/ws/<workspaceId>/blobs`). This module places installed Agent Plugins in the same
 * tree, split the way the rest of this codebase already splits installed-code from per-tenant state:
 *
 *   infra/agent-plugins/
 *   ├── packages/sha256/<archiveDigest>/   immutable, per-INSTANCE package bytes (content-addressed)
 *   ├── data/ws/<workspaceId>/<pluginId>/  writable, per-WORKSPACE PLUGIN_DATA
 *   └── staging/                           private atomic-extraction directories (`install.ts`)
 *
 * Why the split is `packages/` (not workspace-scoped) vs `data/ws/` (workspace-scoped), and not one
 * `ws/<workspaceId>/<pluginId>/` tree holding both: verified against this codebase's own closest
 * analogous case, `src/features/plugin-runtime/discovery.ts`'s `installDir` — its
 * `plugins/<id>/<version>/` layout carries no workspace segment at all, and
 * `FederatedMcpConnectionConfig` (`src/assistant/mcp-federation/ports.ts`) carries no `workspaceId`
 * either; workspace scoping in this codebase lives entirely in the activation/admission layer
 * (`plugin-runtime/activation.ts`'s `PluginActivationRecord.workspaceId`), never in the installed-
 * code layer. Two workspaces "installing" the byte-identical archive of the same plugin@version
 * should never re-extract or re-verify it a second time — sharing the read-only package root costs
 * nothing security-relevant, since the bytes are content-addressed and frozen read-only
 * (`install.ts`'s `freezeTree`) the moment they are published.
 *
 * Why `TOVU_AGENT_PLUGINS_DIR` is required to be ABSOLUTE, stricter than `TOVU_MEDIA_UPLOADS_DIR`/
 * `TOVU_THEMES_DIR` (neither of which validates this): a relative override resolved against an
 * unpredictable `cwd` at different call sites would be a correctness AND security footgun specific
 * to this feature that the sibling env vars don't share — a wrong root silently changes which bytes
 * a `chmod 0o555`-frozen "trusted" package root actually points at. Production deployments should set
 * this to an absolute path outside the repo tree (e.g. `/var/lib/tovu/agent-plugins`): it then
 * survives immutable-container replacement, and — unlike anything under the checkout — cannot
 * accidentally enter a frontend build context if a bundler ever globs the repo tree.
 *
 * Architectural role:
 * Pure path computation. No I/O — `install.ts` and its callers create directories as needed.
 */
import path from "node:path";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `[a-z0-9.-]`, matching the Agent Plugins spec's own `name` grammar (§5.5) — a plugin id that
 * passed `parseAgentPluginManifest` (`manifest.ts`) is always safe as a path segment already; this
 * is defense in depth for any future caller that has not gone through that validator. */
const SAFE_PLUGIN_ID_PATTERN = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;

export interface AgentPluginLayout {
  /** `infra/agent-plugins` (or `TOVU_AGENT_PLUGINS_DIR`) — the whole tree this feature owns. */
  readonly root: string;
  /** `<root>/packages/sha256` — immutable, content-addressed, shared across every workspace. */
  readonly packages: string;
  /** `<root>/data/ws` — the parent of every workspace's writable `PLUGIN_DATA` trees. */
  readonly data: string;
  /** `<root>/staging` — private atomic-extraction directories; never a package's live path. */
  readonly staging: string;
  /**
   * One workspace's writable `PLUGIN_DATA` root for one installed plugin: `<data>/<workspaceId>/<pluginId>`.
   *
   * @throws {Error} If `workspaceId` is not a syntactically valid UUID, or `pluginId` does not match
   * the Agent Plugins name grammar — both are used as raw path segments, so an unvalidated caller
   * must not be able to smuggle a traversal segment through this function.
   */
  workspaceDataDir(workspaceId: string, pluginId: string): string;
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

  const root = path.resolve(override ?? path.join(cwd, "infra", "agent-plugins"));
  const packages = path.join(root, "packages", "sha256");
  const data = path.join(root, "data", "ws");
  const staging = path.join(root, "staging");

  return {
    root,
    packages,
    data,
    staging,
    workspaceDataDir(workspaceId: string, pluginId: string): string {
      if (!UUID_PATTERN.test(workspaceId)) {
        throw new Error(`workspaceDataDir: '${workspaceId}' is not a syntactically valid workspace id`);
      }
      if (!SAFE_PLUGIN_ID_PATTERN.test(pluginId) || pluginId.length > 64) {
        throw new Error(`workspaceDataDir: '${pluginId}' is not a valid Agent Plugin id`);
      }
      return path.join(data, workspaceId.toLowerCase(), pluginId);
    },
  };
}
