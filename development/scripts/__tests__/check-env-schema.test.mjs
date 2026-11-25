import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { checkEnvReads, compareEnvDebt, envReadDebt } from "../check-env-schema.mjs";

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

test("a new undeclared read fails even when old debt is baselined", () => {
  const declared = new Set(["PORT"]);
  const old = [{ path: "apps/website/src/fixture.ts", text: FIXTURE }];
  const baseline = envReadDebt({ undeclared: checkEnvReads({ ts, files: old, declared }).undeclared });
  // The baseline holds names and files with counts, never values.
  assert.deepEqual(baseline["BRACKET_ONLY::apps/website/src/fixture.ts"], { count: 1 });
  assert.deepEqual(compareEnvDebt({ baseline, current: baseline }).violations, []);

  const grown = [
    { path: "apps/website/src/fixture.ts", text: `${FIXTURE}\nconst again = process.env.BRACKET_ONLY;\nconst fresh = process.env.BRAND_NEW;` },
    { path: "apps/desktop/src/other.ts", text: "const moved = process.env.INJECTED_ONLY;" },
  ];
  const current = envReadDebt({ undeclared: checkEnvReads({ ts, files: grown, declared }).undeclared });
  const { violations } = compareEnvDebt({ baseline, current });
  assert.deepEqual(violations.map((v) => v.key).sort(), [
    "BRACKET_ONLY::apps/website/src/fixture.ts",
    "BRAND_NEW::apps/website/src/fixture.ts",
    "INJECTED_ONLY::apps/desktop/src/other.ts",
  ]);

  const paid = envReadDebt({ undeclared: checkEnvReads({ ts, files: old, declared: new Set(["PORT", "BRACKET_ONLY"]) }).undeclared });
  const shrink = compareEnvDebt({ baseline, current: paid });
  assert.deepEqual(shrink.violations, []);
  assert.deepEqual(shrink.shrunk, ["BRACKET_ONLY::apps/website/src/fixture.ts"]);
});
