import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { createPublishCredential, type PublishCredentialWriteDeps } from "../../publish-credentials/store.js";
import { InMemoryPublishCredentialSetRepo } from "../../publish-credentials/repo.memory.js";
import { composePublishCredentialSource, createDbPublishCredentialSource, createEnvPublishCredentialSource } from "../credentials.js";

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

// --- vendor-official env var aliases (2026-08-15 credential-UI redesign brief) -----------------

test("netlify falls back to NETLIFY_ACCESS_TOKEN when NETLIFY_TOKEN is unset", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, { NETLIFY_ACCESS_TOKEN: "nl-alias-token" } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "netlify" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "nl-alias-token");
});

test("netlify falls back to NETLIFY_AUTH_TOKEN when neither NETLIFY_TOKEN nor NETLIFY_ACCESS_TOKEN is set", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, { NETLIFY_AUTH_TOKEN: "nl-auth-token" } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "netlify" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "nl-auth-token");
});

test("netlify prefers NETLIFY_TOKEN over its own aliases when more than one is set", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, {
    NETLIFY_TOKEN: "primary",
    NETLIFY_ACCESS_TOKEN: "alias-1",
    NETLIFY_AUTH_TOKEN: "alias-2",
  } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "netlify" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "primary");
});

test("netlify's failure reason names every alias it checked when none is set", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, {} as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "netlify" });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.match(result.reason, /NETLIFY_TOKEN/);
  assert.match(result.reason, /NETLIFY_ACCESS_TOKEN/);
  assert.match(result.reason, /NETLIFY_AUTH_TOKEN/);
});

test("cloudflare-pages accepts CLOUDFLARE_TOKEN (the vendor-official name) as its token, alongside the account id", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, {
    CLOUDFLARE_TOKEN: "cf-official-token",
    CLOUDFLARE_ACCOUNT_ID: "acct-1",
  } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "cloudflare-pages" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "cf-official-token");
});

test("cloudflare-pages prefers CLOUDFLARE_TOKEN over CLOUDFLARE_API_TOKEN when both are set", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, {
    CLOUDFLARE_TOKEN: "primary",
    CLOUDFLARE_API_TOKEN: "fallback",
    CLOUDFLARE_ACCOUNT_ID: "acct-1",
  } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "cloudflare-pages" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "primary");
});

test("cloudflare-pages still names CLOUDFLARE_ACCOUNT_ID explicitly even when the token comes from an alias", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, { CLOUDFLARE_TOKEN: "cf-official-token" } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "cloudflare-pages" });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.match(result.reason, /CLOUDFLARE_ACCOUNT_ID/);
});

test("github-pages falls back to GH_TOKEN (the gh CLI's own name) when GITHUB_TOKEN is unset", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, { GH_TOKEN: "gh-cli-token" } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "github-pages" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "gh-cli-token");
});

test("github-pages falls back to GITHUB_ACCESS_TOKEN — the name operators reach for by analogy", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, { GITHUB_ACCESS_TOKEN: "gh-access-token" } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "github-pages" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "gh-access-token");
});

test("github-pages prefers GITHUB_TOKEN over its own aliases when more than one is set", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, {
    GITHUB_TOKEN: "primary",
    GH_TOKEN: "alias-1",
    GITHUB_ACCESS_TOKEN: "alias-2",
  } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "github-pages" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "primary");
});

test("github-pages' failure reason names every alias it checked when none is set", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, {} as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "github-pages" });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.match(result.reason, /GITHUB_TOKEN/);
  assert.match(result.reason, /GH_TOKEN/);
  assert.match(result.reason, /GITHUB_ACCESS_TOKEN/);
});

test("vercel falls back to VERCEL_ACCESS_TOKEN — the name operators reach for by analogy", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, { VERCEL_ACCESS_TOKEN: "vercel-access-token" } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "vercel" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "vercel-access-token");
});

test("vercel prefers VERCEL_TOKEN over VERCEL_ACCESS_TOKEN when both are set", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, {
    VERCEL_TOKEN: "primary",
    VERCEL_ACCESS_TOKEN: "alias-1",
  } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "vercel" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "primary");
});

test("vercel's failure reason names every alias it checked when none is set", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, {} as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "vercel" });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.match(result.reason, /VERCEL_TOKEN/);
  assert.match(result.reason, /VERCEL_ACCESS_TOKEN/);
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

// --- s3-compatible: no env fallback, six-field DB projection (spec `custom-publish-provider-contract.md` §4/§10) ---

test("createEnvPublishCredentialSource: s3-compatible has NO env-var fallback — always ok:false, regardless of any env vars set", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, {
    GITHUB_TOKEN: "irrelevant",
    VERCEL_TOKEN: "irrelevant",
  } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "s3-compatible" });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.match(result.reason, /no server-environment-variable fallback/);

  const configured = await source.isConfigured({ workspaceId: WORKSPACE, target: "s3-compatible" });
  assert.equal(configured.configured, false);
});

test("createDbPublishCredentialSource: resolves a saved s3-compatible connection with secretAccessKey mapped to token, plus all five companion fields", async () => {
  const writeDeps = makeWriteDeps();
  await createPublishCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "x",
    connection: {
      providerId: "s3-compatible",
      region: "auto",
      bucket: "my-bucket",
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "s3cr3t",
      publicUrl: "https://my-bucket.example.test",
      endpoint: "https://abc123.r2.cloudflarestorage.com",
    },
  });

  const source = createDbPublishCredentialSource(writeDeps);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "s3-compatible" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "s3cr3t", "secretAccessKey must fill the token field's role");
  assert.equal(result.accessKeyId, "AKIAEXAMPLE");
  assert.equal(result.bucket, "my-bucket");
  assert.equal(result.region, "auto");
  assert.equal(result.publicUrl, "https://my-bucket.example.test");
  assert.equal(result.endpoint, "https://abc123.r2.cloudflarestorage.com");
  assert.equal(result.accountId, undefined, "accountId is a cloudflare-pages-only field, never populated for s3-compatible");
});

test("createDbPublishCredentialSource: an omitted endpoint stays omitted on the resolved credential, never coerced to an empty string", async () => {
  const writeDeps = makeWriteDeps();
  await createPublishCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "x",
    connection: {
      providerId: "s3-compatible",
      region: "us-east-1",
      bucket: "my-bucket",
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "s3cr3t",
      publicUrl: "https://my-bucket.s3.us-east-1.amazonaws.com",
    },
  });

  const source = createDbPublishCredentialSource(writeDeps);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "s3-compatible" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.ok(!("endpoint" in result), "omitted endpoint must not appear as a key at all");
});

test("composePublishCredentialSource: self-hosted-cli mode still never falls back to env for s3-compatible when nothing is saved in the DB", async () => {
  const writeDeps = makeWriteDeps();
  const source = composePublishCredentialSource({
    workspaceId: WORKSPACE,
    executionMode: "self-hosted-cli",
    dbDeps: writeDeps,
    env: { GITHUB_TOKEN: "irrelevant-to-s3" } as NodeJS.ProcessEnv,
  });
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "s3-compatible" });
  assert.equal(result.ok, false);
});

// --- credentialId: the publish is bound to the connection the OPERATOR chose ---------------------
// terra review 2026-09-20, finding 1 (Critical). The server used to pick the credential itself by
// `{workspaceId, target}`, so whichever row happened to be `is_default` when the publish POST landed
// is the one that published — select B, click Publish inside the promotion window, and the site went
// to A's account. `resolve()` now takes the chosen connection's id and publishes with THAT row or
// refuses. A client-supplied id is UNTRUSTED: the workspace scoping below is the whole point.

test("credentialId: resolves the NAMED connection, not the provider's current default, when the two differ", async () => {
  const writeDeps = makeWriteDeps();
  const chosen = await createPublishCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "Chosen",
    connection: { providerId: "vercel", token: "chosen-token" },
  });
  await createPublishCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "Default",
    connection: { providerId: "vercel", token: "default-token" },
    isDefault: true,
  });

  const source = createDbPublishCredentialSource(writeDeps);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "vercel", credentialId: chosen.id });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "chosen-token", "the publish must use the connection the request named, never the row that is default right now");
});

test("credentialId: another workspace's credential id is REFUSED — never resolved, never leaked", async () => {
  const writeDeps = makeWriteDeps();
  const theirs = await createPublishCredential(writeDeps, {
    workspaceId: OTHER_WORKSPACE,
    label: "Theirs",
    connection: { providerId: "vercel", token: "other-workspace-token" },
  });
  await createPublishCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "Mine",
    connection: { providerId: "vercel", token: "my-token" },
    isDefault: true,
  });

  const source = createDbPublishCredentialSource(writeDeps);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "vercel", credentialId: theirs.id });
  assert.equal(result.ok, false, "a credential id belonging to another workspace must never publish");
  if (result.ok) throw new Error("unreachable");
  assert.equal(
    result.reason,
    "the selected publish credential is not available in this workspace — reload the Static Site tab and choose a connection again"
  );
  assert.doesNotMatch(JSON.stringify(result), /other-workspace-token/, "never leak the other workspace's secret");
  assert.doesNotMatch(JSON.stringify(result), /my-token/, "and never quietly fall back to this workspace's own default");
});

test("credentialId: a nonexistent id is refused with the SAME message as another workspace's id — no existence oracle", async () => {
  const writeDeps = makeWriteDeps();
  await createPublishCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "Mine",
    connection: { providerId: "vercel", token: "my-token" },
    isDefault: true,
  });

  const source = createDbPublishCredentialSource(writeDeps);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "vercel", credentialId: "cred-does-not-exist" });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(
    result.reason,
    "the selected publish credential is not available in this workspace — reload the Static Site tab and choose a connection again"
  );
  assert.doesNotMatch(result.reason, /cred-does-not-exist/, "never echo caller-supplied input back into an error message");
});

test("credentialId: a credential saved for a DIFFERENT provider than the publish target is refused", async () => {
  const writeDeps = makeWriteDeps();
  const vercelCred = await createPublishCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "Vercel",
    connection: { providerId: "vercel", token: "vercel-token" },
  });
  await createPublishCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "GitHub",
    connection: { providerId: "github-pages", token: "github-token" },
    isDefault: true,
  });

  const source = createDbPublishCredentialSource(writeDeps);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "github-pages", credentialId: vercelCred.id });
  assert.equal(result.ok, false, "a vercel connection must never publish a github-pages target");
  if (result.ok) throw new Error("unreachable");
  assert.equal(result.reason, "the selected publish credential is saved for 'vercel', not 'github-pages' — choose a 'github-pages' connection");
  assert.doesNotMatch(JSON.stringify(result), /vercel-token|github-token/, "a refused publish resolves no secret at all");
});

test("credentialId: the id-bound path carries cloudflare-pages' accountId, exactly like the default path", async () => {
  const writeDeps = makeWriteDeps();
  const cred = await createPublishCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "CF",
    connection: { providerId: "cloudflare-pages", token: "cf-token", accountId: "acct-77" },
  });

  const source = createDbPublishCredentialSource(writeDeps);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "cloudflare-pages", credentialId: cred.id });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "cf-token");
  assert.equal(result.accountId, "acct-77");
});

test("credentialId: self-hosted-cli NEVER falls back to the env token when the named credential does not resolve", async () => {
  const writeDeps = makeWriteDeps();
  const source = composePublishCredentialSource({
    workspaceId: WORKSPACE,
    executionMode: "self-hosted-cli",
    dbDeps: writeDeps,
    env: { VERCEL_TOKEN: "from-env-must-never-appear" } as NodeJS.ProcessEnv,
  });

  const result = await source.resolve({ workspaceId: WORKSPACE, target: "vercel", credentialId: "cred-does-not-exist" });
  assert.equal(result.ok, false, "a silent fallback to the env token is exactly the bug this binding exists to close");
  if (result.ok) throw new Error("unreachable");
  assert.doesNotMatch(JSON.stringify(result), /from-env-must-never-appear/);
  assert.equal(
    result.reason,
    "the selected publish credential is not available in this workspace — reload the Static Site tab and choose a connection again"
  );
});

test("credentialId: the env source itself refuses an id-bound resolve — env vars are not saved connections", async () => {
  const source = createEnvPublishCredentialSource(WORKSPACE, { VERCEL_TOKEN: "from-env-must-never-appear" } as NodeJS.ProcessEnv);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "vercel", credentialId: "cred-1" });
  assert.equal(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assert.equal(
    result.reason,
    "a saved connection was chosen for this publish, but this install resolves 'vercel' credentials from server environment variables, which have no saved connections to choose from"
  );
  assert.doesNotMatch(JSON.stringify(result), /from-env-must-never-appear/);
});

test("credentialId: omitting it is unchanged — the provider's default still resolves (every non-admin caller stays on this path)", async () => {
  const writeDeps = makeWriteDeps();
  await createPublishCredential(writeDeps, {
    workspaceId: WORKSPACE,
    label: "Default",
    connection: { providerId: "vercel", token: "default-token" },
    isDefault: true,
  });

  const source = createDbPublishCredentialSource(writeDeps);
  const result = await source.resolve({ workspaceId: WORKSPACE, target: "vercel" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.token, "default-token");
});
