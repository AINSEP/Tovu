import { useState } from "react";

import type { AdminUser } from "@/lib/api";
import { defaultLoginPort } from "./login-dependencies.hooks";
import type { LoginPort } from "./login-port.hooks";

/**
 * @file Everything the Login screen does, so `Login.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same error string. Naming follows
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
  username: string;
  setUsername: (username: string) => void;
  password: string;
  setPassword: (password: string) => void;
  error: string | null;
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
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await port.login({ username, password });
      onLogin(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "login failed");
    } finally {
      setBusy(false);
    }
  }

  return { username, setUsername, password, setPassword, error, busy, submit };
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
