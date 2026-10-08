import { pluginStatePaths } from "@jini-ai/agent-plugins/persistent-state";
/**
 * @file Pure filesystem layout computation for installed Agent Plugins; callers perform I/O.
 *
 * The owner requires workspace isolation. A shared content-addressed package directory would
 * leak another tenant's installs: public archive digests are precomputable and stat-able even
 * when bytes are frozen. A per-workspace tree enforces isolation by construction rather than
 * relying on every future reader to check activation records. It also avoids cross-workspace
 * refcounts and prevents uninstalling one workspace's plugin from deleting another's bytes.
 * Plugin archives are hostile third-party input; per-workspace extraction costs are bounded by
 * the lifecycle owner's archive/expanded-byte limits. Content deduplication stays within a workspace.
 * Writable PLUGIN_DATA belongs to the same workspace tree.
 *
 * Installed plugins are site data: they must travel with the site and survive upgrades.
 * resolveSiteRoot binds the default to TOVU_SITE/TOVU_SITE_DIR; TOVU_AGENT_PLUGINS_DIR overrides it.
 * Overrides must be absolute because an unpredictable cwd must not redirect a trusted tenant root.
 */
import path from "node:path";

import { resolveSiteRoot } from "../../platform/site-dir/index.js";

/**
 * One safe, indivisible path segment: lowercase alphanumerics in `-`/`.`-separated runs, with no
 * leading, trailing, or doubled separator. Matches the Agent Plugins spec's own `name` grammar
 * (§5.5), and — by construction — cannot be `.`, `..`, empty, or contain a `/`, `\`, or whitespace,
 * which is the entire property this module needs before using a caller-supplied string in a
 * `path.join`.
 *
 * Workspace IDs are safe path segments, not necessarily UUIDs: the site's real ID can be
 * `workspace-local`. The check must prevent splitting or escaping a path while accepting that ID.
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
  /** Legacy flat store: migration input only. */
  readonly packages: string;
  pluginRootDir(required: { pluginId: string }, optional?: Record<string, never>): string;
  pluginPackagesDir(required: { pluginId: string }, optional?: Record<string, never>): string;
  pluginMemoryDir(required: { pluginId: string; kind: "learned" | "notes" }, optional?: Record<string, never>): string;
  /** `<root>/staging` — private atomic-extraction directories for this workspace's own installs. */
  readonly staging: string;
  /**
   * This workspace's writable `PLUGIN_DATA` root: `<root>/<pluginId>/data/`.
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
  /** `<root>/ws` — the folder holding one `forWorkspace(id).root` per workspace. Exposed so a reader
   * that must visit every workspace (the site backup) enumerates the same folder installs write to. */
  readonly workspacesDir: string;
  /**
   * Resolves the fully workspace-scoped layout for one workspace. This is the ONLY way to reach a
   * `packages`/`staging`/`pluginDataDir` path — there is deliberately no instance-level equivalent
   * of any of them, so a caller cannot accidentally hand `install.ts` a path shared across tenants.
   *
   * @throws {Error} If `workspaceId` is not a bounded, safe path segment.
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
  const workspacesDir = path.join(root, "ws");

  return {
    root,
    workspacesDir,
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
      const workspaceRoot = path.join(workspacesDir, normalizedWorkspaceId);
      const pluginRootDir = ({ pluginId }: { pluginId: string }, _optional = {}): string => {
        if (!SAFE_ID_SEGMENT_PATTERN.test(pluginId) || pluginId.length > MAX_ID_SEGMENT_LENGTH) {
          throw new Error(`'${pluginId}' is not a valid Agent Plugin id`);
        }
        return pluginStatePaths({ workspaceRoot, pluginId }).root;
      };

      return {
        root: workspaceRoot,
        pluginRootDir,
        pluginPackagesDir: ({ pluginId }, _optional = {}) => path.join(pluginRootDir({ pluginId }), "package", "sha256"),
        pluginMemoryDir: ({ pluginId, kind }, _optional = {}) => {
          if (kind !== "learned" && kind !== "notes") throw new Error("Invalid plugin memory kind");
          return path.join(pluginRootDir({ pluginId }), "memory", kind);
        },
        packages: path.join(workspaceRoot, "packages", "sha256"),
        staging: path.join(workspaceRoot, "staging"),
        pluginDataDir(pluginId: string): string {
          if (!SAFE_ID_SEGMENT_PATTERN.test(pluginId) || pluginId.length > MAX_ID_SEGMENT_LENGTH) {
            throw new Error(`pluginDataDir: '${pluginId}' is not a valid Agent Plugin id`);
          }
          return path.join(pluginRootDir({ pluginId }), "data");
        },
      };
    },
  };
}
