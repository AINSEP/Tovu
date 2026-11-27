import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { renderWidgetContactForm } from "@jini-ai/cms/public-http/http/site/render/contact-form-widget";
import { renderWidgetPostContent } from "@jini-ai/cms/public-http/http/site/render/widgets/post-content";
import { renderWidgetEntrySummary, renderWidgetRecentEntries, renderWidgetSocialLinks } from "@jini-ai/cms/public-http/http/site/render/widgets/social-entries";

import { TOVU_WIDGET_RENDER_HOST as host } from "../widget-render-host.js";
import * as cases from "./widget-render-host-cases.js";

/**
 * @file Byte pin: the widget renderers live in Jini and take their class names and the contact-form
 * copy from the host, so Tovu's binding must reproduce the legacy markup exactly. The fixture was
 * recorded from the renderers BEFORE their classes and copy moved behind the host objects.
 */
const pinned = JSON.parse(readFileSync(new URL("./fixtures/widget-render-host.bytes.json", import.meta.url), "utf8")) as Record<string, string | string[]>;
const form = { ...host.contactForm, newOccurrenceId: () => "fixed" };

test("social-links, entry-summary and recent-entries keep their legacy bytes", () => {
  assert.equal(renderWidgetSocialLinks({ props: cases.SOCIAL_PROPS, host: host.entries }), pinned.social);
  assert.deepEqual(cases.ENTRY_SUMMARY_PROPS.map((props) => renderWidgetEntrySummary({ props, host: host.entries })), pinned.summary);
  assert.equal(renderWidgetRecentEntries({ ir: cases.RECENT_IR, host: host.entries }), pinned.recent);
  assert.equal(renderWidgetRecentEntries({ ir: cases.RECENT_EMPTY_IR, host: host.entries }), pinned.recentEmpty);
});

test("post-content keeps its legacy header, meta and body bytes", () => {
  assert.equal(renderWidgetPostContent({ props: cases.POST_PROPS, docRendering: cases.POST_DOC_RENDERING, host: host.postContent }), pinned.post);
  assert.equal(renderWidgetPostContent({ props: cases.POST_NO_HEADER_PROPS, docRendering: cases.POST_DOC_RENDERING, host: host.postContent }), pinned.postNoHeader);
});

test("contact-form keeps its legacy shell classes, fallback copy and button label (built-in and HTML mode)", () => {
  assert.equal(renderWidgetContactForm({ props: cases.FORM_BUILTIN_PROPS, host: form }), pinned.formBuiltin);
  assert.equal(renderWidgetContactForm({ props: cases.FORM_BUILTIN_MESSAGE_PROPS, host: form }), pinned.formBuiltinMessage);
  assert.equal(renderWidgetContactForm({ props: cases.FORM_HTML_PROPS, host: form }), pinned.formHtml);
  // The pinned bytes really carry the values this binding supplies (not an empty default).
  const builtin = String(pinned.formBuiltin);
  for (const legacy of ["widget widget-contact-form", "Thanks — your message has been sent.", "widget-contact-form-success", "widget-contact-form-error", "Send"]) assert.ok(builtin.includes(legacy) || (legacy === "widget widget-contact-form" && /class="widget [^"]* widget-contact-form"/.test(builtin)), `pinned bytes lack ${legacy}`);
});

test("repeated contact widgets use different field ids and keep each label bound to its own input", () => {
  const props = { slug: "contact", fields: [{ id: "email", type: "email", label: "Email" }] };
  const fieldId = (html: string) => {
    const input = /<input\b[^>]*\bid="(widget-contact-[\da-f-]+-email)"[^>]*>/.exec(html);
    assert.ok(input, "the email control has an occurrence-scoped id");
    assert.ok(html.includes(`for="${input[1]}"`), "the email label targets that control");
    assert.match(input[1], /^widget-contact-[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}-email$/);
    return input[1];
  };

  const first = fieldId(renderWidgetContactForm({ props, host: host.contactForm }));
  const second = fieldId(renderWidgetContactForm({ props, host: host.contactForm }));
  assert.notEqual(first, second, "two contact widgets cannot share document ids");
});
