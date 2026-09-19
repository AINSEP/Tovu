import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function source(relativePath: string): string {
  return fs.readFileSync(path.join(SRC_ROOT, relativePath), "utf8");
}

test("the obsolete not-implemented apply stub and its 501 response are absent", () => {
  const production = [
    source("features/publish-content/gated-hooks.ts"),
    source("server/inbound/admin-http/routes/publish-content/import.ts"),
  ].join("\n");
  assert.doesNotMatch(production, /PublishContentApplyNotImplementedError/);
  assert.doesNotMatch(production, /createNotYetImplementedPublishContentApplyPort/);
  assert.doesNotMatch(production, /APPLY_NOT_IMPLEMENTED/);
});

test("positive control: both composition roots construct the real apply port", () => {
  const composition = [
    source("server/runtime/composition/deps.ts"),
    source("server/runtime/composition/app.ts"),
  ].join("\n");
  const calls = composition.match(/= createPublishContentApplyPort\(/g) ?? [];
  assert.equal(calls.length, 2);
});
