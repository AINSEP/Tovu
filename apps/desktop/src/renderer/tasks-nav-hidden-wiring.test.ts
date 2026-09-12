/**
 * @file The Tasks nav entry is hidden from the top nav at the owner's request, checked as source
 * text — this repo has no DOM runner for `.tsx` (see `use-add-site.hooks.test.ts`'s own header, and
 * `marketplace-nav-wiring.test.ts` for the sibling case). `RunnerSectionId` values are a public
 * contract used in agent tool schemas and URLs (see `sections.ts`'s header): "add, deprecate, alias
 * — but do not rename in place." Hiding Tasks must not delete the `tasks` id, its section record, or
 * any of its `desktop.*` tools — only `visibleSections()`'s existing `hidden` flag changes, the same
 * mechanism `templates`, `deploy`, `diagnostics`, `api-keys`, `settings`, and `account` already use.
 *
 * Every assertion runs against COMMENT-STRIPPED source, same discipline `marketplace-nav-wiring.test.ts`
 * uses — this file's own doc comments discuss `hidden`, `tasks`, and `desktop.queue_task` by name, and
 * a naive substring match would pass on the prose instead of the code.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function withoutComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const sectionsSource = fs.readFileSync(path.join(here, "..", "contracts", "sections.ts"), "utf8");
const sections = withoutComments(sectionsSource);

/** The `tasks` entry's own object literal within `RUNNER_SECTIONS`, so a match cannot be
 *  satisfied by a sibling section that happens to share a field value. */
function tasksEntry() {
  const start = sections.indexOf("id: 'tasks'");
  assert.notEqual(start, -1, "no 'tasks' entry in RUNNER_SECTIONS");
  const objectStart = sections.lastIndexOf("{", start);
  const objectEnd = sections.indexOf("},", start);
  return sections.slice(objectStart, objectEnd);
}

test("tasks is still a registered RunnerSectionId", () => {
  assert.match(sections, /export type RunnerSectionId =[\s\S]*?\|\s*'tasks'/);
});

test("tasks is hidden from the nav", () => {
  const entry = tasksEntry();
  assert.match(entry, /hidden:\s*true/, "Tasks must be parked hidden, not left rendering in the nav");
  assert.match(entry, /label:\s*'Tasks'/);
});

test("tasks keeps all of its desktop.* tools even though it is hidden", () => {
  const entry = tasksEntry();
  assert.match(entry, /tools:\s*\[\s*'desktop\.queue_task',\s*'desktop\.task\.list',\s*'desktop\.task\.cancel',?\s*\]/);
});
