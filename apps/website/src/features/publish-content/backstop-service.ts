import { createBackstopService } from "@jini-ai/cms/publish/content/backstop-service";
import { redactSecretShapes } from "@tovu/contracts/secret-redaction";
import { BACKSTOP_LIMITS, checkRawValues, gapLabelFor } from "./backstop-policy.js";

/**
 * @file Tovu's binding of the hand-send ("backstop") service owned by
 * `@jini-ai/cms/publish/content/backstop-service`: the raw-value scan and gap labels from
 * `backstop-policy.ts`, its size caps with the operator-facing copy that names them, and Tovu's own
 * secret redactor (which carries a Tovu key rule) for what reaches the audit sink.
 */
export const { validateBackstopRequest, runAuditedBackstop, readBackstopMetadata } = createBackstopService({
  policy: {
    checkRawValues,
    gapLabelFor,
    limits: BACKSTOP_LIMITS,
    copy: {
      selectionLimit: `Choose at most ${BACKSTOP_LIMITS.rows} rows and ${BACKSTOP_LIMITS.files} files per send.`,
      bundleLimit: `Choose at most ${BACKSTOP_LIMITS.rows} rows and ${BACKSTOP_LIMITS.files} files totaling at most ${BACKSTOP_LIMITS.bytes / (1024 * 1024)} MB per send.`,
    },
  },
  redact: redactSecretShapes,
});
