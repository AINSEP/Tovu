import assert from "node:assert/strict";
import test from "node:test";

import type { AssistantExecutionRouteDeps } from "../execution-deps.js";
import { resolveProbeCredential } from "../stored-credential-probe.js";

/**
 * @file The `useAdminStoredCredential` branch of the probe chokepoint.
 *
 * WHY IT EXISTS. The admin's own BYOK key moved server-side and write-only on 2026-08-05, but
 * `test-connection.ts`/`list-models.ts` still only knew how to send a key from the request body. So
 * the admin BYOK panel on `/admin/ai-assistant` probed with an empty string, the provider answered
 * "No API key — model discovery needs the key from this browser", `modelDiscovery` never reached
 * `'ok'`, and `ByokProviderForm` fell back to its free-text Model input — while the VISITOR panel
 * directly above it, rendered by the same component, showed a live model picker. Same component,
 * same screen, two different surfaces, because only the visitor form had a stored-key opt-in.
 *
 * WHAT MUST HOLD. Three properties, one per group below:
 *   1. the admin flag opens the admin row, and the SITE row is never touched by it;
 *   2. the endpoint pin applies to the admin row exactly as it does to the site row — this key is
 *      write-only too, so the caller may not choose its destination;
 *   3. every pre-existing caller (neither flag, or the site flag) behaves byte-identically.
 */

const WORKSPACE = "11111111-1111-1111-1111-111111111111";
const PRINCIPAL = "22222222-2222-2222-2222-222222222222";
const GOOGLE = "https://generativelanguage.googleapis.com";

interface StoredRows {
  admin?: { apiKey: string; baseUrl: string | null } | null;
  site?: { apiKey: string; baseUrl: string | null } | null;
}

/**
 * Builds the narrow deps slice `resolveProbeCredential` reads, backed by plain objects.
 *
 * The sealer is shared by both repos in production (one sealing capability app-wide), so it is one
 * fake here too: `open` returns whatever ciphertext string it was handed, which lets each fake row
 * carry its own plaintext key without a real crypto round-trip.
 *
 * `adminReads`/`siteReads` count the calls, which is how the "never touched the other row" and
 * "no decrypt on a request that cannot proceed" assertions below are made observable rather than
 * inferred.
 */
function buildDeps(rows: StoredRows) {
  const counters = { adminReads: 0, siteReads: 0 };
  const now = new Date().toISOString();

  const deps = {
    workspaceId: WORKSPACE,
    authorize: async () => ({ allowed: true as const, reason: "" }),
    adminExecutionCredentialRepo: {
      async findByWorkspaceAndPrincipal(required: { workspaceId: string; principalId: string }) {
        counters.adminReads += 1;
        assert.equal(required.workspaceId, WORKSPACE);
        assert.equal(required.principalId, PRINCIPAL, "the admin row must be looked up by the SESSION principal");
        if (!rows.admin) return null;
        return {
          workspaceId: WORKSPACE,
          principalId: PRINCIPAL,
          protocol: "google",
          providerId: "google-gemini",
          baseUrl: rows.admin.baseUrl,
          model: null,
          maxTokens: null,
          sealed: rows.admin.apiKey,
          masked: "••••cret",
          aadVersion: 0,
          createdAt: now,
          updatedAt: now,
        };
      },
      async upsert() {},
      async clearKey() {},
    },
    siteAssistantCredentialRepo: {
      async findByWorkspaceId() {
        counters.siteReads += 1;
        if (!rows.site) return null;
        return {
          workspaceId: WORKSPACE,
          provider: "google",
          baseUrl: rows.site.baseUrl,
          model: null,
          sealed: rows.site.apiKey,
          masked: "••••site",
          aadVersion: 0,
          createdAt: now,
          updatedAt: now,
        };
      },
      async upsert() {},
      async clearKey() {},
    },
    siteAssistantSecretSealer: {
      async seal() {
        throw new Error("a probe must never seal anything");
      },
      async open({ sealed }: { sealed: unknown }) {
        return String(sealed);
      },
    },
  } as unknown as AssistantExecutionRouteDeps;

  return { deps, counters };
}

test("useAdminStoredCredential opens the CALLER'S OWN admin row and sends its stored endpoint", async () => {
  const { deps, counters } = buildDeps({ admin: { apiKey: "AIza-admin-key", baseUrl: GOOGLE } });

  const result = await resolveProbeCredential(deps, {
    requestedBaseUrl: GOOGLE,
    typedKey: "",
    useStoredCredential: false,
    useAdminStoredCredential: true,
    principalId: PRINCIPAL,
  });

  assert.deepEqual(result, { ok: true, apiKey: "AIza-admin-key", baseUrl: GOOGLE });
  assert.equal(counters.adminReads, 1);
  // The boundary: the admin flag must never reach the SITE's visitor credential.
  assert.equal(counters.siteReads, 0, "the admin opt-in read the site credential — two keys must stay two keys");
});

test("useStoredCredential still opens the SITE row and never the admin's", async () => {
  const { deps, counters } = buildDeps({
    admin: { apiKey: "AIza-admin-key", baseUrl: GOOGLE },
    site: { apiKey: "AIza-site-key", baseUrl: GOOGLE },
  });

  const result = await resolveProbeCredential(deps, {
    requestedBaseUrl: GOOGLE,
    typedKey: "",
    useStoredCredential: true,
  });

  assert.deepEqual(result, { ok: true, apiKey: "AIza-site-key", baseUrl: GOOGLE });
  assert.equal(counters.siteReads, 1);
  assert.equal(counters.adminReads, 0, "the site opt-in read the admin's personal key");
});

test("a typed key still wins over the admin stored one, and no row is decrypted at all", async () => {
  const { deps, counters } = buildDeps({ admin: { apiKey: "AIza-admin-key", baseUrl: GOOGLE } });

  const result = await resolveProbeCredential(deps, {
    requestedBaseUrl: "https://elsewhere.example.com",
    typedKey: "AIza-typed-by-the-operator",
    useStoredCredential: false,
    useAdminStoredCredential: true,
    principalId: PRINCIPAL,
  });

  // Their own secret, typed into their own form, sent where they said — and the stored key is not
  // even opened, so there is nothing to leak on this path.
  assert.deepEqual(result, { ok: true, apiKey: "AIza-typed-by-the-operator", baseUrl: "https://elsewhere.example.com" });
  assert.equal(counters.adminReads, 0);
});

test("the endpoint pin applies to the admin row: a mismatched destination is a 400, not a substitution", async () => {
  const { deps } = buildDeps({ admin: { apiKey: "AIza-admin-key", baseUrl: GOOGLE } });

  const result = await resolveProbeCredential(deps, {
    requestedBaseUrl: "https://attacker.example.com",
    typedKey: "",
    useStoredCredential: false,
    useAdminStoredCredential: true,
    principalId: PRINCIPAL,
  });

  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.failure.code, "STORED_CREDENTIAL_ENDPOINT_MISMATCH");
  assert.match(
    result.ok === false ? result.failure.error : "",
    /admin execution credential is saved for 'https:\/\/generativelanguage\.googleapis\.com'/,
    "the rejection must name the credential and its approved endpoint"
  );
});

test("a trailing slash is the same endpoint, not a mismatch", async () => {
  const { deps } = buildDeps({ admin: { apiKey: "AIza-admin-key", baseUrl: `${GOOGLE}/` } });

  const result = await resolveProbeCredential(deps, {
    requestedBaseUrl: GOOGLE,
    typedKey: "",
    useStoredCredential: false,
    useAdminStoredCredential: true,
    principalId: PRINCIPAL,
  });

  assert.equal(result.ok, true);
  assert.equal(result.ok === true && result.baseUrl, `${GOOGLE}/`, "the SERVER's own stored string is what goes on the wire");
});

test("an admin row with no saved endpoint is a 400 naming the admin credential, not the site one", async () => {
  const { deps } = buildDeps({ admin: { apiKey: "AIza-admin-key", baseUrl: null } });

  const result = await resolveProbeCredential(deps, {
    requestedBaseUrl: GOOGLE,
    typedKey: "",
    useStoredCredential: false,
    useAdminStoredCredential: true,
    principalId: PRINCIPAL,
  });

  assert.equal(result.ok === false && result.failure.code, "STORED_CREDENTIAL_ENDPOINT_UNSET");
  assert.match(result.ok === false ? result.failure.error : "", /admin execution credential has no saved endpoint/);
});

test("no admin row at all falls through to an empty key, letting the provider give its own answer", async () => {
  const { deps } = buildDeps({ admin: null });

  const result = await resolveProbeCredential(deps, {
    requestedBaseUrl: GOOGLE,
    typedKey: "",
    useStoredCredential: false,
    useAdminStoredCredential: true,
    principalId: PRINCIPAL,
  });

  // Nothing to protect on this path — there is no secret in play — and the provider's own auth
  // error is a truer message than a synthesized one.
  assert.deepEqual(result, { ok: true, apiKey: "", baseUrl: GOOGLE });
});

test("neither flag: unchanged for every pre-existing caller, and neither stored row is read", async () => {
  const { deps, counters } = buildDeps({
    admin: { apiKey: "AIza-admin-key", baseUrl: GOOGLE },
    site: { apiKey: "AIza-site-key", baseUrl: GOOGLE },
  });

  const result = await resolveProbeCredential(deps, {
    requestedBaseUrl: GOOGLE,
    typedKey: "",
    useStoredCredential: false,
  });

  assert.deepEqual(result, { ok: true, apiKey: "", baseUrl: GOOGLE });
  assert.equal(counters.adminReads, 0);
  assert.equal(counters.siteReads, 0);
});
