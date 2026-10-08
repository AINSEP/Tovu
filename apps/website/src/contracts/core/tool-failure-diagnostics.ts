// Diagnostic authority and provenance live in the daemon owner; this facade binds host validation.
export { issueToolFailureDiagnostic, isIssuedToolFailureDiagnostic } from "@jini-ai/daemon/tool-recovery";
export type { ToolFailureDiagnostic } from "@jini-ai/daemon/tool-recovery";
import { issueCredentialSetup as issueDaemonCredentialSetup } from "@jini-ai/daemon/tool-recovery";
import { redactUserText } from "@jini-ai/chat/core";
import { assertCredentialFreeField } from "./credential-token.js";
export function issueCredentialSetup(required: { setupToolId: string; prefill: Readonly<Record<string, string | number | boolean | null>> }, optional = {}) {
  return issueDaemonCredentialSetup({ ...required, assertCredentialFreeField,
    containsSecret: ({ text }) => redactUserText({ text }).secretRedacted }, optional);
}
