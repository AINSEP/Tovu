import assert from "node:assert/strict";
import test from "node:test";

import { buildCreateForm, buildCreateOutcome } from "../custom-credential-create-ui.js";

/**
 * @file Shape pins for the "Save an API credential" card (Stryker lane L14: 44.3 %). The token field
 * must be the only secret, required field; prefills appear only when supplied; category defaults to
 * the catch-all `general`; and the outcome card reports the label and state verbatim.
 */

type Field = { name: string; kind: string; required?: boolean; secret?: boolean; value?: unknown; options?: Array<{ value: string }> };

test("an empty prefill: fixed field order, no prefilled values, category defaults to 'general', no Works-for picker", () => {
  const form = buildCreateForm({ prefill: {} });
  const fields = form.fields as unknown as Field[];
  assert.deepEqual(fields.map((f) => [f.name, f.kind, f.required ?? false, f.secret ?? false]), [
    ["label", "string", true, false],
    ["baseUrl", "string", true, false],
    ["category", "enum", true, false],
    ["username", "string", false, false],
    ["token", "string", true, true],
  ]);
  assert.equal("value" in fields[0]!, false);
  assert.equal("value" in fields[1]!, false);
  assert.equal(fields[2]!.value, "general");
  assert.deepEqual(fields[2]!.options, ["source-control", "hosting", "media", "ai", "ops", "general"].map((value) => ({ value })));
  assert.equal("value" in fields[4]!, false, "the token is never prefilled");
  assert.equal(form.title, "Save an API credential");
  assert.equal(form.submitLabel, "Save credential");
  assert.deepEqual(form.app, { appName: "tovu-custom-credential-create", appVersion: "1" });
  assert.deepEqual(form.preferredFrameSize, ["100%", "560px"]);
  assert.match(form.description ?? "", /the assistant never sees it/);
});

test("prefills are carried as values (including an empty-string label), and a catalog prefill adds the Works-for picker before username", () => {
  const form = buildCreateForm({
    prefill: { label: "", baseUrl: "https://api.example.test", category: "hosting", worksFor: ["vercel"] },
    providers: [{ id: "vercel", vendorId: "vercel" }],
  });
  const fields = form.fields as unknown as Field[];
  assert.deepEqual(fields.map((f) => f.name), ["label", "baseUrl", "category", "worksFor", "username", "token"]);
  assert.equal(fields[0]!.value, "");
  assert.equal(fields[1]!.value, "https://api.example.test");
  assert.equal(fields[2]!.value, "hosting");
  assert.deepEqual(fields[3]!.value, ["vercel"]);
});

test("buildCreateOutcome: success and failure titles, the label detail, state and message verbatim", () => {
  assert.deepEqual(buildCreateOutcome({ label: "repo", state: "success", message: "Saved." }), {
    title: "Credential saved", details: [{ label: "Label", value: "repo" }], state: "success", message: "Saved.",
    app: { appName: "tovu-custom-credential-create-outcome", appVersion: "1" }, preferredFrameSize: ["100%", "240px"],
  });
  const failed = buildCreateOutcome({ label: "repo", state: "failure", message: "Duplicate label." });
  assert.equal(failed.title, "Credential not saved");
  assert.equal(failed.state, "failure");
  assert.equal(failed.message, "Duplicate label.");
});
