import assert from "node:assert/strict";
import test from "node:test";
import { pagesAgentToolCatalog } from "../agent-tools.js";

/**
 * Owner decision P10 G7-13: the admin agent adds WebMCP tags (`data-toolname`, `toolname`, ...) to
 * the pages it writes ONLY when the owner asks. Guidance is the default, there is no automatic
 * post-save tagging pass, and an unrequested page must not be littered with tool attributes.
 *
 * The region handles (`data-agent-element`) are a different thing: the page writer REFUSES a page
 * without them (`assertTopLevelSectionsAreTagged`) because later edits address a page by handle, so
 * they stay unconditional and are pinned by `webmcp-authoring.test.ts`.
 */

/** The one bullet of the writer's contract that starts with `heading`, up to the next bullet. */
function contractBullet({ description, heading }: { description: string; heading: string }, _optional = {}): string {
  const start = description.indexOf(`- ${heading}`);
  assert.notEqual(start, -1, `the contract must keep its "${heading}" bullet`);
  const next = description.indexOf("\n- ", start + 1);
  return description.slice(start, next === -1 ? undefined : next);
}

for (const name of ["pages_write_html", "pages_write_region"]) {
  test(`${name}: visitor-action WebMCP tags are added only when the owner asks, and no tagging pass runs after saving`, () => {
    const tool = pagesAgentToolCatalog.find((entry) => entry.name === name);
    assert.ok(tool, name);
    const bullet = contractBullet({ description: tool.description, heading: "BROWSER AGENTS" });
    assert.match(bullet, /only when the owner asks/i);
    assert.match(bullet, /by default add no/i);
    assert.match(bullet, /no tagging pass after saving/i);
    // The attribute names stay taught, so the model knows how to tag once it IS asked.
    assert.match(bullet, /data-toolname/);
  });

  test(`${name}: form tool attributes are added only when the owner asks, while the form's real contract is always preserved`, () => {
    const tool = pagesAgentToolCatalog.find((entry) => entry.name === name);
    assert.ok(tool, name);
    const bullet = contractBullet({ description: tool.description, heading: "REAL FORMS" });
    assert.match(bullet, /only when the owner asks/i);
    // Preserving action/method/field names is not optional: dropping them would break real submissions.
    assert.match(bullet, /preserve its action, method and field names/i);
  });
}
