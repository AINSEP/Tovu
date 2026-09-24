import assert from "node:assert/strict";
import test from "node:test";

import { planStartSteps } from "../prepare-start.mjs";

/**
 * @file `planStartSteps` — what `npm start`'s `prestart` builds before `node dist/src/index.js`
 * runs. A fresh clone or unzipped copy has no `dist/`, no `apps/admin/dist` and no
 * `apps/site-chat/dist` (all gitignored), so a bare `npm start` either crashed on the missing entry
 * or served "Admin shell not built" at /admin. The plan builds only what is missing, in the same
 * order the Dockerfile does, and never rebuilds something that is already there.
 *
 * Run with: `node --test development/scripts/__tests__/prepare-start.test.mjs`
 */

const BUILT = ["dist/runtime-manifest.json", "apps/admin/dist/index.html", "apps/admin/node_modules", "apps/site-chat/dist/site-assistant.js", "apps/site-chat/node_modules"];

function hasOnly(paths) {
  const set = new Set(paths);
  return (rel) => set.has(rel);
}

test("a fresh clone (after npm install) builds the server, then installs and builds admin and site-chat", () => {
  const plan = planStartSteps({ has: hasOnly([]), builtSha: null, headSha: "abc1234def" });
  assert.deepEqual(
    plan.steps.map((s) => s.args),
    [
      ["run", "build"],
      ["--prefix", "apps/admin", "install"],
      ["--prefix", "apps/admin", "run", "build"],
      ["--prefix", "apps/site-chat", "install"],
      ["--prefix", "apps/site-chat", "run", "build"],
    ],
  );
  assert.equal(plan.staleWarning, null);
});

test("everything already built: no steps, so npm start goes straight to the server", () => {
  const plan = planStartSteps({ has: hasOnly(BUILT), builtSha: "abc1234def", headSha: "abc1234def" });
  assert.deepEqual(plan.steps, []);
  assert.equal(plan.staleWarning, null);
});

test("an app whose node_modules exists but whose dist does not is built without reinstalling", () => {
  const plan = planStartSteps({
    has: hasOnly(["dist/runtime-manifest.json", "apps/admin/node_modules", "apps/site-chat/dist/site-assistant.js"]),
    builtSha: "abc1234def",
    headSha: "abc1234def",
  });
  assert.deepEqual(plan.steps.map((s) => s.args), [["--prefix", "apps/admin", "run", "build"]]);
});

test("a dist/src/index.js left by a failed build does not count: the manifest is the done marker", () => {
  const plan = planStartSteps({ has: hasOnly(["dist/src/index.js", ...BUILT.slice(1)]), builtSha: null, headSha: "abc1234def" });
  assert.deepEqual(plan.steps.map((s) => s.args), [["run", "build"]]);
});

test("a dist built from another commit is not rebuilt, only warned about, with the exact fix", () => {
  const plan = planStartSteps({ has: hasOnly(BUILT), builtSha: "1111111aaaa", headSha: "2222222bbbb" });
  assert.deepEqual(plan.steps, []);
  assert.equal(
    plan.staleWarning,
    "tovu: dist/ was built from commit 1111111, but this checkout is at 2222222. If the server fails to start, run `npm run build` first.",
  );
});

test("no staleness warning when either sha is unknown (a zip has no git; old builds wrote \"unknown\")", () => {
  for (const [builtSha, headSha] of [["unknown", "2222222bbbb"], ["1111111aaaa", null], [null, "2222222bbbb"]]) {
    assert.equal(planStartSteps({ has: hasOnly(BUILT), builtSha, headSha }).staleWarning, null);
  }
});
