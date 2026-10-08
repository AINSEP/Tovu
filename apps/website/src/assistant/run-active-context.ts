/**
 * @file The agent daemon's `GET /api/active` — the route `@jini-ai/mcp`'s `get_active_context` tool
 * and its active-resource read call, answered from the admin screen each live run was started from.
 *
 * Run-start screen context is already known; use it instead of requiring a separate client POST
 * to populate the generic active-context pointer.
 *
 * Which run: `GET /api/active` carries no run id, so the route cannot tell which run is asking. It therefore answers only
 * when every live run's screen agrees, and `{active: false}` when two live runs were sent from
 * different screens: an ambiguous answer is reported as none, never as another conversation's
 * screen. The run's own prompt carries its exact screen either way (`buildPageContextPromptBlock`).
 *
 * Age: a recording older than http-kit's `ACTIVE_CONTEXT_TTL_MS` is ignored, matching the 5-minute
 * contract `get_active_context`'s own description states.
 *
 * Trust: every value comes from the browser via `readRunPageContext`, already validated and capped.
 */
import type { Express } from "express";
import { ACTIVE_CONTEXT_TTL_MS } from "@jini-ai/daemon/http";

import type { RunPageContext } from "./run-page-context.js";

/** The route `@jini-ai/mcp`'s `get_active_context` calls. */
export const ACTIVE_CONTEXT_PATH = "/api/active";

/** `GET /api/active`'s body — http-kit's `GetActiveOutput` shape, plus the full `pageContext`. */
export type RunActiveContextAnswer =
  | { readonly active: false }
  | {
      readonly active: true;
      /** The open entry's id (usable with the content tools), else the admin path. */
      readonly resourceRef: string;
      /** The open entry's title, else `null`. */
      readonly resourceName: string | null;
      /** The admin route path. */
      readonly detail: string;
      /** When the screen was recorded (run start), epoch ms. */
      readonly ts: number;
      readonly ageMs: number;
      readonly pageContext: RunPageContext;
    };

/** The live runs' screens: recorded at run start, forgotten at run end. */
export interface RunActiveContextStore {
  record(runId: string, pageContext: RunPageContext): void;
  forget(runId: string): void;
  read(): RunActiveContextAnswer;
}

interface Recorded {
  readonly pageContext: RunPageContext;
  readonly ts: number;
}

/** Two recordings name the same screen when their path and open entry match; a renamed title does not make them differ. */
function screenKey(pageContext: RunPageContext): string {
  return JSON.stringify([pageContext.path, pageContext.entry?.kind ?? null, pageContext.entry?.id ?? null]);
}

/**
 * Builds the store the daemon records each run's screen in.
 *
 * @param options.now - Clock seam. @default Date.now
 * @returns The store. `read` is O(live runs); entries are removed by `forget`, so size is bounded by
 *   the number of concurrently live runs.
 */
export function createRunActiveContextStore(options: { readonly now?: () => number } = {}): RunActiveContextStore {
  const now = options.now ?? Date.now;
  const byRunId = new Map<string, Recorded>();

  return {
    record(runId, pageContext) {
      byRunId.set(runId, { pageContext, ts: now() });
    },
    forget(runId) {
      byRunId.delete(runId);
    },
    read() {
      const at = now();
      let newest: Recorded | undefined;
      const screens = new Set<string>();
      for (const recorded of byRunId.values()) {
        if (at - recorded.ts > ACTIVE_CONTEXT_TTL_MS) continue;
        screens.add(screenKey(recorded.pageContext));
        if (newest === undefined || recorded.ts >= newest.ts) newest = recorded;
      }
      if (newest === undefined || screens.size !== 1) return { active: false };
      const { pageContext, ts } = newest;
      return {
        active: true,
        resourceRef: pageContext.entry?.id ?? pageContext.path,
        resourceName: pageContext.entry?.title ?? null,
        detail: pageContext.path,
        ts,
        ageMs: at - ts,
        pageContext,
      };
    },
  };
}

/**
 * Mounts `GET /api/active` on the daemon app. Mount it AFTER `requireAgentDaemonToken`: `jini-mcp`
 * sends the daemon token (`mcp-injection.ts`), and nothing else may read the operator's screen.
 */
export function registerRunActiveContextRoute(app: Pick<Express, "get">, store: RunActiveContextStore): void {
  app.get(ACTIVE_CONTEXT_PATH, (_req, res) => {
    res.json(store.read());
  });
}
