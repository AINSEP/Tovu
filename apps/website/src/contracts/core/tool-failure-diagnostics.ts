// Diagnostic authority and provenance live in the daemon owner (`@jini-ai/daemon/tool-recovery`); this binding
// only injects the host's credential-free-field check and secret detector into credential setup.
import { issueCredentialSetup as issueDaemonCredentialSetup } from "@jini-ai/daemon/tool-recovery";
import { redactUserText } from "@jini-ai/chat/core";
import { assertCredentialFreeField } from "./credential-token.js";
export function issueCredentialSetup(required: { setupToolId: string; prefill: Readonly<Record<string, string | number | boolean | null>> }, optional = {}) {
  return issueDaemonCredentialSetup({ ...required, assertCredentialFreeField,
    containsSecret: ({ text }) => redactUserText({ text }).secretRedacted }, optional);
}
