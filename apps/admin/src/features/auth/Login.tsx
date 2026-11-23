import { createLoginTranslator } from "./Login.hooks";
import { PasskeySignIn } from '@jini-ai/user-management/react';
import { ownerPasskeySignInPort } from '../../lib/owner-passkey-api';
import { authApi } from './api/auth-api';
import { OwnerRecoverySignIn } from "./OwnerRecoverySignIn";
import { ErrorNotice } from "@jini-ai/ui/panel-kit";
import type { AdminUser } from "./api/auth-api.types";
import { SecretInput } from "@/components/SecretInput/SecretInput";
import type { UseAdminLocaleHook } from "@jini-ai/admin/react/kit";
import { useWiredLogin } from "./hooks/use-login.hooks";

/**
 * @file The Login screen — markup only.
 *
 * State and the submit handler live in `hooks/use-login.hooks.ts`. Nothing here computes a value
 * (no derivations, no branchy formatting), so this feature has no `rules.ts`.
 */
export interface LoginProps {
  onLogin: (user: AdminUser) => void;
  /** The host's one locale hook; App passes it to the early Login mount. */
  useAdminLocaleHook: UseAdminLocaleHook;
  /**
   * Dependency injection seam for tests — the same convention `Posts.tsx`'s `usePostsHook` and
   * `@jini-ai/ui`'s `useCustomSelect` use. Defaulted to the real hook, so production callers pass
   * nothing and behave exactly as before.
   */
  useLoginHook?: typeof useWiredLogin;
}

export function Login({ onLogin, useAdminLocaleHook, useLoginHook = useWiredLogin }: LoginProps) {
  const { username, setUsername, password, setPassword, error, failure, busy, submit, mfa } = useLoginHook({ onLogin });
  const locale = useAdminLocaleHook({}, {});
  const t = createLoginTranslator({ locale });

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <h1>Tovu</h1>
        <p>{t("Sign in to your workspace")}</p>
        {mfa ? <label>
          {t("Authenticator code")}
          <input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} data-agent-private="" value={mfa.code} onChange={event => mfa.setCode(event.target.value)} autoFocus />
        </label> : <>
        <label>
          {t("Username")}
          <input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        {/* Not wrapped in its <label> like Username: the eye toggle's name would join the input's. */}
        <div className="login-field">
          <label htmlFor="login-password">{t("Password")}</label>
          <SecretInput label={t("Password")} locale={locale} id="login-password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        </>}
        {failure ? <ErrorNotice failure={failure} disclosure="id-only" t={t} className="login-error" /> : error ? <div className="login-error">{error}</div> : null}
        <button disabled={busy}>{busy ? t("Signing in…") : mfa ? t("Verify code") : t("Sign in")}</button>
        {mfa ? <button type="button" disabled={busy} onClick={mfa.cancel}>{t("Cancel")}</button> : null}
      </form>
      {mfa ? <PasskeySignIn port={ownerPasskeySignInPort} pendingToken={mfa.pendingToken} translate={t}
        onComplete={async () => { const result = await authApi.me(); onLogin(result.user); }} /> : null}
      <OwnerRecoverySignIn t={t} />
    </div>
  );
}
