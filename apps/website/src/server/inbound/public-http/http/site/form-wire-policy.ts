/** Query param names shared by {@link encodeFormSubmissionResultQuery} (write side, forms-submit.ts
 *  builds a redirect Location with) and {@link decodeFormSubmissionResultFromQuery} (read side,
 *  pages.ts reads `req.query` with) — one constant so the two halves of the round trip cannot drift
 *  apart from each other. */
export const FORM_RESULT_QUERY_KEYS = {
  slug: "form",
  status: "form_status",
  errors: "form_errors",
  retryAfter: "form_retry_after",
} as const;

/** Name of the cookie carrying {@link FormFlashPayload}. Exported so `forms-submit.ts` (sets it) and
 *  `pages.ts` (reads + clears it) cannot drift onto different names — mirrors `dev-auth.ts`'s
 *  `SESSION_COOKIE`/`complete-sign-in.ts`'s `MEMBER_SESSION_COOKIE` precedent of one named constant
 *  per cookie, owned by whichever module needs it most, reused verbatim by every other reader/writer. */
export const FORM_FLASH_COOKIE_NAME = "tovu_form_flash";

