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
import { registerPublicNewsletterConfirmRoute } from "../inbound/public-http/routes/site/newsletter-confirm.js";
import { registerPublicNewsletterUnsubscribeRoute } from "../inbound/public-http/routes/site/newsletter-unsubscribe.js";
import type { NewsletterPublicRouteDeps } from "../inbound/public-http/routes/site/newsletter-deps.js";
import type { RouteDeps } from "#src/server/routes/types";

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
  registerFederationReloadRoute({ app, deps: { reload: async () => { throw thrown; } } });
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
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  const deps = { workspaceId: "ws", authorize: async () => ({ allowed: true, reason: "test" }),
    siteUpdateRuntime: { runningVersion: async () => { throw thrown; }, feed: { latestRelease: async () => { throw thrown; } }, ids: { next: () => "id" } } } as unknown as Pick<RouteDeps, "workspaceId" | "authorize" | "siteUpdateRuntime">;
  const app = express();
  app.use((_req, res, next) => { res.locals.principal = { id: "owner" }; res.locals.authCredentialKind = "session"; next(); });
  registerAdminSiteUpdateStatusRoute({ app, deps, reporter: probe.reporter });
  const base = await startTestServer(app, t);
  const response = await fetch(`${base}/api/admin/v1/workspaces/ws/system/site-update/status`);
  assert.doesNotMatch(await response.text(), /Zq9Xw8Vu7Ts6Rq5Po4Nm3Lk2|cause-secret|field-secret/);
  probe.assertOneIncident({ thrown });
});

for (const [path, register] of [["/newsletter/confirm", registerPublicNewsletterConfirmRoute], ["/newsletter/unsubscribe", registerPublicNewsletterUnsubscribeRoute]] as const) test(`${path}: a dependency failure is one composed incident`, async (t) => {
  const probe = composedReporterProbe({ t }); const thrown = secretBearingError();
  const app = express();
  app.use((_req, res, next) => { res.locals.failureReporter = probe.reporter; next(); });
  register({ app, deps: portFake<NewsletterPublicRouteDeps>({ workspaceId: "ws", newsletterReady: Promise.resolve(),
    newsletterConfirmationTokenRepo: { findByTokenHash: async () => { throw thrown; } }, newsletterKeyring: { derive: async () => { throw thrown; } },
    clock: { nowIso: () => "2026-10-28T00:00:00.000Z" } }) });
  const response = await dispatchHttpRequest({ app, method: "get", url: `${path}?token=${Buffer.from("{}").toString("base64url")}.signature` });
  assert.equal(response.status, 500);
  probe.assertOneIncident({ errorId: REF.exec(String(response.body))?.[1], thrown });
});
