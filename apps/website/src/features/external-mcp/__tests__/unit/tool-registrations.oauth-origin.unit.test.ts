import assert from "node:assert/strict";
import test from "node:test";

import type { ToolRegistration } from "@jini-ai/cms/core";
import { ToolInputError } from "@jini-ai/core";

import {
  createDeviceAuthorizationStore,
  createExternalMcpOAuthService,
  InMemoryExternalMcpServerRepo,
  saveExternalMcpServer,
} from "#src/assistant/index";
import { createPendingAuthorizationStore, type OAuthFetch, type OAuthProviderDescriptor } from "#src/platform/oauth/index";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";

import { buildExternalMcpRegistrations } from "../../tool-registrations.js";
import type { ExternalMcpToolDeps } from "../../deps.js";

/**
 * @file `external_mcp_oauth_connect`'s redirect-URI origin precedence — the 2026-09-10 fix for a
 * non-technical user's OAuth connect refusing outright just because `TOVU_PUBLIC_URL` was never set
 * (see `tool-registrations.ts`'s own header, "2026-09-10").
 *
 * Three things this suite proves, matching the three states `resolveExternalMcpOAuthRedirectUri` can
 * be in:
 * 1. `TOVU_PUBLIC_URL` unset, `derivedPublicOrigin` present -> the derived origin is used and the
 *    connect is NOT refused (the actual defect this change closes).
 * 2. Both present -> the operator's `TOVU_PUBLIC_URL` wins, never the derived one (a real deployment
 *    behind a proxy or custom domain must keep working).
 * 3. Neither present -> the last-resort refusal still fires, naming both things that were tried.
 *
 * Real `createExternalMcpOAuthService`/`beginAuthorizationCode` are used throughout, not a stub of
 * `beginConnect` — the authorization URL's own `redirect_uri` query parameter is asserted directly,
 * so this proves what this domain's code ACTUALLY sends the OAuth client, not just what it intended
 * to. `fetchFn` is a tripwire that throws if ever called: the `authorization_code` grant's
 * `beginConnect` path never touches the network (it only composes a URL and writes `pending`), so a
 * call would mean this test is exercising something other than what it claims to.
 */

const WORKSPACE = "ws-external-mcp-oauth-origin";
const SERVER = "test-oauth-srv";
const CALLBACK_PATH_SUFFIX = `/api/mcp-servers/oauth/callback/${SERVER}`;

const PROVIDER: OAuthProviderDescriptor = {
  providerId: "test-provider",
  label: "Test Provider",
  supportedGrants: ["authorization_code"],
  authorizationEndpoint: "https://auth.example.com/authorize",
  tokenEndpoint: "https://auth.example.com/token",
  defaultScopes: [],
  usesPkce: true,
  clientAuth: "none",
};

const NETWORK_TRIPWIRE: OAuthFetch = (async () => {
  throw new Error("network should not be reached by an authorization_code beginConnect");
}) as OAuthFetch;

function call(handler: ToolRegistration["handler"], input: unknown) {
  return handler({
    executionId: "exec-1",
    principal: { id: "principal-1" },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  } as Parameters<typeof handler>[0]);
}

/** Builds a real, wired `external_mcp_oauth_connect` handler over one saved authorization_code
 *  OAuth row — `derivedPublicOrigin` is the one field each test below varies. */
async function makeConnectHandler(derivedPublicOrigin: string | undefined): Promise<ToolRegistration["handler"]> {
  const repo = new InMemoryExternalMcpServerRepo();
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  const clock = { nowIso: () => "2026-09-10T00:00:00.000Z" };

  await saveExternalMcpServer(
    { repo, sealer, keyring, clock },
    {
      workspaceId: WORKSPACE,
      serverId: SERVER,
      label: "Test OAuth Server",
      transport: "stdio",
      authMode: "oauth",
      enabled: true,
      command: "npx",
      args: "-y test-mcp",
      allowedToolNames: "do_thing",
      oauth: {
        providerId: PROVIDER.providerId,
        grant: "authorization_code",
        clientId: "tovu-client",
        scopes: "read",
        tokenEnvName: "TEST_OAUTH_SRV_TOKEN",
      },
    },
  );

  const externalMcpOAuth = createExternalMcpOAuthService({
    workspaceId: WORKSPACE,
    repo,
    sealer,
    keyring,
    clock,
    pending: createPendingAuthorizationStore({ clock }),
    devices: createDeviceAuthorizationStore(),
    fetchFn: NETWORK_TRIPWIRE,
    lookupProvider: () => PROVIDER,
  });

  const routeDeps: ExternalMcpToolDeps = {
    workspaceId: WORKSPACE,
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock,
    externalMcpServerRepo: repo,
    siteAssistantSecretSealer: sealer,
    siteAssistantSecretKeyring: keyring,
    externalMcpOAuth,
    ...(derivedPublicOrigin === undefined ? {} : { derivedPublicOrigin }),
  };

  const registrations = buildExternalMcpRegistrations(routeDeps, { surfaceExchanges: createSurfaceExchangeStore() });
  const registration = registrations.find((r) => r.descriptor.id === "external_mcp_oauth_connect");
  assert.ok(registration, "external_mcp_oauth_connect must be wired");
  return registration.handler;
}

/** Reads back the `redirect_uri` an authorization URL was built with. */
function redirectUriOf(authorizationUrl: string): string | null {
  return new URL(authorizationUrl).searchParams.get("redirect_uri");
}

test("TOVU_PUBLIC_URL unset, a derived origin present: the derived origin is used and the connect is NOT refused", async () => {
  const previous = process.env.TOVU_PUBLIC_URL;
  delete process.env.TOVU_PUBLIC_URL;
  try {
    const handler = await makeConnectHandler("https://localhost:3000");
    const result = (await call(handler, { id: SERVER })) as { kind: string; authorizationUrl: string };

    assert.equal(result.kind, "redirect_required");
    assert.equal(redirectUriOf(result.authorizationUrl), `https://localhost:3000${CALLBACK_PATH_SUFFIX}`);
  } finally {
    if (previous === undefined) delete process.env.TOVU_PUBLIC_URL;
    else process.env.TOVU_PUBLIC_URL = previous;
  }
});

test("TOVU_PUBLIC_URL set: it wins over a derived origin, never the reverse", async () => {
  const previous = process.env.TOVU_PUBLIC_URL;
  process.env.TOVU_PUBLIC_URL = "https://configured.example.com";
  try {
    const handler = await makeConnectHandler("https://localhost:3000");
    const result = (await call(handler, { id: SERVER })) as { kind: string; authorizationUrl: string };

    assert.equal(result.kind, "redirect_required");
    assert.equal(redirectUriOf(result.authorizationUrl), `https://configured.example.com${CALLBACK_PATH_SUFFIX}`);
  } finally {
    if (previous === undefined) delete process.env.TOVU_PUBLIC_URL;
    else process.env.TOVU_PUBLIC_URL = previous;
  }
});

test("TOVU_PUBLIC_URL set to a malformed value: the connect is refused naming it, never silently demoted to the derived origin", async () => {
  const previous = process.env.TOVU_PUBLIC_URL;
  try {
    // Two shapes, because the resolver has two ways to reject one: a value `new URL()` parses but
    // whose scheme is not http(s) (a typed-over "https"), and one it cannot parse at all (a bare
    // host, the other thing an operator types into an env var called *_URL).
    for (const malformed of ["htps://public.example", "public.example.com"]) {
      process.env.TOVU_PUBLIC_URL = malformed;
      const handler = await makeConnectHandler("https://localhost:3000");

      await assert.rejects(
        () => call(handler, { id: SERVER }),
        (error: unknown) => {
          // The operator override must win WHENEVER it is present — so an invalid value cannot be
          // indistinguishable from an absent one. Degrading to `undefined` here would hand the
          // provider a localhost callback in dev, or a proxy-derived one in production, that the
          // operator never configured and cannot see in the emitted authorization URL.
          assert.ok(error instanceof ToolInputError, `expected a ToolInputError (400) for '${malformed}', got ${String(error)}`);
          assert.match(error.message, /TOVU_PUBLIC_URL/, "the refusal must name the variable the operator has to fix");
          assert.ok(error.message.includes(malformed), `the refusal must quote the offending value, got: ${error.message}`);
          assert.doesNotMatch(error.message, /localhost/, "a silent fallback to the derived origin is the exact failure this refuses");
          return true;
        },
      );
    }
  } finally {
    if (previous === undefined) delete process.env.TOVU_PUBLIC_URL;
    else process.env.TOVU_PUBLIC_URL = previous;
  }
});

test("neither TOVU_PUBLIC_URL nor a derived origin: the last-resort refusal still fires, naming both", async () => {
  const previous = process.env.TOVU_PUBLIC_URL;
  delete process.env.TOVU_PUBLIC_URL;
  try {
    const handler = await makeConnectHandler(undefined);

    await assert.rejects(
      () => call(handler, { id: SERVER }),
      (error: unknown) => {
        assert.ok(error instanceof ToolInputError, `expected a ToolInputError (400), got ${String(error)}`);
        assert.match((error as Error).message, /TOVU_PUBLIC_URL/);
        assert.match((error as Error).message, /derived origin/i);
        return true;
      },
    );
  } finally {
    if (previous === undefined) delete process.env.TOVU_PUBLIC_URL;
    else process.env.TOVU_PUBLIC_URL = previous;
  }
});
