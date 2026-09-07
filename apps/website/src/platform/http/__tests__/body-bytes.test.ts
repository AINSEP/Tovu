import assert from "node:assert/strict";
import test from "node:test";

import { createHttpClient } from "../client.js";
import type { EgressPolicy, HttpRequest, HttpResponse, HttpTransportAdapter, PinnedPeer } from "../ports.js";

/**
 * @file `HttpResponse.bodyBytes`/`bodyTruncated` — the byte-capable half of the guarded client,
 * added 2026-09-06 so `features/media-import` can fetch an image WITHOUT reaching past the ADR-038
 * SSRF guard to a raw `fetch`.
 *
 * The whole justification for the field is a contrast, so this file asserts the contrast directly
 * rather than only the happy half: for one and the same response body — a byte sequence that is
 * deliberately INVALID UTF-8 — `bodyBytes` comes back identical to what the transport produced,
 * while `bodyText` comes back mangled into U+FFFD replacement characters and is not recoverable.
 * A test that only checked "bodyBytes is defined" would pass just as happily against an
 * implementation that derived it from `bodyText`, which is precisely the bug worth preventing.
 *
 * An IP-literal target is used throughout (`8.8.8.8`, classified `public`) so no test here depends
 * on DNS: `client.ts`'s `resolveHostAddresses` short-circuits a literal address without a lookup.
 */

/** PNG magic bytes followed by `0xFF 0xFE 0x00` — `0xFF` and `0xFE` are not legal UTF-8 lead bytes
 *  in any position, so a `toString("utf8")` round trip cannot reproduce this sequence. */
const INVALID_UTF8_BODY = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe, 0x00]);

function makePolicy(overrides: Partial<EgressPolicy> = {}): EgressPolicy {
  return {
    allowedSchemes: ["https"],
    denyPrivateAddresses: true,
    devHostAllowlist: [],
    maxRedirects: 3,
    connectTimeoutMs: 5000,
    maxResponseBytes: 1_000_000,
    maxDecompressedBytes: 1_000_000,
    ...overrides,
  };
}

/** Mirrors what `transport.fetch.ts` actually does: ONE `Buffer.concat`, returned in both shapes. */
class BinaryTransport implements HttpTransportAdapter {
  constructor(private readonly bytes: Uint8Array) {}

  async requestPinned(_req: HttpRequest, _peer: PinnedPeer): Promise<HttpResponse> {
    const body = Buffer.from(this.bytes);
    return { status: 200, headers: { "content-type": "image/png" }, bodyText: body.toString("utf8"), bodyBytes: body };
  }
}

/** A transport predating `bodyBytes` — the shape every hand-written double in the repo still has. */
class LegacyTextTransport implements HttpTransportAdapter {
  async requestPinned(_req: HttpRequest, _peer: PinnedPeer): Promise<HttpResponse> {
    return { status: 200, headers: {}, bodyText: "plain text body" };
  }
}

function request(): HttpRequest {
  return { method: "GET", url: "https://8.8.8.8/image.png", headers: {}, timeoutMs: 1000 };
}

test("bodyBytes survives createHttpClient uncorrupted for a body that is invalid UTF-8", async () => {
  const client = createHttpClient({ transport: new BinaryTransport(INVALID_UTF8_BODY), policy: makePolicy() });

  const response = await client.send(request());

  assert.ok(response.bodyBytes, "the production transport always populates bodyBytes; the policy layer must not drop it");
  assert.deepStrictEqual(Array.from(response.bodyBytes), Array.from(INVALID_UTF8_BODY));
});

test("bodyText for that SAME body is lossy — this contrast is the entire reason bodyBytes exists", async () => {
  const client = createHttpClient({ transport: new BinaryTransport(INVALID_UTF8_BODY), policy: makePolicy() });

  const response = await client.send(request());

  const viaText = Array.from(Buffer.from(response.bodyText, "utf8"));
  assert.notDeepStrictEqual(viaText, Array.from(INVALID_UTF8_BODY), "if bodyText were lossless here, the added field would be unnecessary");
  assert.ok(response.bodyText.includes("�"), `expected replacement characters in the lossy decode, got ${JSON.stringify(response.bodyText)}`);
  assert.ok(viaText.length !== INVALID_UTF8_BODY.length || !viaText.every((b, i) => b === INVALID_UTF8_BODY[i]));
});

test("an untruncated response reports bodyTruncated:false — the flag is a real answer, not merely absent", async () => {
  const client = createHttpClient({ transport: new BinaryTransport(INVALID_UTF8_BODY), policy: makePolicy() });

  assert.equal((await client.send(request())).bodyTruncated, false);
});

test("a body over the policy cap is clipped in BOTH shapes and flagged bodyTruncated:true", async () => {
  const big = Uint8Array.from({ length: 64 }, (_, index) => (index % 2 === 0 ? 0xff : 0x41));
  const client = createHttpClient({ transport: new BinaryTransport(big), policy: makePolicy({ maxResponseBytes: 16, maxDecompressedBytes: 16 }) });

  const response = await client.send(request());

  assert.equal(response.bodyTruncated, true, "silent truncation is the failure mode this flag exists to make loud");
  assert.ok(response.bodyBytes);
  assert.equal(response.bodyBytes.byteLength, 16, "the byte half must be clipped to the effective cap");
  assert.deepStrictEqual(Array.from(response.bodyBytes), Array.from(big.subarray(0, 16)));
});

test("the tighter of maxResponseBytes/maxDecompressedBytes wins for the byte half too", async () => {
  const big = Uint8Array.from({ length: 64 }, () => 0xff);
  const client = createHttpClient({ transport: new BinaryTransport(big), policy: makePolicy({ maxResponseBytes: 40, maxDecompressedBytes: 8 }) });

  const response = await client.send(request());

  assert.equal(response.bodyBytes?.byteLength, 8);
  assert.equal(response.bodyTruncated, true);
});

test("a transport that reports its own truncation keeps that flag set even when the body is under the cap", async () => {
  class SelfReportingTransport implements HttpTransportAdapter {
    async requestPinned(): Promise<HttpResponse> {
      return { status: 200, headers: {}, bodyText: "abc", bodyBytes: Uint8Array.from([1, 2, 3]), bodyTruncated: true };
    }
  }
  const client = createHttpClient({ transport: new SelfReportingTransport(), policy: makePolicy() });

  assert.equal((await client.send(request())).bodyTruncated, true, "the cap layer must never downgrade a truncation the producer already reported");
});

test("a legacy transport that returns no bodyBytes still works — the field is additive, and absence is not fabricated into a value", async () => {
  const client = createHttpClient({ transport: new LegacyTextTransport(), policy: makePolicy() });

  const response = await client.send(request());

  assert.equal(response.bodyText, "plain text body", "every pre-existing text consumer is unchanged");
  assert.equal(response.bodyBytes, undefined, "bodyBytes must not be back-filled from bodyText — a consumer needing real bytes has to be able to tell it did not get them");
  assert.equal(response.bodyTruncated, false);
});
