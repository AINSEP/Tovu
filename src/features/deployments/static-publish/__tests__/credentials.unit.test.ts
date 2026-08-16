import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../../../integrations/secret-sealer.aesgcm";
import { InMemoryKeyring } from "../../../../integrations/keyring.memory";
import { createPublishCredential, type PublishCredentialWriteDeps } from "../../publish-credentials/store";
import { InMemoryPublishCredentialSetRepo } from "../../publish-credentials/repo.memory";
import { composePublishCredentialSource, createDbPublishCredentialSource, createEnvPublishCredentialSource } from "../credentials";

/**
 * @file `createEnvPublishCredentialSource` (bound to one workspace, refuses any other — Terra's
 * multi-tenant finding), `createDbPublishCredentialSource` (resolves a provider's DEFAULT saved
 * connection — Contract v2 Correction B, replacing an earlier "ambiguous, 2+ saved" refusal design),
 * and `composePublishCredentialSource` (DB-first, env-fallback only in self-hosted-cli mode, never in
 * hosted-api-only). Every test injects its own `env`/repo rather than mutating real `process.env`
 * (which would leak across parallel test files sharing one process).
 */

const WORKSPACE = "ws-1";
const OTHER_WORKSPACE = "ws-2";
const NOW = "2026-08-15T00:00:00.000Z";

function makeWriteDeps(): PublishCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  let counter = 0;
  return {
    repo: new InMemoryPublishCredentialSetRepo(),
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `cred-${(counter += 1)}` },
  };
}

// --- createEnvPublishCredentialSource ---------------------------------------------------------

test("resolves GITHUB_TOKEN for the github-pages target, trimmed, for the bound workspace", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, { GITHUB_TOKEN: "  ghp_fake_token_value  " } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "github-pages" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "ghp_fake_token_value");
});

test("resolves VERCEL_TOKEN for the vercel target — distinct env var from github-pages", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, { VERCEL_TOKEN: "fake_vercel_token" } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "vercel" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "fake_vercel_token");
});

test("a target's own token being unset never falls back to the OTHER target's env var", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, { VERCEL_TOKEN: "fake_vercel_token" } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "github-pages" });
  assert.equal(result.ok, false);
});

test("fails cleanly (ok:false with a guidance message) when the env var is unset — never throws, never returns an empty token", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, {} as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "vercel" });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.match(result.reason, /VERCEL_TOKEN/);
  assert.doesNotMatch(result.reason, /Bearer|token=|token:/i);
});

test("fails cleanly when the env var is present but blank/whitespace-only — never resolves an empty-string token", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, { GITHUB_TOKEN: "   " } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "github-pages" });
  assert.equal(result.ok, false);
});

test("refuses (never silently serves) a resolve() call for a DIFFERENT workspace than the one it's bound to", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, { VERCEL_TOKEN: "fake_vercel_token" } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: OTHER_WORKSPACE, target: "vercel" });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.match(result.reason, new RegExp(WORKSPACE));
  assert.doesNotMatch(JSON.stringify(result), /fake_vercel_token/, "a mismatched workspace must never see the process-wide token");
});

test("isConfigured() also refuses a DIFFERENT workspace than the one it's bound to", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, { VERCEL_TOKEN: "fake_vercel_token" } as NodeJS.ProcessEnv);
  const result = await source.isConfigured({ workspaceId: OTHER_WORKSPACE, target: "vercel" });
  assert.equal(result.configured, false);
});

test("cloudflare-pages requires BOTH CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID — token alone is not configured", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, { CLOUDFLARE_API_TOKEN: "cf-token" } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "cloudflare-pages" });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.match(result.reason, /CLOUDFLARE_ACCOUNT_ID/);
});

test("cloudflare-pages resolves BOTH token and accountId once both env vars are set", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, {
    CLOUDFLARE_API_TOKEN: "cf-token",
    CLOUDFLARE_ACCOUNT_ID: "acct-123",
  } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "cloudflare-pages" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "cf-token");
  assert.equal(result.accountId, "acct-123");
});

test("netlify/vercel/github-pages never carry an accountId field", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, { NETLIFY_TOKEN: "nl-token" } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "netlify" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal("accountId" in result, false);
});

// --- createDbPublishCredentialSource -------------------------------------------------------------

test("resolves the provider's DEFAULT saved connection — never 'ambiguous' even with 2+ saved", async () => {
  const writeDeps = makeWriteDeps();
  await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "Old", connection: { providerId: "vercel", token: "old-token" } });
  await createPublishCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "New",
    connection: { providerId: "vercel", token: "new-token" },
    isDefault: true,
  });

  const source = createDbPublishCredentialSource(writeDeps);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "vercel" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "new-token", "must resolve the DEFAULT connection, not the first-created or an arbitrary one");
});

test("resolve() reports ok:false (not configured) with no default, never decrypts anything", async () => {
  const writeDeps = makeWriteDeps();
  const source = createDbPublishCredentialSource(writeDeps);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "vercel" });
  assert.equal(result.ok, false);
});

test("isConfigured() never decrypts — a broken sealer does not fail it", async () => {
  const writeDeps = makeWriteDeps();
  await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "One", connection: { providerId: "netlify", token: "t" } });

  const source = createDbPublishCredentialSource({ repo: writeDeps.repo, sealer: { open: () => { throw new Error("must not be called"); }, seal: writeDeps.sealer.seal.bind(writeDeps.sealer) } });
  const result = await source.isConfigured({ workspaceId: WORKSPACE, target: "netlify" });
  assert.equal(result.configured, true);
});

test("resolve() carries accountId for cloudflare-pages, sourced from the credential (never the publish config)", async () => {
  const writeDeps = makeWriteDeps();
  await createPublishCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "CF",
    connection: { providerId: "cloudflare-pages", token: "cf-token", accountId: "acct-99" },
  });

  const source = createDbPublishCredentialSource(writeDeps);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "cloudflare-pages" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "cf-token");
  assert.equal(result.accountId, "acct-99");
});

test("resolve() for a non-cloudflare target never carries an accountId field", async () => {
  const writeDeps = makeWriteDeps();
  await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "V", connection: { providerId: "vercel", token: "v-token" } });

  const source = createDbPublishCredentialSource(writeDeps);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "vercel" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal("accountId" in result, false);
});

test("tenant isolation: a saved connection in one workspace never resolves for another", async () => {
  const writeDeps = makeWriteDeps();
  await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "Mine", connection: { providerId: "vercel", token: "mine" } });

  const source = createDbPublishCredentialSource(writeDeps);
  const result = await source.resolve({ workspaceId: OTHER_WORKSPACE, target: "vercel" });
  assert.equal(result.ok, false);
});

// --- composePublishCredentialSource ---------------------------------------------------------------

test("self-hosted-cli: DB-backed wins over the env fallback when both are configured", async () => {
  const writeDeps = makeWriteDeps();
  await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "Saved", connection: { providerId: "vercel", token: "from-db" } });

  const source = composePublishCredentialSource({
    workspaceId: WORKSPACE,
    executionMode: "self-hosted-cli",
    dbDeps: writeDeps,
    env: { VERCEL_TOKEN: "from-env" } as NodeJS.ProcessEnv,
  });

  const result = await source.resolve({ workspaceId: WORKSPACE, target: "vercel" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "from-db");
});

test("self-hosted-cli: falls back to the env source when nothing is saved in the DB", async () => {
  const writeDeps = makeWriteDeps();
  const source = composePublishCredentialSource({
    workspaceId: WORKSPACE,
    executionMode: "self-hosted-cli",
    dbDeps: writeDeps,
    env: { VERCEL_TOKEN: "from-env" } as NodeJS.ProcessEnv,
  });

  const result = await source.resolve({ workspaceId: WORKSPACE, target: "vercel" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "from-env");
});

test("hosted-api-only: the env source is never even constructed — a set env var is never used as a fallback", async () => {
  const writeDeps = makeWriteDeps();
  const source = composePublishCredentialSource({
    workspaceId: WORKSPACE,
    executionMode: "hosted-api-only",
    dbDeps: writeDeps,
    env: { VERCEL_TOKEN: "from-env-must-never-appear" } as NodeJS.ProcessEnv,
  });

  const result = await source.resolve({ workspaceId: WORKSPACE, target: "vercel" });
  assert.equal(result.ok, false, "hosted-api-only with nothing saved in the DB must report not-configured, never fall through to env");
  if (result.ok) throw new Error("unreachable");
  assert.doesNotMatch(result.reason, /from-env-must-never-appear/);
});

test("hosted-api-only: still resolves a DB-backed default when one is saved", async () => {
  const writeDeps = makeWriteDeps();
  await createPublishCredential(writeDeps, { workspaceId: WORKSPACE, label: "Saved", connection: { providerId: "vercel", token: "from-db" } });

  const source = composePublishCredentialSource({ workspaceId: WORKSPACE, executionMode: "hosted-api-only", dbDeps: writeDeps });
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "vercel" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "from-db");
});
