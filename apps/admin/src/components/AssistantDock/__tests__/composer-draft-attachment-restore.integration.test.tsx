import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ChatPane } from "@jini-ai/chat/react";
import type { ChatAttachment, ChatTransport } from "@jini-ai/chat/core";

import { createChatAttachmentValidator } from "@/lib/chat-attachment-liveness";

/**
 * @file The end-to-end proof that this host's `validateAttachments` wiring actually restores a
 * composer draft's attachments — against the REAL `@jini-ai/chat` `ChatPane`, not a recorder.
 *
 * `AssistantDock.unit.test.tsx` proves the prop reaches `ChatPane`; nothing there proves the value
 * behind it does the job, because that file replaces `ChatPane` with a spy. Here the only fake is
 * `fetch` (jsdom has no server) and the transport (nothing is sent). Everything between a persisted
 * `localStorage` record and a rendered chip is production code from both packages.
 *
 * The case that matters is the UNHAPPY one: a draft whose attachment is genuinely gone. A restore
 * that only ever ran against live files would look identical to one with no validation at all.
 *
 * The two `localStorage` envelopes are written by hand because `@jini-ai/chat` does not export its
 * cache writers. That is a real coupling to another package's storage format, and it fails in the
 * safe direction: a format change breaks these assertions loudly rather than silently restoring
 * nothing in production.
 */

const LIVE_REF = "attachment:11111111-2222-3333-4444-555555555555";
const DEAD_REF = "attachment:99999999-9999-9999-9999-999999999999";
const DRAFT_TEXT = "the paragraph the operator does not want to retype";

const live: ChatAttachment = { path: LIVE_REF, name: "keeps.png", kind: "image", size: 16 };
const pruned: ChatAttachment = { path: DEAD_REF, name: "pruned.png", kind: "image", size: 16 };

/** What a page reload leaves behind: the two records `composer-draft-cache.ts` persists, under the
 *  separate keys that let text and attachments degrade independently. */
function seedPersistedDraft(conversationId: string, attachments: readonly ChatAttachment[]): void {
  const now = Date.now();
  localStorage.setItem(`jini.chat.composer-draft.v1.${conversationId}`, JSON.stringify({ v: 1, t: now, d: DRAFT_TEXT }));
  localStorage.setItem(
    `jini.chat.composer-attachments.v1.${conversationId}`,
    JSON.stringify({ v: 1, t: now, a: attachments })
  );
}

type FetchMock = Mock<(input: URL | RequestInfo, init?: RequestInit) => Promise<Response>>;

/** Answers 200 for `LIVE_REF` and 404 for anything else — the daemon's one-hour `retentionMs`
 *  having pruned the rest. */
function serverHolding(refs: readonly string[]): FetchMock {
  return vi.fn(async (input: URL | RequestInfo) => {
    const url = String(input);
    const ref = decodeURIComponent(url.slice(url.lastIndexOf("/") + 1));
    const status = refs.includes(ref) ? 200 : 404;
    return { ok: status === 200, status } as Response;
  });
}

const silentTransport: ChatTransport = {
  async startRun() {
    throw new Error("nothing in this file sends");
  },
  async reattachRun() {},
  async fetchRunStatus() {
    return null;
  },
  async stopRun() {},
};

function renderRestoredPane(conversationId: string, fetchImpl?: FetchMock) {
  return render(
    <ChatPane
      transport={silentTransport}
      // Required, not decoration: with an empty inventory `ChatPane` treats itself as unavailable
      // and disables the composer entirely.
      agents={[{ id: "claude", name: "Claude", available: true }]}
      conversationId={conversationId}
      {...(fetchImpl ? { validateAttachments: createChatAttachmentValidator({ fetchImpl }) } : {})}
    />
  );
}

function chipNames(): string[] {
  return screen.queryAllByTestId("attachment-chip").map((chip) => chip.textContent ?? "");
}

describe("composer draft restore: attachments, validated against the server", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("brings back the reference the server still holds and drops the one it has pruned", async () => {
    // A distinct id per case: `composer-draft-cache` keeps a module-level memory tier that outlives
    // one test, so a shared id would let an earlier case's restore stand in for this one's.
    const conversationId = "convo-mixed";
    seedPersistedDraft(conversationId, [pruned, live]);

    renderRestoredPane(conversationId, serverHolding([LIVE_REF]));

    await waitFor(() => expect(chipNames()).toHaveLength(1));
    expect(chipNames()[0]).toContain("keeps.png");
    expect(chipNames()[0]).not.toContain("pruned.png");
    expect(screen.getByRole("textbox")).toHaveValue(DRAFT_TEXT);
  });

  it("still brings back the text when every attachment is gone", async () => {
    const conversationId = "convo-all-dead";
    seedPersistedDraft(conversationId, [pruned]);
    const fetchImpl = serverHolding([]);

    renderRestoredPane(conversationId, fetchImpl);

    // Waits for the probe itself, so "no chips" is asserted AFTER validation settled rather than
    // before it started — the difference between a real assertion and a race that always passes.
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(DRAFT_TEXT));
    expect(chipNames()).toEqual([]);
  });

  it("restores text only when no validator is wired, rather than references nothing vouched for", async () => {
    const conversationId = "convo-no-validator";
    seedPersistedDraft(conversationId, [live]);

    renderRestoredPane(conversationId);

    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue(DRAFT_TEXT));
    expect(chipNames()).toEqual([]);
  });
});
