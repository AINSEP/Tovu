import { Login as LoginScreen } from "@jini-ai/admin/screens/auth/Login";
import type { LoginController, LoginHookProps } from "@jini-ai/admin/screens/auth/hooks/use-login.hooks";
import type { AdminUser } from "@jini-ai/core/contracts/site/user-management-react";
import { SecretInput } from "@/components/SecretInput/SecretInput";
import { useWiredAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { authApi } from "./api/auth-api";
import { LoginErrorNotice, OwnerPasskeySignIn, OwnerRecoverySignIn } from "./auth-host-binding";
import { useWiredLogin } from "./hooks/use-wired-login.hooks";

/**
 * @file Public surface of the `auth` feature — and this host's binding of the Jini Login screen.
 *
 * `panels.tsx` does not import this — `Login` renders before the admin shell mounts and has no
 * `AdminPanel` entry (no nav, not part of the panel registry). `App.tsx` imports from HERE instead.
 * Adding a file to this feature is not an API change unless it is exported from this line.
 */

/** The product name shown as the sign-in heading (host copy, passed to the Jini screen). */
const PRODUCT_NAME = "Tovu";

/** The Login screen with this host's collaborators bound in. `useLoginHook` stays overridable so a
 *  test can drive the markup with a fake controller. */
export function Login({ onLogin, useLoginHook = useWiredLogin }: { onLogin: (user: AdminUser) => void; useLoginHook?: (props: LoginHookProps) => LoginController }) {
  return <LoginScreen onLogin={onLogin} useLoginHook={useLoginHook} useAdminLocaleHook={useWiredAdminLocale} productName={PRODUCT_NAME}
    SecretInput={SecretInput} ErrorNotice={LoginErrorNotice} PasskeySignIn={OwnerPasskeySignIn} OwnerRecoverySignIn={OwnerRecoverySignIn} loadCurrentUser={authApi.me} />;
}
