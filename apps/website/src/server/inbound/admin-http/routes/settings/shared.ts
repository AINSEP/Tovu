import type { Express, Response } from "express";
import { defineJsonRoute, mountJsonRoute, ok, type HttpMethod, type JsonRouteAuthorize, type RouteInputContext } from "@jini-ai/http-kit";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";

import { createSettingsPrincipalLookup, set, type SettingScope, type SettingsWriteServiceDeps } from "#src/features/settings/index";
import {
  createCmsSettingsService,
  resolveTargetWorkspaceId as resolveCmsTargetWorkspaceId,
  resolveUserLayerReadTarget as resolveCmsUserLayerReadTarget,
  respondToSettingsError as respondToCmsSettingsError,
  type SettingsPermissions,
  type SettingsService,
  type TargetWorkspaceResolution,
  type UserLayerReadTarget,
  type SettingsErrorMapping,
} from "@jini-ai/core/settings/express";

export type { TargetWorkspaceResolution, UserLayerReadTarget, SettingsErrorMapping } from "@jini-ai/core/settings/express";
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
 * Decides which workspace a settings WRITE may target, from the request body.
 *
 * This exists because a body-supplied `workspaceId` was a cross-tenant write. All three mutation
 * routes authorize against the ambient `deps.workspaceId` (the `:workspaceId` path param, already
 * 404-checked against it at the top of each handler) while passing the BODY's `workspaceId` through
 * to `write-service` as the write target. Nothing required the two to match, so a principal holding
 * `settings.workspace.write` here could post `{"scope":"workspace","workspaceId":"<other>"}` and
 * have both authorize() calls pass against this workspace while `saveWorkspaceValue` wrote the
 * other tenant's row. `reset` was worse: one request wiped a whole namespace in another tenant.
 *
 * The rule is that there is nothing to decide — the target IS the ambient workspace. A body that
 * names a different one is rejected with 400 rather than ignored, so a mis-integrated caller fails
 * loudly instead of silently writing somewhere else than it asked for. A body that names THIS
 * workspace is accepted as redundant-but-consistent, since existing callers send it.
 *
 * `scope: "global"` returns `undefined`: there is no workspace concept in the platform partition,
 * and seeding one would be wrong for the reason `authWorkspaceId`'s own doc comment already gives.
 *
 * Lives here rather than in any one route so the three cannot drift apart again — copy-paste drift
 * between these files is what produced the gap. `write-service` re-asserts the same invariant as a
 * backstop for non-HTTP callers.
 *
 * @param deps - narrowed route deps; supplies the ambient authorized workspace.
 * @param required.bodyWorkspaceId - the request body's `workspaceId`, unvalidated.
 * @param required.scope - the write's target scope.
 * @returns the workspace id to write (`undefined` = global partition), or a 400 message.
 * @complexity O(1).
 */
export function resolveTargetWorkspaceId(
  deps: Pick<SettingsRouteDeps, "workspaceId">,
  required: { bodyWorkspaceId: unknown; scope: SettingScope }
): TargetWorkspaceResolution {
  return resolveCmsTargetWorkspaceId({ workspaceId: deps.workspaceId, input: required });
}

/**
 * Permission that gates reading *another* principal's user-layer value. Mirrors
 * `write-service.ts`'s existing `settings.user.self.write` vs `settings.user.write` split for
 * writes (`permissionFor`, lines ~80-83): touching your own user layer and touching someone
 * else's are deliberately separate grants — now with the matching read-side pair.
 *
 * Read is NOT implied by write here: this checks `settings.user.read` and nothing else, so the
 * permission model no longer conflates the two. Existing write-holders are not locked out —
 * `identity/permissions.ts` registers a one-time additive `settings.user.write -> settings.user.read`
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
export function respondToSettingsError(res: Response, err: unknown, mappings: readonly SettingsErrorMapping[]): void {
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
  return { ...service, set: (input) => set({ deps, input }) };
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
 * @complexity O(1) setup and guard work, plus host authorization and route effects.
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
    handle: async ({ input, context, authorize }) => ok({ value: await handle({ request: input, principal: context!, authorize: authorize! }) }),
  }, { ports: {
    workspace: ({ raw, deps }) => {
      if (String(raw.params.workspaceId ?? "") !== deps.workspaceId) {
        rejectSettingsRequest({ status: 404, error: "workspace was not found" });
      }
    },
    authenticate: async ({ res, deps }) => { await deps.settingsReady; return getAuthedPrincipal(res); },
    authorize: async ({ context, deps, permission, entityType }) => {
      const principal = context!;
      const result = await deps.authorize({ principalId: principal.id, permission, workspaceId: deps.workspaceId, entityType });
      if (!result.allowed) rejectSettingsRequest({
        status: 403, error: `principal '${principal.id}' is not authorized for '${permission}' (${result.reason})`,
        code: "FORBIDDEN", details: { permission, reason: result.reason },
      });
    },
    onError: ({ res, error }) => {
      if (error instanceof SettingsRequestError) { res.status(error.response.status).json(error.response.body); return; }
      respondToSettingsError(res, error, errorMappings);
    },
  } });
  mountJsonRoute({ app, spec, deps });
}
