import { issueCredentialSetup, type ToolFailureDiagnostic } from "../../contracts/core/tool-failure-diagnostics.js";
import { CustomCredentialNotFoundError } from "./store.js";

export interface CredentialSetupFailure {
  executed: false;
  credentialSetup: ToolFailureDiagnostic;
}

/** Preserve provider output, while offering the credential card the failing call can actually use. */
export async function withCustomCredentialSetup<T>(
  { invoke, label, url, verification = false }: { invoke: () => Promise<T>; label: string; url?: string; verification?: boolean },
  _optional = {},
): Promise<T | CredentialSetupFailure> {
  let result: T;
  try { result = await invoke(); }
  catch (error) {
    if (!(error instanceof CustomCredentialNotFoundError)) throw error;
    const prefill: Record<string, string> = { kind: "api", label };
    if (url) {
      try { prefill.baseUrl = new URL(url).origin; } catch { /* The card collects a valid URL; an unknown label is resolved before request validation. */ }
    }
    return { executed: false, credentialSetup: issueCredentialSetup({ setupToolId: "credential_save", prefill }, {}) };
  }
  const output = result as { status?: unknown };
  // A scoped key can get a request 401 while still working for its intended purpose.
  // Only explicit verification can establish invalidity and offer replacement.
  const rotation = verification && output.status === "invalid";
  return rotation ? { credentialSetup: issueCredentialSetup({ setupToolId: "credential_save", prefill: { kind: "api", target: label } }, {}), ...result } : result;
}
