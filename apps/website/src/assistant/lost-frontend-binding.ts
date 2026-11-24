/**
 * @file Tovu's admin-tab wording for `@jini-ai/daemon/http`'s `createLostFrontendBindings`, which
 * turns "no frontend is bound" into "reload the admin tab" for a run whose tab bound with a token
 * the daemon no longer knows (the daemon's in-memory frontend-session registry forgot it across an
 * API restart — tsx watch in dev, a crash or deploy in production).
 *
 * The mechanics (recording unknown/expired-token bind errors, matching the daemon's exact
 * "no frontend is bound" / "detached before answering" wording, `FrontendDisconnectedError`) live
 * in Jini. Only the host knows its frontend is the admin tab and which server-side tool replaces
 * an admin action, so only that copy stays here; `agent-daemon-scope-tools.ts` injects it.
 */
import type { LostFrontendBindingMessages } from "@jini-ai/daemon/http";

export const LOST_FRONTEND_BINDING_MESSAGE =
  "The admin tab lost its connection to the assistant after a server restart, so it cannot run this tool. " +
  "Reload the admin page and try again.";

/** The admin tab is simply gone for this run (closed, reloaded, its stream dropped) — not the
 *  restart case. Recoverable, so the copy tells the agent to ask for the tab and retry, or to use
 *  the server-side tool for the same action, instead of reporting a dead end. */
const UNBOUND_DETAIL =
  "no admin tab is connected to this run, so this tool could not run and nothing was changed. " +
  "Ask the user to open or reload the admin page, then retry once it reconnects; or use the server-side tool for the same " +
  "action if one exists (e.g. publish_content_publish instead of admin.publish_content).";
const DETACHED_DETAIL =
  "the admin tab disconnected before answering, so this tool's outcome is unknown. " +
  "Ask the user to reload the admin page, check whether the action happened, and retry only if it did not.";

/** Injected as `createLostFrontendBindings({ messages })`. */
export const ADMIN_TAB_LOST_FRONTEND_MESSAGES: LostFrontendBindingMessages = {
  lostBinding: LOST_FRONTEND_BINDING_MESSAGE,
  unboundDetail: UNBOUND_DETAIL,
  detachedDetail: DETACHED_DETAIL,
};
