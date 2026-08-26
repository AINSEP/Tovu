import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { OAuthError, type OAuthErrorCode } from "../errors.js";
import type { OAuthClient, OAuthClock, OAuthFetch, OAuthProviderDescriptor } from "../ports.js";

/**
 * @file Shared doubles for the `src/oauth/` tests.
 *
 * The fetch double records the REQUEST as well as scripting the response, because most of what
 * matters in an OAuth client is what it sent: the presence of `code_verifier`, the absence of a
 * client secret for a public client, `redirect: "error"`, and the fact that a failure was not
 * retried. A double that only scripted responses would let all of those regress silently.
 */

export interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: URLSearchParams;
  readonly redirect: string | undefined;
}

export interface ScriptedResponse {
  readonly status?: number;
  readonly json?: unknown;
  /** Raw body, when the test needs something `JSON.stringify` cannot produce. */
  readonly text?: string;
  /** Thrown instead of answering — models a timeout or a transport failure. */
  readonly throws?: Error;
}

export interface FetchDouble {
  readonly fetchFn: OAuthFetch;
  readonly requests: RecordedRequest[];
  /** How many times `fetchFn` was called. The retry assertions read this. */
  callCount(): number;
}

/** Scripts responses in order; the last one repeats if called again (so a "did it retry?" assertion
 *  fails on the call count rather than on a confusing out-of-script error). */
export function createFetchDouble(script: readonly ScriptedResponse[]): FetchDouble {
  const requests: RecordedRequest[] = [];
  let calls = 0;

  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const step = script[Math.min(calls, script.length - 1)] ?? {};
    calls += 1;
    requests.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: { ...(init?.headers as Record<string, string> | undefined) },
      body: new URLSearchParams(typeof init?.body === "string" ? init.body : ""),
      redirect: init?.redirect,
    });
    if (step.throws) throw step.throws;
    const body = step.text ?? JSON.stringify(step.json ?? {});
    return new Response(body, { status: step.status ?? 200, headers: { "content-type": "application/json" } });
  }) as OAuthFetch;

  return { fetchFn, requests, callCount: () => calls };
}

/** A clock the test moves by hand. */
export function createTestClock(startIso = "2026-08-25T12:00:00.000Z"): OAuthClock & { advance(ms: number): void; setIso(iso: string): void } {
  let nowMs = Date.parse(startIso);
  return {
    nowIso: () => new Date(nowMs).toISOString(),
    advance: (ms) => {
      nowMs += ms;
    },
    setIso: (iso) => {
      nowMs = Date.parse(iso);
    },
  };
}

export const TEST_PROVIDER: OAuthProviderDescriptor = {
  providerId: "test-provider",
  label: "Test Provider",
  supportedGrants: ["authorization_code", "device_code"],
  authorizationEndpoint: "https://auth.example.com/authorize",
  tokenEndpoint: "https://auth.example.com/token",
  deviceAuthorizationEndpoint: "https://auth.example.com/device",
  defaultScopes: ["images:generate"],
  usesPkce: true,
  clientAuth: "none",
};

export const TEST_CLIENT: OAuthClient = { clientId: "tovu-client", authMethod: "none" };

/**
 * Asserts that `fn` rejects with an {@link OAuthError} carrying exactly `code`, and returns it so
 * the test can go on to assert the exact message.
 */
export async function assertOAuthRejects(fn: () => Promise<unknown>, code: OAuthErrorCode): Promise<OAuthError> {
  let caught: unknown;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof OAuthError, `expected an OAuthError, got ${String(caught)}`);
  assert.equal(caught.code, code);
  return caught;
}

/** Synchronous counterpart of {@link assertOAuthRejects}. */
export function assertOAuthThrows(fn: () => unknown, code: OAuthErrorCode): OAuthError {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof OAuthError, `expected an OAuthError, got ${String(caught)}`);
  assert.equal(caught.code, code);
  return caught;
}

// ---------------------------------------------------------------------------
// Real loopback servers
//
// Discovery and dynamic registration are about what a REMOTE document makes this
// process do next, so their tests run against a real `node:http` server on
// 127.0.0.1 rather than a scripted `fetch`. A double cannot express a 404 body, a
// chunked over-long stream, or a redirect the way a real server does, and those
// are exactly the shapes that were measured in the wild. `endpoint-safety.ts`
// permits `http` for loopback precisely so this is possible.
// ---------------------------------------------------------------------------

/** One request the fixture saw. `body` is the raw request body, for asserting what was POSTed. */
export interface RecordedServerRequest {
  readonly method: string;
  readonly url: string;
  readonly body: string;
}

export interface LoopbackServer {
  readonly origin: string;
  readonly requests: RecordedServerRequest[];
  close(): Promise<void>;
}

/** Starts a real loopback server on an ephemeral port. Mirrors the `withServer` discipline in
 *  `features/agent-plugins/__tests__/unit/fetch-archive.unit.test.ts`, as a start/close pair so a
 *  caller can hold several fixtures open at once. */
export async function startLoopbackServer(
  handler: (req: IncomingMessage, res: ServerResponse, recorded: RecordedServerRequest) => void,
): Promise<LoopbackServer> {
  const requests: RecordedServerRequest[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const recorded: RecordedServerRequest = {
        method: req.method ?? "GET",
        url: req.url ?? "/",
        body: Buffer.concat(chunks).toString("utf8"),
      };
      requests.push(recorded);
      handler(req, res, recorded);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("expected the loopback server to report an AddressInfo");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/** Writes a JSON reply. */
export function sendJson(res: ServerResponse, status: number, json: unknown): void {
  const body = JSON.stringify(json);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body);
}

export interface DiscoveryFixtureOptions {
  /** Where the protected resource (the MCP endpoint) lives. */
  readonly resourcePath?: string;
  /** Origins advertised in `authorization_servers` BEFORE this one, which answer nothing usable.
   *  Models the measured case of a second advertised AS that 404s at its well-known path. */
  readonly deadAuthorizationServers?: readonly string[];
  /** Merged over the RFC 8414 metadata document. A `null` value DELETES that member. */
  readonly metadata?: Readonly<Record<string, unknown>>;
  /** What `/oauth2/register` answers. */
  readonly registration?: { readonly status?: number; readonly json?: unknown };
  /** Serve 404 for both protected-resource well-known paths. */
  readonly withoutProtectedResourceMetadata?: boolean;
  /** Scopes the protected resource advertises. */
  readonly resourceScopes?: readonly string[];
}

export interface DiscoveryFixture extends LoopbackServer {
  /** The MCP endpoint URL a connection row would hold. */
  readonly resourceUrl: string;
  /** A `WWW-Authenticate` header value shaped like the one a real MCP server returns on 401. */
  readonly wwwAuthenticate: string;
}

/**
 * A loopback authorization server that publishes RFC 9728 protected-resource metadata, RFC 8414
 * authorization-server metadata, and an RFC 7591 registration endpoint.
 *
 * Deliberately shaped like a real one measured in the wild: the well-known protected-resource path
 * carries the resource's own path suffix, and the metadata advertises `none` among its token
 * endpoint auth methods.
 */
export async function startDiscoveryFixture(options: DiscoveryFixtureOptions = {}): Promise<DiscoveryFixture> {
  const resourcePath = options.resourcePath ?? "/mcp";
  const resourceScopes = options.resourceScopes ?? ["openid", "email", "offline_access"];
  let origin = "";

  const server = await startLoopbackServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0] ?? "/";

    if (path === `/.well-known/oauth-protected-resource${resourcePath}` || path === "/.well-known/oauth-protected-resource") {
      if (options.withoutProtectedResourceMetadata === true) {
        sendJson(res, 404, { detail: "Not Found" });
        return;
      }
      sendJson(res, 200, {
        resource: `${origin}${resourcePath}`,
        authorization_servers: [...(options.deadAuthorizationServers ?? []), origin],
        scopes_supported: [...resourceScopes],
      });
      return;
    }

    if (path === "/.well-known/oauth-authorization-server") {
      const base: Record<string, unknown> = {
        issuer: origin,
        authorization_endpoint: `${origin}/oauth2/authorize`,
        token_endpoint: `${origin}/oauth2/token`,
        registration_endpoint: `${origin}/oauth2/register`,
        grant_types_supported: ["authorization_code", "refresh_token"],
        response_types_supported: ["code"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_basic", "none", "client_secret_post"],
        scopes_supported: [...resourceScopes],
      };
      for (const [key, value] of Object.entries(options.metadata ?? {})) {
        if (value === null) delete base[key];
        else base[key] = value;
      }
      sendJson(res, 200, base);
      return;
    }

    if (path === "/oauth2/register") {
      sendJson(res, options.registration?.status ?? 201, options.registration?.json ?? { client_id: "minted-client-id" });
      return;
    }

    if (path === resourcePath) {
      res.writeHead(401, {
        "content-type": "application/json",
        "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource${resourcePath}", scope="${resourceScopes.join(" ")}"`,
      });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    sendJson(res, 404, { detail: "Not Found" });
  });

  origin = server.origin;
  return {
    ...server,
    resourceUrl: `${server.origin}${resourcePath}`,
    wwwAuthenticate: `Bearer resource_metadata="${server.origin}/.well-known/oauth-protected-resource${resourcePath}", scope="${resourceScopes.join(" ")}"`,
  };
}
