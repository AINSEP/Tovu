import type { ToolMetadataById } from "@jini-ai/core";
import type { ToolApprovalPolicy } from "../../headless/assistant-tool-approval-policy.js";

/** A fixed, safe diagnostic; authorization is mandatory, additional confirmation is unnecessary. */
export const toolMetadata = {
  observability_send_test_error: {
    search: { keywords: "observability telemetry test error Sentry OpenTelemetry analytics delivery" },
    approval: { class: "edit", confirmation: "direct" },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
