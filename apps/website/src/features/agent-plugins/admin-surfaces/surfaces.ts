import {
  defineAdminSurfaceContribution,
  readAdminSurfaceFile,
  type AdminSurfaceActionHandler,
  type AdminSurfaceActionOutcome,
  type LoadedAdminSurface,
} from "@jini-ai/agent-plugins/admin-surfaces";
import type { TrustedPluginPackage } from "@jini-ai/agent-plugins/lifecycle";

import type { TovuAgentPluginLifecycle } from "#src/features/agent-plugins/lifecycle";
import type { HostSignInLink, IssuedSignInCollector } from "./issued-sign-ins.js";

/**
 * @file Tovu's adapter over Jini's admin-surface seam (`@jini-ai/agent-plugins/admin-surfaces`):
 * which file a plugin ships to contribute surfaces, how this host finds one surface, and the port
 * through which this host supplies a surface's action handlers and bootstrap data.
 *
 * Why a source port instead of handing routes the lifecycle: the routes need exactly two things
 * (the admitted surfaces and a contained file read), and both security pins and route tests stay
 * on typed fakes of those two. Admission itself (active + shipped digest + contained paths) stays
 * in Jini's contribution loader; nothing here re-implements it.
 */

/** The contribution file a plugin ships at its package root. Host-named, as for every seam. */
export const ADMIN_SURFACES_FILENAME = "tovu-admin-surfaces.json";
/** The screen route and assistant adapter enforce the same workspace permission. */
export const ADMIN_SURFACE_ACTION_PERMISSION = "admin.plugins.enable";

/** Where the public files route (`public-http/routes/agent-plugin-surfaces/files.ts`) serves surfaces. */
export const ADMIN_SURFACE_FILES_PREFIX = "/api/agent-plugin-surfaces/v1";

/** The URL a surface file is served at. Segments are encoded; the path keeps its `/` separators.
 * @complexity O(n) in the path length. */
export function adminSurfaceFileUrl(
  required: { readonly pluginId: string; readonly surfaceId: string; readonly path: string },
  _optional: Record<string, never> = {},
): string {
  const path = required.path.split("/").map(encodeURIComponent).join("/");
  return `${ADMIN_SURFACE_FILES_PREFIX}/${encodeURIComponent(required.pluginId)}/${encodeURIComponent(required.surfaceId)}/${path}`;
}

/** What the routes read: admitted surfaces and their contained files. */
export interface AdminSurfaceSource {
  list(required: { readonly workspaceId: string }, optional?: Record<string, never>): Promise<readonly LoadedAdminSurface[]>;
  readFile(required: { readonly plugin: TrustedPluginPackage; readonly filename: string }, optional?: Record<string, never>): Promise<string>;
}

/** Who is asking, passed to every handler and bootstrap provider; the host already authorized it. */
export interface AdminSurfaceRequestContext {
  readonly workspaceId: string;
  readonly principalId: string;
  readonly pluginId: string;
  readonly surfaceId: string;
}

/**
 * Host-side behaviour for surfaces. A declared action with no handler answers `action-unavailable`
 * (Jini's dispatcher), and a surface with no bootstrap provider starts with `data: null`.
 */
export interface AdminSurfaceHost {
  handlersFor(required: { readonly pluginId: string; readonly surfaceId: string }, optional?: Record<string, never>): Readonly<Record<string, AdminSurfaceActionHandler<AdminSurfaceRequestContext>>>;
  bootstrapData(required: { readonly context: AdminSurfaceRequestContext }, optional?: Record<string, never>): Promise<unknown>;
  /** The sign-in links an action issued, for the host page to offer (absent: none are ever offered). */
  readonly signIns?: Pick<IssuedSignInCollector, "collect">;
}

/** The default host: no handlers, no bootstrap data. */
export const NO_ADMIN_SURFACE_HOST: AdminSurfaceHost = {
  handlersFor: () => ({}),
  bootstrapData: async () => null,
};

/**
 * The real source over the lifecycle owner. Surfaces are a data contribution, but they are served
 * as executable frame code, so activation is required (`requireActive: true`).
 * @complexity O(p) active trusted packages per `list`.
 */
export function createAgentPluginAdminSurfaceSource(
  required: { readonly lifecycle: Pick<TovuAgentPluginLifecycle, "loadPluginContributions" | "readTrustedPluginFile"> },
  _optional: Record<string, never> = {},
): AdminSurfaceSource {
  const definition = defineAdminSurfaceContribution({ filename: ADMIN_SURFACES_FILENAME });
  return {
    list: async ({ workspaceId }) => (await required.lifecycle.loadPluginContributions({ workspaceId, definition }, { requireActive: true, orderByPluginId: true })).items,
    readFile: ({ plugin, filename }) => required.lifecycle.readTrustedPluginFile(plugin, filename),
  };
}

/** The one admitted surface with these ids, or `undefined`. Ids are compared, never joined into a path.
 * @complexity O(s) admitted surfaces. */
export async function findAdminSurface(
  required: { readonly source: AdminSurfaceSource; readonly workspaceId: string; readonly pluginId: string; readonly surfaceId: string },
  _optional: Record<string, never> = {},
): Promise<LoadedAdminSurface | undefined> {
  const surfaces = await required.source.list({ workspaceId: required.workspaceId });
  return surfaces.find((surface) => surface.plugin.pluginId === required.pluginId && surface.descriptor.id === required.surfaceId);
}

/** Reads one declared file of a surface with its isolation headers (Jini's `readAdminSurfaceFile`).
 * @complexity O(f) declared files plus the read. */
export function readSurfaceFile(
  required: { readonly source: AdminSurfaceSource; readonly surface: LoadedAdminSurface; readonly path: string },
  _optional: Record<string, never> = {},
) {
  return readAdminSurfaceFile({ surface: required.surface, path: required.path, readFile: (input) => required.source.readFile(input) });
}

/** Runs one screen/tool action and adds only the sign-in URLs this host issued on success.
 * @complexity O(l) issued links plus the action. No link is opened here. */
export async function withAdminSurfaceSignIns(required: {
  readonly host: AdminSurfaceHost;
  readonly run: () => Promise<AdminSurfaceActionOutcome>;
}, _optional: Record<string, never> = {}): Promise<AdminSurfaceActionOutcome & { readonly hostSignIns?: readonly HostSignInLink[] }> {
  // A local name, not `required.run()`: the raw-SQLite ratchet reads `.run()` as better-sqlite3's sync terminal.
  const { run } = required;
  if (!required.host.signIns) return run();
  const { value: outcome, signIns } = await required.host.signIns.collect({ run });
  return outcome.ok && signIns.length > 0 ? { ...outcome, hostSignIns: signIns } : outcome;
}
