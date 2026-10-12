import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { FIELD_TYPE_REGISTRY, MAX_NAME_LENGTH, SLUG_PATTERN, validateFieldDescriptors, type FieldDescriptor } from "@jini-ai/cms/forms";
import { renderWidgetIr } from "../../../server/inbound/public-http/http/site/render.js";

/**
 * @file The all-fields demo form (`fixtures/all-fields-demo.json`): one field of every registry type,
 * used to create a real form on a site and eyeball every control on a public page. It has to stay a
 * definition the CMS accepts, or that manual check starts with a refused create.
 */

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/all-fields-demo.json", import.meta.url), "utf8")) as {
  name: string; slug: string; fields: FieldDescriptor[];
};

test("all-fields demo: the CMS accepts the definition, name and slug included", () => {
  assert.deepEqual(validateFieldDescriptors({ fields: fixture.fields }), { valid: true });
  assert.ok(fixture.name.length > 0 && fixture.name.length <= MAX_NAME_LENGTH);
  assert.match(fixture.slug, SLUG_PATTERN);
});

test("all-fields demo: exactly one field of every registry type, so a new type fails here until it is added", () => {
  assert.deepEqual(fixture.fields.map((field) => field.type).sort(), Object.keys(FIELD_TYPE_REGISTRY).sort());
});

test("all-fields demo: the Topic select carries the contact-page topics in order", () => {
  const topic = fixture.fields.find((field) => field.id === "topic");
  assert.equal(topic?.type, "select");
  assert.deepEqual(topic?.options?.map((option) => option.label),
    ["Request Planner or Day-of Producer", "Current Event", "How it works", "Issue", "Other", "Press"]);
});

test("all-fields demo: the public render emits every field with its native control", () => {
  const html = renderWidgetIr({ componentId: "contact-form", props: { slug: fixture.slug, fields: fixture.fields as never } });
  for (const field of fixture.fields) assert.ok(html.includes(`data-tovu-field="${field.id}"`), `${field.id} rendered`);
  assert.match(html, /<select[^>]*data-tovu-field="topic"/);
  assert.match(html, /<select[^>]*data-tovu-field="services"[^>]* multiple/);
  assert.match(html, /<fieldset[^>]*>\s*<legend>Event type \*<\/legend>/);
  assert.match(html, /type="checkbox"[^>]*data-tovu-field="tips"[^>]* role="switch"/);
  assert.match(html, /type="range"[^>]*data-tovu-field="budget"/);
  assert.match(html, /enctype="multipart\/form-data"/);
  assert.match(html, /<script>/, "range readout ships with the slider");
});
