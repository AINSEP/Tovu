/**
 * @file Coverage for `sites-mcp-tools.js` — the tool table the assistant is offered and the
 * handlers behind it.
 *
 * Two groups of load-bearing assertions:
 *
 * 1. **Table-wide invariants**, asserted over the WHOLE table rather than per tool, so a tool added
 *    later is covered by them without anyone remembering to. The one that matters most is that
 *    nothing declares `destructiveHint: true` — `trust.ts:325` refuses such a tool unconditionally,
 *    so a tool that declared it would be silently absent from the assistant with no failing test.
 * 2. **Refusals**, which are where the damage would be. `add_site_pointer` must refuse a folder
 *    that is not already a site and write nothing; `reveal_site_folder` must refuse a path the
 *    app is not tracking and must not reach the file manager at all.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { SITES_MCP_TOOLS, describeSitesMcpTools, runSitesMcpTool } from "./sites-mcp-tools.ts";
import { SITE_ORIGIN, sitesFilePath, readTrackedSites, trackSite } from "./tracked-sites.ts";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-mcp-tools-"));
}

function siteFixture(name = "site") {
  const dir = path.join(tempDir(), name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name }));
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: `id-${name}` }));
  return dir;
}

/** A context whose reveal effect is recorded instead of performed — no real Finder window, ever. */
function fakeContext(userDataDir = tempDir()) {
  const revealed = [];
  return {
    revealed,
    context: {
      userDataDir,
      projectsPath: sitesFilePath(userDataDir),
      revealPath: async (target) => {
        revealed.push(target);
      },
    },
  };
}

test("no published tool declares destructiveHint at all", () => {
  for (const tool of SITES_MCP_TOOLS) {
    // `trust.ts:325` refuses `destructiveHint: true` before either allowlist is consulted, so such
    // a tool can never be federated. Asserted as ABSENT rather than `!== true`, because declaring
    // `destructiveHint: false` would be a claim about irreversibility this shell cannot make on
    // behalf of a handler someone adds later.
    assert.equal("destructiveHint" in tool.annotations, false, `${tool.name} declares destructiveHint`);
  }
});

test("every published tool declares an explicit readOnlyHint and a usable schema", () => {
  assert.ok(SITES_MCP_TOOLS.length > 0);
  for (const tool of SITES_MCP_TOOLS) {
    // Absent hints are the gap `trust.ts` R3 explicitly cannot catch: a tool declaring nothing is
    // admitted as if read-only, with no operator awareness. Every tool here states its answer.
    assert.equal(typeof tool.annotations.readOnlyHint, "boolean", `${tool.name} has no readOnlyHint`);
    // `trust.ts` R4 refuses a tool whose `inputSchema` is not a JSON-Schema object.
    assert.equal(tool.inputSchema.type, "object", `${tool.name} has no object inputSchema`);
    assert.match(tool.name, /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/, `${tool.name} fails trust.ts's name pattern`);
    assert.ok(tool.description.length > 40, `${tool.name}'s description is too thin to act on`);
  }
});

test("describeSitesMcpTools publishes the table without leaking handlers", () => {
  const described = describeSitesMcpTools();
  assert.deepEqual(
    described.map((tool) => tool.name),
    SITES_MCP_TOOLS.map((tool) => tool.name),
  );
  for (const tool of described) {
    assert.equal("handler" in tool, false, "a handler function reached the wire payload");
  }
});

test("list_sites reports the tracked sites and whether each folder still exists", async () => {
  const { context } = fakeContext();
  const present = siteFixture("live");
  trackSite(context.projectsPath, present, SITE_ORIGIN.adopted);
  trackSite(context.projectsPath, "/gone/missing-site", SITE_ORIGIN.adopted);

  const result = await runSitesMcpTool("list_sites", {}, context);

  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.count, 2);
  const byName = new Map(result.structuredContent.sites.map((p) => [p.name, p]));
  assert.equal(byName.get("live").present, true);
  // A stale row reports `present: false` rather than being hidden: an assistant that silently
  // omitted it could not explain why the operator's site is not listed.
  assert.equal(byName.get("missing-site").present, false);
  assert.match(result.content[0].text, /missing-site .* \(folder missing\)/);
});

test("add_site_pointer tracks a real site as adopted", async () => {
  const { context } = fakeContext();
  const siteDir = siteFixture();

  const result = await runSitesMcpTool("add_site_pointer", { siteDir }, context);

  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent.siteDir, siteDir);
  assert.equal(readTrackedSites(context.projectsPath)[0].origin, SITE_ORIGIN.adopted);
});

test("add_site_pointer REFUSES an empty folder, writes no row, and initializes nothing", async () => {
  const { context } = fakeContext();
  const siteDir = path.join(tempDir(), "fresh");
  fs.mkdirSync(siteDir);

  const result = await runSitesMcpTool("add_site_pointer", { siteDir }, context);

  assert.equal(result.isError, true);
  assert.equal(result.structuredContent.code, "SITE_DIR_EMPTY");
  assert.deepEqual(readTrackedSites(context.projectsPath), []);
  // The assertion the whole tool exists to satisfy: no `tovu init` ran here.
  assert.deepEqual(fs.readdirSync(siteDir), []);
});

test("add_site_pointer REFUSES an incomplete site and an occupied folder", async () => {
  const { context } = fakeContext();
  const incomplete = path.join(tempDir(), "half");
  fs.mkdirSync(incomplete);
  fs.writeFileSync(path.join(incomplete, "config.json"), "{}");
  const occupied = path.join(tempDir(), "docs");
  fs.mkdirSync(occupied);
  fs.writeFileSync(path.join(occupied, "taxes.pdf"), "x");

  const first = await runSitesMcpTool("add_site_pointer", { siteDir: incomplete }, context);
  const second = await runSitesMcpTool("add_site_pointer", { siteDir: occupied }, context);

  assert.equal(first.structuredContent.code, "SITE_DIR_INCOMPLETE");
  assert.equal(second.structuredContent.code, "SITE_DIR_OCCUPIED");
  assert.deepEqual(readTrackedSites(context.projectsPath), []);
  assert.deepEqual(fs.readdirSync(incomplete), ["config.json"]);
  assert.deepEqual(fs.readdirSync(occupied), ["taxes.pdf"]);
});

test("add_site_pointer REFUSES a relative path rather than resolving it somewhere surprising", async () => {
  const { context } = fakeContext();
  const siteDir = siteFixture("relative-target");

  // A model has no idea what the agent daemon's cwd is, so a relative path can only ever be a
  // mistake. Pinned because the fix is one line (`cwd: path.sep`) and its absence would be invisible
  // — the call would succeed on some machines and point at a stranger's folder on others.
  const result = await runSitesMcpTool("add_site_pointer", { siteDir: path.basename(siteDir) }, context);

  assert.equal(result.isError, true);
  assert.deepEqual(readTrackedSites(context.projectsPath), []);
});

test("add_site_pointer rejects a missing or non-string siteDir with a correctable message", async () => {
  const { context } = fakeContext();

  for (const args of [{}, { siteDir: "" }, { siteDir: 42 }, { siteDir: null }]) {
    const result = await runSitesMcpTool("add_site_pointer", args, context);
    assert.equal(result.isError, true, `accepted ${JSON.stringify(args)}`);
    assert.match(result.content[0].text, /'siteDir' is required/);
  }
  assert.deepEqual(readTrackedSites(context.projectsPath), []);
});

test("add_site_pointer reports an already-tracked site without claiming it added one", async () => {
  const { context } = fakeContext();
  const siteDir = siteFixture();
  await runSitesMcpTool("add_site_pointer", { siteDir }, context);

  const result = await runSitesMcpTool("add_site_pointer", { siteDir }, context);

  assert.equal(result.structuredContent.alreadyTracked, true);
  assert.match(result.content[0].text, /was already in your websites/);
  assert.equal(readTrackedSites(context.projectsPath).length, 1);
});

test("reveal_site_folder opens a tracked site's folder", async () => {
  const { context, revealed } = fakeContext();
  const siteDir = siteFixture();
  trackSite(context.projectsPath, siteDir, SITE_ORIGIN.adopted);

  const result = await runSitesMcpTool("reveal_site_folder", { siteDir }, context);

  assert.equal(result.isError, undefined);
  assert.deepEqual(revealed, [siteDir]);
});

test("reveal_site_folder REFUSES a path the app is not tracking and never reaches the file manager", async () => {
  const { context, revealed } = fakeContext();
  const untracked = siteFixture("not-mine");

  const result = await runSitesMcpTool("reveal_site_folder", { siteDir: untracked }, context);

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /is not one of this app's websites/);
  // The load-bearing half. Without the tracked-row check, `siteDir` is a model-supplied argument to
  // "show this to the operator" — an empty array is the only passing state.
  assert.deepEqual(revealed, []);
});

test("reveal_site_folder refuses a sensitive path a model might invent", async () => {
  const { context, revealed } = fakeContext();

  for (const siteDir of ["/etc", "/Users", "/", path.join(os.homedir(), ".ssh")]) {
    const result = await runSitesMcpTool("reveal_site_folder", { siteDir }, context);
    assert.equal(result.isError, true, `opened ${siteDir}`);
  }
  assert.deepEqual(revealed, []);
});

test("reveal_site_folder surfaces a file-manager failure as a readable tool error", async () => {
  const userDataDir = tempDir();
  const siteDir = siteFixture();
  const context = {
    userDataDir,
    projectsPath: sitesFilePath(userDataDir),
    revealPath: async () => {
      throw new Error("could not run 'open': ENOENT");
    },
  };
  trackSite(context.projectsPath, siteDir, SITE_ORIGIN.adopted);

  const result = await runSitesMcpTool("reveal_site_folder", { siteDir }, context);

  assert.equal(result.isError, true);
  // The cause is passed through, not flattened into "it failed" — the model has to be able to tell
  // the operator what went wrong.
  assert.match(result.content[0].text, /could not run 'open': ENOENT/);
});

test("an unknown tool name is an error RESULT naming the real tools, not a thrown protocol error", async () => {
  const { context } = fakeContext();

  const result = await runSitesMcpTool("delete_everything", {}, context);

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Unknown tool 'delete_everything'/);
  assert.match(result.content[0].text, /list_sites/);
});
