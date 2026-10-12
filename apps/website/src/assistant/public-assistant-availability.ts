import { resolveByokProtocol } from "./byok-provider-turn.js";
import { resolveSiteAssistantApiKey, type ResolvedSiteAssistantCredential } from "./site-credential-store.js";
import type { SiteAssistantCredentialRepoPort } from "./site-credential-store.js";
import type { SecretSealerPort } from "../features/webhooks/index.js";

export type PublicAssistantAvailability =
  | { ready: true; credential: ResolvedSiteAssistantCredential }
  | { ready: false; code: string; error: string };

/** Saved site credentials govern the visitor surface, independently of admin BYOK and env keys.
 * Reuses the credential owner's fail-closed decrypt path; never probes a paid provider or exposes
 * a key in the unavailable result. Called per read so later key/model removal takes effect.
 * @complexity O(n) in credential-field lengths, one repository read and at most one decrypt. */
export async function resolvePublicAssistantAvailability(required: {
  repo: SiteAssistantCredentialRepoPort; sealer: SecretSealerPort; workspaceId: string;
}, options: { onCredentialFailure?: (error: unknown) => void } = {}): Promise<PublicAssistantAvailability> {
  // The public readiness outcome stays key-free; the visitor route separately correlates the
  // credential owner's real failure with its safe response id in the redacted operator log.
  const credential = await resolveSiteAssistantApiKey(required, { workspaceId: required.workspaceId }, options.onCredentialFailure);
  if (!credential?.apiKey.trim()) {
    return { ready: false, code: "NOT_CONFIGURED", error: "site assistant is not configured — save a usable provider key and a model in AI Assistant before enabling the public assistant." };
  }
  if (!resolveByokProtocol({ provider: credential.provider })) {
    return { ready: false, code: "PROVIDER_UNSUPPORTED", error: `site assistant is configured for an unsupported provider "${credential.provider}" — supported providers are anthropic, openai, azure, google.` };
  }
  if (!credential.model?.trim()) {
    return { ready: false, code: "MODEL_NOT_CONFIGURED", error: "site assistant has no saved model — choose one in AI Assistant before enabling the public assistant." };
  }
  return { ready: true, credential };
}
