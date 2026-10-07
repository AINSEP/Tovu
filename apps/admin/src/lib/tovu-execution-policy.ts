import type { ExecutionConfig } from '@jini-ai/ui';
import type { AdminDeploymentOverview } from './api';

/** Local CLI is hidden on deployed sites for now (owner 2026-10-07); later an agent could
 * install a CLI (e.g. Claude Code) on the server and this gate can open. The server's existing
 * TOVU_RUNTIME_MODE signal is authoritative; NODE_ENV and browser hostname are not capabilities.
 * Until discovery succeeds, hide entry points rather than briefly offering an unusable runtime.
 * Desktop bridge presence keeps the user's own machine available even with production assets. */
export function localCliAllowed(
  { mode, desktop }: { mode: AdminDeploymentOverview['mode'] | undefined; desktop: boolean },
  _optional = {},
): boolean {
  return desktop || mode === 'local';
}

/** Projection only: never save this value back on mount. Keep both halves for later reopening. */
export function effectiveExecutionConfig(
  { config, allowed }: { config: ExecutionConfig; allowed: boolean }, _optional = {},
): ExecutionConfig {
  return allowed || config.mode === 'byok' ? config : { ...config, mode: 'byok' };
}

/** BYOK fields remain editable without a form round trip silently overwriting the saved mode. */
export function preserveSavedExecutionMode(
  { saved, next, allowed }: { saved: ExecutionConfig; next: ExecutionConfig; allowed: boolean },
  _optional = {},
): ExecutionConfig {
  return allowed || saved.mode === next.mode ? next : { ...next, mode: saved.mode };
}

export const DEPLOYED_LOCAL_CLI_NOTE = 'Local CLI is hidden on deployed sites for now. BYOK is used; your saved choice is unchanged.';
