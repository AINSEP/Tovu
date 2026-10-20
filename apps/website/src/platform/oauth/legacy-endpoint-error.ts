import { OAuthError } from "@jini-ai/oauth";

/**
 * @file Error translation for the legacy testing/DB URL seam in `endpoint-safety.ts`.
 *
 * That seam routes every check through Jini's guard under the fixed label `"provider endpoint"`, so
 * Jini's subject and Tovu's host-policy message both come back with the subject doubled. This
 * module repairs that copy in one place for both legacy entry points.
 */

/**
 * Rewrites a Jini guard refusal into the legacy seam's wording.
 *
 * @param required.error - Whatever the guard threw. Anything that is not an {@link OAuthError} is
 *   returned untouched, so an unexpected failure is rethrown with its identity intact.
 * @param optional.prefix - When present, the label-free legacy error is wrapped once more in an
 *   error whose message starts with this text and whose `cause` is the label-free error.
 * @returns The value the caller should throw.
 * @complexity O(n) in the message length; no I/O.
 */
export function toLegacyEndpointError(
  { error }: { readonly error: unknown },
  { prefix }: { readonly prefix?: string } = {},
): unknown {
  if (!(error instanceof OAuthError)) return error;
  // Legacy wrappers name their own subject. Strip only the fixed duplicate subject prefixes.
  const message = error.message.replace("provider endpoint: provider endpoint", "provider endpoint")
    .replace("provider-supplied link: provider endpoint", "provider-supplied link");
  const { code, operatorAction } = error;
  const legacy = new OAuthError({ code, message, operatorAction }, { cause: error.cause });
  return prefix === undefined ? legacy : new OAuthError({ code, message: `${prefix}${message}`, operatorAction }, { cause: legacy });
}
