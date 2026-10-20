import assert from "node:assert/strict";
import test from "node:test";

import type { FormDefinitionRecord } from "@jini-ai/cms/forms";
import { buildFormDestinationManifest } from "../form-destination-manifest.js";

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
    { name: "visitor_note", required: false },
  ] }]);
  assert.equal(JSON.stringify(manifest).includes("owner@example.com"), false, "notification recipients never leave Tovu");
});

test("no active forms means an empty manifest", () => {
  assert.deepEqual(buildFormDestinationManifest({ definitions: [] }), []);
});
