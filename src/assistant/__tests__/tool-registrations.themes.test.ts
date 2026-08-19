import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { getThemesAgentToolCatalog, type AgentToolDefinition } from "../../features/theme/agent-tools.js";
import { discoverAllBuiltInThemes } from "../../features/theme/index.js";
import type { RouteDeps } from "../../server/routes/types.js";
import { assertRiskMetadataIsWirable, buildAssistantToolRegistrations } from "../tool-registrations.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { contributeThemesTools } from "../../features/theme/tool-registrations.js";

// Themes moved off `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array onto the
// tool-contribution registry (2026-08-17 — see `features/theme/tool-registrations.ts`'s header), so
// `buildAssistantToolRegistrations` below no longer wires it unless something explicitly installs it
// first, mirroring what the real composition roots now do via `installFirstPartyToolContributors()`.
resetToolContributorsForTests();
contributeThemesTools();

/**
 * @file Covers all 4 Themes catalog entries (all wired): catalog completeness, published contracts,
 * risk cross-check, the ADR-021 authorization half (explicit-handler style — nothing in
 * `theme.ts`/`theme-files.ts` calls `authorize()` itself), and a multi-tool workflow chaining
 * list -> list_files -> read -> write -> re-read, asserting state against the REAL filesystem and
 * the REAL `loadTheme()` validator rather than a spy.
 *
 * Every test runs against a throwaway themes root laid out exactly like the real one (top-level
 * declarative themes plus a `handlebars/` engine subfolder), so writes are genuinely written and
 * the validation feedback loop the write tool exists to provide is genuinely exercised.
 */

const WORKSPACE_ID = "ws-themes-tools";
const PRINCIPAL_ID = "principal-under-test";

const DECLARATIVE_MANIFEST = JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "declarative", engine: 1 }, null, 2);
const HBS_MANIFEST = JSON.stringify({ id: "hb", name: "HB", version: "1.0.0", tier: "handlebars", engine: 1 }, null, 2);

/** A themes root with one declarative theme at the top level and one Handlebars theme in its engine subfolder. */
function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-themes-tools-"));

  const plain = path.join(root, "plain");
  fs.mkdirSync(path.join(plain, "templates"), { recursive: true });
  fs.writeFileSync(path.join(plain, "theme.json"), DECLARATIVE_MANIFEST, "utf8");
  fs.writeFileSync(path.join(plain, "tokens.json"), '{"--ink":"#000"}', "utf8");
  fs.writeFileSync(path.join(plain, "styles.css"), "body{margin:0}", "utf8");
  fs.writeFileSync(path.join(plain, "templates", "home.json"), '{"type":"doc","content":[]}', "utf8");
  fs.writeFileSync(path.join(plain, "templates", "entry.json"), '{"type":"doc","content":[]}', "utf8");

  const hb = path.join(root, "handlebars", "hb");
  fs.mkdirSync(path.join(hb, "templates"), { recursive: true });
  fs.writeFileSync(path.join(hb, "theme.json"), HBS_MANIFEST, "utf8");
  fs.writeFileSync(path.join(hb, "tokens.json"), "{}", "utf8");
  fs.writeFileSync(path.join(hb, "templates", "home.hbs"), "{{site.title}}", "utf8");
  fs.writeFileSync(path.join(hb, "templates", "entry.hbs"), "{{post.title}}", "utf8");

  return root;
}

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const authorizeCalls: Array<Record<string, unknown>> = [];
  const themesDir = makeThemesRoot();

  const authorize = async (params: Record<string, unknown>) => {
    authorizeCalls.push(params);
    return allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" };
  };

  const deps = {
    workspaceId: WORKSPACE_ID,
    themes: discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" }),
    themesDir,
    authorize,
  };

  return { deps: deps as unknown as RouteDeps, authorizeCalls, themesDir };
}

function executionContext(input: Record<string, unknown> | undefined): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function themesRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(buildAssistantToolRegistrations(deps).filter((r) => r.descriptor.id.startsWith("theme_")).map((r) => [r.descriptor.id, r]));
}

function wired(deps: RouteDeps, toolId: string): ToolRegistration {
  const found = themesRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

function catalogEntry(toolId: string): AgentToolDefinition {
  const entry = getThemesAgentToolCatalog().find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

const WIRED_THEMES_TOOL_IDS = ["theme_list", "theme_list_files", "theme_read_file", "theme_write_file"];

// ---------------------------------------------------------------------------
// 1. Catalog completeness
// ---------------------------------------------------------------------------

test("exactly the 4 themes entries are registered — nothing else", () => {
  const { deps } = fakeRouteDeps();
  assert.deepEqual([...themesRegistrations(deps).keys()].sort(), [...WIRED_THEMES_TOOL_IDS].sort());
  assert.equal(getThemesAgentToolCatalog().length, 4, "sanity: the full themes catalog is still 4 entries");
});

test("no destructive theme operation is agent-callable anywhere in the whole assistant tool set", () => {
  const { deps } = fakeRouteDeps();
  const ids = buildAssistantToolRegistrations(deps).map((r) => r.descriptor.id);
  for (const excluded of ["theme_delete_file", "theme_delete", "theme_create", "theme_rename_folder", "theme_rename"]) {
    assert.equal(ids.includes(excluded), false, `'${excluded}' must not be wired — see agent-tools.ts's exclusions`);
  }
});

test("an id with no DERIVED_RISK_BY_TOOL_ID classification cannot be wired (unknown operations are refused, never assumed safe)", () => {
  assert.throws(
    () =>
      assertRiskMetadataIsWirable("theme_delete_file", {
        name: "theme_delete_file",
        description: "hypothetical",
        sideEffects: "mutates-durable-state",
        authorization: { permission: "theme.edit" },
      }),
    /has no entry in DERIVED_RISK_BY_TOOL_ID/
  );
});

// ---------------------------------------------------------------------------
// 2. Published contracts
// ---------------------------------------------------------------------------

test("every wired themes registration publishes its catalog entry's inputSchema and description verbatim", () => {
  const { deps } = fakeRouteDeps();
  for (const [id, registration] of themesRegistrations(deps)) {
    assert.deepEqual(registration.descriptor.inputSchema, catalogEntry(id).inputSchema, `${id}'s published schema must be its catalog entry's`);
    assert.equal(registration.descriptor.description, catalogEntry(id).description);
  }
});

test("each catalog entry's declared risk matches what this layer derives from its handler", () => {
  for (const id of WIRED_THEMES_TOOL_IDS) {
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id)));
  }
});

test("only theme_write_file declares a durable side effect; the three read tools declare none", () => {
  assert.equal(catalogEntry("theme_write_file").sideEffects, "mutates-durable-state");
  for (const id of ["theme_list", "theme_list_files", "theme_read_file"]) {
    assert.equal(catalogEntry(id).sideEffects, "none");
  }
});

test("reads reuse the existing theme.set permission; the write is gated by its own theme.edit", () => {
  for (const id of ["theme_list", "theme_list_files", "theme_read_file"]) {
    assert.equal(catalogEntry(id).authorization.permission, "theme.set");
  }
  assert.equal(catalogEntry("theme_write_file").authorization.permission, "theme.edit");
});

// ---------------------------------------------------------------------------
// 3. Authorization (ADR-021 §2, explicit-handler style)
// ---------------------------------------------------------------------------

test("every themes tool refuses when authorize() denies, and performs no work", async () => {
  const { deps, themesDir } = fakeRouteDeps({ allow: false });
  const before = fs.readFileSync(path.join(themesDir, "plain", "tokens.json"), "utf8");

  const calls: Array<[string, Record<string, unknown>]> = [
    ["theme_list", {}],
    ["theme_list_files", { themeId: "plain" }],
    ["theme_read_file", { themeId: "plain", path: "tokens.json" }],
    ["theme_write_file", { themeId: "plain", path: "tokens.json", content: "{}" }],
  ];
  for (const [id, input] of calls) {
    await assert.rejects(() => wired(deps, id).handler(executionContext(input)), /not authorized/, `${id} must refuse`);
  }
  assert.equal(fs.readFileSync(path.join(themesDir, "plain", "tokens.json"), "utf8"), before, "a denied write must not touch disk");
});

test("each themes tool checks exactly the permission its catalog entry declares", async () => {
  const { deps, authorizeCalls } = fakeRouteDeps();
  await wired(deps, "theme_read_file").handler(executionContext({ themeId: "plain", path: "tokens.json" }));
  assert.equal(authorizeCalls.at(-1)?.permission, "theme.set");

  await wired(deps, "theme_write_file").handler(executionContext({ themeId: "plain", path: "tokens.json", content: "{}" }));
  assert.equal(authorizeCalls.at(-1)?.permission, "theme.edit");
});

// ---------------------------------------------------------------------------
// 4. Read behavior
// ---------------------------------------------------------------------------

test("theme_list returns every discovered theme with id/name/tier/status/errors, and never leaks the server's filesystem path", async () => {
  const { deps } = fakeRouteDeps();
  const result = (await wired(deps, "theme_list").handler(executionContext({}))) as { themes: Array<Record<string, unknown>> };

  assert.deepEqual(result.themes.map((t) => t.id).sort(), ["hb", "plain"]);
  for (const theme of result.themes) {
    assert.equal(theme.status, "valid", `expected fixture theme '${String(theme.id)}' to be valid`);
    assert.deepEqual(theme.errors, []);
    assert.equal("dir" in theme, false, "the absolute host path must not reach the model");
    assert.equal("templates" in theme, false, "whole template bodies must not be dumped into a list response");
  }
});

test("theme_list filters by tier and by status", async () => {
  const { deps } = fakeRouteDeps();
  const byTier = (await wired(deps, "theme_list").handler(executionContext({ tier: "handlebars" }))) as { themes: Array<{ id: string }> };
  assert.deepEqual(byTier.themes.map((t) => t.id), ["hb"]);

  const byStatus = (await wired(deps, "theme_list").handler(executionContext({ status: "invalid" }))) as { themes: unknown[] };
  assert.deepEqual(byStatus.themes, []);
});

test("theme_list_files lists every file in one theme's folder, relative to it", async () => {
  const { deps } = fakeRouteDeps();
  const result = (await wired(deps, "theme_list_files").handler(executionContext({ themeId: "plain" }))) as { files: string[] };
  assert.deepEqual(result.files, ["styles.css", "templates/entry.json", "templates/home.json", "theme.json", "tokens.json"]);
});

test("theme_read_file returns the raw file content", async () => {
  const { deps } = fakeRouteDeps();
  const result = (await wired(deps, "theme_read_file").handler(executionContext({ themeId: "plain", path: "theme.json" }))) as { content: string };
  assert.equal(result.content, DECLARATIVE_MANIFEST);
});

test("an unknown themeId is a schema-decorated refusal naming the themes that do exist", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "theme_read_file").handler(executionContext({ themeId: "nope", path: "theme.json" })),
    (err: Error) => /theme 'nope' was not found/.test(err.message) && /discovered themes are: hb, plain/.test(err.message)
  );
});

// ---------------------------------------------------------------------------
// 5. Containment, enforced through the TOOL surface (not just the module).
// ---------------------------------------------------------------------------

test("theme_read_file and theme_write_file both refuse a ../ escape out of the theme's folder", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const victim = path.join(themesDir, "handlebars", "hb", "theme.json");
  const before = fs.readFileSync(victim, "utf8");

  for (const escapeAttempt of ["../handlebars/hb/theme.json", "../../etc/passwd", "templates/../../../escaped.txt"]) {
    await assert.rejects(
      () => wired(deps, "theme_read_file").handler(executionContext({ themeId: "plain", path: escapeAttempt })),
      /outside the theme folder|must be relative/,
      `read of ${escapeAttempt} must be refused`
    );
    await assert.rejects(
      () => wired(deps, "theme_write_file").handler(executionContext({ themeId: "plain", path: escapeAttempt, content: "PWNED" })),
      /outside the theme folder|must be relative/,
      `write of ${escapeAttempt} must be refused`
    );
  }

  assert.equal(fs.readFileSync(victim, "utf8"), before, "a sibling theme must be untouched");
});

test("theme_write_file refuses an absolute path", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const outside = path.join(themesDir, "..", "escaped.txt");
  await assert.rejects(
    () => wired(deps, "theme_write_file").handler(executionContext({ themeId: "plain", path: outside, content: "PWNED" })),
    /must be relative to the theme folder/
  );
  assert.equal(fs.existsSync(outside), false);
});

// ---------------------------------------------------------------------------
// 6. The write feedback loop — the reason this domain exists in this shape.
// ---------------------------------------------------------------------------

test("theme_write_file writes the file and reports the theme still valid", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const result = (await wired(deps, "theme_write_file").handler(
    executionContext({ themeId: "plain", path: "styles.css", content: "body{color:red}" })
  )) as { status: string; errors: string[]; bytesWritten: number };

  assert.equal(result.status, "valid");
  assert.deepEqual(result.errors, []);
  assert.equal(result.bytesWritten, "body{color:red}".length);
  assert.equal(fs.readFileSync(path.join(themesDir, "plain", "styles.css"), "utf8"), "body{color:red}");
});

test("writing INVALID JSON reports status 'invalid' with a naming error — the immediate feedback an editing agent needs", async () => {
  const { deps } = fakeRouteDeps();
  const result = (await wired(deps, "theme_write_file").handler(
    executionContext({ themeId: "plain", path: "tokens.json", content: "{ not json" })
  )) as { status: string; errors: string[] };

  assert.equal(result.status, "invalid");
  assert.ok(result.errors.some((e) => e.startsWith("tokens.json:")), `expected a tokens.json error, got ${JSON.stringify(result.errors)}`);
});

test("writing a Handlebars template with a disallowed construct reports status 'invalid' naming the file and the construct", async () => {
  const { deps } = fakeRouteDeps();
  const result = (await wired(deps, "theme_write_file").handler(
    executionContext({ themeId: "hb", path: "templates/home.hbs", content: "{{> leak}}" })
  )) as { status: string; errors: string[] };

  assert.equal(result.status, "invalid");
  assert.ok(result.errors.some((e) => /templates\/home\.hbs:.*disallowed partial "leak"/.test(e)), JSON.stringify(result.errors));
});

test("writing a Liquid template with a disallowed tag into a templated theme is caught by the SAME loader a human edit goes through", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  // Convert `plain` to the templated tier in place, through the tool itself.
  await wired(deps, "theme_write_file").handler(
    executionContext({ themeId: "plain", path: "theme.json", content: JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "templated", engine: 1 }) })
  );
  await wired(deps, "theme_write_file").handler(executionContext({ themeId: "plain", path: "templates/entry.liquid", content: "{{ post.title }}" }));
  const result = (await wired(deps, "theme_write_file").handler(
    executionContext({ themeId: "plain", path: "templates/home.liquid", content: '{% include "leak" %}' })
  )) as { status: string; errors: string[] };

  assert.equal(result.status, "invalid");
  assert.ok(result.errors.some((e) => /templates\/home\.liquid:.*disallowed tag "include"/.test(e)), JSON.stringify(result.errors));
  // The file WAS written — validation reports on it, it does not silently discard the agent's work.
  assert.equal(fs.readFileSync(path.join(themesDir, "plain", "templates", "home.liquid"), "utf8"), '{% include "leak" %}');
});

test("a successful write refreshes the live routeDeps.themes entry, so the running site serves the edit", async () => {
  const { deps } = fakeRouteDeps();
  await wired(deps, "theme_write_file").handler(
    executionContext({ themeId: "hb", path: "theme.json", content: JSON.stringify({ id: "hb", name: "Renamed HB", version: "2.0.0", tier: "handlebars", engine: 1 }) })
  );

  const live = deps.themes.find((t) => t.manifest.id === "hb");
  assert.equal(live?.manifest.name, "Renamed HB");
  assert.equal(live?.manifest.version, "2.0.0");
  assert.equal(live?.status, "valid");
});

test("an invalid write is reflected in the live theme list too — theme_list immediately reports what theme_write_file just reported", async () => {
  const { deps } = fakeRouteDeps();
  await wired(deps, "theme_write_file").handler(executionContext({ themeId: "hb", path: "templates/home.hbs", content: "{{{post.title}}}" }));

  const listed = (await wired(deps, "theme_list").handler(executionContext({ status: "invalid" }))) as { themes: Array<{ id: string; errors: string[] }> };
  assert.deepEqual(listed.themes.map((t) => t.id), ["hb"]);
  assert.ok(listed.themes[0].errors.some((e) => /disallowed raw output/.test(e)), JSON.stringify(listed.themes[0].errors));
});

// ---------------------------------------------------------------------------
// 7. Multi-tool workflow — the loop an editing agent actually runs.
// ---------------------------------------------------------------------------

test("list -> list_files -> read -> write -> re-read stays consistent across the whole sequence", async () => {
  const { deps } = fakeRouteDeps();

  const listed = (await wired(deps, "theme_list").handler(executionContext({ tier: "handlebars" }))) as { themes: Array<{ id: string }> };
  const themeId = listed.themes[0].id;

  const files = (await wired(deps, "theme_list_files").handler(executionContext({ themeId }))) as { files: string[] };
  assert.ok(files.files.includes("templates/home.hbs"));

  const read = (await wired(deps, "theme_read_file").handler(executionContext({ themeId, path: "templates/home.hbs" }))) as { content: string };
  assert.equal(read.content, "{{site.title}}");

  const nextSource = "{{#each posts}}<li>{{title}}</li>{{/each}}";
  const written = (await wired(deps, "theme_write_file").handler(
    executionContext({ themeId, path: "templates/home.hbs", content: nextSource })
  )) as { status: string };
  assert.equal(written.status, "valid");

  const reread = (await wired(deps, "theme_read_file").handler(executionContext({ themeId, path: "templates/home.hbs" }))) as { content: string };
  assert.equal(reread.content, nextSource);

  // A brand-new file also shows up in a subsequent listing.
  await wired(deps, "theme_write_file").handler(executionContext({ themeId, path: "templates/post.hbs", content: "{{post.title}}" }));
  const filesAfter = (await wired(deps, "theme_list_files").handler(executionContext({ themeId }))) as { files: string[] };
  assert.ok(filesAfter.files.includes("templates/post.hbs"));
});
