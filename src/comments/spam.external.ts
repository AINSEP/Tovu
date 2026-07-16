/**
 * @file ADR-031 §5 — an Akismet-style external `SpamCheckPort` adapter (ADR-006 rule-of-two
 * "plausible next" half; `spam.heuristic.ts` is the "built now, no network" half — this file is
 * SPEC-035's resolution of that deferral).
 *
 * Shape mirrors Akismet's real, documented REST API (`https://{apiKey}.rest.akismet.com/1.1/
 * comment-check`, form-urlencoded request, plain-text `"true"`/`"false"` response body) closely
 * enough to be a genuinely correct adapter against the real service, not a stand-in — but no real
 * Akismet API key/credential exists in this environment, so it has never made a live call against
 * the actual service. Tests exercise it against a fake, injected `HttpClientPort`, never a real
 * network call.
 *
 * **Egress seam (ADR-031 §5's own instruction: "a network-backed adapter's egress is a
 * core-mediated capability, never a raw `fetch` from plugin code"):** this adapter's constructor
 * takes an `HttpClientPort` (`../http`, ADR-038's single guarded outbound-HTTP seam — the SAME
 * port `integrations/delivery.ts`'s webhook dispatch already uses) and calls `.send()` exclusively
 * — no `fetch`/`http.request` anywhere in this file. `HttpClientPort` exists in this codebase and
 * is NOT a bigger-than-expected undertaking to depend on; what IS out of this slice's scope is
 * actually CONSTRUCTING a live `HttpClientPort` instance (`createHttpClient(transport, policy)`)
 * and wiring this adapter into a real composition root — `server/deps.ts` has no Akismet API
 * key/blog URL to configure it with, and `comments/index.ts#createCommentsModule` still
 * hardcodes `HeuristicSpamCheck` (unchanged by this file). This class is real and correctly
 * structured; its ACTIVATION is a disclosed, deliberate non-goal, the same disclosed-but-unwired
 * status `webhookSigner`/the webhook delivery worker already carry elsewhere in this codebase.
 *
 * **Disclosed data-availability gap:** Akismet's real `comment-check` API strongly wants
 * `user_ip` (and ideally `user_agent`) for accurate classification. This codebase's ingress
 * boundary deliberately never surfaces the raw visitor IP past the HTTP route layer
 * (`comments-submit.ts`'s own file header: "the raw IP itself is never stored" /
 * `ingress.ts`'s: "this file never sees it") — only a salted `authorIpHash` reaches
 * `CommentSubmission.ingressContext`, and a hash is not a valid `user_ip` value to send Akismet
 * (it would be meaningless to the real service, not merely imprecise). This adapter therefore
 * omits `user_ip`/`user_agent` entirely rather than sending a fabricated or nonsensical value —
 * a real, structural limitation of this codebase's privacy boundary, not an implementation
 * shortcut. Akismet's API tolerates missing optional fields (accuracy degrades, the call itself
 * does not fail).
 */
import type { HttpClientPort } from "../http";
import type { SpamCheckPort } from "./ports";
import type { CommentRecord, CommentSubmission, SpamVerdict } from "./types";

export interface AkismetSpamCheckConfig {
  /** The Akismet API key — subdomains the request host (`https://{apiKey}.rest.akismet.com/...`),
   * per Akismet's real API contract. */
  apiKey: string;
  /** The registered site URL Akismet's API requires on every call (its `blog` field). */
  blog: string;
  /** Per-attempt timeout passed straight through to `HttpClientPort.send()`. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

function akismetHost(apiKey: string): string {
  return `https://${apiKey}.rest.akismet.com/1.1`;
}

function formEncode(fields: Readonly<Record<string, string>>): string {
  return Object.entries(fields)
    .filter(([, value]) => value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

function commonFields(config: AkismetSpamCheckConfig, submission: CommentSubmission): Record<string, string> {
  // `user_ip`/`user_agent` deliberately omitted — see file header's disclosed data-availability
  // gap. Every other field Akismet's real API accepts and this codebase actually has is sent.
  return {
    blog: config.blog,
    comment_type: submission.parentId ? "reply" : "comment",
    comment_author: submission.authorName,
    comment_author_email: submission.authorEmail ?? "",
    comment_author_url: submission.authorUrl ?? "",
    comment_content: submission.bodyRaw,
  };
}

/**
 * Akismet-style external `SpamCheckPort` adapter. `check()` fails OPEN (never flags as spam) on
 * any transport error, timeout, or malformed response — a deliberate, disclosed choice: this
 * codebase's own ADR-031 §4 instruction is "spam is stored silently, never rejected at the
 * boundary" specifically to avoid an oracle; the analogous asymmetry here is that a classifier
 * OUTAGE must never silently spam-file legitimate visitor comments. `report()` best-effort
 * feeds a moderator correction back (Akismet's `submit-spam`/`submit-ham`) and swallows failures
 * (mirrors `SpamCheckPort.report`'s own doc: "no-op locally" for the adapter with nothing to
 * correct — this adapter DOES have something to correct, but a failed feedback POST must never
 * surface as a moderation-action failure to the operator who just clicked "not spam").
 */
export class AkismetSpamCheck implements SpamCheckPort {
  constructor(
    private readonly httpClient: HttpClientPort,
    private readonly config: AkismetSpamCheckConfig
  ) {}

  async check(submission: CommentSubmission): Promise<SpamVerdict> {
    try {
      const response = await this.httpClient.send({
        method: "POST",
        url: `${akismetHost(this.config.apiKey)}/comment-check`,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: formEncode(commonFields(this.config, submission)),
        timeoutMs: this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });

      if (response.status < 200 || response.status >= 300) {
        return { isSpam: false, score: 0, provider: "akismet-unavailable" };
      }

      // Akismet's real API returns the literal text "true" or "false" as the whole response body.
      const verdictText = response.bodyText.trim().toLowerCase();
      const isSpam = verdictText === "true";
      // `X-akismet-pro-tip: discard` is Akismet's own "blatant spam, safe to auto-discard" signal
      // — mapped to a full-confidence score; an ordinary "true" without the pro-tip header still
      // maps to a high-but-not-maximal score, consistent with `spam.heuristic.ts`'s own
      // graduated-score convention (this port's score is a confidence, not just a boolean).
      const proTipDiscard = (response.headers["x-akismet-pro-tip"] ?? "").toLowerCase() === "discard";
      const score = isSpam ? (proTipDiscard ? 1 : 0.85) : 0;

      return { isSpam, score, provider: "akismet" };
    } catch {
      // Network error, timeout, or an EgressPolicy refusal (e.g. the configured `blog`/apiKey
      // host isn't on this workspace's allowlist) — fail open, per this class's own doc above.
      return { isSpam: false, score: 0, provider: "akismet-unavailable" };
    }
  }

  async report(required: { workspaceId: string; comment: CommentRecord; verdict: "ham" | "spam" }): Promise<void> {
    try {
      await this.httpClient.send({
        method: "POST",
        url: `${akismetHost(this.config.apiKey)}/submit-${required.verdict}`,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: formEncode({
          blog: this.config.blog,
          comment_type: required.comment.parentId ? "reply" : "comment",
          comment_author: required.comment.authorName,
          comment_author_email: required.comment.authorEmail ?? "",
          comment_author_url: required.comment.authorUrl ?? "",
          comment_content: required.comment.bodyText,
        }),
        timeoutMs: this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      });
    } catch {
      // Best-effort feedback — see this class's own doc above for why a failed report() must
      // never surface as a moderation-action failure.
    }
  }
}
