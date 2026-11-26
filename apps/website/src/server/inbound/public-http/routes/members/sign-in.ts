import { reportServerFailure } from "#src/server/inbound/shared/admin-failure";
import type { Response } from "express";
import type { ErrorReporter } from "@jini-ai/core/errors/reporter";
import { SenderIdentityNotConfiguredError } from "#src/platform/mail/index";
import { memberSignInRefusal as memberSignInRefusalFor, sendMemberAuthError } from "@jini-ai/user-management/members/public-member-auth-response";

/**
 * @file Tovu's policy for the PUBLIC sign-in request routes: the sign-in refusal copy, the redacted 500 and the
 * private report of a detached delivery failure. The route itself is the Jini spec
 * `@jini-ai/cms/public-http/routes/members/sign-in`, mounted by `registerPublicMemberSignInRequestRoute`
 * (`runtime/composition/modules/public-members.ts`).
 */

/** Detached failures remain observable through private, redacted diagnostics after acceptance. */
export function reportMemberDeliveryFailure({ error, reporter }: { error: unknown; reporter: Pick<ErrorReporter, "record"> }, _optional = {}): void {
  reportServerFailure({ error, operation: "public:member-delivery" }, { reporter });
}

/** Setup errors are site-wide; validation is independent of account existence.
 * Per-address delivery outcomes never enter this error path: they use generic acceptance.
 * @complexity O(1); writes one response, without logging credentials or provider detail.
 */
export const respondToSignInError = ({ error, res }: { error: unknown; res: Response }, _options = {}): void => sendMemberAuthError({ error, deps: {
  refusal: memberSignInRefusal,
  report: input => reportServerFailure(input, { tracker: res.locals.adminFailureTracker, reporter: res.locals.failureReporter }),
  json: (body, status) => { res.status(status).json(body); },
  copy: MEMBER_SIGN_IN_FAILURE,
} });

/** The sign-in request routes' unexpected-failure copy (`reportServerFailure` operation + visitor sentence). */
export const MEMBER_SIGN_IN_FAILURE = {
  operation: "public:member-sign-in",
  visitorError: "The site couldn’t complete sign-in. Try the original action again and report this error ID if it keeps happening.",
} as const;

/** `respondToSignInError`'s known answers: credential 401, site-wide setup 503, validation 400.
 * @returns The refusal (status + flat body), or `undefined` for an unexpected error (the 500).
 */
export function memberSignInRefusal({ error }: { error: unknown }, _options = {}): { status: number; body: { error: string; code?: string } } | undefined {
  return memberSignInRefusalFor({
    error,
    isSenderNotConfigured: ({ error: candidate }) => candidate instanceof SenderIdentityNotConfiguredError,
    senderNotConfiguredMessage: "Member sign-in is unavailable: email is not set up for this site.",
  });
}
