import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import { ApiError, describeApiError } from "../../lib/admin-http/request";

/**
 * @file The host collaborators `@jini-ai/admin`'s `skillFailure` reads: this app's transport error
 * class (for the server incident ID its body may carry), its error describer, and the product's
 * secret-redaction options. Bound once here so every Skills failure formats the same way.
 */
export const SKILL_FAILURE_HOST = { ApiError, describeApiError, redactionOptions: TOVU_ERROR_REDACTION_OPTIONS } as const;
