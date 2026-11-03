/** Late listener recovery uses only the authority minted by the main that spawned this server. */
import { json, type RequestHandler } from "express";
import type { ToolExecutionRouteTarget } from "@jini-ai/daemon/http";
import { requireToolExecutionCaller } from "@jini-ai/daemon/http";
import { DESKTOP_MCP_HANDOFF_ENV, isDesktopMcpCapability, type DesktopMcpRuntime } from "#src/assistant/desktop-mcp-runtime";

/** Mount before the public JSON parser: Origin, socket peer and bearer are checked before bytes.
 * The first valid endpoint is immutable; a repeated delivery only retries server admission.
 * @example registerDesktopMcpHandoff({ router, runtime, reload });
 * @complexity O(1) setup/body (1 KiB maximum), plus the existing coalesced federation reload.
 */
export function registerDesktopMcpHandoff({ router, runtime, reload }: {
  router: Pick<ToolExecutionRouteTarget, "post">; runtime: DesktopMcpRuntime; reload: () => Promise<void | boolean>;
}, _options = {}): void {
  const rejectBrowser: RequestHandler = (req, res, next) => {
    if (req.headers.origin !== undefined) { res.sendStatus(403); return; }
    next();
  };
  const receiveCapability: RequestHandler = (req, res, next) => {
    const body: unknown = req.body;
    if (!isDesktopMcpCapability(body)) { res.sendStatus(400); return; }
    if (!runtime.accept(body)) { res.sendStatus(409); return; }
    void reload().then(admitted => { res.sendStatus(admitted === false ? 503 : 204); }, next);
  };
  router.post("/internal/desktop-mcp-capability", rejectBrowser,
    requireToolExecutionCaller({}, { tokenEnvVar: DESKTOP_MCP_HANDOFF_ENV, env: { [DESKTOP_MCP_HANDOFF_ENV]: runtime.handoffToken } }),
    json({ limit: "1kb" }), receiveCapability);
}
