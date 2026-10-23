import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo } from "../../post/index.js";
import { InMemoryPagesHtmlDocumentStore } from "../../pages/index.js";
import { emailTemplatesAgentToolCatalog } from "../agent-tools.js";
import { buildEmailTemplatesRegistrations, contributeEmailTemplatesTools, emailTemplatesDerivedRisk } from "../tool-registrations.js";

const WS = "ws-1";
const HTML = '<html><head><meta name="email-fields" content="name=Ada"><title>Hi {{name}}</title></head><body><p>Hello {{name}}</p></body></html>';

function harness(granted: ReadonlySet<string>) {
  const repo = new InMemoryPostRepo([]);
  const clock = { nowMs: () => Date.parse("2026-10-22T00:00:00.000Z") };
  const asked: string[] = [];
  let n = 0;
  const registrations = buildEmailTemplatesRegistrations({
    workspaceId: WS,
    postRepo: repo,
    clock,
    idGen: { newId: () => `tpl-${++n}` },
    pagesHtmlStore: (scope, options = {}) => new InMemoryPagesHtmlDocumentStore(scope, { ...options, repo, clock }),
    authorize: (async (request: { permission: string }) => {
      asked.push(request.permission);
      return granted.has(request.permission) ? { allowed: true, reason: "matched" } : { allowed: false, reason: "no grant" };
    }) as never,
  });
  const byName = new Map(registrations.map((entry) => [entry.descriptor.id, entry]));
  const call = (name: string, input: unknown) => byName.get(name)!.handler({ principal: { id: "admin-1", kind: "user" }, signal: new AbortController().signal, input } as never);
  return { call, asked, byName };
}

test("every catalog tool is registered with its declared risk, and the contributor carries the same builder", () => {
  const { byName } = harness(new Set());
  assert.deepEqual([...byName.keys()].sort(), emailTemplatesAgentToolCatalog.map((tool) => tool.name).sort());
  for (const tool of emailTemplatesAgentToolCatalog) assert.equal(emailTemplatesDerivedRisk.get(tool.name), tool.sideEffects);
  const contribution = contributeEmailTemplatesTools();
  assert.equal(contribution.domain, "email-templates");
  assert.equal(contribution.build, buildEmailTemplatesRegistrations);
  assert.equal(contribution.risk, emailTemplatesDerivedRisk);
});

test("create, edit, get, list and preview each call the shared operation behind their permission", async () => {
  const { call, asked } = harness(new Set(["content.read", "pages.edit_html"]));
  const created = (await call("email_template_create", { name: "Welcome", html: HTML })) as { id: string; version: number };
  const edited = (await call("email_template_edit", { id: created.id, html: HTML.replace("Hello", "Hey"), expectedVersion: created.version })) as { html: string };
  assert.match(edited.html, /Hey/);
  assert.equal(((await call("email_template_get", { id: created.id })) as { name: string }).name, "Welcome");
  assert.equal(((await call("email_template_list", {})) as { templates: unknown[] }).templates.length, 1);
  assert.equal(((await call("email_template_preview", { id: created.id })) as { subject: string }).subject, "Hi Ada");
  assert.deepEqual(asked, ["pages.edit_html", "pages.edit_html", "content.read", "content.read", "content.read"]);
});

test("a reader without pages.edit_html cannot create or edit", async () => {
  const { call } = harness(new Set(["content.read"]));
  await assert.rejects(call("email_template_create", { name: "W", html: HTML }), /EMAIL_TEMPLATES_FORBIDDEN/);
  await assert.rejects(call("email_template_edit", { id: "x", html: HTML }), /EMAIL_TEMPLATES_FORBIDDEN/);
});

test("operation failures reach the model with stable codes", async () => {
  const { call } = harness(new Set(["content.read", "pages.edit_html"]));
  await assert.rejects(call("email_template_get", { id: "nope" }), /EMAIL_TEMPLATES_NOT_FOUND/);
  await assert.rejects(call("email_template_get", {}), /EMAIL_TEMPLATES_INVALID_INPUT/);
  const created = (await call("email_template_create", { name: "W", html: HTML })) as { id: string };
  await assert.rejects(call("email_template_edit", { id: created.id, html: HTML, expectedVersion: 99 }), /EMAIL_TEMPLATES_VERSION_CONFLICT/);
});
