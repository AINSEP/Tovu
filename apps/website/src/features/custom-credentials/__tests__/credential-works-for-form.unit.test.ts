import assert from "node:assert/strict";
import test from "node:test";
import { buildCreateForm, type CreateCredentialPrefill } from "../custom-credential-create-ui.js";

const providers = [{ id: "vercel", vendorId: "vercel" }, { id: "github-pages", vendorId: "github" }, { id: "s3-compatible", vendorId: "s3-compatible" }];

function worksForField(prefill: CreateCredentialPrefill) {
  const field = buildCreateForm({ prefill, providers }).fields.find(field => field.name === "worksFor");
  if (field !== undefined && field.kind !== "multi-enum") throw new Error("worksFor must be a multi-enum");
  return field;
}

test("API card reuses multi-enum and suggests exact catalog labels only on creation", () => {
  for (const [prefill, expected] of [[{ label: "Vercel" }, ["vercel"]], [{ label: "Production access", category: "hosting" }, []], [{ label: "Vercel", worksFor: [], category: "hosting" }, []]] as const) {
    const input = "worksFor" in prefill ? { ...prefill, worksFor: [...prefill.worksFor] } : prefill;
    const field = worksForField(input);
    assert.deepEqual(field?.value, expected);
    assert.ok(field?.options.some(option => option.value === "github"));
    assert.ok(field?.options.some(option => option.value === "github-pages"));
  }
});

test("a non-hosting credential gets no Works-for picker and no deploy host", () => {
  for (const prefill of [{ label: "Tovu Mail — Resend API" }, { label: "Tovu Mail — Resend API", category: "general" }, { label: "Production access" }, { label: "Vercel", worksFor: [] }, {}]) {
    assert.equal(worksForField(prefill), undefined, JSON.stringify(prefill));
  }
});

test("a shown Works-for picker says it is optional and when to leave it empty", () => {
  const field = worksForField({ label: "Vercel" });
  assert.equal(field?.label, "Works for (optional)");
  assert.match(field?.hint ?? "", /Leave this empty unless this is a hosting or deploy key/);
  assert.equal(field?.required, undefined);
});

test("source-control credentials still get the catalog", () => {
  assert.ok(worksForField({ label: "My repo", category: "source-control" })?.options.some(option => option.value === "github"));
});

test("prefilled non-catalog targets are the only options offered", () => {
  const field = worksForField({ label: "Tovu Mail — Resend API", worksFor: ["resend"] });
  assert.deepEqual(field?.options.map(option => option.value), ["resend"]);
  assert.deepEqual(field?.value, ["resend"]);
});

test("a prefilled catalog target keeps the whole catalog and its selection", () => {
  const field = worksForField({ label: "Production access", worksFor: ["vercel"] });
  assert.deepEqual(field?.value, ["vercel"]);
  assert.deepEqual(field?.options.map(option => option.value), ["vercel", "github-pages", "github", "s3-compatible"]);
});
