import assert from "node:assert/strict";

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
