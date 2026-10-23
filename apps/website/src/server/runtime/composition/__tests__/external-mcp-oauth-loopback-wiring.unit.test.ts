/**
 * Execute each root's actual OAuth ports call without booting its database/listeners, then run
 * the real authorization-code flow. Like c266749d0's API-connection pin, only desktop may use
 * a plaintext loopback callback; public plaintext callbacks remain forbidden in every runtime.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createSystemClock, type HttpClientPort } from "@jini-ai/core/primitives";
import { beginAuthorizationCode, createPendingAuthorizationStore, type OAuthHttpPorts } from "@jini-ai/oauth";
import { createTovuOAuthHttpPorts } from "#src/platform/oauth/endpoint-safety";
import { resolveApiConnectionRuntime } from "../agent-plugin-connections.js";

const LOOPBACK_REDIRECT = "http://127.0.0.1:4319/api/mcp-servers/oauth/callback/probe";
const HTTPS_REDIRECT = "https://site.example.com/api/mcp-servers/oauth/callback/probe";
const randomBytesFn = ({ byteLength }: { byteLength: number }) => randomBytes(byteLength);

/**
 * Select the one real ports call by AST, excluding comments, and supply only its boot dependencies.
 * Reads one source file; no network, database, process launch, or mutation of the real environment.
 * @throws AssertionError if the root no longer has exactly one OAuth ports call.
 * @complexity O(n) time/space in the source length, bounded to the three composition roots below.
 */
function wiredOAuthPorts(
  { file, env }: { file: string; env: Readonly<Record<string, string | undefined>> },
  _options: Record<string, never> = {},
): OAuthHttpPorts {
  const source = ts.createSourceFile(file, readFileSync(new URL(file, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const calls: ts.CallExpression[] = [];
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "createTovuOAuthHttpPorts") calls.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(calls.length, 1, `${file} must have one OAuth ports call`);
  const http: HttpClientPort = { send: async () => { throw new Error("authorization start must not send HTTP"); } };
  return runInNewContext(`(${calls[0]!.getText(source)})`, {
    createTovuOAuthHttpPorts, resolveApiConnectionRuntime, process: { env },
    guardedOutboundHttpClient: http, routeDeps: { mediaGenerationHttpClient: http },
  }) as OAuthHttpPorts;
}

/** Begin a real PKCE handshake with the root's guard and a fresh, timer-free pending store. */
function beginRedirect(
  { ports, redirectUri }: { ports: OAuthHttpPorts; redirectUri: string },
  _options: Record<string, never> = {},
): ReturnType<typeof beginAuthorizationCode> {
  return beginAuthorizationCode({
    provider: { providerId: "probe", label: "Probe", supportedGrants: ["authorization_code"],
      authorizationEndpoint: "https://auth.example.com/authorize", tokenEndpoint: "https://auth.example.com/token",
      defaultScopes: [], usesPkce: true, clientAuth: "none" },
    guard: ports.guard, randomBytesFn,
    pending: createPendingAuthorizationStore({ clock: createSystemClock(), randomBytesFn }),
    options: { clientDisplayName: "Tovu", softwareId: "tovu", redirectUris: [redirectUri] },
    ownerKey: "workspace:probe", client: { clientId: "tovu-client", authMethod: "none" }, redirectUri,
  });
}

for (const file of ["../app.ts", "../deps.ts", "../../../inbound/assistant/agent-daemon-server.ts"]) {
  test(`${file}: desktop accepts a loopback OAuth callback; hosted requires HTTPS`, async () => {
    for (const electronRunAsNode of ["1", undefined, "true"]) {
      const ports = wiredOAuthPorts({ file, env: { ELECTRON_RUN_AS_NODE: electronRunAsNode } });
      const secure = await beginRedirect({ ports, redirectUri: HTTPS_REDIRECT });
      assert.equal(new URL(secure.authorizationUrl).searchParams.get("redirect_uri"), HTTPS_REDIRECT);
      if (electronRunAsNode === "1") {
        const desktop = await beginRedirect({ ports, redirectUri: LOOPBACK_REDIRECT });
        assert.equal(new URL(desktop.authorizationUrl).searchParams.get("redirect_uri"), LOOPBACK_REDIRECT);
        assert.equal(new URL(desktop.authorizationUrl).searchParams.get("code_challenge_method"), "S256");
      } else {
        await assert.rejects(beginRedirect({ ports, redirectUri: LOOPBACK_REDIRECT }),
          { code: "OAUTH_UNSAFE_ENDPOINT", message: /redirect URI:.*must use https/ });
      }
      await assert.rejects(beginRedirect({ ports, redirectUri: HTTPS_REDIRECT.replace("https:", "http:") }),
        { code: "OAUTH_UNSAFE_ENDPOINT", message: /redirect URI:.*must use https/ });
    }
  });
}
