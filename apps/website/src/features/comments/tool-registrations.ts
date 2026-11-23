import { toolMetadata } from '../../contracts/core/tool-metadata/comments.js';
/**
 * @file Comments' half of ADR-049 Decision 4 (ADR-031/SPEC-033/SPEC-035), the host binding: the
 * catalog, the ten handlers, the authored risk map and the typed-error mapping live in
 * `@jini-ai/cms/comments` (`buildCommentsToolRegistrations`). This file supplies what is Tovu's: the
 * settings ledger operations and its refusal class, the approval wrapper and the unexpected-key
 * refusal, the search vocabulary and approval policy (`toolMetadata`), and the default surface store.
 */
import { withToolMetadata, type ToolContributor, type ToolRegistration } from "@jini-ai/core";
import { type AuthorizeFn } from "@jini-ai/core/contracts/events";
import { contentReadVocabulary } from "../../contracts/core/tool-metadata/content-read.js";
import { buildCommentsToolRegistrations, commentsDerivedRisk, type CommentRepoPort, type CommentsPackageToolDeps, type CommentWriteService } from "@jini-ai/cms/comments";
import type { CommentsProviderRegistry } from '@jini-ai/capability-providers/comments';
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { createRandomUuidGenerator, createSystemClock } from "@jini-ai/platform/system";
import type { PrincipalRepoPort } from "@jini-ai/user-management";
import { approvalToolHandler, refuseUnexpectedKeys } from '#src/contracts/core/human-confirm';
import { ForbiddenError as SettingsForbiddenError, type SettingsRepoPort } from "../settings/index.js";
import { getCommentsSettings, setCommentsSettings } from "./settings.js";

/**
 * The exact slice of the route-deps bag Comments' tool handlers read. Declared structurally
 * (rather than importing `server/routes/types`'s `RouteDeps`) so this module carries no back-edge
 * into the composition root. `server/routes/*` satisfies this structurally by passing its existing
 * `RouteDeps` object; nothing there changes.
 */
export interface CommentsToolDeps {
  commentsProviders?: CommentsProviderRegistry;
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: { nowIso(): string };
  idGen: { newId(): string };
  commentsReady: Promise<void>;
  commentsSettingsReady: Promise<void>;
  commentRepo: CommentRepoPort;
  commentWriteService: CommentWriteService;
  settingsRepo: SettingsRepoPort;
  principalRepo: PrincipalRepoPort;
}

/**
 * The route deps as the package-side ports. Every field reads the route deps at call time (a getter,
 * not a copy) because the route deps bag is mutable: a caller that swaps `authorize` or the provider
 * registry after the registrations were built is seen by the next tool call, as it was before the
 * handlers took ports.
 */
function toPackageDeps({ routeDeps }: { routeDeps: CommentsToolDeps }, _optional = {}): CommentsPackageToolDeps {
  return {
    get commentsProviders() { return routeDeps.commentsProviders; },
    get authorize() { return routeDeps.authorize; },
    get workspaceId() { return routeDeps.workspaceId; },
    get commentsReady() { return routeDeps.commentsReady; },
    get commentsSettingsReady() { return routeDeps.commentsSettingsReady; },
    get commentRepo() { return routeDeps.commentRepo; },
    get commentWriteService() { return routeDeps.commentWriteService; },
    commentsSettings: {
      get: (input) => getCommentsSettings({ settingsRepo: routeDeps.settingsRepo }, input),
      // No explicit pre-check here, unlike every other Comments handler: `setCommentsSettings`
      // (settings.ts) self-enforces internally — its `set()` call is invoked with
      // `requiredPermissionOverride: 'comments.configure'` HARD-CODED inside settings.ts itself, so
      // passing `authorize: routeDeps.authorize` through is exactly ADR-021 §2's "one evaluator",
      // reached the domain-function way Forms/Identity use, not the explicit-handler way the rest
      // of this file uses. See settings.ts's own comment on that override for why.
      set: (input) => setCommentsSettings(
        { settingsRepo: routeDeps.settingsRepo, clock: routeDeps.clock, ids: routeDeps.idGen, authorize: routeDeps.authorize, principals: routeDeps.principalRepo },
        input,
      ),
    },
    settingsForbiddenError: SettingsForbiddenError,
    approvalHandler: approvalToolHandler,
    refuseUnexpectedKeys,
  };
}

export function buildCommentsRegistrations(
  routeDeps: CommentsToolDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
): ToolRegistration[] {
  return withToolMetadata({ registrations: buildCommentsToolRegistrations({ deps: toPackageDeps({ routeDeps }), surfaces }, { hostReads: contentReadVocabulary }), metadata: toolMetadata });
}

/**
 * Contributes Comments' AI tools to the assistant's catalog — called once by
 * `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildCommentsRegistrations`/
 * `commentsDerivedRisk` by name; this is the seam that replaced it (2026-08-17 — see
 * `tool-contribution-registry.ts`'s header for why: this edge used to close a module cycle with
 * `assistant`, and a one-directional `comments -> assistant` registration call does not).
 */
export function contributeCommentsTools(): ToolContributor<CommentsToolDeps, AssistantSurfaceDeps> {
  return { domain: "comments", build: buildCommentsRegistrations, risk: commentsDerivedRisk };
}
