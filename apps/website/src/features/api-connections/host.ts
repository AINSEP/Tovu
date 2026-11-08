import { createApiConnectionHost as createRuntimeHost } from '@jini-ai/integrations/api-connections';
import { bindApiConnectionHost, type ApiConnectionHostDeps, type ApiConnectionHostOptions } from './host-bindings.js';
export type { ApiConnectionHostDeps } from './host-bindings.js';
export type { ApiConnectionRuntime } from '@jini-ai/integrations/api-connections';
export { API_CONNECTION_CALLBACK_ORIGINS_ENV } from './host-bindings.js';
// Defined beside the binding cookie, whose `Path` it is; re-exported for the routes that mount it.
export { API_CONNECTION_OAUTH_CALLBACK_PATH } from './browser-binding.js';
export { createApiConnectionHost as createApiConnectionRuntimeHost } from '@jini-ai/integrations/api-connections';

/** Same host signature; Tovu wires each required port over the original owners. */
export function createApiConnectionHost(required: ApiConnectionHostDeps, optional: ApiConnectionHostOptions = {}) {
  const binding = bindApiConnectionHost({ required, optional });
  return createRuntimeHost(binding.required, binding.optional);
}
export type ApiConnectionHost = ReturnType<typeof createApiConnectionHost>;
