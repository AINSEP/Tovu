import { resolveProbeCredential as resolveEndpointPinnedCredential, type ProbeCredentialResolution, type ResolveProbeCredentialInput } from "@jini-ai/cms/admin-http/routes/assistant/stored-credential-probe";
import { resolveExecutionCredential, resolveSiteAssistantApiKey } from "#src/assistant/index";
import type { AssistantExecutionRouteDeps } from "#src/server/runtime/composition/modules/assistant-execution";

/**
 * @file Binds the stored-credential probe chokepoint (Jini
 * `@jini-ai/cms/admin-http/routes/assistant/stored-credential-probe`, which owns the rule — which key a
 * BYOK probe sends and WHERE — and its long rationale) to Tovu's two sealed credential stores, for
 * `test-connection.ts` and `list-models.ts`. Both readers are closures over the SAME repo, workspace
 * and sealer the host already uses, and are only called for the one credential the request opted
 * into: a typed key, or neither stored-credential flag, reads nothing.
 */

/** How each stored credential is named in the endpoint-pin rejection messages. */
const PROBE_CREDENTIAL_SUBJECTS = { admin: "admin execution credential", site: "stored site assistant credential" };

/**
 * Resolves the `(apiKey, baseUrl)` pair a probe should actually use, or the rejection to return.
 * @complexity O(1) — at most one repo read plus one decrypt.
 */
export async function resolveProbeCredential(
  { deps, input }: { deps: AssistantExecutionRouteDeps; input: ResolveProbeCredentialInput },
  _optional = {},
): Promise<ProbeCredentialResolution> {
  return resolveEndpointPinnedCredential({
    input,
    subjects: PROBE_CREDENTIAL_SUBJECTS,
    // One sealing capability app-wide — `siteAssistantSecretSealer` is the same sealer
    // `assistant-byok.ts` and the live model discovery binding in `modules/assistant.ts` open this row with. See
    // `routes/types.ts`'s `adminExecutionCredentialRepo` doc.
    openAdmin: ({ principalId }) => resolveExecutionCredential(
      { deps: { repo: deps.adminExecutionCredentialRepo, sealer: deps.siteAssistantSecretSealer },
        input: { workspaceId: deps.workspaceId, principalId } },
    ),
    openSite: () => resolveSiteAssistantApiKey(
      { deps: { repo: deps.siteAssistantCredentialRepo, sealer: deps.siteAssistantSecretSealer },
        input: { workspaceId: deps.workspaceId } },
    ),
  });
}
