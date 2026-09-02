import type { AdminUser } from "../../lib/api";
import { useWiredLogin } from "./hooks/use-login.hooks";

/**
 * @file The Login screen — markup only.
 *
 * State and the submit handler live in `hooks/use-login.hooks.ts`. Nothing here computes a value
 * (no derivations, no branchy formatting), so this feature has no `rules.ts`.
 */
export interface LoginProps {
  onLogin: (user: AdminUser) => void;
  /**
   * Dependency injection seam for tests — the same convention `Posts.tsx`'s `usePostsHook` and
   * `@jini-ai/ui`'s `useCustomSelect` use. Defaulted to the real hook, so production callers pass
   * nothing and behave exactly as before.
   */
  useLoginHook?: typeof useWiredLogin;
}

export function Login({ onLogin, useLoginHook = useWiredLogin }: LoginProps) {
  const { username, setUsername, password, setPassword, error, busy, submit } = useLoginHook({ onLogin });

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <h1>Tovu</h1>
        <p>Sign in to your workspace</p>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error ? <div className="login-error">{error}</div> : null}
        <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
