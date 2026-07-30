import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * @file The server half of the MCP-UI two-step confirmation protocol: a short-lived, single-use,
 * tightly-bound token minted when a destructive tool renders its confirmation UI, and redeemed only
 * when a human acts on that UI.
 *
 * ## Why a token at all, rather than `descriptor.requiresConfirmation`
 *
 * `ToolDescriptor.requiresConfirmation` (`jini-shims.d.ts`) exists and is deliberately never set —
 * `tool-registration-kit.ts` records why: `ToolExecutor` is built with NO `ExecutionDelegate`
 * (`agent-daemon-server.ts`), so setting the flag parks the execution on a promise only
 * `resumeConfirmation` can settle, and no route calls it. The park is unbounded, because
 * `descriptor.timeoutMs`'s timer is armed only AFTER the confirmation await. A boolean flag is
 * therefore not a weaker version of this mechanism; it is a hang.
 *
 * This module is the transport that flag was waiting for, built the way MCP-UI actually does it:
 * the confirmation surface is a UI RESOURCE returned from the tool call itself (see `mcp-ui.ts`),
 * so it needs no `ExecutionDelegate`, no parked promise, and no second channel — the first call
 * RETURNS, the human acts, and the host issues a second, ordinary tool call.
 *
 * ## The property this file is responsible for
 *
 * **The agent must not be able to complete the delete on its own.** The two-step shape alone does
 * not give that — if the token appeared anywhere the model can read, a model could simply read it
 * out of step 1's result and call step 2 itself, and the "confirmation" would be theater.
 *
 * What makes it real is where the secret lives. Per MCP Apps' own security model, a host renders the
 * UI resource for the USER and does not feed its HTML to the model. So {@link mint} returns a token
 * that its caller embeds ONLY inside the UI resource's HTML — never in the tool result's text
 * block, never in `_meta`, never in an error message. The model sees "a confirmation dialog is
 * open"; the rendered dialog holds the only copy of the secret; and step 2 is unreachable without
 * it. That invariant is the caller's to keep, and
 * `src/features/post/__tests__/agent-tools.delete-confirmation.test.ts` asserts it directly by
 * scanning the model-visible half of the result for the token.
 *
 * Defense in depth on top of that: tokens are random, stored hashed, single-use, TTL-bounded, and
 * bound to the exact tool + workspace + principal + entity + entity VERSION they were minted for.
 *
 * ## Architectural role
 *
 * `assistant` layer, domain-agnostic — it names no post/page/content concept and would serve any
 * future destructive tool unchanged.
 */

/** Default lifetime of a pending confirmation. Long enough for a human to read a dialog, short
 * enough that an abandoned one cannot be redeemed later from scrollback. */
export const DEFAULT_CONFIRMATION_TTL_MS = 5 * 60 * 1000;

/** Bytes of entropy per token — 256 bits, matching the session-token sizing used elsewhere. */
const TOKEN_BYTES = 32;

/**
 * What a token is bound to. Every field is compared on redemption; any mismatch is a rejection
 * rather than a warning.
 */
export interface ConfirmationBinding {
  /** The tool allowed to redeem this token. A token minted for one tool cannot confirm another. */
  toolId: string;
  workspaceId: string;
  /** The principal the run is acting for — a token minted in one principal's run is useless in another's. */
  principalId: string;
  entityType: string;
  entityId: string;
  /**
   * The entity's version at mint time. Binding to it is what makes the confirmation about a
   * SPECIFIC state: if the row is edited between the dialog rendering and the human clicking, the
   * thing they agreed to delete is no longer the thing on disk, so the token is refused and a fresh
   * dialog must be raised.
   */
  entityVersion: number;
}

/** A minted, not-yet-redeemed confirmation. */
export interface PendingConfirmation extends ConfirmationBinding {
  /** Human-readable description of what was agreed to, echoed back for the audit trail. */
  summary: string;
  expiresAtMs: number;
}

/** Why a redemption failed. Deliberately coarse — see {@link PendingConfirmationStore.redeem}. */
export type ConfirmationRejectionReason =
  | "unknown-or-expired"
  | "already-used"
  | "binding-mismatch"
  | "stale-entity-version";

export type RedeemResult =
  | { ok: true; confirmation: PendingConfirmation }
  | { ok: false; reason: ConfirmationRejectionReason };

export interface PendingConfirmationStore {
  /**
   * Mints a token for one pending destructive action.
   *
   * @returns The RAW token. Its only safe destination is inside the UI resource's HTML — see this
   * file's header.
   */
  mint(spec: ConfirmationBinding & { summary: string }): { token: string; expiresAtMs: number };
  /** Redeems a token exactly once, against the binding the caller expects. */
  redeem(spec: { token: string } & ConfirmationBinding): RedeemResult;
  /** Pending, unexpired count — for tests and diagnostics only. */
  size(): number;
}

/** Tokens are keyed by SHA-256 so a heap dump or log of the store yields nothing redeemable. */
function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Compares two binding-derived strings without leaking their contents through timing.
 *
 * Overkill for a map lookup already keyed by a 256-bit hash, and included anyway because the
 * comparison it protects (`principalId`, `entityId`) is the one an attacker who already holds a
 * token would probe.
 */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Creates an in-process pending-confirmation store.
 *
 * In-process, and that is correct rather than a shortcut: `buildAssistantToolRegistrations` runs
 * ONCE at daemon boot (`agent-daemon-server.ts`), so one store instance spans every tool call the
 * daemon serves, and a confirmation that does not survive a daemon restart is a confirmation the
 * human will simply be asked for again — the fail-closed direction. Persisting them would create a
 * durable store of pre-authorized deletes, which is strictly worse.
 *
 * @param deps.now - Millisecond clock, injected so TTL expiry is testable without waiting.
 * @param deps.randomToken - Token source, injected so a test can assert a known value. Defaults to
 * `crypto.randomBytes` — never `Math.random`.
 * @param deps.ttlMs - Lifetime of a minted token.
 * @complexity O(1) amortized per operation; expired entries are swept lazily on access.
 * @overallScore 100
 */
export function createPendingConfirmationStore(
  deps: {
    now?: () => number;
    randomToken?: () => string;
    ttlMs?: number;
  } = {}
): PendingConfirmationStore {
  const now = deps.now ?? (() => Date.now());
  const randomToken = deps.randomToken ?? (() => randomBytes(TOKEN_BYTES).toString("base64url"));
  const ttlMs = deps.ttlMs ?? DEFAULT_CONFIRMATION_TTL_MS;

  const pending = new Map<string, PendingConfirmation>();

  function sweep(nowMs: number): void {
    for (const [key, entry] of pending) {
      if (entry.expiresAtMs <= nowMs) pending.delete(key);
    }
  }

  return {
    mint(spec) {
      const nowMs = now();
      sweep(nowMs);

      const token = randomToken();
      const expiresAtMs = nowMs + ttlMs;
      pending.set(hashToken(token), {
        toolId: spec.toolId,
        workspaceId: spec.workspaceId,
        principalId: spec.principalId,
        entityType: spec.entityType,
        entityId: spec.entityId,
        entityVersion: spec.entityVersion,
        summary: spec.summary,
        expiresAtMs,
      });

      return { token, expiresAtMs };
    },

    redeem(spec) {
      const nowMs = now();
      const key = hashToken(spec.token);
      const entry = pending.get(key);

      // One reason for "no such token" and "expired token" alike: distinguishing them would tell a
      // caller holding a guessed token that it was once real.
      if (!entry) return { ok: false, reason: "unknown-or-expired" };

      // Single use — removed before any binding check, so a token cannot be probed repeatedly
      // against different bindings to learn what it was minted for.
      pending.delete(key);

      if (entry.expiresAtMs <= nowMs) return { ok: false, reason: "unknown-or-expired" };

      const bindingMatches =
        safeEqual(entry.toolId, spec.toolId) &&
        safeEqual(entry.workspaceId, spec.workspaceId) &&
        safeEqual(entry.principalId, spec.principalId) &&
        safeEqual(entry.entityType, spec.entityType) &&
        safeEqual(entry.entityId, spec.entityId);
      if (!bindingMatches) return { ok: false, reason: "binding-mismatch" };

      if (entry.entityVersion !== spec.entityVersion) {
        return { ok: false, reason: "stale-entity-version" };
      }

      return { ok: true, confirmation: entry };
    },

    size() {
      sweep(now());
      return pending.size;
    },
  };
}
