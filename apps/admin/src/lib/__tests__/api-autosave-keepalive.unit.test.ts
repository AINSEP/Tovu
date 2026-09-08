import { afterEach, describe, expect, it, vi } from "vitest";

import { api, bodyFitsKeepalive, KEEPALIVE_MAX_BODY_BYTES } from "../api";

/**
 * @file REGRESSION (2026-09-07 audit claim #3) for the unload-safe transport on the standing-draft
 * autosave write.
 *
 * `use-standing-draft-autosave.hooks.ts`'s own suite proves the HOOK asks for `keepalive` on an exit
 * and not otherwise. This file proves the other half — that the request actually goes out with
 * `keepalive` set — because a port that forwards the flag to a client that drops it is exactly the
 * "correct primitive, unwired call site" shape this fix exists to close.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Captures every `fetch` call's `RequestInit` so a test can assert the real request shape. */
function stubFetchCapturing(): Array<{ url: string; init?: RequestInit }> {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ applied: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    })
  );
  return calls;
}

const DRAFT = {
  bodyFormat: "html",
  bodyHtml: "<p>small</p>",
  title: "T",
  slug: "t",
  baseVersion: 1,
} as const;

describe("api.putAutosave keepalive", () => {
  it("sets keepalive on the fetch when the caller asks for it", async () => {
    const calls = stubFetchCapturing();
    await api.putAutosave("p1", { ...DRAFT }, { keepalive: true });
    expect(calls[0]?.init?.keepalive).toBe(true);
  });

  it("omits keepalive entirely on an ordinary write", async () => {
    const calls = stubFetchCapturing();
    await api.putAutosave("p1", { ...DRAFT });
    expect(calls[0]?.init?.keepalive).toBeUndefined();
  });

  it("drops keepalive for a body over the ceiling — a rejected request beats no request", async () => {
    const calls = stubFetchCapturing();
    // Over 64 KiB once serialized, so `fetch` would reject outright rather than send it.
    await api.putAutosave("p1", { ...DRAFT, bodyHtml: "x".repeat(KEEPALIVE_MAX_BODY_BYTES + 1) }, { keepalive: true });
    expect(calls[0]?.init?.keepalive).toBeUndefined();
    // The write is still attempted, just over the ordinary transport.
    expect(calls[0]?.init?.method).toBe("PUT");
  });
});

describe("bodyFitsKeepalive", () => {
  it("measures bytes, not characters — an astral-plane body is up to four bytes each", () => {
    // 20_000 characters, but 80_000 bytes: a `.length` check would wave this through.
    const astral = "\u{1F600}".repeat(20_000);
    expect(astral.length).toBeLessThan(KEEPALIVE_MAX_BODY_BYTES);
    expect(bodyFitsKeepalive(astral)).toBe(false);
  });

  it("accepts a body exactly at the ceiling and refuses the next byte", () => {
    expect(bodyFitsKeepalive("a".repeat(KEEPALIVE_MAX_BODY_BYTES))).toBe(true);
    expect(bodyFitsKeepalive("a".repeat(KEEPALIVE_MAX_BODY_BYTES + 1))).toBe(false);
  });
});
