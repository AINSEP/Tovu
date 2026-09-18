import { describe, expect, it, vi, type Mock } from "vitest";

import type { ChatAttachment } from "@jini-ai/chat/core";

import {
  MAX_PROBED_ATTACHMENTS,
  createChatAttachmentValidator,
} from "../chat-attachment-liveness";

/**
 * @file `createChatAttachmentValidator` — the host half of `ChatPaneProps.validateAttachments`.
 *
 * The property every case here defends: **a reference is restored only when this server said, in
 * this session, that it is still readable.** Every other outcome — 404, 401, a network fault, a
 * timeout, a malformed ref, an overflow past the probe cap — drops the reference. A restored chip
 * that fails at send is worse than no chip at all (the composer looks intact and the turn dies),
 * so the failure direction is deliberately one-way.
 */

const LIVE_REF = "attachment:11111111-2222-3333-4444-555555555555";
const DEAD_REF = "attachment:99999999-9999-9999-9999-999999999999";

function attachment(path: string, name = "hero.png"): ChatAttachment {
  return { path, name, kind: "image", size: 16 };
}

/** Typed so a stub is assignable to `fetch` itself — the validator takes `typeof fetch`, not a
 *  narrowed convenience signature, so a mismatch here would be hidden by the seam rather than caught. */
type FetchMock = Mock<(input: URL | RequestInfo, init?: RequestInit) => Promise<Response>>;

/** A `fetch` fake answering per-ref, so a case says which attachment the server still has. */
function fetchStub(statusByRef: Readonly<Record<string, number>>): FetchMock {
  return vi.fn(async (input: URL | RequestInfo) => {
    const url = String(input);
    const ref = decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));
    const status = statusByRef[ref] ?? 404;
    return { ok: status >= 200 && status < 300, status } as Response;
  });
}

describe("createChatAttachmentValidator", () => {
  it("keeps only the references the server still serves, in their original order", async () => {
    const fetchImpl = fetchStub({ [LIVE_REF]: 200 });
    const validate = createChatAttachmentValidator({ fetchImpl });

    const survivors = await validate([attachment(DEAD_REF, "gone.png"), attachment(LIVE_REF)]);

    expect(survivors).toEqual([attachment(LIVE_REF)]);
  });

  it("preserves input order across a bounded-concurrency sweep", async () => {
    const refs = Array.from({ length: 6 }, (_, index) => `attachment:0000000${index}-aaaa-bbbb-cccc-dddddddddddd`);
    const fetchImpl = fetchStub(Object.fromEntries(refs.map((ref) => [ref, 200])));
    const validate = createChatAttachmentValidator({ fetchImpl });

    const survivors = await validate(refs.map((ref) => attachment(ref)));

    expect(survivors.map((survivor) => survivor.path)).toEqual(refs);
  });

  it("probes with a body-less HEAD to the read-back route, same-origin, with the ref encoded", async () => {
    const fetchImpl = fetchStub({ [LIVE_REF]: 200 });
    const validate = createChatAttachmentValidator({ fetchImpl });

    await validate([attachment(LIVE_REF)]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    // `encodeURIComponent` escapes the ref's `:` — Express decodes `:ref` before the route sees it.
    expect(url).toBe(`/api/attachments/${encodeURIComponent(LIVE_REF)}`);
    expect(init.method).toBe("HEAD");
    expect(init.credentials).toBe("same-origin");
    expect(init.signal).toBeDefined();
  });

  it("drops a reference whose probe rejects, rather than restoring one it could not confirm", async () => {
    const fetchImpl: FetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    const survivors = await createChatAttachmentValidator({ fetchImpl })([attachment(LIVE_REF)]);

    expect(survivors).toEqual([]);
  });

  it("drops a reference the session is no longer authorized for (401), like any other refusal", async () => {
    const fetchImpl = fetchStub({ [LIVE_REF]: 401 });

    expect(await createChatAttachmentValidator({ fetchImpl })([attachment(LIVE_REF)])).toEqual([]);
  });

  it("drops a malformed ref without spending a request on it", async () => {
    const fetchImpl = fetchStub({});

    const survivors = await createChatAttachmentValidator({ fetchImpl })([
      attachment("../../etc/passwd"),
      attachment("attachment:"),
      attachment("/var/folders/staged/hero.png"),
    ]);

    expect(survivors).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("drops everything past the probe cap instead of issuing an unbounded number of requests", async () => {
    const refs = Array.from(
      { length: MAX_PROBED_ATTACHMENTS + 3 },
      (_, index) => `attachment:${String(index).padStart(8, "0")}-aaaa-bbbb-cccc-dddddddddddd`,
    );
    const fetchImpl = fetchStub(Object.fromEntries(refs.map((ref) => [ref, 200])));

    const survivors = await createChatAttachmentValidator({ fetchImpl })(refs.map((ref) => attachment(ref)));

    expect(survivors).toHaveLength(MAX_PROBED_ATTACHMENTS);
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_PROBED_ATTACHMENTS);
  });

  it("holds in-flight probes to the configured concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const release: Array<() => void> = [];
    const fetchImpl: FetchMock = vi.fn(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise<void>((resolve) => release.push(resolve));
      inFlight -= 1;
      return { ok: true, status: 200 } as Response;
    });
    const refs = Array.from({ length: 5 }, (_, index) => `attachment:${String(index).padStart(8, "0")}-aaaa-bbbb-cccc-dddddddddddd`);

    const pending = createChatAttachmentValidator({ fetchImpl, concurrency: 2 })(refs.map((ref) => attachment(ref)));
    // Drains the queue one released probe at a time; each release lets exactly one worker advance.
    for (let drained = 0; drained < refs.length; drained += 1) {
      await vi.waitFor(() => expect(release.length).toBeGreaterThan(drained));
      release[drained]();
    }

    expect(await pending).toHaveLength(refs.length);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("returns an empty list for an empty draft without touching the network", async () => {
    const fetchImpl = fetchStub({});

    expect(await createChatAttachmentValidator({ fetchImpl })([])).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
