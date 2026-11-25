import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { checkEnvReads } from "../check-env-schema.mjs";

const ts = createRequire(import.meta.url)("typescript");

const FIXTURE = `
const port = process.env.PORT;
const fromBracket = process.env["BRACKET_ONLY"];
const { DESTRUCTURED_ONLY } = process.env;
function boot({ env }) { return env.INJECTED_ONLY; }
process.env.ASSIGNED_ONLY = "1";
delete process.env.DELETED_ONLY;
`;

test("an undeclared env read fails the check", () => {
  const files = [{ path: "apps/website/src/fixture.ts", text: FIXTURE }];
  const failing = checkEnvReads({ ts, files, declared: new Set(["PORT"]) });
  assert.equal(failing.ok, false);
  // Bracket and destructured reads count; assignments and deletes are writes, not reads.
  assert.deepEqual([...new Set(failing.undeclared.map((read) => read.name))].sort(), ["BRACKET_ONLY", "DESTRUCTURED_ONLY", "INJECTED_ONLY"]);
  assert.ok(failing.undeclared.every((read) => read.file === "apps/website/src/fixture.ts" && read.line > 0));

  const passing = checkEnvReads({ ts, files, declared: new Set(["PORT", "BRACKET_ONLY", "DESTRUCTURED_ONLY", "INJECTED_ONLY"]) });
  assert.equal(passing.ok, true);
  assert.deepEqual(passing.undeclared, []);
});
