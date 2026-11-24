import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { SUBAGENT_DISPATCH_MARKER, shouldPrefixSubagentDispatch, subagentDispatchPrefix } from "../subagent-dispatch-marker.js";

/**
 * Owner decision P10 G7-11: the `<<SUBAGENT_DISPATCH>>` first line only exists to skip the AI Dev
 * Shop startup ceremony that a site folder's `AGENTS.md` asks for. A site folder without that file
 * has no ceremony to skip, so its prompt must not start with an unexplained developer marker.
 */

const SITE = join("/sites", "demo");
const filesPresent = (...files: string[]) => (path: string) => files.map((file) => join(SITE, file)).includes(path);

test("the marker text is AGENTS.md's documented dispatch marker", () => {
  assert.equal(SUBAGENT_DISPATCH_MARKER, "<<SUBAGENT_DISPATCH>>");
});

test("a site folder with no AGENTS.md gets no marker, so the prompt starts with the owner's words", () => {
  const fileExists = filesPresent();
  assert.equal(shouldPrefixSubagentDispatch({ siteDir: SITE, fileExists }), false);
  assert.equal(subagentDispatchPrefix({ siteDir: SITE, fileExists }), "");
});

test("a site folder whose own AGENTS.md carries the startup ceremony gets the marker and a blank line", () => {
  const fileExists = filesPresent("AGENTS.md");
  assert.equal(shouldPrefixSubagentDispatch({ siteDir: SITE, fileExists }), true);
  assert.equal(subagentDispatchPrefix({ siteDir: SITE, fileExists }), "<<SUBAGENT_DISPATCH>>\n\n");
});

test("a vendored AI-Dev-Shop/AGENTS.md alone is enough to need the marker", () => {
  assert.equal(shouldPrefixSubagentDispatch({ siteDir: SITE, fileExists: filesPresent("AI-Dev-Shop/AGENTS.md") }), true);
});

test("only the site folder itself is looked at: the same file one level down does not count", () => {
  const seen: string[] = [];
  const fileExists = (path: string) => { seen.push(path); return path === join(SITE, "notes", "AGENTS.md"); };
  assert.equal(shouldPrefixSubagentDispatch({ siteDir: SITE, fileExists }), false);
  assert.deepEqual(seen, [join(SITE, "AGENTS.md"), join(SITE, "AI-Dev-Shop", "AGENTS.md")]);
});
