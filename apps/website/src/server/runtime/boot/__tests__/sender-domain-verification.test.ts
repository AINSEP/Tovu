import assert from "node:assert/strict";
import test from "node:test";
import { providerOk, providerRejected } from "@jini-ai/core/provider-registry";
import type { MailProviderModule } from "@jini-ai/platform/mail";

import { createSenderDomainVerification, type SenderDomainVerificationDeps } from "../sender-domain-verification.js";

/**
 * @file The provider-side sender-domain verdict: every reason the provider cannot be asked is its
 * own state, a provider answer is passed through, and no failure is ever reported as `failed`.
 */

const asked: unknown[] = [];
const provider = (domainStatus?: MailProviderModule["domainStatus"]) => ({ id: "mailer", ...(domainStatus ? { domainStatus } : {}) }) as unknown as MailProviderModule;
const answering = provider(async (ctx, { domain }) => { asked.push({ ctx, domain }); return providerOk({ value: { domain, state: "pending" as const } }); });

function deps(overrides: Partial<SenderDomainVerificationDeps> = {}): SenderDomainVerificationDeps {
  return {
    workspaceId: "ws", httpClient: { send: async () => { throw new Error("no network"); } } as never,
    findProvider: async () => answering,
    resolveCredential: async () => ({ token: "k" }) as never,
    readProviderId: async () => "mailer",
    readSenderEmail: async () => "hello@Example.COM",
    ...overrides,
  };
}

test("the provider's answer is passed through, for the lower-cased sender domain, with this workspace's live context", async () => {
  asked.length = 0;
  const fixed = deps();
  assert.deepEqual(await createSenderDomainVerification(fixed)(), { state: "pending", domain: "example.com", providerId: "mailer" });
  assert.deepEqual(asked, [{ ctx: { workspaceId: "ws", mode: "live", credential: { token: "k" }, httpClient: fixed.httpClient }, domain: "example.com" }]);
});

test("no sender, no provider and an unsupported provider are named apart", async () => {
  assert.deepEqual(await createSenderDomainVerification(deps({ readSenderEmail: async () => undefined }))(), { state: "no_sender", providerId: "mailer" });
  assert.deepEqual(await createSenderDomainVerification(deps({ readSenderEmail: async () => { throw new Error("db"); } }))(), { state: "no_sender", providerId: "mailer" });
  assert.deepEqual(await createSenderDomainVerification(deps({ readSenderEmail: async () => "no-at-sign" }))(), { state: "no_sender", providerId: "mailer" });
  assert.deepEqual(await createSenderDomainVerification(deps({ readProviderId: async () => null }))(), { state: "no_provider", domain: "example.com", providerId: null });
  assert.deepEqual(await createSenderDomainVerification(deps({ readProviderId: async () => { throw new Error("db"); } }))(), { state: "no_provider", domain: "example.com", providerId: null });
  assert.deepEqual(await createSenderDomainVerification(deps({ findProvider: async () => undefined }))(), { state: "no_provider", domain: "example.com", providerId: "mailer" });
  assert.deepEqual(await createSenderDomainVerification(deps({ findProvider: async () => { throw new Error("catalog"); } }))(), { state: "no_provider", domain: "example.com", providerId: "mailer" });
  assert.deepEqual(await createSenderDomainVerification(deps({ findProvider: async () => provider() }))(), { state: "unsupported", domain: "example.com", providerId: "mailer" });
});

test("a missing key, a provider error and a thrown call are Unknown, never failed", async () => {
  const unknown = (reason: string) => ({ state: "unknown", domain: "example.com", providerId: "mailer", reason });
  assert.deepEqual(await createSenderDomainVerification(deps({ resolveCredential: async () => null }))(), unknown("the provider's key is not saved"));
  assert.deepEqual(await createSenderDomainVerification(deps({ resolveCredential: async () => { throw new Error("vault"); } }))(), unknown("the provider's key is not saved"));
  const rejecting = provider(async () => providerRejected({ code: "forbidden", message: "no" }));
  assert.deepEqual(await createSenderDomainVerification(deps({ findProvider: async () => rejecting }))(), unknown("the sending key can't check domains, and no connected account could check it either"));
  const throwing = provider(async () => { throw new Error("socket"); });
  assert.deepEqual(await createSenderDomainVerification(deps({ findProvider: async () => throwing }))(), unknown("the provider did not answer the domain check"));
});

test("a permission refusal retries with the plugin account key without changing the sending key", async () => {
  const credential = { token: "send-only" };
  const tokens: string[] = [];
  const restricted = provider(async (ctx, { domain }) => {
    tokens.push(ctx.credential.token);
    return ctx.credential.token === "account"
      ? providerOk({ value: { domain, state: "verified" as const } })
      : providerRejected({ code: "forbidden", message: "sending access only" });
  });
  const check = createSenderDomainVerification(deps({
    findProvider: async () => restricted, resolveCredential: async () => credential,
    resolveDomainReadCredential: async ({ id }) => { assert.equal(id, "mailer"); return { token: "account" }; },
  }));
  assert.deepEqual(await check(), { state: "verified", domain: "example.com", providerId: "mailer" });
  assert.deepEqual(tokens, ["send-only", "account"]);
  assert.deepEqual(credential, { token: "send-only" });
});

test("an unrelated provider refusal never opens the account credential", async () => {
  let lookups = 0;
  const check = createSenderDomainVerification(deps({
    findProvider: async () => provider(async () => providerRejected({ code: "rate_limited", message: "wait" })),
    resolveDomainReadCredential: async () => { lookups += 1; return { token: "account" }; },
  }));
  assert.equal((await check()).state, "unknown");
  assert.equal(lookups, 0);
});
