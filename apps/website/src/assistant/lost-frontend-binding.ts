/**
 * @file Turns "no frontend is bound" into "reload the admin tab" for a run whose tab bound with a
 * token the daemon no longer knows.
 *
 * The daemon's frontend-session registry is in memory, so an API restart (tsx watch in dev, a
 * crash or deploy in production) forgets every tab's session. A tab that has not reconnected yet
 * still sends its old bind token with the next run; `bindRunByToken` throws "unknown or expired
 * bind token", `createFrontendControl`'s `onBindError` receives it, and the run goes on unbound
 * (deliberately: a failed bind never fails the run). Every frontend tool call in that run then
 * fails with `@jini-ai/daemon`'s bare `no frontend is bound to run "…"`, which tells neither the
 * agent nor the owner what to do.
 *
 * Tovu-side, not in Jini: both messages are Jini's and accurate for what Jini knows; only the host
 * knows this is a tab that needs a reload. Matched on Jini's exact wording, pinned by
 * `__tests__/lost-frontend-binding.test.ts`.
 */
import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

export const LOST_FRONTEND_BINDING_MESSAGE =
  "The admin tab lost its connection to the assistant after a server restart, so it cannot run this tool. " +
  "Reload the admin page and try again.";

const UNKNOWN_TOKEN = /unknown or expired bind token/;
const NOT_BOUND = /^no frontend is bound to run /;

export interface LostFrontendBindings {
  /** Pass as `createFrontendControl`'s `onBindError` body. Records only unknown/expired-token failures. */
  noteBindError(context: { runId: string; error: unknown }): void;
  /** Wraps one frontend tool so a lost-binding run's "no frontend is bound" gets the reload message. */
  wrap(registration: ToolRegistration): ToolRegistration;
}

/**
 * @param options.maxRuns - How many runs to remember. Bounded instead of released on terminal: a
 * run id only matters while its run is live, so forgetting the oldest after this many lost binds
 * costs nothing, and it keeps this off the run lifecycle entirely.
 */
export function createLostFrontendBindings(options: { maxRuns?: number } = {}): LostFrontendBindings {
  const maxRuns = options.maxRuns ?? 256;
  const lostRuns = new Set<string>();

  return {
    noteBindError({ runId, error }) {
      if (!(error instanceof Error) || !UNKNOWN_TOKEN.test(error.message)) return;
      lostRuns.delete(runId);
      lostRuns.add(runId);
      if (lostRuns.size > maxRuns) lostRuns.delete(lostRuns.values().next().value as string);
    },
    wrap(registration) {
      return {
        ...registration,
        handler: async (ctx: ToolExecutionContext) => {
          try {
            return await registration.handler(ctx);
          } catch (err) {
            if (err instanceof Error && NOT_BOUND.test(err.message) && lostRuns.has(ctx.run.id)) {
              throw new Error(LOST_FRONTEND_BINDING_MESSAGE, { cause: err });
            }
            throw err;
          }
        },
      };
    },
  };
}
