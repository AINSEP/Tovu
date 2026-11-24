/**
 * @file The route host the two surface-answer endpoints (`a2ui-actions-route.ts`,
 * `mcp-ui-tool-calls-route.ts`) are built against. Neither endpoint asks for the same-origin guard —
 * the daemon's bearer gate plus the run-principal header are the boundary, reached only through the
 * admin proxy — so the origin policy here fails closed: should a route ever opt into
 * `requireSameOrigin`, it would refuse every request rather than admit one nobody reviewed.
 */
import type { DaemonRouteHost } from "@jini-ai/daemon/http";
import { daemonRouteHost } from "#src/server/runtime/composition/jini-routes";

/** The daemon scope parses JSON bodies with a 6 MiB limit (`agent-daemon-scope-http.ts`); the routes derive theirs from it. */
const DAEMON_JSON_PARSER_LIMIT_BYTES = 6 * 1024 * 1024;

/** The host both surface endpoints share; built per mount so a test app gets its own. */
export function surfaceRouteHost(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): DaemonRouteHost {
  return daemonRouteHost({ context: { originPolicy: { isSameOrigin: () => false } }, parserLimitBytes: DAEMON_JSON_PARSER_LIMIT_BYTES });
}
