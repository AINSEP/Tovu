import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import type { Response } from "express";
import { touchesProtectedNamespaces } from "@jini-ai/cms/admin-http/routes/settings/protected-namespaces";
import type { SettingsWriteFence } from "@jini-ai/cms/admin-http/routes/settings/shared";
import { ASSISTANT_PERMANENT_DELETES_NAMESPACE, ASSISTANT_PERMANENT_DELETES_WRITE_REASON } from "#src/contracts/headless/index";
import { ASSISTANT_SUBAGENTS_NAMESPACE, ASSISTANT_SUBAGENTS_WRITE_REASON } from "@tovu/contracts/assistant-subagents-policy";

import {
  createSettingsPrincipalLookup, refuseCommentsProviderClear, refuseCommentsProviderReset, set, type SettingsWriteServiceDeps,
} from "#src/features/settings/index";
import {
  createCmsSettingsService,
  resolveUserLayerReadTarget as resolveCmsUserLayerReadTarget,
  type SettingsPermissions,
  type SettingsService,
  type SettingsRepoPort,
  type UserLayerReadTarget,
} from "@jini-ai/core/settings";
import { respondToSettingsError as respondToCmsSettingsError, type SettingsErrorMapping } from "@jini-ai/http-kit/settings";

import type { SettingsRouteDeps } from "./deps.js";

/**
 * @file Shared plumbing for the `settings` admin route registrars
 * (SPEC-007 Phase 5).
 *
 * Purpose:
 * `write-service.ts` declares its own smaller `SettingsWriteServiceDeps`
 * shape (`repo`/`clock`/`ids`/`authorize`/`principals`) rather than reusing
 * `RouteDeps` directly (see that file's header) — this adapter maps the
 * flat `RouteDeps` fields onto it once so every settings route file doesn't
 * repeat the same five-field object literal.
 *
 * Retyped from `RouteDeps` to `SettingsRouteDeps` (ADR-046 Phase 3, SPEC-040) — a pure narrowing,
 * since this function already only ever reads fields the new narrow type includes; see
 * `deps.ts`'s file header for the confirmed field set.
 */
export function toWriteServiceDeps(deps: SettingsRouteDeps): SettingsWriteServiceDeps {
  return {
    repo: deps.settingsRepo,
    clock: { nowMs: () => Date.parse(deps.clock.nowIso()) },
    ids: deps.idGen,
    authorize: deps.authorize,
    principals: createSettingsPrincipalLookup({ repo: deps.principalRepo }),
  };
}

/**
 * Permission that gates reading *another* principal's user-layer value. Mirrors
 * `write-service.ts`'s existing `settings.user.self.write` vs `settings.user.write` split for
 * writes (`permissionFor`, lines ~80-83): touching your own user layer and touching someone
 * else's are deliberately separate grants — now with the matching read-side pair.
 *
 * Read is NOT implied by write here: this checks `settings.user.read` and nothing else, so the
 * permission model no longer conflates the two. Existing write-holders are not locked out —
 * `Jini packages/user-management/src/core/builtin-permissions.ts` registers a one-time additive `settings.user.write -> settings.user.read`
 * grant fan-out for that, which is where the compatibility concern belongs (grant data), not here
 * (the authorization check).
 */
export const CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION = "settings.user.read";

/**
 * Decides which principal's user layer a settings read may target.
 *
 * Both read routes (`get-raw.ts`, `get-effective.ts`) authorize their own read permission against
 * the *caller's* principal, which says nothing about whether the caller may see a *different*
 * principal's data. A request naming someone else must therefore clear a second, explicit
 * `authorize()` check before the read proceeds (ADR-021: `authorize()` is the only evaluator).
 * Lives here rather than in either route so the two cannot drift apart again — the copy-paste
 * drift between them is what produced this gap in the first place.
 *
 * @param deps - narrowed route deps; supplies the evaluator and the authorized workspace.
 * @param required.requestedPrincipalId - the request's `principalId` query param, if any.
 * @param required.callerPrincipalId - the session-derived principal `authorize()` was checked for.
 * @returns `allowed` with the principal id to read (`undefined` = skip the user layer entirely),
 *   or `allowed: false` with `authorize()`'s machine-readable denial reason.
 * @complexity O(1); performs at most one `authorize()` call (none for a self-read or no-op read).
 * @overallScore 100
 */
export async function resolveUserLayerReadTarget(
  deps: Pick<SettingsRouteDeps, "authorize" | "workspaceId">,
  required: { requestedPrincipalId: string | undefined; callerPrincipalId: string }
): Promise<UserLayerReadTarget> {
  return resolveCmsUserLayerReadTarget({
    deps: { workspaceId: deps.workspaceId, authorize: deps.authorize, permission: CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION },
    input: required,
  });
}

/**
 * Writes the first matching mapping's status/code, or a generic 500 if none match. Replaces the
 * `set.ts`/`clear.ts`/`register-definitions.ts` catch blocks' repeated `if (err instanceof X) {...}`
 * chains — same shape three times, differing only in which error classes and codes each route owns.
 *
 * @complexity O(n) in the mapping table length, which is a small fixed list per caller.
 *
 * One entry in a settings route's `catch` block: which thrown error class maps to which HTTP
 * status/code pair. `matches` stays a plain predicate rather than a type-guard — every error class
 * these routes throw is a bare `class XError extends Error {}` with no fields beyond `message`, so
 * narrowing buys nothing here.
 */
export function respondToSettingsError({ res, err, mappings }: { res: Response; err: unknown; mappings: readonly SettingsErrorMapping[] }, _optional = {}): void {
  if (!mappings.some(mapping => mapping.matches(err))) {
    sendAdminFailure({ res, error: err }, { operation: "routes/settings", message: "The settings request could not finish." });
    return;
  }
  respondToCmsSettingsError({ response: res, error: err, mappings });
}

/**
 * Tovu's protected settings namespaces (host policy injected into every Jini settings write spec as
 * `writeFence`). The owner-only grants (Full CLI subagents, permanent deletes) have their own
 * acknowledgment endpoints, so a generic write answers 403 with both reasons. The visitor assistant
 * definitions are code-owned: a definition batch must not rewrite their false default into an
 * implicit enable, so it answers 400 with the steps that do enable it.
 */
export const SETTINGS_WRITE_FENCE: SettingsWriteFence = {
  protected: {
    namespaces: [ASSISTANT_SUBAGENTS_NAMESPACE, ASSISTANT_PERMANENT_DELETES_NAMESPACE],
    error: ASSISTANT_SUBAGENTS_WRITE_REASON + " " + ASSISTANT_PERMANENT_DELETES_WRITE_REASON,
  },
  codeOwned: {
    namespaces: ["site.assistant"], code: "ASSISTANT_SETTINGS_VALIDATION_ERROR",
    error: "Visitor assistant definitions are code-owned. Save a usable provider key and a model, then enable the assistant in AI Assistant.",
  },
};

/** Generic settings mutations cannot bypass the dedicated owner/acknowledgment endpoints: whether a
 * body reaches one of Tovu's owner-only namespaces (by name, rename, alias or reset; the resolution
 * itself is `@jini-ai/cms` `touchesProtectedNamespaces`). `namespaces` narrows or widens the check.
 * @complexity As `touchesProtectedNamespaces`. No writes.
 */
export function touchesAssistantSubagents(required: {
  body: unknown; repo: SettingsRepoPort; workspaceId: string; namespaces?: readonly string[];
}, _optional: Record<string, never> = {}): Promise<boolean> {
  return touchesProtectedNamespaces({ ...required, namespaces: required.namespaces ?? SETTINGS_WRITE_FENCE.protected.namespaces });
}

/** Tovu permission ids remain host policy; CMS owns scope-to-permission translation. */
const SETTINGS_PERMISSIONS: SettingsPermissions = {
  read: "settings.read",
  readRaw: "settings.read.raw",
  readDefinitions: "settings.read.definitions",
  readOtherUser: CROSS_PRINCIPAL_SETTINGS_READ_PERMISSION,
  manageDefinitions: "settings.definitions.manage",
  writeGlobal: "settings.global.write",
  writeWorkspace: "settings.workspace.write",
  writeUserSelf: "settings.user.self.write",
  writeUserOther: "settings.user.write",
  reset: { global: "settings.reset.global", workspace: "settings.reset.workspace", user: "settings.reset.user" },
};

/** Bind the CMS service to host ports and SPEC-050 REQ-08 title bounds.
 * Generic implementation and rationale: Jini packages/core/src/settings/cms-adapter.ts.
 * Route authentication/error envelopes remain host policy. The title wrapper shares these exact
 * deps so a rejected title never reaches the ledger, while other settings keep CMS behavior.
 * @complexity O(1) construction, plus each delegated CMS operation's repository work.
 */
export function createTovuSettingsService(required: { deps: SettingsRouteDeps }): SettingsService {
  const deps = toWriteServiceDeps(required.deps);
  const service = createCmsSettingsService({ deps, permissions: SETTINGS_PERMISSIONS });
  // Mail provider readiness is cached (mail-status-cache.ts); any core.mail write must drop it so a
  // cleared provider stops accepting sign-ins at once. A reset can commit earlier clears before a
  // later failure, so invalidation runs on settlement either way.
  const afterWrite = async <T>({ input, write }: { input: { namespace: string }; write: () => Promise<T> }, _optional = {}): Promise<T> => {
    try { return await write(); } finally {
      if (input.namespace === "core.mail") required.deps.mailProviderControl?.invalidate?.();
    }
  };
  // Clear and reset keep the CMS service's own authorization; the comments provider is refused first
  // because restoring its default re-enables comments behind `comments_set_provider`'s card.
  return { ...service,
    set: input => afterWrite({ input, write: () => (required.deps.set ?? set)({ deps, input }) }),
    clear: input => afterWrite({ input, write: async () => { await refuseCommentsProviderClear({ repo: deps.repo, input }); return service.clear(input); } }),
    reset: input => afterWrite({ input, write: async () => { await refuseCommentsProviderReset({ repo: deps.repo, input }); return service.reset(input); } }),
  };
}
