import { createAdminSurfaceHandlerHost, defineAdminSurfaceHandlerContribution, type AdminSurfaceCapabilitiesPort, type LoadedAdminSurfaceHandlers } from "@jini-ai/agent-plugins/admin-surfaces";

import type { IssuedSignInCollector } from "./issued-sign-ins.js";
import { ADMIN_SURFACES_FILENAME, type AdminSurfaceHost } from "./surfaces.js";

/**
 * @file Binds plugin-supplied admin-surface handler modules (Jini's G5b handler host) to this site as
 * the admin routes' `AdminSurfaceHost` port. Nothing here names a provider.
 *
 * When the handlers are (re)loaded: once at boot, and again before every surface bootstrap. The
 * admin frame always asks for its bootstrap when a surface opens, before any action, so a plugin
 * enabled since the last load (by any writer: the admin toggle, an assistant tool, an install, in
 * either process) gets its handlers on the next open without a restart or a cross-process signal.
 * Disabling needs no reload to take effect: the surface routes admit only active plugins per
 * request, and a later load drops the module and revokes the capabilities it kept.
 */

const handlerContribution = defineAdminSurfaceHandlerContribution({ filename: ADMIN_SURFACES_FILENAME });

/** The lifecycle's `loadPluginContributions`, narrowed to this contribution (as the executable-tool host does). */
export type LoadAdminSurfaceHandlers = (
  required: { readonly workspaceId: string; readonly definition: typeof handlerContribution },
  optional: { readonly orderByPluginId?: boolean },
) => Promise<{ readonly items: readonly LoadedAdminSurfaceHandlers[]; readonly refusals: readonly string[] }>;

export interface AgentPluginAdminSurfaceHandlers extends AdminSurfaceHost {
  /** Loads the active plugins' handler modules and admits them; resolves to the refusal lines. */
  refresh(required?: Record<string, never>, optional?: Record<string, never>): Promise<readonly string[]>;
}

/**
 * Creates the site's admin-surface handler host.
 * @param required.workspaceId - The site's workspace; every load reads its active plugins.
 * @param required.loadContributions - The lifecycle owner's trusted contribution loader.
 * @param required.capabilities - The admin-surface capability port (`capabilities.ts`: tool HTTP/limiter + connections, state, public config).
 * @param optional.log - Where refusal lines go; defaults to `console.warn`.
 * @param optional.signIns - The registry the connections port reports issued sign-ins to; the action route collects it.
 * @returns The `AdminSurfaceHost` port plus `refresh`.
 * @complexity `refresh` is one contribution load, O(p) active packages, plus O(s + a) admission.
 */
export function createAgentPluginAdminSurfaceHandlers(
  required: { readonly workspaceId: string; readonly loadContributions: LoadAdminSurfaceHandlers; readonly capabilities: AdminSurfaceCapabilitiesPort },
  optional: { readonly log?: (line: string) => void; readonly signIns?: IssuedSignInCollector } = {},
): AgentPluginAdminSurfaceHandlers {
  const host = createAdminSurfaceHandlerHost({ capabilities: required.capabilities });
  const log = optional.log ?? ((line: string) => console.warn(`[admin-surfaces] ${line}`));

  async function refresh(): Promise<readonly string[]> {
    const load = await required.loadContributions({ workspaceId: required.workspaceId, definition: handlerContribution }, { orderByPluginId: true });
    const { refusals } = host.sync({ loaded: load.items, refusals: load.refusals });
    for (const line of refusals) log(line);
    return refusals;
  }

  return {
    refresh,
    ...(optional.signIns === undefined ? {} : { signIns: optional.signIns }),
    handlersFor: (input) => host.handlersFor(input),
    async bootstrapData(input) {
      await refresh();
      return host.bootstrapData(input);
    },
  };
}
