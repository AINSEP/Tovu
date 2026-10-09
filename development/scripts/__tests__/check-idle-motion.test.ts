import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkIdleMotion, cssDeclarations } from "../check-idle-motion.js";

/**
 * @file `check-idle-motion.ts` — the idle-CPU static guard. The live tree must be clean, and each
 * rule must actually fire on a planted offender (a guard that passes on everything proves nothing).
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function plant(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "idle-motion-"));
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}

function planted(files: Record<string, string>) {
  const root = plant(files);
  try {
    return checkIdleMotion(root).filter((v) => v.rule !== "stale-allowlist");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("the live tree has no idle-CPU offenders and no stale allowlist entries", () => {
  assert.deepEqual(checkIdleMotion(REPO_ROOT), []);
});

test("an absent allowed spinner produces its exact stale-allowlist violation", (t) => {
  const root = plant({});
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.deepEqual(checkIdleMotion(root).filter((v) => v.detail.endsWith("app.css::.spinner")), [{
    rule: "stale-allowlist", file: "apps/desktop/src/renderer/app.css", line: 0,
    detail: "INFINITE_ANIMATION_ALLOWLIST entry matches nothing: apps/desktop/src/renderer/app.css::.spinner",
  }]);
});

test("an allowed infinite spinner still requires reduced-motion support", () => {
  assert.deepEqual(planted({ "apps/desktop/src/renderer/app.css": ".spinner { animation: spin 1s infinite; }" }), [{
    rule: "reduced-motion", file: "apps/desktop/src/renderer/app.css", line: 1,
    detail: "has an infinite animation but no prefers-reduced-motion rule",
  }]);
});

test("an infinite CSS animation outside the allowlist fails, with its selector", () => {
  const found = planted({ "apps/admin/src/x.css": ".glow {\n  animation: pulse 1s infinite;\n}\n" });
  assert.deepEqual(
    found.map((v) => [v.rule, v.file, v.line]),
    [["infinite-animation", "apps/admin/src/x.css", 2]],
  );
});

test("a commented-out infinite animation and a finite one pass", () => {
  assert.deepEqual(planted({ "apps/admin/src/x.css": "/* animation: a 1s infinite; */\n.a { animation: a 1s linear 3; }\n" }), []);
});

test("an autoplaying or looping video in UI markup fails", () => {
  const found = planted({ "apps/admin/src/V.tsx": "export const V = () => <video src={s} autoPlay muted />;\nexport const W = () => <video src={s} loop />;\n" });
  assert.deepEqual(found.map((v) => v.rule), ["media-autoplay", "media-autoplay"]);
});

test("turning off Electron background throttling fails", () => {
  const found = planted({ "apps/desktop/main.ts": "new BrowserWindow({ webPreferences: { backgroundThrottling: false } });\n" });
  assert.deepEqual(found.map((v) => v.rule), ["background-throttling"]);
});

test("a bare setInterval in UI code fails; one in a comment does not", () => {
  const found = planted({
    "apps/site-chat/src/poll.ts": "// setInterval(tick, 1000)\nexport const t = setInterval(() => {}, 1000);\n",
  });
  assert.deepEqual(found.map((v) => [v.rule, v.line]), [["bare-interval", 2]]);
});

test("a Tailwind infinite animation class fails", () => {
  assert.deepEqual(planted({ "apps/admin/src/S.tsx": 'export const S = () => <span className="animate-spin" />;\n' }).map((v) => v.rule), ["infinite-animation"]);
});

test("cssDeclarations keeps the innermost selector across @media blocks", () => {
  const found = cssDeclarations("@media (min-width: 1px) { .a .b { color: red; animation: x 1s infinite } }");
  assert.deepEqual(found.map((d) => [d.selector, d.declaration]), [
    [".a .b", "color: red"],
    [".a .b", "animation: x 1s infinite"],
  ]);
});
