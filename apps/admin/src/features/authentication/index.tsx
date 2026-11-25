import { Authentication as AuthenticationScreen, type AuthenticationProps } from "@jini-ai/admin/screens/authentication/Authentication";
import { SecretInput } from "@jini-ai/admin/shell/components/SecretInput/SecretInput";
import { useAdminThemeBoundary } from "../../admin-themes/use-admin-theme.hooks";
import { useAdminLocale } from "../../hooks/use-admin-locale.hooks";
import { AuthenticationSettingsShell } from "./authentication-host-binding";
import { AUTHENTICATION_PROVIDER_SCHEMAS } from "./model/provider-schemas";

/**
 * @file Public surface of the `authentication` feature — and this host's binding of the Jini
 * Authentication screen. The admin panel registry imports only this boundary.
 */

/** The product name the page's copy names (host copy, passed to the Jini screen). */
const PRODUCT_NAME = "Tovu";

/** The Authentication page with this host's collaborators bound in. The two hooks stay overridable
 *  so a test can drive the page with a fixed locale or theme. */
export function Authentication({ useAdminThemeBoundaryHook = useAdminThemeBoundary, useAdminLocaleHook = useAdminLocale }: Partial<Pick<AuthenticationProps, "useAdminThemeBoundaryHook" | "useAdminLocaleHook">> = {}) {
  return <AuthenticationScreen useAdminThemeBoundaryHook={useAdminThemeBoundaryHook} useAdminLocaleHook={useAdminLocaleHook}
    productName={PRODUCT_NAME} providers={AUTHENTICATION_PROVIDER_SCHEMAS} SecretInput={SecretInput} SettingsShell={AuthenticationSettingsShell} />;
}
