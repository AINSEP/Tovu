import assert from "node:assert/strict";
import test from "node:test";

import type { FormDefinitionRecord } from "@jini-ai/cms/forms";
import { buildFormDeliveryForm, buildFormDestinationManifest } from "../form-destination-manifest.js";

/** @file Unit tests for the generic form manifest handed to hosting targets. */

const base = { workspaceId: "w", name: "Waitlist", notify: { enabled: true, recipients: ["owner@example.com"] }, createdAt: "t", updatedAt: "t", version: 1 };
const waitlist: FormDefinitionRecord = { ...base, id: "f1", slug: "byho-waitlist", status: "active", fields: [
  { id: "email", label: "Email", type: "email", required: true, maxLength: 254 },
  { id: "interests", label: "Interests", type: "checkbox-group", required: true, options: [{ value: "a", label: "A" }] },
  { id: "consent", label: "Consent", type: "checkbox", required: true },
  { id: "note", name: "visitor_note", label: "Note", type: "textarea", required: false, maxLength: null },
] };

test("active forms map to names, required flags, lengths and multi-value groups only", () => {
  const manifest = buildFormDestinationManifest({ definitions: [waitlist, { ...waitlist, id: "f2", slug: "old", status: "disabled" }] });
  assert.deepEqual(manifest, [{ slug: "byho-waitlist", fields: [
    { name: "email", required: true, maxLength: 254 },
    { name: "interests", required: true, multiple: true },
    { name: "consent", required: true },
    { name: "visitor_note", required: false, maxLength: 2000 },
  ] }]);
  assert.equal(JSON.stringify(manifest).includes("owner@example.com"), false, "notification recipients never leave Tovu");
});

test("no active forms means an empty manifest", () => {
  assert.deepEqual(buildFormDestinationManifest({ definitions: [] }), []);
});

test("T9: the static-host manifest includes default text caps and preserves authored limits", () => {
  const manifest = buildFormDestinationManifest({ definitions: [{ ...waitlist, fields: [
    { id: "name", label: "Name", type: "text", required: false },
    waitlist.fields[0]!,
    waitlist.fields[3]!,
    { id: "token", label: "Token", type: "hidden", required: false },
    waitlist.fields[2]!,
  ] }] });

  assert.deepEqual(manifest, [{ slug: "byho-waitlist", fields: [
    { name: "name", required: false, maxLength: 100 },
    { name: "email", required: true, maxLength: 254 },
    { name: "visitor_note", required: false, maxLength: 2000 },
    { name: "token", required: false, maxLength: 2000 },
    { name: "consent", required: true },
  ] }]);
});

// ---- buildFormDeliveryForm: the snapshot a push delivery freezes when a submission is planned ----

test("the delivery form adds each field's label and type to the manifest's names, flags, lengths and groups", () => {
  assert.deepEqual(buildFormDeliveryForm({ definition: waitlist }), { slug: "byho-waitlist", fields: [
    { name: "email", required: true, maxLength: 254, label: "Email", type: "email" },
    { name: "interests", required: true, multiple: true, label: "Interests", type: "checkbox-group" },
    { name: "consent", required: true, label: "Consent", type: "checkbox" },
    { name: "visitor_note", required: false, label: "Note", type: "textarea" },
  ] });
});

test("the delivery form is built whatever the definition's status is now (the submission was already accepted)", () => {
  assert.equal(buildFormDeliveryForm({ definition: { ...waitlist, slug: "old", status: "disabled" } }).slug, "old");
});

test("the delivery form never carries notification recipients or option lists", () => {
  const form = JSON.stringify(buildFormDeliveryForm({ definition: waitlist }));
  assert.equal(form.includes("owner@example.com"), false);
  assert.equal(form.includes("options"), false);
});
