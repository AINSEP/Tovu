import { startApiConnectionSignIn as startConnectionSignIn, runApiConnectionConnect as runConnectionConnect } from '@jini-ai/integrations/api-connections';
import type { ApiConnectionHost } from './host.js';
import { apiConnectionConnectPorts } from './connect-bindings.js';
export type { ApiConnectionConnectStatus, ApiConnectionSignInStart } from '@jini-ai/integrations/api-connections';
export interface ApiConnectionConnectDeps { readonly host: ApiConnectionHost }
type SignInRequest = Omit<Parameters<typeof startConnectionSignIn>[0], 'signInLink' | 'messages' | 'host'> & { readonly host: ApiConnectionHost };
type SignInOptions = NonNullable<Parameters<typeof startConnectionSignIn>[1]>;
type ConnectRun = Omit<Parameters<typeof runConnectionConnect>[0], 'signInLink' | 'messages' | 'deps'> & { readonly deps: ApiConnectionConnectDeps };

/** Old public signature; the host supplies its browser-link binding and exact refusal copy. */
export function startApiConnectionSignIn(required: SignInRequest, optional: SignInOptions = {}) {
  return startConnectionSignIn({ ...required, ...apiConnectionConnectPorts }, optional);
}
export function runApiConnectionConnect(required: ConnectRun, optional: Record<string, never> = {}) {
  return runConnectionConnect({ ...required, ...apiConnectionConnectPorts }, optional);
}
