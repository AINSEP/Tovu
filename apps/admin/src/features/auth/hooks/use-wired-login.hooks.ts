import { useLogin as useJiniLogin } from "@jini-ai/user-management/react";
import { useLogin, type LoginController, type LoginHookProps } from "@jini-ai/admin/screens/auth/hooks/use-login.hooks";
import { defaultLoginPort } from "./login-dependencies.hooks";
import { LOGIN_API_ERRORS } from "../auth-host-binding";

/**
 * Binds the real `/api/auth/login` client — see `login-dependencies.hooks.ts`.
 *
 * The zero-argument-dependencies half of the `useX(dependencies)` / `useWiredX()` pair, so
 * `Login.tsx` composes this and a test composes {@link useLogin} with `createFakeLoginPort`.
 *
 * @param props `onLogin` — called with the authenticated user once `submit` resolves.
 * @returns The login screen's full controller — see {@link LoginController}.
 */
export function useWiredLogin(props: LoginHookProps): LoginController {
  return useLogin(props, { port: defaultLoginPort, errors: LOGIN_API_ERRORS, useJiniLogin });
}
