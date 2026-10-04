import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { executeCommand, InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryEventBus, InMemoryOutbox } from "#src/contracts/core/events/index";
import { InMemoryFormDefinitionRepo, InMemoryFormSubmissionRepo } from "#src/features/forms/repo.memory";
import { registerAdminFormsCreateRoute } from "../../inbound/admin-http/routes/forms/create.js";
import { registerAdminFormsAuthoringRoute } from "../../inbound/admin-http/routes/forms/authoring.js";
import { registerFormsSubmitRoute } from "../../inbound/public-http/routes/site/forms-submit.js";
import { createFormsAdminModule } from "../../runtime/composition/modules/forms-admin.js";

/** HTTP acceptance: the admin writes markup and a browser POST saves it without authored endpoints. */
test("HTML create/edit route, native urlencoded POST, confirmation redirect and honeypot discard", async (t) => {
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  const formSubmissionRepo = new InMemoryFormSubmissionRepo();
  let id = 0;
  const deps = {
    workspaceId: "ws", formDefinitionRepo, formSubmissionRepo,
    clock: { nowMs: () => Date.parse("2026-10-04T12:00:00Z") }, idGen: { newId: () => `id-${++id}` },
    executeCommand, changeSets: new InMemoryChangeSetRepo(), outbox: new InMemoryOutbox(), bus: new InMemoryEventBus(),
    authorize: async () => ({ allowed: true, reason: "owner" }),
  };
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "owner", kind: "user" }; next(); });
  registerAdminFormsCreateRoute(app, deps);
  registerAdminFormsAuthoringRoute(app, deps);
  registerFormsSubmitRoute(app, { workspaceId: "ws", submitForm: {
    definitionRepo: formDefinitionRepo, submissionRepo: formSubmissionRepo,
    ...deps, rateLimiter: { check: () => ({ allowed: true as const }) },
  } });
  const server = createServer(app).listen(0);
  t.after(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const created = await fetch(`${base}/api/admin/v1/workspaces/ws/forms`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Contact", slug: "contact", mode: "html", html: '<input name="old">' }),
  });
  assert.equal(created.status, 201);
  const { data: form } = await created.json() as { data: { id: string } };
  const edited = await fetch(`${base}/api/admin/v1/workspaces/ws/forms/${form.id}/authoring`, {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "html", html: '<form action="/wrong" method="get"><input name="email" type="email" required></form>' }),
  });
  assert.equal(edited.status, 200);
  const saved = await edited.json() as { data: { mode: string; html: string; fields: Array<{ id: string }> } };
  assert.equal(saved.data.mode, "html");
  assert.doesNotMatch(saved.data.html, /<form/);
  assert.deepEqual(saved.data.fields.map((field) => field.id), ["email"]);
  const post = async (body: string) => fetch(`${base}/forms/contact/submit`, {
    method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", accept: "text/html", referer: `${base}/contact-page` }, body,
  });
  const accepted = await post("email=ada%40example.com&_hp=");
  assert.equal(accepted.status, 303);
  assert.match(accepted.headers.get("location")!, /^\/contact-page\?form=contact&form_status=success$/);
  const invalid = await post("email=ada%40example.com&unknown=value");
  assert.equal(invalid.status, 303);
  assert.match(invalid.headers.get("location")!, /form_status=validation/);
  await post("_hp=bot");
  const submissions = await formSubmissionRepo.listByDefinition({ workspaceId: "ws", formDefinitionId: form.id, limit: 10 });
  assert.deepEqual(submissions.items.map((submission) => submission.data), [{ email: "ada@example.com" }]);
});

test("authoring PUT requires admin.forms.manage before any lookup, for existing and missing ids alike", async (t) => {
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  const now = "2026-10-04T12:00:00Z";
  const stored = {
    id: "form-1", workspaceId: "ws", name: "Contact", slug: "contact", status: "active" as const,
    createdAt: now, updatedAt: now, notify: { enabled: false, recipients: [] },
    fields: [{ id: "email", label: "Email", type: "email" as const, required: true }],
  };
  await formDefinitionRepo.create(stored);
  const asked: string[] = [];
  const deps = {
    workspaceId: "ws", formDefinitionRepo, formSubmissionRepo: new InMemoryFormSubmissionRepo(),
    clock: { nowMs: () => Date.parse(now) }, idGen: { newId: () => "id" },
    executeCommand, changeSets: new InMemoryChangeSetRepo(), outbox: new InMemoryOutbox(), bus: new InMemoryEventBus(),
    authorize: async ({ permission }: { permission: string }) => {
      asked.push(permission);
      return permission === "admin.forms.manage" ? { allowed: false, reason: "no-permission" } : { allowed: true, reason: "granted" };
    },
  };
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.principal = { id: "reader", kind: "user" }; next(); });
  registerAdminFormsAuthoringRoute(app, deps as unknown as Parameters<typeof registerAdminFormsAuthoringRoute>[1]);
  const server = createServer(app).listen(0);
  t.after(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  for (const [formId, body] of [["form-1", {}], ["missing", {}], ["form-1", { mode: "html", html: '<input name="x">' }]] as const) {
    const res = await fetch(`${base}/api/admin/v1/workspaces/ws/forms/${formId}/authoring`, {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    assert.equal(res.status, 403, `${formId} ${JSON.stringify(body)}`);
    assert.equal(((await res.json()) as { code: string }).code, "FORBIDDEN");
  }
  assert.deepEqual(asked, ["admin.forms.manage", "admin.forms.manage", "admin.forms.manage"]);
  assert.deepEqual(await formDefinitionRepo.findById({ workspaceId: "ws", id: "form-1" }), stored);
});

test("forms-admin composition registers the dedicated authoring endpoint", () => {
  // A registration assertion catches the easy-to-miss production wiring gap independently of HTTP fixtures.
  const paths: string[] = [];
  const app = { get: () => {}, post: () => {}, delete: () => {}, put: (path: string) => { paths.push(path); } };
  createFormsAdminModule({} as Parameters<typeof createFormsAdminModule>[0]).registerRoutes!(app as unknown as express.Express);
  assert.ok(paths.includes("/api/admin/v1/workspaces/:workspaceId/forms/:formId/authoring"));
});
