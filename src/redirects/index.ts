/**
 * @file Public barrel for the `redirects` Tier-2 library (SPEC-009).
 * Mirrors `routing`/`origin`'s barrel shape. `ports.internal.ts` is
 * deliberately NOT re-exported — it is package-private to `redirects.ts`/
 * `capture.ts` (INV-07, ADR-PIPE-009 Migration Safety).
 */
export type {
  ListRedirectsFilter,
  RedirectHitStats,
  RedirectMatchType,
  RedirectRecord,
  RedirectRequest,
  RedirectResolution,
  RedirectResolvePhase,
  RedirectRevision,
  RedirectSource,
  RedirectStatus,
  RedirectStatusCode,
  CreateRedirectInput,
  UpdateRedirectInput,
} from "./types";
export {
  RedirectConflictError,
  RedirectLoopError,
  RedirectNotFoundError,
  RedirectTargetNotAllowedError,
  RedirectValidationError,
} from "./types";

export type {
  RedirectHitEvent,
  RedirectHitEventPayload,
  RedirectMatcher,
  RedirectMutatedEvent,
  RedirectMutatedEventPayload,
  RedirectRepoPort,
  RedirectResolveHook,
  RedirectResolveHookContext,
  RedirectResolver,
  RedirectHitSink,
} from "./ports";

export { redirectMatcher, match, validatePattern } from "./matcher";

export { InMemoryRedirectRepo } from "./repo.memory";
export { SqliteRedirectRepo } from "./repo.sqlite";

export { RedirectSlugChangeCapture } from "./capture";
export type { RedirectSlugChangeCaptureDeps, RedirectSlugChangeCaptureReadDeps } from "./capture";

export {
  RedirectPhaseHandlerResolver,
  registerRedirectsPhaseHandlers,
} from "./phase-handler";
export type { RedirectPhaseHandlerDeps, RegisterRedirectsPhaseHandlersDeps } from "./phase-handler";

export { RedirectHitSinkImpl, registerRedirectHitOutboxHandler } from "./hit-sink";
export type { RegisterRedirectHitOutboxHandlerDeps } from "./hit-sink";

export {
  createRedirect,
  importRedirects,
  tombstoneRedirect,
  updateRedirect,
} from "./redirects";
export type {
  CreateRedirectRequired,
  ImportRedirectsFailure,
  ImportRedirectsRequired,
  RedirectsWriteDeps,
  TombstoneRedirectRequired,
  UpdateRedirectRequired,
} from "./redirects";
