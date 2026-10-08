import { buildWidgetHostPorts } from "#src/features/widgets/deps";
import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryEntryRepo } from "#src/features/entries/index";
import { InMemoryFormDefinitionRepo } from "@jini-ai/cms/forms";
import { renderHtmlPageBody, renderWidgetIr } from "#src/server/inbound/public-http/http/site/render";
import { FORM_BASELINE_STYLE, injectFormSubmissionResultIntoHtml } from "#src/server/inbound/public-http/http/site/form-render";
import { renderHtmlForm } from "@jini-ai/cms/forms";
import { checkMarkupFile } from "#src/features/theme/validation/markup";
import { resolveHtmlPageEmbeds } from "@jini-ai/cms/widgets/html";
import { registerCoreResolver, createContactFormResolver } from "@jini-ai/cms/widgets/resolvers";
import { WIDGET_PAYLOAD_FIELD } from "@jini-ai/cms/widgets";
import { WIDGET_CONTENT_TYPE, WIDGET_FIELD_NAMESPACE } from "@jini-ai/cms/widgets";

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
  const resolved = await resolveHtmlPageEmbeds({ deps: { host: buildWidgetHostPorts({}, {}), ...deps }, input: { workspaceId: "ws", html } });
  assert.deepEqual(resolved.get("form")?.get("contact"), resolved.get("widget")?.get("widget-1"));
  const rendered = renderHtmlPageBody(html, resolved);
  assert.equal((rendered.match(/<form /g) ?? []).length, 3);
  assert.equal((rendered.match(/action="\/forms\/contact\/submit"/g) ?? []).length, 3);
  assert.match(rendered, /method="post"/);
  // `toolparam*` since 98ccfc6e0: published forms are WebMCP tools, one param per field.
  assert.match(rendered, /<label>Email<input type="email" name="email" data-tovu-field="email" toolparamtitle="Email" toolparamdescription="Email" required>/);
  assert.match(rendered, /name="_hp"/);
  // The form itself carries the theme hook (2026-10-05); generated field markup stays class-free.
  assert.equal((rendered.match(/<form class="tovu-form" data-tovu-form="contact"/g) ?? []).length, 3);
  assert.equal((rendered.match(/class=/g) ?? []).length, 3);
  assert.doesNotMatch(rendered, /style=|data-embed-config/);
});

test("HTML mode is per occurrence, and native POST results reveal plain confirmation/error slots", async () => {
  const deps = await harness();
  const html = `<div data-embed-config='{"type":"widget","id":"widget-1"}'></div><div data-embed-config='{"type":"widget","id":"widget-1","mode":"html"}'></div>`;
  const resolved = await resolveHtmlPageEmbeds({ deps: { host: buildWidgetHostPorts({}, {}), ...deps }, input: { workspaceId: "ws", html } });
  const rendered = renderHtmlPageBody(html, resolved);
  assert.match(rendered, /class="widget tovu-form widget-contact-form"/);
  assert.match(rendered, /<form class="tovu-form" data-tovu-form="contact"/);
  assert.equal(resolved.get("widget")?.get("widget-1")?.props.mode, undefined);
  const plainHtml = `<div data-embed-config='{"type":"form","id":"contact","mode":"html"}'></div>`;
  const plain = renderHtmlPageBody(plainHtml, await resolveHtmlPageEmbeds({ deps: { host: buildWidgetHostPorts({}, {}), ...deps }, input: { workspaceId: "ws", html: plainHtml } }));
  const success = injectFormSubmissionResultIntoHtml(plain, { kind: "success", slug: "contact" });
  assert.match(success, /data-tovu-form-success data-form-slug="contact" role="status">Thanks — your message has been sent\.<\/div>/);
  assert.match(success, /<form hidden class="tovu-form" data-tovu-form/);
  const failure = injectFormSubmissionResultIntoHtml(plain, { kind: "validation", slug: "contact", fieldErrors: [{ field: "email", reason: "invalid" }] });
  // A sentence from the field's label since 2e733c6a5 (friendly form errors), not "email: invalid".
  assert.match(failure, /role="alert">Please check your email\.<\/div>/);
});

test("HTML-mode forms carry the tovu-form hook and baseline style so they inherit the theme's form look", () => {
  const authored = '<label class="mine">Email<input class="author-input" name="email" type="email"></label>';
  const html = renderWidgetIr({ componentId: "contact-form", props: { slug: "contact", mode: "html", html: authored, fields: [] } });
  assert.equal(html.startsWith(FORM_BASELINE_STYLE), true);
  assert.match(html, /<form class="tovu-form" data-tovu-form="contact" data-form-slug="contact" /);
  // Author markup is never re-classed: the theme reaches it through `.tovu-form` descendant selectors.
  assert.match(html, /<label class="mine">Email<input class="author-input" name="email" type="email"><\/label>/);
  // Success/error slots keep the exact prefix the result-reveal regexes in form-render.ts match on.
  assert.match(html, /<div data-tovu-form-success data-form-slug="contact" role="status" hidden>/);
  assert.match(html, /<div data-tovu-form-error data-form-slug="contact" role="alert" hidden><\/div>/);
});

test("renderHtmlForm merges a host class with any extra classes instead of replacing them", () => {
  const html = renderHtmlForm({ slug: "contact", action: "/forms/contact/submit", fields: [] , hooks: { field: "data-tovu-field", form: "data-tovu-form", success: "data-tovu-form-success", error: "data-tovu-form-error" } }, { className: "tovu-form  author-form " });
  assert.match(html, /<form class="tovu-form author-form" data-tovu-form="contact"/);
  assert.match(renderHtmlForm({ slug: "contact", action: "/forms/contact/submit", fields: [] , hooks: { field: "data-tovu-field", form: "data-tovu-form", success: "data-tovu-form-success", error: "data-tovu-form-error" } }), /<form data-tovu-form="contact"/);
});

test("theme validator accepts restored form vocabulary and mode key", () => {
  assert.deepEqual(checkMarkupFile({ relativePath: "contact.html", content: `<div data-embed-config='{"type":"form","id":"contact","mode":"html"}'></div>` }), []);
});
