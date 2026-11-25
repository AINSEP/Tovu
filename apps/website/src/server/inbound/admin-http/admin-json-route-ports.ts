import type { Express, Response } from "express";
import { mountJsonRoute, type JsonRoutePorts, type JsonRouteSpec } from "@jini-ai/http-kit";
import { isSameOriginBrowserWrite, type JsonRouteAuthorizeScope, type RouteHostContext, type RouteInputContext, type ServerApiError } from "@jini-ai/core/contracts/server";
import { RouteRefusalError, rejectRoute } from "@jini-ai/core/errors/route-refusal";

import type { RouteDeps } from "#src/server/routes/types";
import { asyncRoute, type AsyncRouteHandler } from "#src/platform/express/async-route";
import { adminFailureResponse, reportServerFailure, sendAdminFailure, type FailureOptions } from "#src/server/inbound/shared/admin-failure";
import { getAuthedPrincipal, type OperatorPrincipalRecord } from "./dev-auth.js";
import { recordAdminRequestFacts, refuseUnlessSessionCredential, routeRequestFactsFor, type SessionCredentialGate } from "./admin-request-facts.js";
import { getPublishTrustContext, publishTrustAuthorizeFor } from "./publish-trust-auth.js";

/**
 * @file The host ports every Jini route spec mounts through (RT-K1-0.T). Jini specs are
 * server-framework neutral and answer in core shapes; these ports keep Tovu's wire contract: the
 * mount-path 404, the session principal, the RBAC/publish-credential 403 and the redacted 500 all
 * come from the same helpers the hand-written routes call, so a route moved to Jini answers
 * byte-for-byte as before. Composition only: nothing here is generic enough to leave Tovu.
 */

/** The only `RouteDeps` fields the ports read; a mount passes these plus its route's own deps. */
export interface AdminJsonRoutePortDeps { workspaceId: string; authorize: RouteDeps["authorize"] }

// A publishing credential authorizes from its grant's closed capability set, never from RBAC
// (`authorize-guard.ts`). The authorize port has no `res`, so the decision is resolved when the
// principal is read and keyed on that request's own principal copy — never shared across requests.
const publishTrustByContext = new WeakMap<OperatorPrincipalRecord, ReturnType<typeof publishTrustAuthorizeFor>>();

/** A refusal keeps its flat `{ error, code?, details? }` body; returned core failures use the same flat shape.
 * @complexity O(1).
 */
function writeRefusal({ res, error }: { res: Response; error: RouteRefusalError }, _optional: Record<string, never> = {}): void {
  res.status(error.response.status).json(error.response.body);
}

/** Returned parse/handler failures answer like thrown refusals: `{ error: <message>, code, details? }`.
 * Statuses follow core's code table, so a route that needs another status throws `rejectRoute` instead.
 * @complexity O(1).
 */
function writeReturnedFailure({ res, error, status }: { res: Response; error: ServerApiError; status: number }, _optional: Record<string, never> = {}): void {
  res.status(status).json({ error: error.message, code: error.code, ...(error.details === undefined ? {} : { details: error.details }) });
}

/** `"guarded"` is `authorizeOrRespond` (a publishing credential answers from its grant);
 * `"direct"` is `authorizeDirectOrRespond`, for routes that never consulted that override —
 * switching them is an authorization change for the owner, not part of a move. */
export type AdminRouteAuthorization = "guarded" | "direct";

/** Per-mount port choices. Every field defaults to the behaviour the hand-written routes had. */
export interface AdminJsonRouteMountOptions {
  /** Per-route `sendAdminFailure` options (operation, status…). */
  failure?: FailureOptions;
  /** The mount-wide decision source; absent means `"guarded"`. */
  authorization?: AdminRouteAuthorization;
  /** Per-permission exceptions to {@link AdminJsonRouteMountOptions.authorization}, keyed by the
   *  permission a spec asks for. A route whose hand-written version answered two checks from two
   *  sources (Menus update-tree: `admin.menus.update` direct, the raw-HTML permission guarded) keeps
   *  both decisions this way instead of forcing one mode on every check. */
  authorizationByPermission?: Readonly<Record<string, AdminRouteAuthorization>>;
  /** Opt-in: a request with no session principal reaches `parse` instead of failing in
   *  `authenticate`. Refused together with {@link AdminJsonRouteMountOptions.sessionCredentialOnly}. Only for routes whose hand-written version refused a bad body BEFORE reading the
   *  principal (so that 400 still wins); the spec must call `authorize` before any side effect,
   *  because that is where the missing principal then fails closed. */
  deferMissingPrincipal?: boolean;
  /** Opt-in: register the handler through `asyncRoute` (named `forwardRejection`), as the
   *  hand-written route was. A rejection that escapes the spec adapter (its own error answer
   *  failing) then reaches `next(error)` and the app's error middleware instead of leaving the
   *  request open; the route-table pin sees the same registration as before the move. */
  forwardRejection?: boolean;
  /** Refuse every credential but a session with `rejectUnlessSessionCredential`'s exact 403, in
   *  `authenticate` — after the workspace 404, before parse, authorization or any side effect.
   *  Not combinable with {@link AdminJsonRouteMountOptions.deferMissingPrincipal} (refused at registration):
   *  a deferred missing principal would skip this gate, and gating first would throw on the missing
   *  credential kind and defeat the deferral. No hand-written route needed both. */
  sessionCredentialOnly?: SessionCredentialGate;
  /** The route's own denial reply (media where-used/import-url), instead of `authorizeOrRespond`'s
   *  403 body. Given the decision that was denied; whatever it answers is written as-is. */
  forbidden?: (args: AdminForbiddenArgs) => { status: number; body: unknown };
  /** Per-error failure options (agent-plugins memory: a Node system error has its own operation and
   *  copy); `undefined` keeps {@link AdminJsonRouteMountOptions.failure}. */
  failureFor?: (error: unknown) => FailureOptions | undefined;
  /** `"route"` (default) is `sendAdminFailure`'s method/route-derived copy; `"operation"` is the
   *  operation-only `adminFailureResponse` body the presentation PATCH writes. */
  failureCopy?: "route" | "operation";
  /** Opt-in (w4-routes K): run the workspace refusal INSIDE `authenticate`, after the credential-kind
   *  gate and a deferred missing session, instead of ahead of them — the hand-written order of routes
   *  that called `rejectUnlessSessionCredential` / checked `res.locals.principal` before
   *  `rejectForeignWorkspace` (credential-copy, widget preview). With
   *  {@link AdminJsonRouteMountOptions.deferMissingPrincipal}, a missing session skips the workspace
   *  check and reaches the spec, which must answer its own refusal first (preview's 401). The principal
   *  read still follows the workspace check, as credential-copy's `admitted` did. Refused at
   *  registration on a `requireSameOrigin` spec: http-kit's same-origin gate sits between the workspace
   *  and authenticate ports, so moving the workspace check would silently reorder it too. */
  authenticateBeforeWorkspace?: boolean;
  /** Opt-in (w4-routes K): the route's own legacy workspace refusal instead of the shared
   *  `{ error: "workspace was not found" }` 404. A reply without `body` is `res.sendStatus(status)`
   *  (Express's status text as `text/plain`, site-backups); with `body`, `res.status(status).json(body)`
   *  (the `{ code: "NOT_FOUND", message }` routes). Given the mounted and the requested workspace ids. */
  workspaceRefusal?: (args: AdminWorkspaceRefusalArgs) => AdminWorkspaceRefusalReply;
  /** Opt-in (w4-routes P): a check answered FIRST — in the workspace port, ahead of the workspace 404,
   *  the credential-kind gate and `authenticateBeforeWorkspace`'s order — for a hand-written route that
   *  refused before any of them (the admin-surface writes' own cross-origin 403). It sees only the
   *  request headers it declares (added to the spec's `readHeaders`, so the spec's `raw.headers` also
   *  carries them); a returned reply is written as-is, `undefined` admits the request. */
  preflight?: AdminMountPreflight;
}

/** What a {@link AdminMountPreflight.check} is given: its declared headers (lower-cased keys, an absent
 *  header has no key) and the mount's port deps. */
export interface AdminPreflightArgs { headers: Readonly<Record<string, string>>; deps: AdminJsonRoutePortDeps }

/** A mount-level check evaluated before every other admin gate ({@link AdminJsonRouteMountOptions.preflight}). */
export interface AdminMountPreflight {
  /** The only request headers the check reads (readHeaders-style). */
  readonly readHeaders: readonly string[];
  readonly check: (args: AdminPreflightArgs) => { status: number; body: unknown } | undefined;
}

/** Runs the mount's preflight on its declared headers; a reply is thrown as a refusal `onError` writes as-is.
 * @complexity O(h) in the declared header count. */
function runPreflight(
  { raw, deps, preflight }: { raw: RouteInputContext; deps: AdminJsonRoutePortDeps; preflight: AdminMountPreflight },
  _optional: Record<string, never> = {},
): void {
  const headers: Record<string, string> = {};
  for (const name of preflight.readHeaders) {
    const key = name.toLowerCase();
    const value = raw.headers?.[key];
    if (value !== undefined) headers[key] = value;
  }
  const reply = preflight.check({ headers, deps });
  if (reply) throw new RouteRefusalError(reply);
}

/** The spec's `readHeaders` plus the preflight's, so the adapter hands them over; nothing without a preflight.
 * Shared by `mountAdminJsonRoute` and `admin-raw-route-ports.ts`'s `mountAdminRawRoute`.
 * @complexity O(h). */
export function preflightReadHeaders(
  { spec, preflight }: { spec: { readHeaders?: readonly string[] }; preflight: AdminMountPreflight | undefined },
  _optional: Record<string, never> = {},
): { readHeaders?: readonly string[] } {
  if (!preflight) return {};
  return { readHeaders: [...new Set([...(spec.readHeaders ?? []), ...preflight.readHeaders.map((name) => name.toLowerCase())])] };
}

/** What a {@link AdminJsonRouteMountOptions.workspaceRefusal} override is given. */
export interface AdminWorkspaceRefusalArgs { workspaceId: string; requested: string }

/** A legacy workspace refusal: no `body` is `sendStatus`'s text reply, a `body` is written as JSON. */
export interface AdminWorkspaceRefusalReply { status: number; body?: unknown }

/** Thrown by the workspace check when the mount overrides the refusal; written by `onError` as-is. */
class AdminWorkspaceRefusal extends Error {
  constructor(readonly reply: AdminWorkspaceRefusalReply) { super("workspace was not found"); }
}

/** The workspace refusal (`rejectForeignWorkspace`'s rule, including its `?? ""` fallback): the
 *  shared 404, or the mount's legacy {@link AdminJsonRouteMountOptions.workspaceRefusal}.
 * @complexity O(1). */
function refuseForeignWorkspace(
  { raw, deps, options }: { raw: RouteInputContext; deps: AdminJsonRoutePortDeps; options: AdminJsonRouteMountOptions },
  _optional: Record<string, never> = {},
): void {
  const requested = String(raw.params.workspaceId ?? "");
  if (requested === deps.workspaceId) return;
  if (options.workspaceRefusal) throw new AdminWorkspaceRefusal(options.workspaceRefusal({ workspaceId: deps.workspaceId, requested }));
  rejectRoute({ status: 404, error: "workspace was not found" });
}

/** Writes a legacy workspace refusal exactly as the hand-written route did. @complexity O(1). */
function writeWorkspaceRefusal({ res, reply }: { res: Response; reply: AdminWorkspaceRefusalReply }, _optional: Record<string, never> = {}): void {
  if (reply.body === undefined) { res.sendStatus(reply.status); return; }
  res.status(reply.status).json(reply.body);
}

/** The denied decision a {@link AdminJsonRouteMountOptions.forbidden} override answers. */
export interface AdminForbiddenArgs { principalId: string; permission: string; entityType?: string; entityId?: string; reason: string }

/** The mode one permission is answered by: its override, else the mount default (`"guarded"`).
 * @complexity O(1). */
function authorizationFor({ options, permission }: { options: AdminJsonRouteMountOptions; permission: string }, _optional: Record<string, never> = {}): AdminRouteAuthorization {
  const overrides = options.authorizationByPermission;
  const override = overrides && Object.hasOwn(overrides, permission) ? overrides[permission] : undefined;
  return override ?? options.authorization ?? "guarded";
}

/** Whether any check on this mount may answer from a publishing grant, so `authenticate` must read it.
 * @complexity O(k) in the override count. */
function mountMayUseGrant({ options }: { options: AdminJsonRouteMountOptions }, _optional: Record<string, never> = {}): boolean {
  if (options.authorization !== "direct") return true;
  return Object.values(options.authorizationByPermission ?? {}).includes("guarded");
}

type AdminPorts = JsonRoutePorts<AdminJsonRoutePortDeps, OperatorPrincipalRecord>;

/** The host `authorize` port. A by-id route names its entity (`entityId`), as the hand-written routes
 * passed it to `deps.authorize`; an id-free route (list, import) sends no `entityId` key, and a
 * type-free check (users list-roles) no `entityType` key — the hand-written calls pinned exactly that.
 * @complexity O(1) plus the injected authorizer.
 */
async function authorizeWithPorts(
  { args, scope, options }: { args: Parameters<NonNullable<AdminPorts["authorize"]>>[0]; scope: JsonRouteAuthorizeScope; options: AdminJsonRouteMountOptions },
  _optional: Record<string, never> = {},
): Promise<void> {
  const { context, deps, permission } = args;
  // Read off the args object (not destructured with a type) so this compiles whether the adapter's
  // `entityType` is required or optional; the key is forwarded only when the spec named one.
  const entityType: string | undefined = args.entityType;
  if (!context) throw new Error("getAuthedPrincipal: no principal on res.locals — requireAdminSession must run before this route");
  // Per permission: a `"direct"` check never consults the grant even when another check on
  // this mount does (Menus update-tree asks one of each).
  const grant = authorizationFor({ options, permission }) === "guarded" ? publishTrustByContext.get(context) : undefined;
  const authorize = grant ?? deps.authorize;
  const entity = { ...(entityType === undefined ? {} : { entityType }), ...(scope.entityId === undefined ? {} : { entityId: scope.entityId }) };
  const result = await authorize({ principalId: context.id, permission, workspaceId: deps.workspaceId, ...entity });
  if (result.allowed) return;
  if (options.forbidden) throw new RouteRefusalError(options.forbidden({ principalId: context.id, permission, ...entity, reason: result.reason }));
  // Same 403 body `authorizeOrRespond` writes (authorize-guard.ts `writeForbidden`).
  rejectRoute({
    status: 403, error: `principal '${context.id}' is not authorized for '${permission}' (${result.reason})`,
    code: "FORBIDDEN", details: { permission, reason: result.reason },
  });
}

/** An unexpected failure: the per-error options if `failureFor` claims it, else the mount's; written
 * with `sendAdminFailure`'s route-derived copy, or — `failureCopy: "operation"` — exactly as the
 * presentation PATCH writes `adminFailureResponse` (operation-only copy, the request's tracker).
 * @complexity The shared failure lifecycle.
 */
function writeAdminFailure({ res, error, options }: { res: Response; error: unknown; options: AdminJsonRouteMountOptions }, _optional: Record<string, never> = {}): void {
  const failure = options.failureFor?.(error) ?? options.failure;
  if (options.failureCopy !== "operation") { sendAdminFailure({ res, error }, failure); return; }
  const { status, body } = adminFailureResponse({ error, tracker: res.locals?.adminFailureTracker }, failure);
  res.status(status).json(body);
}

/** Build the admin ports; `failure` carries the per-route `sendAdminFailure` options (operation, status…).
 * @throws At registration, for `deferMissingPrincipal` together with `sessionCredentialOnly`.
 * @returns Ports for `mountJsonRoute`; the workspace and authorize ports read only `AdminJsonRoutePortDeps`.
 * @throws Error at registration for `deferMissingPrincipal` + `sessionCredentialOnly` (rv1123l T6): a
 *   deferred sessionless request would skip the credential gate, which must answer before parse.
 * @complexity O(1) per request beyond the injected authorizer and the shared failure lifecycle.
 */
export function createAdminJsonRoutePorts(
  required: AdminJsonRouteMountOptions & { workspaceScoped?: boolean; requireSameOrigin?: boolean } = {},
  _optional: Record<string, never> = {},
): AdminPorts {
  if (required.deferMissingPrincipal && required.sessionCredentialOnly) {
    throw new Error("admin route ports: deferMissingPrincipal cannot be combined with sessionCredentialOnly — the credential gate must run before parse");
  }
  if (required.authenticateBeforeWorkspace && required.requireSameOrigin) {
    throw new Error("an admin mount cannot set authenticateBeforeWorkspace on a same-origin spec: it would move the same-origin gate ahead of the workspace check too");
  }
  const workspaceFirst = required.workspaceScoped !== false && !required.authenticateBeforeWorkspace;
  return {
    // Same rule and body as `rejectForeignWorkspace` (shared/route-guards.ts), before any auth —
    // including its `?? ""` fallback, so a missing param on a workspace path is still the 404.
    // Deployment-level paths (`/api/admin/v1/database/*`, `/recovery/*`) never ran that guard.
    workspace: ({ raw, deps }) => {
      // `preflight`: the mount's own first refusal, before the workspace 404 and every later gate.
      if (required.preflight) runPreflight({ raw, deps, preflight: required.preflight });
      if (workspaceFirst) refuseForeignWorkspace({ raw, deps, options: required });
    },
    // A missing session is deferred only on an opted-in mount (`deferMissingPrincipal`): those
    // hand-written routes validated the body before reading the principal, so their 400 must still
    // win, and `authorize` fails closed below with `getAuthedPrincipal`'s own error (the same
    // redacted 500). Every other mount throws here, before parse, exactly as before.
    authenticate: ({ raw, res, deps }) => {
      if (required.deferMissingPrincipal && !res.locals.principal) return undefined;
      if (required.sessionCredentialOnly) refuseUnlessSessionCredential({ res, gate: required.sessionCredentialOnly });
      // `authenticateBeforeWorkspace`: the refusal the workspace port skipped, after the gates above.
      if (required.authenticateBeforeWorkspace && required.workspaceScoped !== false) refuseForeignWorkspace({ raw, deps, options: required });
      const principal = { ...getAuthedPrincipal(res) };
      recordAdminRequestFacts({ principal, res });
      const publishTrust = mountMayUseGrant({ options: required }) ? getPublishTrustContext(res) : null;
      if (publishTrust) publishTrustByContext.set(principal, publishTrustAuthorizeFor(publishTrust));
      return principal;
    },
    authorize: (args, scope = {}) => authorizeWithPorts({ args, scope, options: required }),
    onError: ({ res, error }) => {
      if (error instanceof RouteRefusalError) { writeRefusal({ res, error }); return; }
      if (error instanceof AdminWorkspaceRefusal) { writeWorkspaceRefusal({ res, reply: error.reply }); return; }
      writeAdminFailure({ res, error, options: required });
    },
    onReturnedError: writeReturnedFailure,
    requestFacts: routeRequestFactsFor,
  };
}

/** The default admin ports: `sendAdminFailure`'s route-derived copy for unexpected failures. */
export const adminJsonRoutePorts = createAdminJsonRoutePorts();

/** A public route's unexpected-failure copy: `operation` for the incident sink, the visitor-safe sentence. */
export interface PublicRouteFailure { operation: string; visitorError: string; status?: number }

/** Build the public (visitor) ports: no session or RBAC; an unexpected failure is reported to the
 * incident sink and the visitor sees only the route's own safe copy plus the error ID.
 * @param required.operation - `<area>:<step>` for `reportServerFailure`.
 * @param required.visitorError - The visitor-safe sentence the hand-written route writes today.
 * @param required.workspaceId - When given, a foreign `:workspaceId` is the shared 404 (opt-in).
 * @complexity O(1) plus the shared incident report.
 */
export function createPublicJsonRoutePorts(
  required: PublicRouteFailure & { workspaceId?: string },
  _optional: Record<string, never> = {},
): JsonRoutePorts<object> {
  const { workspaceId } = required;
  return {
    // Opt-in (a mount given `workspaceId`): the same rule and body as `rejectForeignWorkspace`.
    ...(workspaceId === undefined ? {} : { workspace: ({ raw }: { raw: RouteInputContext }) => {
      if (String(raw.params.workspaceId ?? "") !== workspaceId) rejectRoute({ status: 404, error: "workspace was not found" });
    } }),
    onError: ({ res, error }) => {
      if (error instanceof RouteRefusalError) { writeRefusal({ res, error }); return; }
      const { errorId } = reportServerFailure({ error, operation: required.operation }, { tracker: res.locals.adminFailureTracker });
      res.status(required.status ?? 500).json({ error: required.visitorError, errorId });
    },
    onReturnedError: writeReturnedFailure,
    requestFacts: routeRequestFactsFor,
  };
}

/** The admin ports one mount uses: the shared default instance unless the mount customizes them or its
 * path is deployment-level.
 * Shared by `mountAdminJsonRoute` and `admin-raw-route-ports.ts`'s `mountAdminRawRoute`.
 * @complexity O(options).
 */
export function adminPortsFor(
  { path, options, requireSameOrigin }: { path: string; options: AdminJsonRouteMountOptions; requireSameOrigin?: boolean },
  _optional: Record<string, never> = {},
): AdminPorts {
  // A path without `:workspaceId` is deployment-level: its hand-written route never ran the guard.
  const workspaceScoped = path.includes(":workspaceId");
  const customized = Object.values(options).some((value) => value !== undefined);
  return customized || !workspaceScoped ? createAdminJsonRoutePorts({ ...options, workspaceScoped, requireSameOrigin }) : adminJsonRoutePorts;
}

/** Header-only reads, because http-kit hands the policy the raw Node request (no Express `req.get`). */
function headerText({ req, name }: { req: { headers?: Record<string, unknown> }; name: string }, _optional: Record<string, never> = {}): string | undefined {
  const value = req.headers?.[name];
  return typeof value === "string" ? value : undefined;
}

/** The admin's own same-origin rule for a guarded JSON write: the exact browser-write check the
 *  hand-written saved-keys write applies (`isSameOriginBrowserWrite` — an `Origin` naming this host, and
 *  `sec-fetch-site`, when sent, `same-origin`). A JSON admin route only ever serves the admin's own pages,
 *  so this is the mount's default; without one http-kit throws and a cross-origin write became a 500. */
export const adminBrowserWriteOrigin: RouteHostContext = {
  originPolicy: {
    isSameOrigin: ({ req }) => isSameOriginBrowserWrite({
      origin: headerText({ req, name: "origin" }), host: headerText({ req, name: "host" }), fetchSite: headerText({ req, name: "sec-fetch-site" }),
    }),
  },
};

/** Mount a Jini admin route spec behind the admin ports. `deps` is the route's own small deps type
 * plus the two port fields — built from `RouteDeps` at registration, never passed whole.
 * `origin` replaces {@link adminBrowserWriteOrigin} as the policy for a `requireSameOrigin` spec; a spec
 * without that flag never consults it.
 * @returns Void; registers one endpoint.
 * @complexity O(1) setup; per request as `createAdminJsonRoutePorts`.
 */
export function mountAdminJsonRoute<Input, Output, Deps>(
  required: { app: Express; spec: Omit<JsonRouteSpec<Input, Output, Deps, OperatorPrincipalRecord>, "ports">; deps: Deps & AdminJsonRoutePortDeps; origin?: RouteHostContext },
  optional: AdminJsonRouteMountOptions = {},
): void {
  const { forwardRejection, ...portOptions } = optional;
  const adapter = required.spec.requireSameOrigin ? { adapter: required.origin ?? adminBrowserWriteOrigin } : {};
  const ports = adminPortsFor({ path: required.spec.path, options: portOptions, requireSameOrigin: required.spec.requireSameOrigin });
  const app = forwardRejection ? registeringThroughAsyncRoute({ app: required.app, method: required.spec.method }) : required.app;
  const readHeaders = preflightReadHeaders({ spec: required.spec, preflight: portOptions.preflight });
  mountJsonRoute<Input, Output, Deps & AdminJsonRoutePortDeps, OperatorPrincipalRecord>({ app, spec: { ...required.spec, ...readHeaders, ports }, deps: required.deps, ...adapter });
}

/** The one-method app `mountJsonRoute` registers on, wrapping its handler in `asyncRoute`.
 *  `mountJsonRoute` only calls `app[spec.method](path, handler)`; a new use of `app` there fails
 *  loudly here (not a silent bypass), and `admin-json-route-ports.test.ts` pins the wrapped name.
 * @complexity O(1). */
function registeringThroughAsyncRoute(
  { app, method }: { app: Express; method: JsonRouteSpec<unknown, unknown, unknown>["method"] },
  _optional: Record<string, never> = {},
): Express {
  const register = (path: string, handler: AsyncRouteHandler) => app[method](path, asyncRoute({ handler }));
  return { [method]: register } as unknown as Express;
}

/** Mount a Jini public route spec behind the visitor ports (see `createPublicJsonRoutePorts`).
 * @returns Void; registers one endpoint.
 * @complexity O(1) setup.
 */
export function mountPublicJsonRoute<Input, Output, Deps extends object>(
  required: { app: Express; spec: Omit<JsonRouteSpec<Input, Output, Deps>, "ports">; deps: Deps; failure: PublicRouteFailure; workspaceId?: string },
  _optional: Record<string, never> = {},
): void {
  // Only a `:workspaceId` path can name a foreign workspace; elsewhere the option is inert.
  const workspaceId = required.spec.path.includes(":workspaceId") ? required.workspaceId : undefined;
  mountJsonRoute<Input, Output, Deps>({ app: required.app, spec: { ...required.spec, ports: createPublicJsonRoutePorts({ ...required.failure, workspaceId }) }, deps: required.deps });
}
