import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { planV2Migration } from "../theme-migration-plan";

function makeDeclarativeThemeDir(extraRootFile?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-plan-declarative-"));
  fs.writeFileSync(path.join(dir, "theme.json"), JSON.stringify({ id: "t", tier: "declarative" }), "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(dir, "styles.css"), "body {}", "utf8");
  fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
  fs.writeFileSync(path.join(dir, "templates/home.json"), '{"type":"doc"}', "utf8");
  fs.writeFileSync(path.join(dir, "templates/entry.json"), '{"type":"doc"}', "utf8");
  if (extraRootFile) fs.writeFileSync(path.join(dir, extraRootFile), "unexpected", "utf8");
  return dir;
}

test("planV2Migration (declarative) moves styles.css to css/theme.css and templates/*.json to render/pages/", () => {
  const dir = makeDeclarativeThemeDir();
  const plan = planV2Migration({ themeDir: dir, tier: "declarative" });
  assert.deepEqual(plan.unrecognized, []);
  const moveMap = Object.fromEntries(plan.moves.map((m) => [m.from, m.to]));
  assert.equal(moveMap["styles.css"], "css/theme.css");
  assert.equal(moveMap["templates/home.json"], "render/pages/home.json");
  assert.equal(moveMap["templates/entry.json"], "render/pages/entry.json");
});

test("planV2Migration (declarative) flags an unrecognized root-level file rather than silently dropping it", () => {
  const dir = makeDeclarativeThemeDir("README.md");
  const plan = planV2Migration({ themeDir: dir, tier: "declarative" });
  assert.deepEqual(plan.unrecognized, ["README.md"]);
});

test("planV2Migration (declarative) flags an unrecognized file inside templates/ (a non-.json entry)", () => {
  const dir = makeDeclarativeThemeDir();
  fs.writeFileSync(path.join(dir, "templates/notes.txt"), "hi", "utf8");
  const plan = planV2Migration({ themeDir: dir, tier: "declarative" });
  assert.deepEqual(plan.unrecognized, ["templates/notes.txt"]);
});

test("planV2Migration throws for a tier with no migration plan implemented yet", () => {
  const dir = makeDeclarativeThemeDir();
  assert.throws(() => planV2Migration({ themeDir: dir, tier: "static" }), /no v2 migration plan implemented yet for tier 'static'/);
});
