import type { ErrorReporter } from "@jini-ai/core/errors/reporter";
import type { Request, Response } from "express";
import type { Principal } from "@jini-ai/core";
import type { ExecutionCredentialPort, RequestSuppliedProviderConfig as RequestSuppliedByokConfig, ResolvedProviderCredential as ResolvedByokCredential } from "@jini-ai/agent-runtime/providers/credentials";
import type { ProviderChatMessage } from "@jini-ai/agent-runtime/providers/tool-turn";
import { formatCustomInstructionsOverlay, resolveCustomInstructions } from "@jini-ai/agent-runtime/custom-instructions";
import { readPickedFolders, readRunPageContext, withPageContextBlock } from "#src/assistant/run-page-context";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { RouteDeps } from "#src/server/routes/types";
import { ASSISTANT_CONTENT_EDIT_GUIDANCE } from "@tovu/contracts/assistant-content-guidance";
import { PERMANENT_DELETE_GUIDANCE } from "#src/contracts/headless/index";
import { CREDENTIAL_GUIDANCE } from "#src/assistant/credential-guidance";
import { SITE_GUIDE_POINTER } from "#src/assistant/site-guide-pointer";
import { AttachmentUnavailableError, prepareByokMessageAttachments } from "#src/server/inbound/assistant/byok-message-attachments";
import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import { resolveMessages } from "./assistant-byok-history.js";
import type { ByokTurnContext } from "./assistant-byok-turn.js";

/** Exported so `assistant-byok-routes.test.ts` can assert the exact composed `system` string against
 *  this same literal rather than duplicating it — see {@link resolveByokSystemPrompt}'s doc for the
 *  composition this constant is the fixed half of. */
export const SYSTEM_PREAMBLE =
  SITE_GUIDE_POINTER +
  ASSISTANT_CONTENT_EDIT_GUIDANCE +
  "You are the Tovu admin assistant, running with the operator's own AI provider key (BYOK mode). " +
  "Use the tools you are given to inspect and manage this Tovu site on the operator's behalf. " +
  "Keep replies short and direct: lead with the answer, skip preamble and skip restating the " +
  "request. Use headers, lists, or tables only when they carry real structure. Give full detail " +
  "when asked, and never trade correctness for brevity — error text, failing output, and " +
  "confirmations for destructive actions keep their full content. " +
  "Only call tools that exist in your tool list; never invent one. " + CREDENTIAL_GUIDANCE + " " + PERMANENT_DELETE_GUIDANCE;

/** How long one BYOK turn waits on `ByokToolSurface.awaitFederation` before giving up and running
 *  with whatever tools are searchable so far — see that method's own doc for why the wait is bounded
 *  rather than open-ended. Only a turn that lands before the lazy boot pass has settled (normally just the
 *  first API-mode turn after boot) can actually wait this long; a roster-change reload is never
 *  awaited here, and every later turn finds the boot pass already settled and returns at once. 5s, per the owner's own sizing
 *  (`design-byok-external-mcp-2026-09-24.md` §2.1 item 6). */
export const FEDERATION_TURN_WAIT_MS = 5_000;

/** Appended to the system prompt (see {@link resolveByokSystemPrompt}) on a turn whose
 *  `awaitFederation` call timed out rather than settling — the same "no silent withholding" rule
 *  `agent-daemon-server.ts:643-647` already enforces for its own turns: a model that cannot yet see a
 *  just-registered external-MCP tool is told WHY a search might come up empty, rather than being left
 *  to guess the tool does not exist. */
export const FEDERATION_STILL_CONNECTING_NOTE =
  "External MCP servers are still connecting, so their tools may not be searchable yet. If a tool you need is missing, say so and suggest asking again in a moment.";

/**
 * Composes this route's `system` prompt in the fixed order §2.1 item 6 of
 * `design-byok-external-mcp-2026-09-24.md` specifies: {@link SYSTEM_PREAMBLE}, then the federation
 * runtime's own `refusalPrefix()` (when this turn's surface actually has drift to report), then
 * {@link FEDERATION_STILL_CONNECTING_NOTE} (when this turn's `awaitFederation` call timed out rather
 * than settling), then the admin Instructions tab's custom overlay (`core.instructions.custom`), when
 * the operator has set one — every present part joined with the Local CLI path's own separator
 * (`agent-daemon-server.ts`: `` `${base}\n\n${custom}` ``), so an operator's custom instructions still
 * apply identically in both execution modes rather than only to Local CLI runs, and a still-connecting
 * federation boot pass never silently withholds a tool the model would otherwise assume does not exist
 * (the same rule `agent-daemon-server.ts:643-647` already enforces for its own turns).
 *
 * `federation.refusalPrefix`/`federation.stillConnecting` are `handleTurn`'s own read of THIS turn's
 * `awaitFederation(FEDERATION_TURN_WAIT_MS)` outcome and `ByokToolSurface.federation?.refusalPrefix()`
 * — passed in rather than resolved here, since this function has no surface of its own to ask.
 *
 * Re-reads `core.instructions.custom` fresh on every call rather than caching it at module load or
 * across turns: this route has no long-lived process to refresh a cache against between requests (each
 * `handleTurn` invocation is its own request/response lifecycle), so a plain re-read is both simpler
 * and sufficient here — unlike the Local CLI path, which needs `custom-instructions.ts`'s
 * `createCustomInstructionsCache` bridge specifically because `PromptAugmenter.systemOverlay()` is
 * called synchronously inside the daemon's `run()`. `resolveCustomInstructions` never throws (fails
 * open to `""` on any read error) and `formatCustomInstructionsOverlay` returns `null` for unset,
 * empty, or whitespace-only text, so a turn with no federation drift/timeout and an operator who has
 * never opened the Instructions tab gets exactly {@link SYSTEM_PREAMBLE} back, unchanged.
 *
 * @complexity O(1) — one `resolveCustomInstructions` read (itself O(1)) plus a trim/length check.
 * @overallScore 100
 */
async function resolveByokSystemPrompt(
  routeDeps: RouteDeps,
  federation: { readonly refusalPrefix: string; readonly stillConnecting: boolean },
): Promise<string> {
  const customInstructions = await resolveCustomInstructions(
    {
      settingsRepo: routeDeps.settingsRepo,
      settingsReady: routeDeps.settingsUiTabsReady,
      getEffective: routeDeps.getEffective,
      instructionsNamespace: routeDeps.instructionsNamespace,
      warn: (message: string, error: unknown) => console.error(`[assistant] ${message}`, error),
      workspaceId: routeDeps.workspaceId,
    },
  );
  const customOverlay = formatCustomInstructionsOverlay({ customInstructions: customInstructions });
  const parts = [SYSTEM_PREAMBLE];
  if (federation.refusalPrefix.length > 0) parts.push(federation.refusalPrefix);
  if (federation.stillConnecting) parts.push(FEDERATION_STILL_CONNECTING_NOTE);
  if (customOverlay !== null) parts.push(customOverlay);
  return parts.join("\n\n");
}

type ByokTurnInputs = { messages: ProviderChatMessage[]; principal: Principal; credential: ResolvedByokCredential };

/**
 * The two gates `handleTurn` must clear before it opens a stream: the client-supplied history must
 * resolve to a non-empty, user-ending message list, and a usable BYOK credential (request-supplied
 * or the admin's own stored row) must resolve. Both can end the request on their own; consolidated
 * here so `handleTurn` itself is a single `if (!inputs) return;` rather than two separate guards.
 */
async function resolveTurnInputsOrRespond(
  req: Request,
  res: Response,
  credentialPort: ExecutionCredentialPort,
  routeDeps: RouteDeps,
  signal: AbortSignal,
  reporter: ErrorReporter,
): Promise<ByokTurnInputs | null> {
  const body = (req.body ?? {}) as { messages?: unknown; byok?: RequestSuppliedByokConfig; pageContext?: unknown; attachmentIds?: unknown; folders?: unknown };
  const history = resolveMessages({ raw: body.messages });
  if (history.length === 0 || history[history.length - 1]?.role !== "user") {
    res.status(400).json({ error: "'messages' must end with a non-empty user message", code: "VALIDATION_ERROR" });
    return null;
  }
  // The admin screen block, same as a Local CLI run's (`run-page-context.ts`): degrade-only, so a
  // malformed `pageContext` means "the turn does not know the screen", never a rejected request.
  let folders: string[];
  try { folders = readPickedFolders({ value: body.folders }, {}); }
  catch { res.status(400).json({ error: "Invalid picked folders", code: "VALIDATION_ERROR" }); return null; }
  const messages = [...withPageContextBlock({ messages: history, pageContext: readRunPageContext({ value: body.pageContext }), folders })];

  const authed = getAuthedPrincipal(res);
  const credential = await credentialPort.resolve({
    requestBody: body.byok ?? {},
    workspaceId: routeDeps.workspaceId,
    principalId: authed.id,
  });
  if (!credential) {
    res.status(400).json({
      error:
        "no usable BYOK credential — supply 'byok' with a supported protocol, a non-empty apiKey, and a model, or save one first in Settings",
      code: "VALIDATION_ERROR",
    });
    return null;
  }
  // The credential read is a cancellation window: a browser gone by now gets no attachment work.
  if (signal.aborted) return null;

  if (!await attachTurnMessagesOrRespond({ attachmentIds: body.attachmentIds, messages, principalId: authed.id, routeDeps, res, reporter })) return null;
  return { messages, principal: { id: authed.id }, credential };
}

/** Validates attachment references and adds the owner-scoped byte preparation to the newest message.
 * Invalid or unavailable attachments stop the request before SSE begins; omitted references do nothing.
 * At most ten references are passed to the existing attachment preparation owner.
 * @complexity O(attachment bytes) preparation, with at most ten references; mutates the last message. */
async function attachTurnMessagesOrRespond({ attachmentIds, messages, principalId, routeDeps, res, reporter }: {
  attachmentIds: unknown; messages: ProviderChatMessage[]; principalId: string; routeDeps: RouteDeps; res: Response; reporter: ErrorReporter;
}, _options: Record<string, never> = {}): Promise<boolean> {
  if (attachmentIds === undefined) return true;
  const refs = readAttachmentRefs({ value: attachmentIds });
  if (!refs) {
    res.status(400).json({ error: "Invalid message attachments", code: "VALIDATION_ERROR" });
    return false;
  }
  try {
    const prepared = await prepareByokMessageAttachments({ refs, principalId, uploadDirectory: routeDeps.siteStoragePaths.chatAttachmentsDir }, {});
    const last = messages[messages.length - 1];
    if (!last) throw new Error("assistant attachment preparation has no message");
    messages[messages.length - 1] = { ...last, content: last.content + prepared.notice, images: prepared.images };
  } catch (error) {
    if (error instanceof AttachmentUnavailableError) res.status(400).json({ error: "Attachment is unavailable. Reattach it before sending.", code: "VALIDATION_ERROR" });
    else sendAdminFailure({ res, error, reporter }, { operation: "assistant-byok:attachments", message: "The attachment could not be prepared." });
    return false;
  }
  return true;
}

/** At most ten non-empty string references; anything else is a malformed request, not an attachment. */
function readAttachmentRefs({ value }: { value: unknown }, _options: Record<string, never> = {}): readonly string[] | undefined {
  const valid = Array.isArray(value) && value.length <= 10 && value.every(ref => typeof ref === "string" && ref !== "");
  return valid ? value : undefined;
}

/** Resolves inputs, extension tools, federation and the prompt before the stream opens, rechecking the
 * turn's abort after each so a disconnected user never reaches credential-backed provider work.
 * Returns null when the request was answered or the browser left; then no stream, run or call starts.
 * @complexity Awaits the existing input, surface and prompt owners once each; the federation wait is
 * shared across turns and is never cancelled by this one. */
export async function prepareByokTurnSetup({ req, res, context, abort }: {
    req: Request; res: Response; context: ByokTurnContext; abort: AbortController;
  }, _optional = {}): Promise<(ByokTurnInputs & { system: string }) | null> {
    const { routeDeps, resolvedToolSurface, credentialPort, reporter } = context;
    const inputs = await resolveTurnInputsOrRespond(req, res, credentialPort, routeDeps, abort.signal, reporter);
    if (!inputs || abort.signal.aborted) return null;

    // `ready` resolves once the installed-extension-tools pass (Agent Plugins, Agent Skills, enabled
    // plugin-capability tools) has been applied to `resolvedToolSurface`'s registry AND its
    // `search_tools`/`describe_tool` catalog rebuilt to include them — see `ByokToolSurface.ready`'s
    // own doc. Awaited here, once per turn, so `search_tools` can find a just-registered extension
    // tool before the model's first tool call this turn, not only after it. Resolves instantly for
    // every turn after the first (the promise is already settled) and for a caller-supplied
    // `toolSurface` that predates this field, which has no `ready` to wait on at all.
    await (resolvedToolSurface.ready ?? Promise.resolve());
    if (abort.signal.aborted) return null;

    // Starts (or awaits) this surface's lazy federation boot pass, bounded to
    // `FEDERATION_TURN_WAIT_MS` — see `ByokToolSurface.awaitFederation`'s own doc. Only a turn that
    // lands before the boot pass has settled can actually wait (a roster-change reload is never
    // awaited here); every later turn finds the boot pass already settled and this resolves at
    // once. `federation?.refusalPrefix()` reads whatever drift THIS surface has accumulated so far,
    // live — empty before federation has admitted anything, and always when this surface was built
    // with `installExtensions: false` (`federation` is `undefined` there). No signal is passed: the
    // boot pass is shared, so one closed tab must not stop it for other turns.
    const federationOutcome = await resolvedToolSurface.awaitFederation({ timeoutMs: FEDERATION_TURN_WAIT_MS });
    if (abort.signal.aborted) return null;
    const system = await resolveByokSystemPrompt(routeDeps, {
      refusalPrefix: resolvedToolSurface.federation?.refusalPrefix() ?? "",
      stillConnecting: !federationOutcome.settled,
    });
    return abort.signal.aborted ? null : { ...inputs, system };
  }

