import { authApi } from "@/features/auth/api/auth-api";
import type { LoginPort } from "./login-port.hooks";

/**
 * @file The only place under `features/auth` that reaches `lib/api` — see `login-port.hooks.ts`
 * for why the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultLoginPort: LoginPort = {
  login: (credentials, _optional = {}) => authApi.login(credentials),
  completeMfa: (input, _optional = {}) => authApi.completeMfa(input),
};
