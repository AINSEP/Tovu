import type { Request, Response } from "express";
import type { FrontendSessionOwner } from "@jini-ai/core/contracts/site/daemon";
import type { FrontendHookInput } from "@jini-ai/core/contracts/site/daemon-http";
import type { ToolConfirmationDirective } from "@jini-ai/core/contracts/site/client-directives";
import { VISITOR_APPROVAL_EXPIRED, type HeldVisitorApproval, type VisitorAgUiResume } from "#src/assistant/site/visitor-ag-ui-resume";
import type { VisitorConfirmations } from "#src/assistant/site/visitor-confirmations";
import { VISITOR_TOOL_REFUSAL } from "#src/assistant/site/visitor-executor";
import { allowsVisitorRequestOrigin } from "#src/assistant/site/visitor-request-origin";
import type { RateLimiter } from "#src/contracts/core/rate-limit/rate-limit";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { requestHookInput } from "#src/platform/express/request-facts";
import type { VisitorAgUiWriter, VisitorTurnWriter } from "./site-assistant-ag-ui.js";

/**
 * @file AG-UI visitor approvals (P6-T2.T): one logical turn may span several HTTP segments. The
 * first ends with a standard interrupt; a resume POST to the same `/chat` attaches the next one to
 * the SAME running provider call. The legacy `/confirm` route and writer stay for open legacy tabs
 * until P6-T2.R.
 */

/** One HTTP segment of a logical turn. */
export interface VisitorSegment { readonly res: Response; readonly writer: VisitorTurnWriter & Partial<Pick<VisitorAgUiWriter, "interrupt">>; readonly runId: string }

/** The turn's live segment. While parked there is no segment: provider output has nowhere to go
 *  and is dropped (the parked call cannot produce any until it is answered). */
export interface VisitorTurnSegments { current: VisitorSegment; parked: boolean; readonly writer: VisitorTurnWriter }

export function createVisitorTurnSegments({ initial }: { initial: VisitorSegment }, _optional = {}): VisitorTurnSegments {
  const segments: { current: VisitorSegment; parked: boolean } = { current: initial, parked: false };
  const live = (): VisitorTurnWriter | undefined => (segments.parked ? undefined : segments.current.writer);
  const writer: VisitorTurnWriter = {
    start: () => { live()?.start(); },
    text: (required) => { live()?.text(required); },
    directive: (required) => { live()?.directive(required); },
    finish: (required) => { live()?.finish(required); },
    settle: () => { live()?.settle(); },
  };
  return Object.assign(segments, { writer });
}

/** Ends the turn's run when its CURRENT segment is dropped by the visitor (not by us). */
export function watchSegmentClose({ segment, abort }: { segment: VisitorSegment; abort: AbortController }, _optional = {}): void {
  segment.res.on("close", () => { if (!segment.res.writableEnded) abort.abort(); });
}

/**
 * The Ask channel for an AG-UI turn. No approval owner (credential issuance failed or absent)
 * means no channel, so Ask-mode tools are denied by policy and plain chat is unaffected.
 */
export function agUiApprovalChannel(
  { confirmations, resume, segments, owner, quotaKey, threadId, nowMs, waitMs, abort }: {
    confirmations: VisitorConfirmations; resume: VisitorAgUiResume<VisitorSegment>; segments: VisitorTurnSegments;
    owner: FrontendSessionOwner | null; quotaKey: string; threadId: string; nowMs: () => number; waitMs: number; abort: AbortController;
  },
  _optional = {},
) {
  if (!owner) return {};
  const held: HeldVisitorApproval<VisitorSegment> = {
    quotaKey,
    attach: ({ segment }) => { segments.current = segment; segments.parked = false; watchSegmentClose({ segment, abort }); },
    cleanup: () => { abort.abort(); },
  };
  const emit = (directive: ToolConfirmationDirective) => {
    const segment = segments.current;
    const interruptId = directive.challengeId;
    if (!resume.parkVisitorApproval({ owner, threadId, runId: segment.runId, interruptId, held, abandonAtMs: nowMs() + waitMs })) {
      void confirmations.confirm({ challengeId: interruptId, allow: false, owner });
      return;
    }
    // Normal segment close is not Stop: parked first, then the segment ends with writableEnded set,
    // so the close listener does not abort the held call and response-close cleanup is skipped.
    segments.parked = true;
    segment.writer.interrupt?.({ interrupt: { id: interruptId, reason: "confirmation", message: `${directive.title}: ${directive.summary}` } });
    segment.res.end();
  };
  return { confirmation: {
    // The exchange is bound to the approval owner, the same identity a resume must present.
    request: (required: Parameters<VisitorConfirmations["request"]>[0]) => confirmations.request({ ...required, binding: { ...required.binding, owner } }),
    confirm: confirmations.confirm,
    emit,
  } };
}

/** A resume carries exactly one answer and no new turn: no messages, one `resume` entry. */
export function isVisitorAgUiResume({ body }: { body: unknown }, _optional = {}): boolean {
  return Boolean(body && typeof body === "object" && Array.isArray((body as { resume?: unknown }).resume)
    && ((body as { resume: unknown[] }).resume).length > 0);
}

function boundedResumeShape({ body }: { body: unknown }): boolean {
  const value = body as { resume?: unknown[]; messages?: unknown };
  return value.resume?.length === 1 && Array.isArray(value.messages) && value.messages.length === 0;
}

export interface VisitorResumePorts {
  readonly enabled: () => Promise<boolean>;
  readonly allowsOrigin: (required: { origin: string }) => Promise<boolean>;
  readonly limiter: RateLimiter;
  /** Required: the signed guest-cookie/tab owner. There is no ownerless fallback. */
  readonly resolveApprovalOwner: (required: FrontendHookInput) => Promise<FrontendSessionOwner | null>;
  readonly resume: VisitorAgUiResume<VisitorSegment>;
  readonly openSegment: (required: { req: Request; res: Response; threadId: string; runId: string }) => VisitorSegment;
}

/**
 * The resume branch of visitor `/chat`, before any provider start. Carries `/confirm`'s rate limit,
 * enabled check, closed body shape and JSON/same-origin protection. Missing, expired, foreign,
 * mismatched, replayed and ownerless answers all get the same plain sentence.
 */
export async function handleVisitorAgUiResume({ req, res, ports }: { req: Request; res: Response; ports: VisitorResumePorts }, _optional = {}): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  if (!(await ports.limiter.check({ key: resolveClientIp(req) })).allowed) { res.status(429).json({ error: VISITOR_TOOL_REFUSAL }); return; }
  if (!await ports.enabled()) { res.status(404).json({ error: VISITOR_TOOL_REFUSAL }); return; }
  const sameOrigin = await allowsVisitorRequestOrigin({ ...requestHookInput({ req }), allowsOrigin: ports.allowsOrigin });
  if (!boundedResumeShape({ body: req.body }) || !req.is("application/json") || !sameOrigin) { res.status(400).json({ error: VISITOR_TOOL_REFUSAL }); return; }
  const owner = await ports.resolveApprovalOwner(requestHookInput({ req }));
  const result = await ports.resume.resumeVisitorApproval({ input: req.body, owner,
    attachResponse: ({ threadId, runId }) => ports.openSegment({ req, res, threadId, runId }) });
  if (result === "expired" && !res.headersSent) res.status(400).json({ error: VISITOR_APPROVAL_EXPIRED });
}
