// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

import { resolveDefaultForSourceControl } from "#src/features/source-control/index";
import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Gap #11 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — the sealed credential
 * stores behind `.../system/publish/credentials` and `.../system/source-control/credentials`, through
 * the REAL site composition on both dialects.
 *
 * `publish-credentials-route.test.ts` and `source-control-credentials-route.test.ts` run on the
 * hermetic root. The repos are dialect-tested alone; the route → `AesGcmSecretSealer` (keyed by the
 * real `EnvOrFileKeyring`) → `vendor_credential_sets` / source-control row → unseal seam is not. The
 * dialect risks are the sealed blob round-tripping through a BLOB column (SQLite) vs BYTEA/TEXT
 * (Postgres), and a duplicate `(provider, label)` surfacing as the mapped 409 rather than a raw
 * driver unique-violation (the two engines word that error differently).
 *
 * Two true external edges are faked, nothing else: the site key (set through `TOVU_SITE_KEY` for the
 * test, so the real keyring resolves it; the legacy name is pinned to the same value so a developer
 * shell's own key cannot conflict), and the publish host's verification endpoint (`globalThis.fetch`
 * for any URL that is not this test's own server — the same discipline
 * `publish-credentials-route.test.ts`'s `stubVerificationFetch` documents).
 */

const SITE_KEY_HEX = "a1".repeat(32);
const SITE_KEY_VARS = ["TOVU_SITE_KEY", "TOVU_INTEGRATIONS_ROOT_KEY"] as const;

function useSiteKey(t: TestContext): void {
  const saved = SITE_KEY_VARS.map((name) => [name, process.env[name]] as const);
  for (const name of SITE_KEY_VARS) process.env[name] = SITE_KEY_HEX;
  t.after(() => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

/** Records every outbound (non-local) request's URL and Authorization header, answering 401. */
function captureProviderCalls(t: TestContext, site: BootedSite): Array<{ url: string; authorization: string | null }> {
  const calls: Array<{ url: string; authorization: string | null }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).startsWith(site.baseUrl)) return original(input, init);
    calls.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization") });
    return new Response("", { status: 401 });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] publish credentials [${dialect}]: the token is sealed into the store and unsealed for verification, never returned, and DELETE removes it`, async (t) => {
    useSiteKey(t);
    const site = await bootSite(t, dialect);
    const calls = captureProviderCalls(t, site);
    const base = `${site.ws}/system/publish/credentials`;

    const created = await expectJson<{ credential: Record<string, unknown> & { id: string }; verification: { status: string } }>(
      await send(site, "POST", base, { label: "Unrun Netlify", connection: { providerId: "netlify", token: "netlify-secret-token" } }),
      201
    );
    assert.deepEqual(
      { providerId: created.credential.providerId, label: created.credential.label, isDefault: created.credential.isDefault, tokenTail: created.credential.tokenTail },
      { providerId: "netlify", label: "Unrun Netlify", isDefault: true, tokenTail: "oken" }
    );
    assert.equal(JSON.stringify(created).includes("netlify-secret-token"), false);
    assert.equal(created.verification.status, "invalid");
    assert.deepEqual(calls, [{ url: "https://api.netlify.com/api/v1/user", authorization: "Bearer netlify-secret-token" }], "the save-time verify read the token back out of the sealed row");

    const verified = await expectJson<{ verification: { status: string } }>(await send(site, "POST", `${base}/${created.credential.id}/verify`), 200);
    assert.equal(verified.verification.status, "invalid");
    assert.deepEqual(calls.at(-1), { url: "https://api.netlify.com/api/v1/user", authorization: "Bearer netlify-secret-token" });

    const listed = await expectJson<{ credentials: Array<{ id: string }> }>(await send(site, "GET", base), 200);
    assert.deepEqual(listed.credentials.map((row) => row.id), [created.credential.id]);

    const removed = await send(site, "DELETE", `${base}/${created.credential.id}`);
    assert.equal(removed.status, 204);
    assert.deepEqual((await expectJson<{ credentials: unknown[] }>(await send(site, "GET", base), 200)).credentials, []);
  });

  test(`[unrun] publish credentials [${dialect}]: a duplicate (provider, label) is the mapped 409 DUPLICATE_LABEL with the exact detail, and one row remains`, async (t) => {
    useSiteKey(t);
    const site = await bootSite(t, dialect);
    captureProviderCalls(t, site);
    const base = `${site.ws}/system/publish/credentials`;

    await expectJson(await send(site, "POST", base, { label: "Shared", connection: { providerId: "netlify", token: "token-a" } }), 201);
    const duplicate = await expectJson<{ error: string; detail: string }>(
      await send(site, "POST", base, { label: "Shared", connection: { providerId: "netlify", token: "token-b" } }),
      409
    );
    assert.deepEqual(duplicate, { error: "DUPLICATE_LABEL", detail: "a 'netlify' credential labeled 'Shared' already exists in this workspace" });
    assert.equal((await expectJson<{ credentials: unknown[] }>(await send(site, "GET", base), 200)).credentials.length, 1);
  });

  test(`[unrun] source-control credentials [${dialect}]: create → rename keeps the sealed token → a duplicate label is 409 → delete`, async (t) => {
    useSiteKey(t);
    const site = await bootSite(t, dialect);
    const base = `${site.ws}/system/source-control/credentials`;
    const resolveGithub = () =>
      resolveDefaultForSourceControl(
        { repo: site.deps.sourceControlCredentialSetRepo, sealer: site.deps.siteAssistantSecretSealer },
        { workspaceId: site.deps.workspaceId, providerId: "github" }
      );

    const created = await expectJson<{ credential: Record<string, unknown> & { id: string } }>(
      await send(site, "POST", base, { label: "default", connection: { providerId: "github", token: "ghp_unrun_secret" } }),
      201
    );
    assert.deepEqual(
      { providerId: created.credential.providerId, label: created.credential.label, isDefault: created.credential.isDefault, configured: created.credential.configured },
      { providerId: "github", label: "default", isDefault: true, configured: true }
    );
    assert.equal(JSON.stringify(created).includes("ghp_unrun_secret"), false);
    assert.deepEqual((await resolveGithub())?.connection, { providerId: "github", token: "ghp_unrun_secret" });

    const renamed = await expectJson<{ credential: { id: string; label: string } }>(await send(site, "PUT", `${base}/${created.credential.id}`, { label: "renamed" }), 200);
    assert.deepEqual(renamed.credential.label, "renamed");
    assert.deepEqual((await resolveGithub())?.connection, { providerId: "github", token: "ghp_unrun_secret" }, "a label-only PUT never touches the sealed token");

    await expectJson(await send(site, "POST", base, { label: "second", connection: { providerId: "github", token: "ghp_other" } }), 201);
    const duplicate = await send(site, "POST", base, { label: "renamed", connection: { providerId: "github", token: "ghp_third" } });
    assert.equal(duplicate.status, 409, await duplicate.clone().text());
    assert.equal(((await duplicate.json()) as { error: string }).error, "DUPLICATE_LABEL");

    assert.equal((await send(site, "DELETE", `${base}/${created.credential.id}`)).status, 204);
    const remaining = await expectJson<{ credentials: Array<{ label: string }> }>(await send(site, "GET", base), 200);
    assert.deepEqual(remaining.credentials.map((row) => row.label), ["second"]);
  });
}
