/** Product launch bindings; native IPC framing and one-time delivery belong to Jini sidecar. */
import { receiveNodeStartupSecrets, splitNodeStartupSecrets, STARTUP_SECRETS_ENV } from '@jini-ai/sidecar/supervisor/node';

export const STARTUP_SECRET_KEYS = ['TOVU_AGENT_DAEMON_TOKEN', 'TOVU_TOOL_EXEC_TOKEN', 'JINI_DESKTOP_RENDER_TOKEN',
  'TOVU_ADMIN_PASSWORD', 'TOVU_DESKTOP_MCP_TOKEN', 'TOVU_DESKTOP_MCP_HANDOFF_TOKEN'] as const;
/** Distinguishes a desktop control owner from a standalone launcher that only offers startup IPC. */
export const DESKTOP_AGENT_SERVICE_ENV = 'TOVU_DESKTOP_AGENT_SERVICE';
let credentials: Readonly<Record<string, string>> = {};
let startup: Promise<void> | undefined;

/** Consume launch credentials once, adopting manual-launch env values without re-exporting them.
 * Server callers register the plugin resolver synchronously before awaiting this; every host
 * consumes credentials before boot I/O/child creation.
 * @throws On missing/refused/malformed startup IPC; no partial boot or environment fallback.
 * @complexity O(e) environment scan, one bounded Jini IPC request when marked by the launcher.
 */
export function initializeStartupSecrets(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): Promise<void> {
  if (startup) return startup;
  const inherited = splitNodeStartupSecrets({ env: process.env, keys: STARTUP_SECRET_KEYS });
  for (const key of Object.keys(process.env)) {
    if (STARTUP_SECRET_KEYS.some(name => name === key.toUpperCase())) delete process.env[key];
  }
  credentials = inherited.secrets;
  const fromIpc = process.env[STARTUP_SECRETS_ENV] === '1';
  delete process.env[STARTUP_SECRETS_ENV];
  startup = (async () => {
    if (!fromIpc) return;
    const received = await receiveNodeStartupSecrets({ peer: process });
    const allowed = splitNodeStartupSecrets({ env: received, keys: STARTUP_SECRET_KEYS });
    if (Object.keys(allowed.env).length) throw new Error('Unexpected startup credential keys');
    credentials = allowed.secrets;
  })();
  return startup;
}

/** Supply private launch values only to this process's explicit configuration consumers.
 * Scoped/custom environments remain independent, preserving the shared daemon's site boundary.
 * @returns A detached configuration snapshot, never suitable as a child OS environment.
 * @complexity O(e) copy; no I/O.
 */
export function startupSecretEnvironment({ env }: { env: NodeJS.ProcessEnv }, _optional: Record<string, never> = {}): NodeJS.ProcessEnv {
  return env === process.env ? { ...env, ...credentials } : { ...env };
}
