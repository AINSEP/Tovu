/**
 * @file G14b end-to-end proof, vendor-neutral half: the fake provider plugin "acme-office" (a test
 * fixture) delivers form submissions through its OAuth connection over the REAL fan-out: submission
 * -> planner -> outbox child job -> OAuth connection port -> plugin adapter -> the fake provider's
 * table API. Also: a replayed event adds nothing, an account switch after planning never moves a
 * frozen job to the new account, a sign-in the provider stopped honouring is `authorization-required`
 * with the job kept, and a saved custom credential still resolves behind the OAuth port.
 * G14c: the plugin's own admin surface saves the binding through the host's `deliveryBindings`
 * port (written to `core.forms/deliveryBindings` as the admin) and that binding delivers; the host
 * refuses an adapter the plugin declares but does not contribute, and never lets the surface reach
 * another adapter's binding. The
 * google-workspace plugin's twin is `content/agent-plugins/google-workspace/__tests__/
 * form-delivery.e2e.test.mjs`. Only the fake's hosts resolve (127.0.0.1); any other host throws.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import { FormDeliveryError } from "@jini-ai/cms/forms";
import type { HttpClientPort } from "@jini-ai/core/primitives";

import { loadPluginContributionsFromSource, type LoadPluginContributions } from "#src/features/agent-plugins/lifecycle";
import type { FormDestinationKit } from "#src/features/form-destinations/index";
import { FORM_DESTINATIONS_FILENAME } from "#src/features/form-destinations/registry";
import { createOAuthDeliverySite, FORM_ID, WORKSPACE, type Consent, type OAuthDeliverySite } from "./form-delivery-oauth.fixture.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = "acme-office";
const ADAPTER = "acme-office-rows";
const loadContributions: LoadPluginContributions = (input) => loadPluginContributionsFromSource({
  plugin: { pluginId: PLUGIN, packageRoot: path.join(here, "../../../../features/api-connections/__tests__/fixtures/acme-office") }, definition: input.definition,
});
const ACME_HOSTS = new Set(["auth.acme.test", "api.acme.test"]);

/** The fake provider's state: codes bound to an account and a PKCE challenge, tokens per account, rows it accepted. */
const provider = {
  codes: new Map<string, { account: string; challenge: string }>(),
  tokens: new Map<string, string>(),
  refreshTokens: new Map<string, string>(),
  refuseRefresh: false,
  rows: [] as { table: string; idempotencyKey: string | undefined; account: string; values: Record<string, unknown> }[],
};
let server: Server;
let origin = "";

const mint = (kind: string, account: string) => `acme-${kind}-${account}-${randomBytes(6).toString("hex")}`;

function tokenResponse(body: string): [number, unknown] {
  const form = new URLSearchParams(body);
  if (form.get("grant_type") === "refresh_token") {
    const account = provider.refreshTokens.get(form.get("refresh_token") ?? "");
    if (provider.refuseRefresh || !account) return [400, { error: "invalid_grant" }];
    const accessToken = mint("access", account);
    provider.tokens.set(accessToken, account);
    return [200, { access_token: accessToken, token_type: "Bearer", expires_in: 3600, scope: "acme.files" }];
  }
  const entry = provider.codes.get(form.get("code") ?? "");
  provider.codes.delete(form.get("code") ?? "");
  if (!entry || createHash("sha256").update(form.get("code_verifier") ?? "").digest("base64url") !== entry.challenge) return [400, { error: "invalid_grant" }];
  const accessToken = mint("access", entry.account);
  const refreshToken = mint("refresh", entry.account);
  provider.tokens.set(accessToken, entry.account);
  provider.refreshTokens.set(refreshToken, entry.account);
  return [200, { access_token: accessToken, refresh_token: refreshToken, token_type: "Bearer", expires_in: 3600, scope: "acme.files" }];
}

/** `/me` names the token's account; `POST /tables/<t>/rows` appends one row for it; `/token` exchanges and refreshes. */
function answer(method: string, url: string, headers: Record<string, string | string[] | undefined>, body: string): [number, unknown] {
  const account = provider.tokens.get(String(headers.authorization ?? "").replace(/^Bearer /, ""));
  if (url === "/me") return account ? [200, { id: `acct-${account}`, name: account }] : [401, {}];
  const table = /^\/tables\/([^/]+)\/rows$/.exec(url)?.[1];
  if (method === "POST" && table !== undefined) {
    if (!account) return [401, {}];
    const { values } = JSON.parse(body) as { values: Record<string, unknown> };
    provider.rows.push({ table: decodeURIComponent(table), idempotencyKey: headers["idempotency-key"] as string | undefined, account, values });
    return [201, {}];
  }
  return url === "/token" ? tokenResponse(body) : [404, {}];
}

before(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const [status, value] = answer(req.method ?? "GET", req.url ?? "/", req.headers, body);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(value));
    });
  });
  origin = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)));
});
after(async () => { await new Promise((resolve) => server.close(resolve)); });
beforeEach(() => {
  for (const map of [provider.codes, provider.tokens, provider.refreshTokens]) map.clear();
  provider.rows.length = 0;
  provider.refuseRefresh = false;
});

/** Only the fake provider's hosts reach the local server; anything else throws. */
function toLocal(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" || !ACME_HOSTS.has(url.hostname)) throw new Error(`unexpected outbound host ${url.hostname}`);
  return `${origin}${url.pathname}${url.search}`;
}
const http: HttpClientPort = {
  async send({ request }) {
    const response = await fetch(toLocal(request.url), { method: request.method, headers: request.headers, ...(request.body === undefined ? {} : { body: request.body as string }) });
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), bodyText: await response.text() };
  },
};
const kit: FormDestinationKit = { timeouts: {}, fetch: (url, init) => fetch(toLocal(url), init) };
const env = { TOVU_ACME_OAUTH_WEB_CLIENT_ID: "acme-web-client", TOVU_ACME_OAUTH_WEB_CLIENT_SECRET: "w".repeat(24) };

/** The "browser" consenting as `account`; the code is bound to the request's PKCE challenge. */
const consentAs = (account: string): Consent => async (authorizationUrl) => {
  const url = new URL(authorizationUrl);
  const code = randomBytes(12).toString("hex");
  provider.codes.set(code, { account, challenge: url.searchParams.get("code_challenge") ?? "" });
  return { code, state: url.searchParams.get("state") ?? "" };
};

/** A connected site with one binding on the given (or the signed-in) account. */
async function connectedSite(optional: { accountId?: string } = {}): Promise<{ site: OAuthDeliverySite; connectionRef: string }> {
  const site = await createOAuthDeliverySite({ loadContributions, http, kit, env });
  const connectionRef = await site.connect({ pluginId: PLUGIN, consent: consentAs("alice") });
  await site.bind({ bindings: [{ bindingId: "b1", adapterId: ADAPTER, connectionRef, enabled: true, config: { table: "Leads", accountId: optional.accountId ?? "acct-alice" } }] });
  return { site, connectionRef };
}

test("end to end: a submission is planned, delivered through the OAuth connection with a fresh token, and a replayed event adds no row", async () => {
  const { site } = await connectedSite();
  await site.submit({ submissionId: "sub-1", answers: { email: "ada@example.test", message: "Hello" } });
  await site.drain();
  const [planned] = site.jobsFor({ submissionId: "sub-1" });
  assert.equal(planned?.status, "pending", "planning queued exactly one child job");
  assert.ok(![...provider.tokens.keys()].some((token) => JSON.stringify(planned.event).includes(token)), "the frozen job holds no token");
  assert.equal(JSON.stringify(planned.job).includes("198.51.100.7"), false, "the frozen job holds no source IP");

  await site.drain();
  assert.deepEqual(site.jobsFor({ submissionId: "sub-1" }).map(({ status, attempts }) => ({ status, attempts })), [{ status: "delivered", attempts: 1 }]);
  assert.deepEqual(provider.rows, [{ table: "Leads", idempotencyKey: JSON.stringify(["sub-1", "b1"]), account: "alice",
    values: { _submission_id: "sub-1", submitted_at: "2026-10-20T10:00:00.000Z", Email: "ada@example.test", Message: "Hello" } }]);

  await site.replayReceived({ submissionId: "sub-1" });
  await site.drain();
  await site.drain();
  assert.equal(site.jobsFor({ submissionId: "sub-1" }).length, 1, "the plan is stored once: no second job");
  assert.equal(provider.rows.length, 1, "no second row");
});

test("an account switch after planning: the frozen job is refused (authorization-required, kept), never delivered to the new account", async () => {
  const { site } = await connectedSite();
  await site.submit({ submissionId: "sub-1", answers: { email: "ada@example.test" } });
  await site.drain();
  await site.switchAccount({ pluginId: PLUGIN, consent: consentAs("bob") });

  await site.drain();
  const [job] = site.jobsFor({ submissionId: "sub-1" });
  assert.deepEqual({ status: job?.status, attempts: job?.attempts, lastError: job?.lastError }, { status: "failed", attempts: 1, lastError: "authorization-required" });
  assert.deepEqual(provider.rows, [], "nothing reached the provider for either account");
  site.clock.advanceMs(48 * 60 * 60_000);
  await site.drain();
  assert.equal(site.jobsFor({ submissionId: "sub-1" })[0]?.attempts, 1, "a refused job is not retried");
});

test("a binding re-pointed at the switched account delivers the next submission there", async () => {
  const { site, connectionRef } = await connectedSite();
  await site.switchAccount({ pluginId: PLUGIN, consent: consentAs("bob") });
  await site.bind({ bindings: [{ bindingId: "b1", adapterId: ADAPTER, connectionRef, enabled: true, config: { table: "Leads", accountId: "acct-bob" } }] });
  await site.submit({ submissionId: "sub-2", answers: { email: "bo@example.test" } });
  await site.drain();
  await site.drain();
  assert.deepEqual(provider.rows.map((row) => [row.account, row.values._submission_id]), [["bob", "sub-2"]]);
});

test("reconnect required (the provider refuses the refresh with invalid_grant): authorization-required, the job kept in the ledger, nothing sent", async () => {
  const { site, connectionRef } = await connectedSite();
  await site.submit({ submissionId: "sub-1", answers: { email: "ada@example.test" } });
  await site.drain();
  site.clock.advanceMs(2 * 60 * 60_000);
  provider.refuseRefresh = true;

  await site.drain();
  const [job] = site.jobsFor({ submissionId: "sub-1" });
  assert.deepEqual({ status: job?.status, lastError: job?.lastError }, { status: "failed", lastError: "authorization-required" });
  assert.deepEqual(provider.rows, []);
  const [connection] = await site.host.listConnections({ pluginId: PLUGIN });
  assert.equal((await site.host.statusOf({ connection: connection! })).status, "reconnect-required", "the admin sees Reconnect required");
  assert.equal(connectionRef, (await site.host.statusOf({ connection: connection! })).connectionRef);
});

test("a binding naming a saved custom credential still resolves behind the OAuth port (the OAuth port does not own its ref)", async () => {
  const site = await createOAuthDeliverySite({ loadContributions, http, kit, env });
  await site.connect({ pluginId: PLUGIN, consent: consentAs("alice") });
  const staticToken = [...provider.tokens.keys()][0]!;
  const credentialId = await site.saveCustomCredential({ label: "Acme static", baseUrl: "https://api.acme.test", worksFor: [ADAPTER], token: staticToken });
  await site.bind({ bindings: [{ bindingId: "b-static", adapterId: ADAPTER, connectionRef: credentialId, enabled: true, config: { table: "Static" } }] });
  await site.submit({ submissionId: "sub-3", answers: { email: "cy@example.test" } });
  await site.drain();
  await site.drain();
  assert.deepEqual(site.jobsFor({ submissionId: "sub-3" }).map((row) => row.status), ["delivered"]);
  assert.deepEqual(provider.rows.map((row) => row.table), ["Static"]);
});

test("a job of another workspace is never served by this site's OAuth host: no connection resolves, authorization-required", async () => {
  const { site, connectionRef } = await connectedSite();
  const job = { binding: { bindingId: "b1", adapterId: ADAPTER, connectionRef, enabled: true, config: { table: "Leads", accountId: "acct-alice" } }, idempotencyKey: "[\"s\",\"b1\"]",
    snapshot: { form: { slug: "contact", fields: [{ name: "email", required: true }] }, submission: { id: "s", answers: { email: "x@example.test" }, submittedAt: "2026-10-20T10:00:00.000Z" } } };
  const other = `${WORKSPACE}-other`;
  await assert.rejects(site.deliver({ workspaceId: other, job }), (error: unknown) => error instanceof FormDeliveryError && error.code === "authorization-required" && !error.retryable);
  assert.deepEqual(provider.rows, []);
});

// --- G14c: the plugin's admin surface owns its bindings ---------------------------------------------

const saveBinding = (site: OAuthDeliverySite, payload: Record<string, unknown>) =>
  site.surfaceAction({ pluginId: PLUGIN, surfaceId: "account", action: "save-binding", payload: { adapterId: ADAPTER, connectionId: "account", table: "Leads", accountId: "acct-alice", ...payload } });

test("end to end: the surface saves a binding (connection id and form slug in, ref and form row id stored) and a submission delivers through it", async () => {
  const site = await createOAuthDeliverySite({ loadContributions, http, kit, env });
  const connectionRef = await site.connect({ pluginId: PLUGIN, consent: consentAs("alice") });
  const saved = await saveBinding(site, { formSlugs: ["contact"] });
  assert.equal(saved.ok, true, JSON.stringify(saved));
  const view = JSON.parse((saved as { result: { json: string } }).result.json) as Record<string, unknown>;
  assert.deepEqual(view, { bindingId: view.bindingId, adapterId: ADAPTER, connectionId: "account", enabled: true, formIds: ["contact"], config: { table: "Leads", accountId: "acct-alice" } });
  assert.deepEqual(await site.bindings(), [{ bindingId: view.bindingId, adapterId: ADAPTER, connectionRef, enabled: true, formIds: [FORM_ID], config: { table: "Leads", accountId: "acct-alice" } }]);

  await site.submit({ submissionId: "sub-1", answers: { email: "ada@example.test" } });
  await site.drain();
  await site.drain();
  assert.deepEqual(site.jobsFor({ submissionId: "sub-1" }).map((row) => row.status), ["delivered"]);
  assert.deepEqual(provider.rows.map((row) => [row.table, row.account]), [["Leads", "alice"]]);
});

test("security: an adapter the surface declares but the plugin does not contribute is refused (adapter-not-owned); nothing stored", async () => {
  const site = await createOAuthDeliverySite({ loadContributions, http, kit, env });
  await site.connect({ pluginId: PLUGIN, consent: consentAs("alice") });
  const outcome = await saveBinding(site, { adapterId: "acme-office-ghost" });
  assert.deepEqual(outcome.ok ? null : outcome.error.code, "adapter-not-owned");
  assert.deepEqual(await site.bindings(), []);
});

test("security: another adapter's binding is invisible to the surface and can be neither overwritten nor removed", async () => {
  const { site, connectionRef } = await connectedSite();
  const foreign = { bindingId: "x1", adapterId: "other-rows", connectionRef, enabled: true, config: { table: "Theirs" } };
  await site.bind({ bindings: [foreign] });
  const listed = await site.surfaceAction({ pluginId: PLUGIN, surfaceId: "account", action: "list-bindings" });
  assert.deepEqual(listed, { ok: true, result: { json: "[]" } });
  assert.equal((await saveBinding(site, { bindingId: "x1" })).ok, false);
  assert.equal((await site.surfaceAction({ pluginId: PLUGIN, surfaceId: "account", action: "remove-binding", payload: { bindingId: "x1" } })).ok, false);
  assert.deepEqual(await site.bindings(), [foreign]);
});

test("the surface lists and removes its own binding; the removal reaches the stored setting", async () => {
  const { site } = await connectedSite();
  const listed = await site.surfaceAction({ pluginId: PLUGIN, surfaceId: "account", action: "list-bindings" });
  assert.deepEqual(listed.ok && JSON.parse((listed.result as { json: string }).json), [{ bindingId: "b1", adapterId: ADAPTER, connectionId: "account", enabled: true, allForms: true, config: { table: "Leads", accountId: "acct-alice" } }]);
  assert.deepEqual(await site.surfaceAction({ pluginId: PLUGIN, surfaceId: "account", action: "remove-binding", payload: { bindingId: "b1" } }), { ok: true, result: { removed: true } });
  assert.deepEqual(await site.bindings(), []);
});

/** acme-office plus a second plugin, "other-vendor", that contributes the adapter id acme's surface declares but does not own. */
const withOtherVendor: LoadPluginContributions = async (input) => {
  // other-vendor ships only a form-destinations file.
  if (input.definition.filename !== FORM_DESTINATIONS_FILENAME) return loadContributions(input);
  const [own, other] = await Promise.all([loadContributions(input), loadPluginContributionsFromSource({
    plugin: { pluginId: "other-vendor", packageRoot: path.join(here, "fixtures/other-vendor") }, definition: input.definition,
  })]);
  return { items: [...own.items, ...other.items], refusals: [...own.refusals, ...other.refusals] };
};

test("security: an adapter id the surface declares but ANOTHER plugin contributes is refused (adapter-not-owned); nothing stored", async () => {
  const site = await createOAuthDeliverySite({ loadContributions: withOtherVendor, http, kit, env });
  await site.connect({ pluginId: PLUGIN, consent: consentAs("alice") });
  const outcome = await saveBinding(site, { adapterId: "acme-office-ghost" });
  assert.deepEqual(outcome.ok ? null : outcome.error.code, "adapter-not-owned");
  assert.deepEqual(await site.bindings(), []);
});
