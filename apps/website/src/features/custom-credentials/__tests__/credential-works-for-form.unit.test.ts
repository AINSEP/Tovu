import assert from "node:assert/strict";
import test from "node:test";
import { buildCreateForm } from "../custom-credential-create-ui.js";

test("API card reuses multi-enum and suggests exact catalog labels only on creation", () => {
  const providers = [{ id: "vercel", vendorId: "vercel" }, { id: "github-pages", vendorId: "github" }];
  for (const [prefill, expected] of [[{ label: "Vercel" }, ["vercel"]], [{ label: "Production access" }, []], [{ label: "Vercel", worksFor: [] }, []]] as const) {
    const input = "worksFor" in prefill ? { label: prefill.label, worksFor: [...prefill.worksFor] } : { label: prefill.label };
    const form = buildCreateForm({ prefill: input, providers });
    const field = form.fields.find(field => field.name === "worksFor");
    assert.equal(field?.kind, "multi-enum");
    if (field?.kind !== "multi-enum") throw new Error("missing multi-enum");
    assert.deepEqual(field.value, expected);
    assert.ok(field.options.some(option => option.value === "github"));
    assert.ok(field.options.some(option => option.value === "github-pages"));
  }
});
