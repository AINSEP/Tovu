/** Tovu compatibility shim (A10c seam). The portable body lives in `@jini-ai/agent-plugins/connect`; these
 * entries keep their positional signatures and bind Tovu's credential token rule (R1). */
import type { PluginCredentialsPort } from "./service-ports.js";
import { tovuTokenValidator } from "./access-token-tool.js";
import type { ResolvedAgentPluginForConnect } from "./connect-tool.js";
import type { InstalledAgentPluginServers } from "./import-access-token.js";
import {
  listTokenSignInPlugins as listWithPorts, checkAgentPluginAccessToken as checkWithPorts,
  type TokenSignInPlugin, type TokenCheckOutcome,
} from "@jini-ai/agent-plugins/connect";
export type { TokenSignInPlugin, TokenCheckOutcome } from "@jini-ai/agent-plugins/connect";

/** Same signature as the pre-seam entry. */
export function listTokenSignInPlugins(
  workspaceId: string,
  listPlugins: (workspaceId: string) => Promise<readonly InstalledAgentPluginServers[]>,
): Promise<readonly TokenSignInPlugin[]> {
  return listWithPorts({ workspaceId, listPlugins });
}

/** Same signature as the pre-seam entry; never throws, never returns or logs the token. */
export function checkAgentPluginAccessToken(
  deps: {
    readonly workspaceId: string;
    readonly credentials: Pick<PluginCredentialsPort, "probe">;
    readonly resolveInstalledPlugin: (pluginId: string) => Promise<ResolvedAgentPluginForConnect | null>;
  },
  input: { readonly pluginId: string; readonly token: string },
): Promise<TokenCheckOutcome> {
  return checkWithPorts({ deps: { workspaceId: deps.workspaceId, credentials: deps.credentials, resolveInstalledPlugin: deps.resolveInstalledPlugin, tokenValidator: tovuTokenValidator }, input });
}
