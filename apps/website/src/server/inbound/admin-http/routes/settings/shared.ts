import { sendAdminFailure } from "#src/server/inbound/shared/admin-failure";
import type { Express, Response } from "express";
import { defineJsonRoute, mountJsonRoute } from "@jini-ai/http-kit";
import {
  ok,
  type HttpMethod,
  type JsonRouteAuthorize,
  type RouteInputContext,
} from "@jini-ai/core/contracts/server";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { touchesAssistantSubagents } from "./assistant-subagents-access.js";
import { ASSISTANT_PERMANENT_DELETES_WRITE_REASON } from "#src/contracts/headless/index";
import { ASSISTANT_SUBAGENTS_WRITE_REASON } from "@tovu/contracts/assistant-subagents-policy";

import {
  createSettingsPrincipalLookup, refuseCommentsProviderClear, refuseCommentsProviderReset, set, type SettingsWriteServiceDeps,
} from "#src/features/settings/index";
import {
  createCmsSettingsService,
  resolveUserLayerReadTarget as resolveCmsUserLayerReadTarget,
  type SettingsPermissions,
  type SettingsService,
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
 * Generic implementation and rationale: Jini packages/core/src/settings/express/cms-adapter.ts.
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

/** Only deliberate HTTP rejections carry caller-visible text; other errors use CMS mappings. */
class SettingsRequestError extends Error {
  constructor(readonly response: { status: number; body: unknown }) {
    super("settings request rejected");
  }
}

/** Reject with Tovu's flat JSON envelope, preserving absent code/details fields.
 * @returns Never; the injected adapter error port writes the response.
 * @complexity O(1) time/space.
 */
export function rejectSettingsRequest(required: {
  status: number; error: string; code?: string; details?: { permission: string; reason: string };
}, _optional: Record<string, never> = {}): never {
  const body: { error: string; code?: string; details?: { permission: string; reason: string } } = { error: required.error };
  if (required.code !== undefined) body.code = required.code;
  if (required.details !== undefined) body.details = required.details;
  throw new SettingsRequestError({ status: required.status, body });
}

/** Bind the JSON adapter to Tovu's ambient workspace, readiness/session and permission policy.
 * Field parsing remains in each handler: reads authorize first, while writes validate both fields
 * and body workspace first. Domain services retain their non-bypassable inner authorization.
 * Unknown failures keep the fixed CMS 500 envelope rather than disclosing exception messages.
 * @returns Void; registers exactly one endpoint, with no listener or background work.
 * @complexity O(1) setup; protected-coordinate checks follow touchesAssistantSubagents's bounded
 * alias/batch/reset lookup cost, plus host authorization and route effects.
 */
export function mountSettingsJsonRoute<Output>(required: {
  app: Express; deps: SettingsRouteDeps; method: HttpMethod; path: string;
  errorMappings?: readonly SettingsErrorMapping[];
  handle: (input: { request: RouteInputContext; principal: ReturnType<typeof getAuthedPrincipal>; authorize: JsonRouteAuthorize }) => Promise<Output>;
}, _optional: Record<string, never> = {}): void {
  const { app, deps, method, path, handle, errorMappings = [] } = required;
  const spec = defineJsonRoute<RouteInputContext, Output, SettingsRouteDeps, ReturnType<typeof getAuthedPrincipal>>({
    method, path,
    parse: (raw) => ok({ value: raw }),
    // These ports are always bound below; context and the authorizer are present on every call.
    handle: async ({ input, context, authorize }) => {
      // Code-owned visitor defaults must not be rewritten into an implicit enable through the
      // generic definition batch. Reuse the existing alias/batch fence before ANY item writes.
      if (method !== "get" && Array.isArray((input.body as { definitions?: unknown } | null)?.definitions)
        && await touchesAssistantSubagents({ body: input.body, repo: deps.settingsRepo, workspaceId: deps.workspaceId, namespaces: ["site.assistant"] })) {
        rejectSettingsRequest({ status: 400, code: "ASSISTANT_SETTINGS_VALIDATION_ERROR",
          error: "Visitor assistant definitions are code-owned. Save a usable provider key and a model, then enable the assistant in AI Assistant." });
      }
      if (method !== "get" && await touchesAssistantSubagents({ body: input.body, repo: deps.settingsRepo, workspaceId: deps.workspaceId })) {
        rejectSettingsRequest({ status: 403, code: "FORBIDDEN", error: ASSISTANT_SUBAGENTS_WRITE_REASON + " " + ASSISTANT_PERMANENT_DELETES_WRITE_REASON });
      }
      if (!context) throw new Error("settings route has no authenticated principal");
      if (!authorize) throw new Error("settings route has no authorizer");
      return ok({ value: await handle({ request: input, principal: context, authorize }) });
    },
  }, { ports: {
    workspace: ({ raw, deps }) => {
      if (String(raw.params.workspaceId ?? "") !== deps.workspaceId) {
        rejectSettingsRequest({ status: 404, error: "workspace was not found" });
      }
    },
    authenticate: async ({ res, deps }) => { await deps.settingsReady; return getAuthedPrincipal(res); },
    authorize: async ({ context, deps, permission, entityType }) => {
      const principal = context;
      if (!principal) throw new Error("settings authorization has no authenticated principal");
      const result = await deps.authorize({ principalId: principal.id, permission, workspaceId: deps.workspaceId, entityType });
      if (!result.allowed) rejectSettingsRequest({
        status: 403, error: `principal '${principal.id}' is not authorized for '${permission}' (${result.reason})`,
        code: "FORBIDDEN", details: { permission, reason: result.reason },
      });
    },
    onError: ({ res, error }) => {
      if (error instanceof SettingsRequestError) { res.status(error.response.status).json(error.response.body); return; }
      respondToSettingsError({ res, err: error, mappings: errorMappings });
    },
  } });
  mountJsonRoute({ app, spec, deps });
}
