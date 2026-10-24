import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { findCandidateDestination } from "../../../../apps/website/src/features/publish-trust/connect.ts";
import { readBundledDeployConfigCandidatePaths, readBundledDeployWorkflowFile } from "../../../../apps/website/src/features/deployments/deploy-config-registry.ts";

test("Fly declares deploy candidates and its workflow as data, usable before activation", async () => {
  const declaration = JSON.parse(readFileSync(new URL("../tovu-deploy-configs.json", import.meta.url), "utf8")).generators[0];
  assert.deepEqual(declaration.candidatePaths, [{ path: "fly.toml", order: 1 }, { path: ".github/workflows/fly-deploy.yml", order: 5 }]);
  assert.equal(declaration.workflowFile, "fly-deploy.yml");
  const required = { sourceRoot: fileURLToPath(new URL("../../", import.meta.url)) };
  assert.deepEqual(readBundledDeployConfigCandidatePaths(required), ["fly.toml", "render.yaml", "railway.toml", "app.json", ".github/workflows/fly-deploy.yml"]);
  assert.equal(readBundledDeployWorkflowFile(required), declaration.workflowFile);
  const reads = [];
  const candidate = await findCandidateDestination({ resolvePath: value => value, io: {
    read: async file => { reads.push(file); return file === declaration.candidatePaths[0].path ? 'TOVU_PUBLIC_URL="https://site.example.test"' : null; },
    write: async () => { throw new Error("read only"); },
  } }, {
    // c755ab25a: the host supplies plugin candidates; core defaults to neutral app.json only.
    candidatePaths: readBundledDeployConfigCandidatePaths(required),
  });
  assert.equal(candidate, "https://site.example.test");
  assert.deepEqual(reads, ["fly.toml"]);
});
