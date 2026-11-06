import { useState } from "react";
import { useLogin as useJiniLogin } from "@jini-ai/user-management/react";
import { formatUserFacingError, type UserFacingError } from "@jini-ai/core";
import { ApiError } from "@/lib/api";

import type { AdminUser } from "@/lib/api";
import { defaultLoginPort } from "./login-dependencies.hooks";
import type { LoginPort } from "./login-port.hooks";

/**
 * @file Everything the Login screen does, so `Login.tsx` is only markup.
 *
 * Keeps submission order and refusal messages; unexpected failures also carry safe copy details. Naming follows
 * `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because nothing
 * outside `features/auth` needs it.
 *
 * `deps.port` is injected (see `login-port.hooks.ts`) rather than reaching for `lib/api`'s `api`
 * directly, so a test can describe a login attempt against `createFakeLoginPort` instead of
 * stubbing global `fetch`. `useWiredLogin` below is the zero-dependency pair `Login.tsx` actually
 * mounts. `onLogin` moved from a bare positional argument into `props` (same `(props, deps)` shape
 * as `useFormEditor`/`useEditMediaPanel`) now that this hook takes a second, injected argument —
 * a lone trailing object could no longer be told apart from `deps` by position alone.
 */

export interface LoginHookProps {
  onLogin: (user: AdminUser) => void;
}

export interface LoginDependencies {
  port: LoginPort;
}

export interface LoginController {
  mfa?: { code: string; setCode: (code: string) => void; cancel: () => void };
  username: string;
  setUsername: (username: string) => void;
  password: string;
  setPassword: (password: string) => void;
  error: string | null;
  failure?: UserFacingError | null;
  busy: boolean;
  submit: (e: React.FormEvent) => Promise<void>;
}

/**
 * @param props `onLogin` — called with the authenticated user once `submit` resolves.
 * @param deps `port` — the injected login transport; see `login-port.hooks.ts`.
 * @returns The login screen's full controller — see {@link LoginController}.
 * @complexity Time/space: O(1) — one credential round trip per submit, no iteration.
 */
export function useLogin({ onLogin }: LoginHookProps, { port }: LoginDependencies): LoginController {
  const [failure, setFailure] = useState<UserFacingError | null>(null);
  async function observed<T>(execute: () => Promise<T>, secrets: string[]): Promise<T> {
    setFailure(null);
    try { return await execute(); }
    catch (err) {
      if (!(err instanceof ApiError && [400, 401, 429].includes(err.status))) {
        // Anonymous copy never contains a transport exception or backend diagnosis, even redacted.
        setFailure(formatUserFacingError({ message: "Sign-in could not finish.",
          action: "Try signing in again. If it still fails, copy details and report this problem.",
          step: "auth-login", cause: "The sign-in request did not finish. Its error ID identifies the server report." },
        { errorId: err instanceof ApiError && typeof err.body?.errorId === "string" ? err.body.errorId : undefined,
          exactSecrets: secrets.filter(Boolean) }));
      }
      throw err instanceof Error ? err : new Error("Sign-in could not finish. Try signing in again.");
    }
  }
  const controller = useJiniLogin({ onLogin, translate: text => text,
    port: { login: input => observed(() => port.login(input), [input.password]),
      ...(port.completeMfa ? { completeMfa: (input: { pendingToken: string; code: string }) =>
        observed(() => port.completeMfa!(input), [input.code, input.pendingToken]) } : {}) } }, { initialUsername: "admin" });
  return { ...controller, failure };
}

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
  return useLogin(props, { port: defaultLoginPort });
}
