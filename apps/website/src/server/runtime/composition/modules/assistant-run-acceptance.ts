/**
 * @file The admin assistant's one durable run acceptance, shared by `/api/runs`
 * (`assistant.ts`'s `proxyAcceptedRun`) and the AG-UI canary route (`assistant-ag-ui.ts`), so both
 * commit the same stub and accepted input BEFORE any launch, reuse the same idempotent attempt id,
 * and attach the same owner-scoped finalizer. It returns the canonical accepted run, never an HTTP
 * response: each route answers in its own wire shape. No storage of its own — the ledger's existing
 * durable store is the only record.
 */
import { randomUUID } from "node:crypto";

import type { DurableRun, DurableRunStore } from "@jini-ai/chat/server/durable-runs";

import { createRunAcceptance, type RunAcceptancePorts } from "#src/assistant/durable-runs/accept";
import type { RouteDeps } from "#src/server/routes/types";
import { assistantRunFinalizerFor } from "./run-finalizer/shared.js";
import { createHttpRunDaemonClient } from "./run-daemon-http-client.js";

/** Everything acceptance touches, injected: ledger store, clock, id source, daemon launch, the
 *  finalizer watch and the start capture. */
export interface AssistantRunAcceptancePorts {
  readonly store: DurableRunStore;
  readonly now: () => number;
  readonly mintRunId: () => string;
  readonly launch: RunAcceptancePorts["launch"];
  readonly watch: (required: DurableRun, optional: {}) => void;
  readonly onAccepted: NonNullable<RunAcceptancePorts["onAccepted"]>;
}

/** Accepts (or replays) the owned durable run for one assistant message. `null` when the store
 *  refuses it (a foreign or mismatched message), which both routes answer as not found.
 * @complexity O(1) store calls plus at most one daemon launch. */
export async function acceptOwnedAssistantRun(
  { principalId, workspaceId, conversationId, messageId, request, ports }: {
    principalId: string; workspaceId: string; conversationId: string; messageId: string;
    request: { agentId?: string; contextRef: string }; ports: AssistantRunAcceptancePorts;
  },
  _optional = {},
): Promise<DurableRun | null> {
  const acceptance = createRunAcceptance({ store: ports.store, now: ports.now, mintRunId: ports.mintRunId,
    onAccepted: ports.onAccepted, launch: ports.launch, attach: (run) => ports.watch(run, {}) }, {});
  return acceptance.accept({ principalId, workspaceId, conversationId, messageId, request }, {});
}

/** The production ports for one verified principal, or `null` when this root has no durable store
 *  (the caller then keeps its legacy, non-durable start).
 * @complexity O(1). */
export function assistantRunAcceptancePorts(
  { deps, principalId }: {
    deps: Pick<RouteDeps, "chatRunLedger" | "tracker" | "observability"> & { assistantDaemonDemand?: { ensureReady: NonNullable<Parameters<typeof createHttpRunDaemonClient>[1]>["ensureReady"] } | undefined };
    principalId: string;
  },
  _optional = {},
): AssistantRunAcceptancePorts | null {
  const store = deps.chatRunLedger.durable;
  if (!store) return null;
  const finalizer = assistantRunFinalizerFor({ ledger: deps.chatRunLedger, tracker: deps.tracker, observability: deps.observability }, {});
  const client = createHttpRunDaemonClient({ observability: deps.observability }, { ensureReady: deps.assistantDaemonDemand?.ensureReady });
  return { store, now: Date.now, mintRunId: randomUUID,
    onAccepted: ({ run }) => deps.tracker.capture({ name: "assistant_run_started", userId: principalId }, { properties: { chatSurface: "admin", logicalRunId: run.messageId, eventId: `assistant-start:${run.messageId}` } }),
    launch: (required, optional) => {
      if (!client.launch) throw new Error("assistant daemon has no launch operation");
      return client.launch(required, optional);
    },
    watch: (run) => finalizer.watch({ principalId, conversationId: run.conversationId, message: run.message }),
  };
}
