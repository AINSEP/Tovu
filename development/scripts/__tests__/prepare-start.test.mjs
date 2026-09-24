import assert from "node:assert/strict";
import test from "node:test";

import { planStartSteps } from "../prepare-start.mjs";

/**
 * @file `planStartSteps` — what `npm start`'s `prestart` builds before `node dist/src/index.js`
 * runs. A fresh clone or unzipped copy has no `dist/`, no `apps/admin/dist` and no
 * `apps/site-chat/dist` (all gitignored), so a bare `npm start` either crashed on the missing entry
 * or served "Admin shell not built" at /admin. The plan builds only what is missing, in the same
 * order the Dockerfile does, and never rebuilds something that is already there and fresh.
 *
 * Slice 3 (npm-start-just-works-plan-2026-09-24): prestart now REBUILDS a stale `dist/` or app
 * build automatically instead of only warning about it, because it runs `build:server`/`build:local`
 * directly — the same commands `build` wraps, minus `check-no-linked-jini.mjs`'s guard that blocks a
 * full `npm run build` on a machine with Jini npm-linked (this repo's own dev machine). Per-app
 * staleness is tracked with a build stamp file (`apps/<app>/dist/.tovu-build-sha`, written by `main()`
 * after each app build; `builtStamps` here is `main()`'s already-read `{ admin, "site-chat" }`
 * contents), the same idea `dist/runtime-manifest.json`'s `tovuSha` already gives the server.
 * `staleWarning` is gone from the return value entirely — a stale build is now fixed, not reported.
 *
 * Run with: `node --test development/scripts/__tests__/prepare-start.test.mjs`
 */

const BUILT = ["dist/runtime-manifest.json", "apps/admin/dist/index.html", "apps/admin/node_modules", "apps/site-chat/dist/site-assistant.js", "apps/site-chat/node_modules"];
const FRESH_STAMPS = { admin: "abc1234def", "site-chat": "abc1234def" };

function hasOnly(paths) {
  const set = new Set(paths);
  return (rel) => set.has(rel);
}

test("a fresh clone (after npm install) builds the server, then installs and builds admin and site-chat", () => {
  const plan = planStartSteps({ has: hasOnly([]), builtSha: null, headSha: "abc1234def", builtStamps: {} });
  assert.deepEqual(
    plan.steps.map((s) => s.args),
    [
      ["run", "build:server"],
      ["--prefix", "apps/admin", "install"],
      ["--prefix", "apps/admin", "run", "build:local"],
      ["--prefix", "apps/site-chat", "install"],
      ["--prefix", "apps/site-chat", "run", "build:local"],
    ],
  );
});

test("everything already built and fresh: no steps, so npm start goes straight to the server", () => {
  const plan = planStartSteps({ has: hasOnly(BUILT), builtSha: "abc1234def", headSha: "abc1234def", builtStamps: FRESH_STAMPS });
  assert.deepEqual(plan.steps, []);
});

test("an app whose node_modules exists but whose dist does not is built without reinstalling", () => {
  const plan = planStartSteps({
    has: hasOnly(["dist/runtime-manifest.json", "apps/admin/node_modules", "apps/site-chat/dist/site-assistant.js"]),
    builtSha: "abc1234def",
    headSha: "abc1234def",
    builtStamps: { "site-chat": "abc1234def" },
  });
  assert.deepEqual(plan.steps.map((s) => s.args), [["--prefix", "apps/admin", "run", "build:local"]]);
});

test("a dist/src/index.js left by a failed build does not count: the manifest is the done marker", () => {
  const plan = planStartSteps({ has: hasOnly(["dist/src/index.js", ...BUILT.slice(1)]), builtSha: null, headSha: "abc1234def", builtStamps: FRESH_STAMPS });
  assert.deepEqual(plan.steps.map((s) => s.args), [["run", "build:server"]]);
});

test("server sha != HEAD: rebuilt via build:server, not just warned about", () => {
  const plan = planStartSteps({
    has: hasOnly(BUILT),
    builtSha: "1111111aaaa",
    headSha: "2222222bbbb",
    builtStamps: { admin: "2222222bbbb", "site-chat": "2222222bbbb" }, // apps stay fresh; isolates server staleness
  });
  assert.deepEqual(plan.steps.map((s) => s.args), [["run", "build:server"]]);
});

test("missing admin stamp (dist present, never stamped) is treated as stale and rebuilt", () => {
  const plan = planStartSteps({ has: hasOnly(BUILT), builtSha: "abc1234def", headSha: "abc1234def", builtStamps: { "site-chat": "abc1234def" } });
  assert.deepEqual(plan.steps.map((s) => s.args), [["--prefix", "apps/admin", "run", "build:local"]]);
});

test("app stamp equals HEAD: no step for that app", () => {
  const plan = planStartSteps({ has: hasOnly(BUILT), builtSha: "abc1234def", headSha: "abc1234def", builtStamps: FRESH_STAMPS });
  assert.deepEqual(plan.steps, []);
});

test("headSha null (no git, e.g. an unzipped copy): nothing already built is ever treated as stale", () => {
  const plan = planStartSteps({ has: hasOnly(BUILT), builtSha: "1111111aaaa", headSha: null, builtStamps: { admin: "9999999zzzz" } });
  assert.deepEqual(plan.steps, []);
});

test('no staleness rebuild when builtSha is the legacy "unknown" sentinel (old builds wrote it when git was unavailable)', () => {
  const plan = planStartSteps({
    has: hasOnly(BUILT),
    builtSha: "unknown",
    headSha: "2222222bbbb",
    builtStamps: { admin: "2222222bbbb", "site-chat": "2222222bbbb" }, // apps stay fresh; isolates the server sentinel check
  });
  assert.deepEqual(plan.steps, []);
});

test("staleWarning is gone: the return value carries no such field", () => {
  const plan = planStartSteps({ has: hasOnly(BUILT), builtSha: "1111111aaaa", headSha: "2222222bbbb", builtStamps: FRESH_STAMPS });
  assert.equal("staleWarning" in plan, false);
});

test("app build steps carry their own app name, so main() knows which stamp file to write after success", () => {
  const plan = planStartSteps({ has: hasOnly([]), builtSha: null, headSha: "abc1234def", builtStamps: {} });
  const appSteps = plan.steps.filter((s) => s.args.includes("run") && s.args.includes("build:local"));
  assert.deepEqual(
    appSteps.map((s) => s.app),
    ["admin", "site-chat"],
  );
});
