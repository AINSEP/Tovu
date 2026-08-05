import { useState } from "react";

import { api, type AdminUser } from "../../../lib/api";

/**
 * @file Everything the Login screen does, so `Login.tsx` is only markup.
 *
 * Extracted verbatim — same state, same order, same error string. Naming follows
 * `hooks/use-settings-slice.hooks.ts`: `use-<thing>.hooks.ts`. Feature-local because nothing
 * outside `features/auth` needs it.
 */

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
 * @complexity Time/space: O(1) — one credential round trip per submit, no iteration.
 */
export function useLogin(onLogin: (user: AdminUser) => void): LoginController {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.login({ username, password });
      onLogin(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "login failed");
    } finally {
      setBusy(false);
    }
  }

  return { username, setUsername, password, setPassword, error, busy, submit };
}
