import { createAgentDaemonIdlePark } from "./agent-daemon-idle-park.js";
import express from "express";
import { isTerminalRunState } from '@jini-ai/protocol';
import { type RunLifecycle } from "@jini-ai/daemon";
import { type AgentDaemonResource } from "../../runtime/composition/agent-daemon-core-deps.js";
import { createAssistantAgentInventory } from "#src/assistant/agents";
import { createRunScopedCredentials } from "#src/assistant/daemon-access";
import { awaitBootWorkWithinBound } from "../../runtime/lifecycle/await-boot-work.js";

type ScopeLifetime = {
  disposed: boolean; closing: Promise<void> | undefined; responses: Set<express.Response>;
  activeWork: number; resolveDrained: (() => void) | undefined; ownerRetentionTimers: Set<ReturnType<typeof setTimeout>>;
};
type LifetimePorts = {
  processActivity: ReturnType<typeof createAgentDaemonIdlePark>; ownsIdlePark: boolean; lifecycle: RunLifecycle;
  assistantInventory: Pick<ReturnType<typeof createAssistantAgentInventory>, 'dispose'>;
  getRunCredentials: () => Pick<ReturnType<typeof createRunScopedCredentials>, 'revoke'>;
  getDaemonStore: () => AgentDaemonResource | undefined; disposeAiTracing: () => void;
};
export function createScopeLifetime(required: LifetimePorts, _optional = {}) {
  const state: ScopeLifetime = { disposed: false, closing: undefined, responses: new Set(), activeWork: 0, resolveDrained: undefined, ownerRetentionTimers: new Set() };
  return { isDisposed: () => state.disposed, responses: state.responses, ownerRetentionTimers: state.ownerRetentionTimers,
    idlePark: { ...required.processActivity, hold: hold.bind(undefined, { state, processActivity: required.processActivity }) },
    dispose: dispose.bind(undefined, { ...required, state }) };
}
function hold({ state, processActivity }: { state: ScopeLifetime; processActivity: ReturnType<typeof createAgentDaemonIdlePark> }, _optional = {}) {
    const release = processActivity.hold({}, {});
    state.activeWork++;
    let released = false;
    return () => {
      if (released) return;
      released = true; release(); state.activeWork--;
      if (state.activeWork === 0) state.resolveDrained?.();
    };
}

function dispose({ state, processActivity, ownsIdlePark, lifecycle, assistantInventory, getRunCredentials, getDaemonStore, disposeAiTracing }: LifetimePorts & { state: ScopeLifetime }, _optional = {}): Promise<void> {
      if (state.closing) return state.closing;
      state.disposed = true; // Fence intake and live run credentials before the first await.
      state.closing = (async () => {
        const runs = await lifecycle.list({});
        for (const run of runs) getRunCredentials().revoke({ runId: run.id }, {});
        const drains = runs.filter(run => !isTerminalRunState({ state: run.state })).map(async run => {
          await lifecycle.cancel({ runId: run.id });
          await lifecycle.waitForTerminal({ runId: run.id }, { signal: AbortSignal.timeout(5_000) });
        });
        await awaitBootWorkWithinBound({ work: drains }, { timeoutMs: 5_000 });
        // Terminal callbacks own session saves and attachment cleanup beyond the run's end.
        const drained = state.activeWork === 0 ? Promise.resolve() : new Promise<void>(resolve => { state.resolveDrained = resolve; });
        // Keep the retained client alive until accepted preparation/cleanup really settles.
        // The inherited IPC deadline bounds callers; timing out must not close beneath live work.
        await drained;
        for (const response of state.responses) response.end();
        state.responses.clear();
        for (const timer of state.ownerRetentionTimers) clearTimeout(timer);
        state.ownerRetentionTimers.clear();
        if (ownsIdlePark) processActivity.stop({}, {});
        disposeAiTracing();
        try { await assistantInventory.dispose({}); }
        finally { await getDaemonStore()?.close(); }
      })();
      return state.closing;
    }
