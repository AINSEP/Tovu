import { createRouteIncidentReporter } from "#src/server/__tests__/helpers/route-incident-reporter";
/**
 * @file Codex FIX 4 remainder: every former legacy-sink caller of `reportServerFailure` now records through
 * the site's composed reporter (read from `res.locals.failureReporter`, or injected as a REQUIRED
 * dependency where no response exists). Per site family: one incident id, one host record, one tracker
 * report, no secret from the message, `cause` or an own field. Pattern: `mail-feedback.unit.test.ts`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import express, { type Express, type IRouter, type Request, type RequestHandler, type Response } from "express";
import { startTestServer } from "./helpers/http-test-server.js";
import { dispatchHttpRequest } from "./helpers/in-process-http.js";
import { portFake } from "./helpers/port-fake.js";
import { composedReporterProbe, secretBearingError } from "./helpers/composed-reporter-probe.js";
import { registerProductRoutes, type CommerceSiteAdapterDeps } from "../inbound/public-http/routes/site/products.js";
import { registerCommerceHttp } from "../runtime/composition/commerce-http.js";
import { registerThemePagePreview } from "../inbound/public-http/middleware/theme-page-preview.js";
import { registerFederationReloadRoute, FEDERATION_RELOAD_PATH } from "../inbound/assistant/federation-reload-route.js";
import { respondToSignInError, reportMemberDeliveryFailure } from "../inbound/public-http/routes/members/sign-in.js";
import { sendMemberAuthError } from "../inbound/public-http/routes/members/complete-sign-in.js";
import { createPublicJsonRoutePorts } from "../inbound/admin-http/admin-json-route-ports.js";
import { registerAdminSiteUpdateStatusRoute } from "../runtime/composition/http-app/mount-admin-system.js";
import { registerAdminSiteShareRoutes } from "../runtime/composition/modules/system-site-shares.js";
import { registerPublicNewsletterConfirmRoute } from "../inbound/public-http/routes/site/newsletter-confirm.js";
import { registerPublicNewsletterUnsubscribeRoute } from "../inbound/public-http/routes/site/newsletter-unsubscribe.js";
import type { NewsletterPublicRouteDeps } from "../inbound/public-http/routes/site/newsletter-deps.js";
import type { RouteDeps } from "#src/server/routes/types";
import { createAdminJsonRoutePorts } from "../inbound/admin-http/admin-json-route-ports.js";
import { registerAdminAnalyticsRecentHitsRoute, type AdminAnalyticsRecentHitsDeps } from "../inbound/admin-http/routes/analytics/recent-hits.js";
import { registerAdminPostTemplatePreviewRoute } from "../inbound/admin-http/routes/posts/template-preview.js";
import { mapWidgetErrorToResponse } from "../inbound/admin-http/http/widgets.js";
import { installErrorResponse } from "../inbound/admin-http/routes/agent-plugins/install-response.js";
import { importErrorResponse } from "../inbound/admin-http/routes/publish-content/import-errors.js";
import { respondWithError } from "../inbound/admin-http/routes/publish-content/peer-transport.js";
import { composeAssistantRoutines, ROUTINE_ROUTE_BASE, type ComposeAssistantRoutinesRequired, type MountRoutineAdminRoute } from "../runtime/composition/modules/assistant-routines.js";
import { mkdtempSync, rmSync } from "node:fs";
import { registerToolAccessLoweringRoute, TOOL_ACCESS_LOWERING_PATH } from "../inbound/assistant/tool-access-lowering-route.js";
import { tmpdir } from "node:os";
import path from "node:path";

const REF = /(ERR-(?:[0-9A-F]{4}-){3}[0-9A-F]{4})/;

/** A minimal response double whose locals carry the composed reporter. */
function fakeRes(reporter: unknown, locals: Record<string, unknown> = {}) {
  const out = { status: 0, body: "" as unknown };
  const res = { locals: { ...locals, failureReporter: reporter }, status(code: number) { out.status = code; return res; }, type() { return res; }, set() { return res; },
    send(value: unknown) { out.body = value; return res; }, json(value: unknown) { out.body = value; return res; } };
  return { res, out };
}

for (const [route, operation] of [["/products", "catalog"], ["/products/:id", "detail"]] as const) test(`products ${operation}: a failure is one composed incident`, async (t) => {
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  const handlers = new Map<string, (req: unknown, res: unknown) => Promise<void>>();
  const app = { get: (path: string, handler: (req: unknown, res: unknown) => Promise<void>) => { handlers.set(path, handler); } } as unknown as IRouter;
  const fail = async (): Promise<never> => { throw thrown; };
  registerProductRoutes({ app, deps: { commerceCatalog: { listProducts: fail, findProduct: fail } } as unknown as CommerceSiteAdapterDeps });
  const { res, out } = fakeRes(probe.reporter);
  await handlers.get(route)!({ params: { id: "item" } }, res);
  assert.equal(out.status, 500);
  probe.assertOneIncident({ errorId: REF.exec(String(out.body))?.[1], thrown });
});

test("commerce storefront guard: a readiness failure is one composed incident", async (t) => {
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  let handler: ((req: unknown, res: unknown, next: () => void) => Promise<void>) | undefined;
  const app = { use: (route: typeof handler) => { handler = route; } } as unknown as Express;
  registerCommerceHttp({ app, deps: { workspaceId: "w", clock: { nowMs: () => 0, nowIso: () => "2026-11-05T00:00:00.000Z" }, commerce: { storefrontStatus: async () => { throw thrown; } } } as unknown as RouteDeps });
  const { res, out } = fakeRes(probe.reporter);
  await handler!({ path: "/products" }, res, () => assert.fail("the failure must be answered"));
  assert.equal(out.status, 503);
  probe.assertOneIncident({ errorId: REF.exec(String(out.body))?.[1], thrown });
});

test("theme page preview: a render failure is one composed incident", async (t) => {
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  let handler: RequestHandler | undefined;
  const app = { get: (route: string, ...handlers: RequestHandler[]) => { if (route === "/theme-explore/:themeId/template/:templateId") handler = handlers.at(-1); } } as unknown as Express;
  registerThemePagePreview({ app, deps: { workspaceId: "ws", authorize: async () => { throw thrown; } } as unknown as RouteDeps });
  const { res, out } = fakeRes(probe.reporter, { principal: { id: "owner" } });
  await handler!({ params: {} } as Request, res as unknown as Response, () => {});
  assert.equal(out.status, 500);
  probe.assertOneIncident({ errorId: REF.exec(String(out.body))?.[1], thrown });
});

test("federation reload: a failed reload is one composed incident", async (t) => {
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  const app = express();
  app.use((_req, res, next) => { res.locals.failureReporter = probe.reporter; next(); });
  registerFederationReloadRoute({ app, reporter: probe.reporter, deps: { reload: async () => { throw thrown; } } });
  const base = await startTestServer(app, t);
  const response = await fetch(`${base}${FEDERATION_RELOAD_PATH}`, { method: "POST" });
  assert.equal(response.status, 500);
  probe.assertOneIncident({ errorId: ((await response.json()) as { errorId: string }).errorId, thrown });
});

for (const send of [respondToSignInError, sendMemberAuthError]) test(`${send.name}: an unexpected member failure is one composed incident`, async (t) => {
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  const { res, out } = fakeRes(probe.reporter);
  send({ res: res as unknown as Response, error: thrown });
  assert.equal(out.status, 500);
  probe.assertOneIncident({ errorId: (out.body as { errorId: string }).errorId, thrown });
});

test("member delivery: a detached delivery failure records through the injected reporter", (t) => {
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  reportMemberDeliveryFailure({ error: thrown, reporter: probe.reporter });
  probe.assertOneIncident({ thrown });
});

test("public JSON route ports: an unexpected failure is one composed incident", (t) => {
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  const ports = createPublicJsonRoutePorts({ operation: "public:test", visitorError: "That did not work." });
  const { res, out } = fakeRes(probe.reporter);
  ports.onError!({ res, error: thrown } as never);
  assert.equal(out.status, 500);
  probe.assertOneIncident({ errorId: (out.body as { errorId: string }).errorId, thrown });
});

test("admin site-update status: a failed check records through the injected reporter", async (t) => {
  const routeErrors = createRouteIncidentReporter().errors;
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  const deps = { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "test" }),
    siteUpdateRuntime: { runningVersion: async () => { throw thrown; }, feed: { latestRelease: async () => { throw thrown; } }, ids: { next: () => "id" } } } as unknown as Pick<RouteDeps, "workspaceId" | "authorize" | "siteUpdateRuntime">;
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = "session"; next(); });
  registerAdminSiteUpdateStatusRoute({ errors: { ...routeErrors, reporter: probe.reporter }, app, deps, reporter: probe.reporter });
  const base = await startTestServer(app, t);
  const response = await fetch(`${base}/api/admin/v1/workspaces/ws/system/site-update/status`);
  assert.doesNotMatch(await response.text(), /Zq9Xw8Vu7Ts6Rq5Po4Nm3Lk2|cause-secret|field-secret/);
  probe.assertOneIncident({ thrown });
});

for (const [path, register] of [["/newsletter/confirm", registerPublicNewsletterConfirmRoute], ["/newsletter/unsubscribe", registerPublicNewsletterUnsubscribeRoute]] as const) test(`${path}: a dependency failure is one composed incident`, async (t) => {
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  const app = express();
  app.use((_req, res, next) => { res.locals.failureReporter = probe.reporter; next(); });
  register({ errors: { ...createRouteIncidentReporter().errors, reporter: probe.reporter }, app, deps: portFake<NewsletterPublicRouteDeps>({ workspaceId: "ws", newsletterReady: Promise.resolve(),
    newsletterConfirmationTokenRepo: { findByTokenHash: async () => { throw thrown; } }, newsletterKeyring: { derive: async () => { throw thrown; } },
    clock: { nowIso: () => "2026-10-28T00:00:00.000Z" } }) });
  const response = await dispatchHttpRequest({ app, method: "get", url: `${path}?token=${Buffer.from("{}").toString("base64url")}.signature` });
  assert.equal(response.status, 500);
  probe.assertOneIncident({ errorId: REF.exec(String(response.body))?.[1], thrown });
});


// FIX 4 (rv1125a item 4): the last seven `adminFailureResponse` callers that still wrote the legacy console + tracker pair.
test("admin JSON ports, operation copy: an unexpected failure is one composed incident", (t) => {
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  const ports = createAdminJsonRoutePorts({ failure: { operation: "presentation:update" }, failureCopy: "operation" });
  const { res, out } = fakeRes(probe.reporter, { principal: { id: "owner" } });
  ports.onError!({ res, error: thrown } as never);
  assert.equal(out.status, 500);
  probe.assertOneIncident({ errorId: (out.body as { errorId: string }).errorId, thrown });
});

/** An app whose admin request carries an owner principal and the composed reporter, as `createApp` binds it. */
function adminApp(reporter: unknown): Express {
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = "session"; res.locals.failureReporter = reporter; next(); });
  return app;
}

test("analytics recent hits: a sink failure is one composed incident", async (t) => {
  const routeErrors = createRouteIncidentReporter().errors;
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  const app = adminApp(probe.reporter);
  registerAdminAnalyticsRecentHitsRoute({ errors: { ...routeErrors, reporter: probe.reporter }, app, deps: { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "test" }),
    analyticsSink: { capabilities: () => ({ durable: false, batch: true }), accept: async () => {}, acceptBatch: async () => {}, list: async () => { throw thrown; } } } as AdminAnalyticsRecentHitsDeps });
  const response = await dispatchHttpRequest({ app, method: "get", url: "/api/admin/v1/workspaces/ws/analytics/recent-hits" });
  assert.equal(response.status, 500);
  probe.assertOneIncident({ errorId: REF.exec(String(response.body))?.[1], thrown });
});

test("post template preview: an unexpected failure is one composed incident", async (t) => {
  const routeErrors = createRouteIncidentReporter().errors;
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  const app = adminApp(probe.reporter);
  registerAdminPostTemplatePreviewRoute({ errors: { ...routeErrors, reporter: probe.reporter }, app, deps: { workspaceId: "ws", authorize: async () => { throw thrown; } } as never });
  const response = await dispatchHttpRequest({ app, method: "get", url: "/api/admin/v1/workspaces/ws/posts/p1/template-preview" });
  assert.equal(response.status, 500);
  probe.assertOneIncident({ errorId: REF.exec(String(response.body))?.[1], thrown });
});

test("widgets error mapping: an unmapped failure is one composed incident", (t) => {
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  const { res, out } = fakeRes(probe.reporter);
  mapWidgetErrorToResponse({ err: thrown, res: res as unknown as Response });
  assert.equal(out.status, 500);
  probe.assertOneIncident({ errorId: (out.body as { errorId: string }).errorId, thrown });
});

test("publish peer actions: an unmapped failure is one composed incident", (t) => {
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  const { res, out } = fakeRes(probe.reporter);
  respondWithError({ res: res as unknown as Response, err: thrown });
  assert.equal(out.status, 500);
  probe.assertOneIncident({ errorId: (out.body as { errorId: string }).errorId, thrown });
});

for (const [name, map] of [
  ["agent plugin install", (reporter: never, error: Error) => installErrorResponse({ error }, { reporter })],
  ["content import", (reporter: never, error: Error) => importErrorResponse({ err: error }, { reporter })],
] as const) test(`${name} error mapping: an unmapped failure records through the injected reporter`, (t) => {
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  const { status, body } = map(probe.reporter as never, thrown);
  assert.equal(status, 500);
  probe.assertOneIncident({ errorId: (body as { errorId: string }).errorId, thrown });
});

// FIX 4 (rv1125a item 4): the routine store-open failure has no response of its own; composition injects the reporter.
test("routines store-open: a sidecar open failure records through the injected reporter", async (t) => {
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  const root = mkdtempSync(path.join(tmpdir(), "routines-reporter-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const routes = new Map<string, Parameters<MountRoutineAdminRoute>[0]["spec"]>();
  const required: ComposeAssistantRoutinesRequired = {
    launch: { desktopEligible: true }, workspaceId: "ws", contentDbPath: path.join(root, "content.db"), openSqlite: () => { throw thrown; },
    beforeStoreClose: () => {}, onStoreClose: () => {}, assistantEnabled: true, onAssistantToggle: () => () => {},
    runStarter: async () => assert.fail("no run starts"), mountAdminRoute: ({ spec }) => { routes.set(`${spec.method} ${spec.path}`, spec); },
    now: () => 0, newId: () => "id", timers: { schedule: () => () => {} }, log: () => {}, writeBeacon: async () => ({}),
    policy: { releaseEnabled: true, access: async () => true }, reporter: probe.reporter,
  };
  const host = await composeAssistantRoutines(required);
  assert.equal(host.availability(), "error");
  const spec = routes.get(`get ${ROUTINE_ROUTE_BASE}`)!;
  const parsed = spec.parse({ body: undefined, params: {}, query: {} });
  assert.ok(parsed.ok);
  const refused = await spec.handle({ input: parsed.value, deps: {} as never, context: { id: "owner", workspaceId: "ws" } as never });
  assert.equal(refused.ok, false);
  const details = refused.error.details;
  assert.ok(details && typeof details === "object" && "errorId" in details);
  assert.ok(typeof details.errorId === "string");
  probe.assertOneIncident({ errorId: details.errorId, thrown });
});

// FIX 4: the agent daemon's scope app never runs `createApp`, so no `res.locals.failureReporter` exists there.
test("daemon tool-access lowering: a failed stop records through the injected reporter", async (t) => {
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  const app = express();
  app.use(express.json());
  registerToolAccessLoweringRoute({ app, lower: async () => { throw thrown; }, reporter: probe.reporter });
  const response = await dispatchHttpRequest({ app, method: "post", url: TOOL_ACCESS_LOWERING_PATH, body: { agentIds: ["a"] } });
  assert.equal(response.status, 500);
  probe.assertOneIncident({ errorId: REF.exec(String(response.body))?.[1], thrown });
});

// FIX 4: the share JSON routes answer through a stand-in `res` (the Jini spec's `failureReply`), not the
// request's own, so the composed reporter is injected at registration rather than read from `res.locals`.
test("site shares: a failure is one composed incident", async (t) => {
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  const fail = async (): Promise<never> => { throw thrown; };
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = "session"; next(); });
  registerAdminSiteShareRoutes({ errors: { ...createRouteIncidentReporter().errors, reporter: probe.reporter }, app, deps: portFake<RouteDeps>({ workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "test" }),
    siteShareBackend: { list: fail, registry: { list: fail } as never } }) });
  const response = await dispatchHttpRequest({ app, method: "get", url: "/api/admin/v1/workspaces/ws/site-shares" });
  assert.equal(response.status, 500);
  assert.doesNotMatch(JSON.stringify(response.body), /Zq9Xw8Vu7Ts6Rq5Po4Nm3Lk2|cause-secret|field-secret/);
  probe.assertOneIncident({ errorId: REF.exec(JSON.stringify(response.body))?.[1], thrown });
});
