/** Tovu notice copy and legacy signatures over Jini's browser-safe run-event owner. */

import * as owner from "@jini-ai/chat/core/run-events";

import type { AgentEvent } from "@jini-ai/chat/core";

export type { RunAgentPayload, RunProtocolEventWire, TerminalOutcome, RunFrameOutcome } from "@jini-ai/chat/core/run-events";

import type { RunAgentPayload, TerminalOutcome, RunFrameOutcome } from "@jini-ai/chat/core/run-events";

export function asString(v: unknown): string { return owner.asString({ value: v }, {}); }

export function parseUsageEvent(payload: RunAgentPayload): AgentEvent { return owner.parseUsageEvent({ payload }, {}); }

export function translateRunAgentPayload(payload: RunAgentPayload): AgentEvent | null { return owner.translateRunAgentPayload({ payload }, {}); }

export function terminalReasonNotice(reason: string): AgentEvent | null { return owner.terminalReasonNotice({ reason, notice: RUN_NOTICES.toolStepLimit }, {}); }



/** The saved line for a run that failed before a process started. Its reason, when the daemon or the
 *  host gave one, arrives just before as an `error` frame and is shown above this line. */
export const RUN_NEVER_STARTED_LABEL = "Run failed before the agent started";


export const RUN_NEVER_STARTED_DETAIL = "Nothing ran, so there is no exit code. The reason, when there is one, is shown above.";

export function readTerminalOutcome(raw: string | undefined): TerminalOutcome | null { return owner.readTerminalOutcome({ raw }, {}); }

export function terminalOutcomeNotice(raw: string | undefined): AgentEvent | null { return owner.terminalOutcomeNotice({ raw, notices: RUN_NOTICES }, {}); }

export function terminalFailureError(raw: string | undefined): Error | null { return owner.terminalFailureError({ raw }, {}); }

export function readTerminalReason(raw: string | undefined, wrapped: boolean): string { return owner.readTerminalReason({ raw, wrapped }, {}); }

export function parseFrame(rawFrame: string): { event: string; data: string } | null { return owner.parseFrame({ rawFrame }, {}); }

export async function* readSseFrames(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> { yield* owner.readSseFrames({ body }, {}); }



/** Run-id prefixes minted for runs the agent daemon does not hold: BYOK turns (`byok:`) and AG-UI
 *  turns (`agui:`). Mirrors `assistant-transport.ts`'s `BYOK_RUN_ID_PREFIX` and
 *  `assistant-transport-ag-ui.ts`'s `AG_UI_RUN_ID_PREFIX`. */
const NON_DAEMON_RUN_ID_PREFIXES = ["byok:", "agui:"] as const;

export function isDaemonRunId(runId: string): boolean { return owner.isDaemonRunId({ runId, excludedPrefixes: NON_DAEMON_RUN_ID_PREFIXES }, {}); }

export function runContentFromEvents(events: readonly AgentEvent[]): string { return owner.runContentFromEvents({ events }, {}); }

export function runEventsForSave(events: readonly AgentEvent[]): AgentEvent[] { return owner.runEventsForSave({ events }, {}); }

export function translateRunFrame(kind: string, raw: string | undefined): RunFrameOutcome { return owner.translateRunFrame({ kind, raw, notices: RUN_NOTICES }, {}); }

export const RUN_NOTICES: owner.RunNotices = {
  toolStepLimit: { kind: "status", label: "Stopped early — tool-step limit reached", detail: "This turn used all the tool steps allowed for one message, so it may be unfinished. Ask it to continue to pick up where it left off." },
  interrupted: { kind: "status", label: "Run interrupted" },
  neverStarted: { kind: "status", label: RUN_NEVER_STARTED_LABEL, detail: RUN_NEVER_STARTED_DETAIL },
  canceledLabel: "Run canceled",
  failedLabel: "Run failed — the agent process exited without answering",
  terminalDetail: ({ outcome: { code, signal, resumable } }) => `exit code ${code}, signal ${signal}, resumable ${resumable}. The agent CLI's own stderr is shown above when it printed anything; otherwise check the server log for \`[agent-daemon] run <id> ended\`.`,
};
