import { InMemoryMemberRepo } from "@jini-ai/user-management/members/repo.memory";
import { InMemoryKeyring } from "#src/features/webhooks/index";
import { MembersSubscriberDirectory } from "#src/features/members/subscriber-directory";
import { createHookRegistry } from "#src/features/newsletter/send-pipeline";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemorySiteAssistantCredentialRepo } from "../../../../../assistant/index.js";
import { InMemoryExternalMcpServerRepo } from "../../../../../features/external-mcp/external-mcp-store.memory.js";
import { createDeviceAuthorizationStore } from "../../../../../features/external-mcp/external-mcp-oauth.js";

export function composeMemberSecrets(_required: Record<string, never> = {}, _optional = {}) {
  // SPEC-011 (Newsletter) Stage 5 wiring — hoisted so `newsletterSubscriberDirectory` below reads
  // the SAME member rows the returned `memberRepo` field exposes (mirrors `entryRepo`/
  // `widgetBindingRepo`'s identical hoisting rationale above), and so `newsletterKeyring` is the
  // ONE process-lifetime `KeyringPort` instance also used to build `webhookSigner` just below —
  // one site key, purpose-namespaced (`webhooks/ports.ts`'s `KeyringPort.derive()` contract),
  // not two independent keyrings.
  const memberRepo = new InMemoryMemberRepo({}, { initialRows: [] });
  const newsletterKeyring = new InMemoryKeyring();
  const newsletterSubscriberDirectory = new MembersSubscriberDirectory({ members: memberRepo });
  const newsletterHooks = createHookRegistry();

  // ADR-058: the SITE assistant credential store's OWN `KeyringPort` instance, deliberately not
  // `newsletterKeyring` above — see `routes/types.ts`'s `siteAssistantSecretKeyring` doc and ADR-058
  // §2 for why a separate instance matters in the real composition root (`apps/website/src/server/runtime/composition/deps.ts`). This
  // hermetic root has no "fail closed on a missing env var" concern to preserve (there is no env var
  // here at all), so a second `InMemoryKeyring` is just the same rule-of-two test double, kept
  // distinct so this root's wiring shape matches `deps.ts`'s one-instance-per-purpose shape.
  const siteAssistantSecretKeyring = new InMemoryKeyring();
  const siteAssistantSecretSealer = new AesGcmSecretSealer(siteAssistantSecretKeyring);
  const siteAssistantCredentialRepo = new InMemorySiteAssistantCredentialRepo();
  // Held as a local rather than constructed inline, because the OAuth service below must be given
  // the SAME repo instance the routes read through — two instances would refresh a token into one
  // and read it back from the other.
  const externalMcpServerRepo = new InMemoryExternalMcpServerRepo();
  // Device begin/poll share this process-local store. Redirect state uses the site's sealer;
  // this hermetic root's ephemeral key still limits its callbacks to the same process.
  const externalMcpOAuthDevices = createDeviceAuthorizationStore();
  return { externalMcpServerRepo, siteAssistantSecretSealer, siteAssistantSecretKeyring, siteAssistantCredentialRepo, externalMcpOAuthDevices, memberRepo, newsletterKeyring, newsletterSubscriberDirectory, newsletterHooks };
}
