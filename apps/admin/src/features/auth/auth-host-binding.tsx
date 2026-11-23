import { ErrorNotice } from "@jini-ai/ui/panel-kit";
import { PasskeySignIn, useRecoveryCodeSignIn } from "@jini-ai/user-management/react";
import type { AuthErrorNoticeProps, AuthPasskeySignInProps, LoginApiErrorPort, OwnerRecoverRequest } from "@jini-ai/admin/screens/auth/auth-host-slots";
import { OwnerRecoverySignIn as OwnerRecoverySignInScreen } from "@jini-ai/admin/screens/auth/OwnerRecoverySignIn";
import { useOwnerRecoverySignIn } from "@jini-ai/admin/screens/auth/OwnerRecoverySignIn.hooks";
import type { Translate } from "@jini-ai/core/text";
import { SecretInput } from "@/components/SecretInput/SecretInput";
import { ApiError } from "@/lib/admin-http/request";
import { ownerPasskeySignInPort } from "../../lib/owner-clients";
import { ownerRecoveryFailure, ownerRecoveryPort } from "../../lib/owner-clients";

/**
 * @file The host's bindings for the Jini sign-in screens — what Tovu injects: its admin HTTP error
 * class, its error notice with the anonymous `id-only` disclosure, its passkey and owner-recovery
 * clients, and the base login / recovery-code controller hooks from `@jini-ai/user-management`.
 */

/** This host's admin HTTP client, as the login failure copy needs it. */
export const LOGIN_API_ERRORS: LoginApiErrorPort = {
  isApiError: (e): e is ApiError => e instanceof ApiError,
};

/** Anonymous visitors see only the error ID of an unexpected failure, never its diagnosis. */
export function LoginErrorNotice(props: AuthErrorNoticeProps) {
  return <ErrorNotice {...props} disclosure="id-only" />;
}

/** The passkey button with this host's owner passkey client bound. */
export function OwnerPasskeySignIn(props: AuthPasskeySignInProps) {
  return <PasskeySignIn port={ownerPasskeySignInPort} {...props} />;
}

/** The owner-recovery controller with this host's recovery-code hook and failure describer bound. */
export function useWiredOwnerRecoverySignIn({ recover, t }: { recover: OwnerRecoverRequest; t: Translate }) {
  return useOwnerRecoverySignIn({ recover, t, useRecoveryCodeSignIn, ownerRecoveryFailure });
}

const identityTranslate: Translate = text => text;

/** The owner-recovery sign-in with this host's client, controller, secret input and notice bound.
 *  `recover`/`useOwnerRecoverySignInHook` stay overridable so a test can drive it with fakes. */
export function OwnerRecoverySignIn({ recover = ownerRecoveryPort.recover, t = identityTranslate, useOwnerRecoverySignInHook = useWiredOwnerRecoverySignIn }: { recover?: OwnerRecoverRequest; t?: Translate; useOwnerRecoverySignInHook?: typeof useWiredOwnerRecoverySignIn }) {
  return <OwnerRecoverySignInScreen recover={recover} t={t} useOwnerRecoverySignInHook={useOwnerRecoverySignInHook} SecretInput={SecretInput} ErrorNotice={LoginErrorNotice} />;
}
