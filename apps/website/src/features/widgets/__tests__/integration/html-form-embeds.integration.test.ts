import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryEntryRepo } from "#src/features/entries/index";
import { InMemoryFormDefinitionRepo } from "#src/features/forms/repo.memory";
import { renderHtmlPageBody } from "#src/server/inbound/public-http/http/site/render";
import { injectFormSubmissionResultIntoHtml } from "#src/server/inbound/public-http/http/site/form-render";
import { checkMarkupFile } from "#src/features/theme/validation/markup";
import { resolveHtmlPageEmbeds } from "../../resolver-service.js";
import { registerCoreResolver, createContactFormResolver } from "../../resolvers/index.js";
import { WIDGET_PAYLOAD_FIELD } from "../../entry-payload.js";
import { WIDGET_CONTENT_TYPE, WIDGET_FIELD_NAMESPACE } from "../../types.js";

/** Owner acceptance 2026-10-04: one renderer, two marker spellings, occurrence-specific HTML mode. */
async function harness() {
  const entryRepo = new InMemoryEntryRepo();
  const formDefinitionRepo = new InMemoryFormDefinitionRepo();
  const now = "2026-10-04T12:00:00Z";
  await formDefinitionRepo.create({
    id: "form-1", workspaceId: "ws", name: "Contact", slug: "contact", status: "active", version: 1,
    createdAt: now, updatedAt: now, notify: { enabled: false, recipients: [] },
    fields: [{ id: "email", label: "Email", type: "email", required: true, className: "theme-input", attributes: { placeholder: "Email", "data-custom": "value" } }],
  });
  await entryRepo.save({
    id: "widget-1", workspaceId: "ws", type: WIDGET_CONTENT_TYPE, slug: "contact-widget", title: "Contact", status: "published",
    bodyJson: null, publishedAt: now, createdAt: now, updatedAt: now, version: 1,
    fieldsJson: { ext: { [WIDGET_FIELD_NAMESPACE]: { [WIDGET_PAYLOAD_FIELD]: JSON.stringify({ status: "active", widgetType: "contact-form", config: { formDefinitionId: "form-1" } }) } } },
  });
  registerCoreResolver({ typeKey: "contact-form", resolver: createContactFormResolver({ formDefinitionRepo }) });
  return { entryRepo, formDefinitionRepo };
}

test("form slug, form id and widget spellings resolve identically and fill plain POST actions", async () => {
  const deps = await harness();
  const html = ['{"type":"form","id":"contact","mode":"html"}', '{"type":"form","id":"form-1","mode":"html"}', '{"type":"widget","id":"widget-1","mode":"html"}'].map((config) => `<div data-embed-config='${config}'></div>`).join("");
  const resolved = await resolveHtmlPageEmbeds({ deps, input: { workspaceId: "ws", html } });
  assert.deepEqual(resolved.get("form")?.get("contact"), resolved.get("widget")?.get("widget-1"));
  const rendered = renderHtmlPageBody(html, resolved);
  assert.equal((rendered.match(/<form /g) ?? []).length, 3);
  assert.equal((rendered.match(/action="\/forms\/contact\/submit"/g) ?? []).length, 3);
  assert.match(rendered, /method="post"/);
  assert.match(rendered, /<label>Email<input type="email" name="email" data-tovu-field="email" required/);
  assert.match(rendered, /name="_hp"/);
  assert.doesNotMatch(rendered, /class=|style=|<style|data-embed-config/);
});

test("HTML mode is per occurrence, and native POST results reveal plain confirmation/error slots", async () => {
  const deps = await harness();
  const html = `<div data-embed-config='{"type":"widget","id":"widget-1"}'></div><div data-embed-config='{"type":"widget","id":"widget-1","mode":"html"}'></div>`;
  const resolved = await resolveHtmlPageEmbeds({ deps, input: { workspaceId: "ws", html } });
  const rendered = renderHtmlPageBody(html, resolved);
  assert.match(rendered, /class="widget tovu-form widget-contact-form"/);
  assert.match(rendered, /<form data-tovu-form="contact"/);
  assert.equal(resolved.get("widget")?.get("widget-1")?.props.mode, undefined);
  const plainHtml = `<div data-embed-config='{"type":"form","id":"contact","mode":"html"}'></div>`;
  const plain = renderHtmlPageBody(plainHtml, await resolveHtmlPageEmbeds({ deps, input: { workspaceId: "ws", html: plainHtml } }));
  const success = injectFormSubmissionResultIntoHtml(plain, { kind: "success", slug: "contact" });
  assert.match(success, /data-tovu-form-success data-form-slug="contact" role="status">Thanks — your message has been sent\.<\/div>/);
  assert.match(success, /<form hidden data-tovu-form/);
  const failure = injectFormSubmissionResultIntoHtml(plain, { kind: "validation", slug: "contact", fieldErrors: [{ field: "email", reason: "invalid" }] });
  assert.match(failure, /role="alert">Please check your answers. email: invalid/);
});

test("theme validator accepts restored form vocabulary and mode key", () => {
  assert.deepEqual(checkMarkupFile({ relativePath: "contact.html", content: `<div data-embed-config='{"type":"form","id":"contact","mode":"html"}'></div>` }), []);
});
