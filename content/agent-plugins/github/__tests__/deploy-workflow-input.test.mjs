import assert from "node:assert/strict";
import test from "node:test";
import actions from "../deploy-ops/github-actions.mjs";

const sha = "a".repeat(40);
test("host-provided workflow reaches the dispatch URL and summary without a vendor default", async () => {
  const sends = [];
  const ctx = { fail: message => { throw new Error(message); }, nowIso: () => "2026-10-22T00:00:00Z", get: async () => ({ json: { sha } }), send: async request => { sends.push(request); return { json: { workflow_run_id: 42 } }; } };
  const result = await actions.deploy(ctx, { target: "example/site", workflowFile: "example-pipeline.yaml" });
  assert.equal(sends[0].url, "https://api.github.com/repos/example/site/actions/workflows/example-pipeline.yaml/dispatches");
  assert.equal(sends[0].body.inputs.expected_sha, sha);
  assert.match(result.summary, /^Dispatched example-pipeline.yaml /);
});
test("missing and escaping workflow names refuse before any network operation", async () => {
  for (const workflowFile of [undefined, "", "../escape.yml", "a/b.yml", "file.yml?x", 7]) {
    await assert.rejects(actions.deploy({ fail: message => { throw new Error(message); }, get: async () => { throw new Error("must not fetch"); } }, { target: "example/site", workflowFile }), { message: "A declared deployment workflow filename is required." });
  }
});
