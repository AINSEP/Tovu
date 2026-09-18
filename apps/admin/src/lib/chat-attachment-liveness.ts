import type { ChatAttachment } from "@jini-ai/chat/core";

/**
 * @file The host half of `@jini-ai/chat`'s `ChatPaneProps.validateAttachments` — "of the attachment
 * references this composer draft was holding when the page went away, which ones does the server
 * still have?"
 *
 * ## Why the package cannot answer this itself
 *
 * `composer-draft-cache.ts` persists a draft's attachment references to `localStorage` alongside
 * its text, but a reference is only a capability id (`attachment:<uuid>`) — the bytes live in the
 * agent daemon's staging directory, under a TTL (`retentionMs`, one hour by default, which Tovu
 * does not override). So a draft restored the next morning would show chips for files that have
 * been pruned: intact-looking, and dead at send. `@jini-ai/chat` has no liveness port of its own
 * (`ChatPaneProps` carries upload and delete only), so it restores references ONLY through this
 * host-supplied validator, and restores none at all when a host does not supply one.
 *
 * ## The rule
 *
 * **A reference survives only when this server confirmed, in this session, that it is still
 * readable.** 404, 401, a network fault, a timeout, a malformed ref, an overflow past the probe cap
 * — every one of them drops the reference. The failure direction is one-way on purpose: dropping a
 * live attachment costs one re-drag, restoring a dead one costs a failed turn. Text and attachments
 * are stored under separate keys in the package, so nothing here can cost the operator their words.
 *
 * ## Why HEAD
 *
 * `GET /api/attachments/:ref` (`registerAdminChatAttachmentReadRoute`) serves the whole file, and
 * the composer's own quota allows 10 files up to 50 MB a turn — validating by downloading them
 * would move that much over the wire to answer a yes/no question. Express routes a HEAD to the same
 * GET handler when no HEAD handler is registered, and Node suppresses the body for a HEAD response,
 * so the status line answers the question and the bytes stay on the server. Asserted end to end
 * against the real composed route in
 * `apps/website/src/server/__tests__/routes/get-chat-attachment-route.test.ts`.
 */

/** The ref shape the read-back route accepts, mirroring its own `CHAT_ATTACHMENT_REF_PATTERN`
 *  (`features/media/read-chat-attachment.ts`). Anything else is not a staged upload this server
 *  could vouch for — an older draft's raw path, say — so it is dropped without a request. */
const CHAT_ATTACHMENT_REF_PATTERN = /^attachment:[A-Za-z0-9-]+$/u;

/**
 * Hard ceiling on probes for one restore. The composer's own per-turn cap is 10
 * (`createDaemonAttachmentUploader`'s `maxAttachmentCount`), so this is double the reachable
 * worst case — a draft record claiming more than this is malformed or hand-edited, and the excess
 * is dropped rather than turned into unbounded request fan-out at mount.
 */
export const MAX_PROBED_ATTACHMENTS = 20;

/** In-flight probes. Matches `createDaemonAttachmentUploader`'s own upload concurrency — enough to
 *  hide localhost latency, few enough to leave the page's connection budget alone. */
const DEFAULT_CONCURRENCY = 2;

/** Abort deadline per probe. A restore runs at mount behind the composer, so a wedged request must
 *  not keep a worker (and the operator's attachment chips) pending indefinitely. */
const DEFAULT_TIMEOUT_MS = 10_000;

export interface ChatAttachmentValidatorOptions {
  /** Injected `fetch` for tests; defaults to the page's own. */
  readonly fetchImpl?: typeof fetch;
  /** In-flight probe cap. Defaults to {@link DEFAULT_CONCURRENCY}. */
  readonly concurrency?: number;
  /** Per-probe abort deadline in ms. Defaults to {@link DEFAULT_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
}

/**
 * Whether the server still serves this one reference.
 *
 * @param ref opaque `attachment:<uuid>` capability id (`ChatAttachment.path`).
 * @returns `true` only on a 2xx. Every refusal and every fault answers `false` — the caller cannot
 *   act differently on them, and a probe that could not reach the server has not confirmed anything.
 * @complexity O(1); one request, abandoned after `timeoutMs`.
 */
async function isAttachmentStillServed(ref: string, options: Required<Omit<ChatAttachmentValidatorOptions, "concurrency">>): Promise<boolean> {
  try {
    const response = await options.fetchImpl(`/api/attachments/${encodeURIComponent(ref)}`, {
      method: "HEAD",
      credentials: "same-origin",
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    return response.ok;
  } catch {
    // A network fault, an abort, or a same-origin policy refusal. Indistinguishable from here, and
    // all mean the same thing: nothing was confirmed, so the reference does not come back.
    return false;
  }
}

/**
 * Runs `probe` over `refs` with at most `concurrency` in flight, answering positionally.
 *
 * Shared-index workers rather than a chunked `Promise.all` loop, for the same reason
 * `createDaemonAttachmentUploader` uses them: a chunked loop stalls the whole batch on its slowest
 * member, and this one runs while the operator is looking at a half-restored composer.
 *
 * @complexity O(n) requests, at most `concurrency` concurrent; O(n) space for the verdicts.
 */
async function probeAll(refs: readonly string[], concurrency: number, probe: (ref: string) => Promise<boolean>): Promise<boolean[]> {
  const verdicts = new Array<boolean>(refs.length).fill(false);
  let next = 0;
  async function worker(): Promise<void> {
    for (let index = next; index < refs.length; index = next) {
      next += 1;
      verdicts[index] = await probe(refs[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, refs.length)) }, worker));
  return verdicts;
}

/**
 * Builds the `validateAttachments` callback `<ChatPane>` calls when it restores a persisted draft.
 *
 * @param options.fetchImpl injected `fetch`; defaults to the page's own.
 * @param options.concurrency in-flight probe cap; defaults to {@link DEFAULT_CONCURRENCY}.
 * @param options.timeoutMs per-probe abort deadline; defaults to {@link DEFAULT_TIMEOUT_MS}.
 * @returns a validator taking the cached references and resolving to the subset still served, in
 *   the order they were given. Never rejects: a caller's only sane response to a rejection is to
 *   restore nothing, which is what an empty subset already means.
 * @complexity O(n) requests bounded by {@link MAX_PROBED_ATTACHMENTS}, at most `concurrency` at once.
 * @example
 * <ChatPane validateAttachments={createChatAttachmentValidator()} />
 */
export function createChatAttachmentValidator(
  options: ChatAttachmentValidatorOptions = {},
): (attachments: readonly ChatAttachment[]) => Promise<readonly ChatAttachment[]> {
  const probeOptions = {
    fetchImpl: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  return async (attachments) => {
    const candidates = attachments
      .slice(0, MAX_PROBED_ATTACHMENTS)
      .filter((candidate) => CHAT_ATTACHMENT_REF_PATTERN.test(candidate.path));
    if (candidates.length === 0) return [];

    const verdicts = await probeAll(
      candidates.map((candidate) => candidate.path),
      concurrency,
      (ref) => isAttachmentStillServed(ref, probeOptions),
    );
    return candidates.filter((_, index) => verdicts[index]);
  };
}
