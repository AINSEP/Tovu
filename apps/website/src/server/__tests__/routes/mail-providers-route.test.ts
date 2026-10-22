import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";
import { resolveCustomCredentialByLabel } from "#src/features/custom-credentials/index";
import type { MailProviderConfiguration, MailProviderConfigurationReport, MailProviderControl } from "#src/platform/mail/mail-status";

/**
 * @file `…/system/mail-providers` (email phase 2): the safe provider DTO, the credential plan, the
 * key save that never activates, and the re-checked switch — each with its own permission, all over
 * the same operations the assistant tools call. Also `…/system/mail-status?refresh=1`.
 */

const LABEL = "Tovu Mail — Fake API";

function control(deps: ReturnType<typeof createRouteDeps>, calls: { selects: string[]; invalidations: number }, optional: { available?: () => boolean } = {}): MailProviderControl {
  const view = async (): Promise<MailProviderConfiguration> => {
    const row = (await deps.customCredentialSetRepo.listByWorkspace({ workspaceId: deps.workspaceId })).find((r) => r.label === LABEL);
    return {
      id: "fakemail", label: "Fake", origin: "plugin", hosted: true, lanes: [], capabilities: { feedback: false, domainVerification: false },
      credential: row ? { required: true, saved: true, label: LABEL, credentialId: row.id, updatedAt: row.updatedAt } : { required: true, saved: false, label: LABEL },
      selectable: Boolean(row), setup: { fields: [{ key: "token", label: "API key", type: "secret", required: true }, { key: "baseUrl", label: "API", type: "url", required: true, defaultValue: "https://api.fake.test" }] },
    };
  };
  return {
    describe: async (): Promise<MailProviderConfigurationReport> => ({ setting: { transactional: null, bulk: null }, providers: [await view()], refusals: [] }),
    check: async ({ id }) => ((optional.available ?? (() => true))() ? { ok: true, label: "Fake" } : { ok: false, reason: `'${id}' has no saved credential` }),
    select: async ({ id }) => { calls.selects.push(id); },
    invalidate: () => { calls.invalidations += 1; },
  };
}

async function rig(t: test.TestContext, optional: { grants?: string[]; withControl?: boolean; available?: () => boolean } = {}) {
  const base = createRouteDeps();
  const calls = { selects: [] as string[], invalidations: 0 };
  const grants = optional.grants ? new Set(optional.grants) : undefined;
  const deps = {
    ...base,
    ...(optional.withControl === false ? {} : { mailProviderControl: control(base, calls, optional.available ? { available: optional.available } : {}) }),
    ...(grants ? { authorize: async ({ permission }: { permission: string }) => (grants.has(permission) ? { allowed: true, reason: "grant" } : { allowed: false, reason: "no_grant" }) } : {}),
  } as typeof base;
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const url = (path: string, workspaceId = deps.workspaceId) => `${baseUrl}/api/admin/v1/workspaces/${workspaceId}/system/${path}`;
  const send = (method: string, path: string, body?: unknown) =>
    fetch(url(path), { method, headers: { cookie, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { deps, calls, url, cookie, send };
}

test("GET mail-providers returns the safe DTO; a wrong workspace 404s; no control is a 503", async (t) => {
  const r = await rig(t);
  const res = await r.send("GET", "mail-providers");
  assert.equal(res.status, 200);
  const body = await res.json() as MailProviderConfigurationReport;
  assert.deepEqual(body.providers.map((p) => [p.id, p.credential.saved]), [["fakemail", false]]);
  assert.equal((await fetch(r.url("mail-providers", "other"), { headers: { cookie: r.cookie } })).status, 404);
  const none = await rig(t, { withControl: false });
  const unavailable = await none.send("GET", "mail-providers");
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json() as { code: string }).code, "MAIL_PROVIDER_CONTROL_UNAVAILABLE");
});

test("each action has its own permission", async (t) => {
  const statusOnly = await rig(t, { grants: ["admin.forms.manage"] });
  assert.equal((await statusOnly.send("GET", "mail-providers")).status, 200);
  const plan = await statusOnly.send("GET", "mail-providers/fakemail/credential");
  assert.equal(plan.status, 403);
  assert.deepEqual((await plan.json() as { details: unknown }).details, { permission: "custom-credentials.write", reason: "no_grant" });
  assert.equal((await statusOnly.send("PUT", "mail-providers/fakemail/credential", { token: "k" })).status, 403);
  const activate = await statusOnly.send("POST", "mail-providers/fakemail/activate");
  assert.equal(activate.status, 403);
  assert.deepEqual((await activate.json() as { details: unknown }).details, { permission: "settings.workspace.write", reason: "no_grant" });
  assert.deepEqual(statusOnly.calls.selects, []);
  const writer = await rig(t, { grants: ["custom-credentials.write"] });
  assert.equal((await writer.send("GET", "mail-providers")).status, 403);
});

test("credential plan, then a save that stores the key without switching, then a re-checked activation", async (t) => {
  const r = await rig(t);
  const plan = await r.send("GET", "mail-providers/fakemail/credential");
  assert.equal(plan.status, 200);
  assert.deepEqual((await plan.json() as { credential: unknown }).credential, { action: "create", label: LABEL, category: "ops", baseUrl: "https://api.fake.test" });

  const saved = await r.send("PUT", "mail-providers/fakemail/credential", { token: "sk-live-secret" });
  assert.equal(saved.status, 200);
  const text = await saved.text();
  assert.equal(text.includes("sk-live-secret"), false, "the secret is never echoed");
  assert.equal((JSON.parse(text) as { provider: MailProviderConfiguration }).provider.credential.saved, true);
  assert.deepEqual(r.calls, { selects: [], invalidations: 1 });
  const stored = await resolveCustomCredentialByLabel({ repo: r.deps.customCredentialSetRepo, sealer: r.deps.siteAssistantSecretSealer }, { workspaceId: r.deps.workspaceId, label: LABEL });
  assert.equal(stored!.connection.token, "sk-live-secret");

  const activated = await r.send("POST", "mail-providers/fakemail/activate");
  assert.equal(activated.status, 200);
  assert.deepEqual(await activated.json(), { set: true, providerId: "fakemail", label: "Fake" });
  assert.deepEqual(r.calls.selects, ["fakemail"]);
});

test("refusals map to statuses and leave everything unchanged", async (t) => {
  const r = await rig(t, { available: () => false });
  const refused = await r.send("POST", "mail-providers/fakemail/activate");
  assert.equal(refused.status, 409);
  assert.deepEqual(await refused.json(), { error: "Cannot switch to 'fakemail' has no saved credential. Nothing was changed.", code: "MAIL_PROVIDER_REFUSED" });
  assert.deepEqual(r.calls.selects, []);
  assert.equal((await r.send("GET", "mail-providers/nope/credential")).status, 404);
  const noToken = await r.send("PUT", "mail-providers/fakemail/credential", {});
  assert.equal(noToken.status, 400);
  assert.equal((await noToken.json() as { code: string }).code, "MAIL_PROVIDER_INPUT");
  const badType = await r.send("PUT", "mail-providers/fakemail/credential", { token: 5 });
  assert.deepEqual([badType.status, (await badType.json() as { error: string }).error], [400, "token must be a string."]);
  const badUrl = await r.send("PUT", "mail-providers/fakemail/credential", { token: "k", baseUrl: "not a url" });
  assert.equal(badUrl.status, 400);
  assert.equal((await badUrl.json() as { error: string }).error, "VALIDATION");
  assert.equal(r.calls.invalidations, 0);
});

test("a non-object body reads as empty; an unexpected fault is a 500 without detail", async (t) => {
  const r = await rig(t);
  const array = await r.send("PUT", "mail-providers/fakemail/credential", ["x"]);
  assert.equal(array.status, 400);
  const logged = t.mock.method(console, "error", () => {});
  const broken = await rig(t);
  (broken.deps.mailProviderControl as MailProviderControl).describe = async () => { throw new Error("catalog exploded"); };
  const res = await broken.send("GET", "mail-providers");
  assert.deepEqual([res.status, await res.json()], [500, { error: "internal error", code: "INTERNAL_ERROR" }]);
  assert.equal(logged.mock.callCount(), 1);
});

test("mail-status ?refresh=1 (or true) asks for a rebuilt status; otherwise the cached one", async (t) => {
  const seen: unknown[] = [];
  const base = createRouteDeps();
  const deps = { ...base, mailStatus: async (optional?: { refresh?: boolean }) => { seen.push(optional); return {} as never; } };
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  for (const query of ["", "?refresh=1", "?refresh=true", "?refresh=no"]) {
    const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/system/mail-status${query}`, { headers: { cookie } });
    assert.equal(res.status, 200);
  }
  assert.deepEqual(seen, [{ refresh: false }, { refresh: true }, { refresh: true }, { refresh: false }]);
});

test("credential races and vault failures keep typed safe envelopes and leave configuration unchanged", async (t) => {
  const { CustomCredentialDuplicateLabelError, CustomCredentialNotFoundError, CustomCredentialSecretStoreUnconfiguredError } = await import("#src/features/custom-credentials/index");
  for (const [error, status, code, rotation] of [
    [new CustomCredentialDuplicateLabelError("secret-race"), 409, "DUPLICATE_LABEL", false],
    [new CustomCredentialNotFoundError("secret-gone"), 404, "NOT_FOUND", true],
    [new CustomCredentialSecretStoreUnconfiguredError("secret-vault"), 503, "SECRET_STORE_UNCONFIGURED", false],
  ] as const) {
    const r = await rig(t); const before = await r.deps.customCredentialSetRepo.listByWorkspace({ workspaceId: r.deps.workspaceId });
    if (rotation) {
      const ctl = r.deps.mailProviderControl!; const describe = ctl.describe!.bind(ctl);
      ctl.describe = async () => { const report = await describe(); return { ...report, providers: report.providers.map(p => ({ ...p, credential: { ...p.credential, credentialId: "vanished", saved: true } })) }; };
      t.mock.method(r.deps.customCredentialSetRepo, "findById", async () => { throw error; });
    } else t.mock.method(r.deps.customCredentialSetRepo, "insert", async () => { throw error; });
    const response = await r.send("PUT", "mail-providers/fakemail/credential", { token: "secret-input" }); const body = await response.json();
    assert.equal(response.status, status); assert.deepEqual(body, { error: code, code }); assert.doesNotMatch(JSON.stringify(body), /secret-/);
    assert.deepEqual(await r.deps.customCredentialSetRepo.listByWorkspace({ workspaceId: r.deps.workspaceId }), before); assert.deepEqual(r.calls, { selects: [], invalidations: 0 });
  }
});
