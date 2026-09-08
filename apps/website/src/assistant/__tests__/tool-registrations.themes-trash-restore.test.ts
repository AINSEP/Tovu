import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { discoverAllBuiltInThemes } from "../../features/theme/index.js";
import { createSurfaceExchangeStore, SURFACE_EXCHANGE_ID_PARAM, type SurfaceExchangeStore } from "../../contracts/core/tool-surface-exchanges.js";
import type { UIResource } from "../index.js";
import type { RouteDeps } from "../../server/routes/types.js";
import { buildAssistantToolRegistrations } from "../tool-registrations.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { contributeThemesTools } from "../../features/theme/tool-registrations.js";
import { registerToolContributor } from "../tool-contribution-registry.js";

resetToolContributorsForTests();
registerToolContributor(contributeThemesTools());

/**
 * @file `theme_trash_file` / `theme_restore_trashed_file` — the owner-approved soft-delete pair
 * (2026-08-30) standing in for the `theme_delete_file` hard delete that stays permanently excluded
 * from the agent catalog (see `agent-tools.ts`'s own header and the certified
 * `tool-registrations.themes.test.ts` exclusion test, both untouched by this feature).
 *
 * Covers what `theme_write_file`/`theme_rename_file`'s own suites do not: the trash round-trip
 * (trash -> hidden from listing -> restore -> visible again, theme stays valid throughout), the
 * shared `validateFileIdentityChange` refusals applied under the `"trashed"` action (required file,
 * script/other identity lock), the collision-free-by-construction trash destination, and the direct
 * write-into-`.trash/` refusal on `theme_write_file`/`theme_edit_file`/`theme_rename_file`.
 *
 * 2026-09-08: `theme_trash_file` now raises a confirmation dialog before writing (ADS-memory/reports/
 * 2026-09-08-delete-confirmation-build.md) — every call site here that uses it purely as SETUP (to
 * get a trashed file into place) goes through `trashFile()` below, which raises the dialog and
 * immediately confirms it, standing in for the human's click. The confirmation gate itself — the
 * dialog appearing, parking, cancel, fail-closed decision, no-emitSurface refusal — is certified by
 * the dedicated section at the bottom of this file, not re-derived at every setup call site.
 */

const WORKSPACE_ID = "ws-themes-trash-restore";
const PRINCIPAL_ID = "principal-under-test";

const STATIC_MANIFEST = JSON.stringify({ id: "plain", name: "Plain", version: "1.0.0", tier: "static", engine: 1 }, null, 2);

function makeThemesRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-themes-trash-restore-"));
  const dir = path.join(root, "plain");
  fs.mkdirSync(path.join(dir, "pages"), { recursive: true });
  fs.writeFileSync(path.join(dir, "theme.json"), STATIC_MANIFEST, "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), '{"--ink":"#000"}', "utf8");
  fs.writeFileSync(path.join(dir, "pages", "index.html"), "<html><body>x</body></html>", "utf8");
  fs.writeFileSync(path.join(dir, "styles.css"), "body{margin:0}", "utf8");
  fs.writeFileSync(path.join(dir, "main.js"), "console.log('hi')", "utf8");
  fs.writeFileSync(path.join(dir, "NOTES.md"), "# notes", "utf8");
  return root;
}

function fakeRouteDeps(options: { allow?: boolean } = {}) {
  const allow = options.allow ?? true;
  const themesDir = makeThemesRoot();
  const authorize = async () => (allow ? { allowed: true, reason: "matched" } : { allowed: false, reason: "insufficient_permission" });
  const deps = {
    workspaceId: WORKSPACE_ID,
    themes: discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" }),
    themesDir,
    authorize,
  };
  return { deps: deps as unknown as RouteDeps, themesDir };
}

function executionContext(input: Record<string, unknown> | undefined): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: PRINCIPAL_ID }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

function wired(deps: RouteDeps, toolId: string): ToolRegistration {
  const found = buildAssistantToolRegistrations(deps).find((r) => r.descriptor.id === toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

/**
 * Raises `theme_trash_file`'s confirmation dialog against ONE explicit store and immediately
 * confirms it, standing in for the human's click — for call sites that only need a file trashed as
 * setup for something else, not to certify the gate itself (that is this file's own dedicated
 * section at the bottom). `wired()` above builds a FRESH `buildAssistantToolRegistrations` (and so a
 * fresh, unshared `SurfaceExchangeStore`) on every call, which cannot answer a dialog it did not
 * itself open — this helper builds against one store passed in (or a fresh one) so the raise-then-
 * confirm round trip lands on the same exchange.
 */
async function trashFile(deps: RouteDeps, input: Record<string, unknown>, surfaceExchanges: SurfaceExchangeStore = createSurfaceExchangeStore()): Promise<unknown> {
  const trashTool = buildAssistantToolRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === "theme_trash_file");
  assert.ok(trashTool, "expected 'theme_trash_file' to be wired");
  const emitted: unknown[] = [];
  const pending = trashTool.handler({ ...executionContext(input), emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match, "the surface must carry its exchange id");
  surfaceExchanges.deliver({ exchangeId: match[1]!, toolId: "theme_trash_file", principalId: PRINCIPAL_ID, params: { decision: "confirm" } });
  return pending;
}

function existsInTheme(themesDir: string, relativePath: string): boolean {
  return fs.existsSync(path.join(themesDir, "plain", relativePath));
}

async function listFiles(deps: RouteDeps, options: { includeTrash?: boolean } = {}): Promise<string[]> {
  const result = (await wired(deps, "theme_list_files").handler(
    executionContext({ themeId: "plain", ...(options.includeTrash ? { includeTrash: true } : {}) })
  )) as { files: string[] };
  return result.files;
}

// ---------------------------------------------------------------------------
// theme_trash_file — the round trip and its refusals (post-confirmation)
// ---------------------------------------------------------------------------

test("theme_trash_file moves the file into .trash/, leaving the theme valid and the file gone from the default listing", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const before = fs.readFileSync(path.join(themesDir, "plain", "styles.css"), "utf8");

  const result = (await trashFile(deps, { themeId: "plain", path: "styles.css" })) as {
    path: string;
    trashedPath: string;
    status: string;
  };

  assert.equal(result.path, "styles.css");
  assert.match(result.trashedPath, /^\.trash\/\d+\/styles\.css$/);
  assert.equal(result.status, "valid");
  assert.equal(existsInTheme(themesDir, "styles.css"), false, "the original path must be empty");
  assert.equal(existsInTheme(themesDir, result.trashedPath), true, "the bytes must exist at the trashed path");
  assert.equal(fs.readFileSync(path.join(themesDir, "plain", result.trashedPath), "utf8"), before, "trashing must not alter the bytes");

  const files = await listFiles(deps);
  assert.equal(files.includes("styles.css"), false);
  assert.equal(files.some((f) => f.startsWith(".trash/")), false, "trashed paths must not surface in the default listing");
});

test("theme_trash_file refuses a required file (theme.json) — it would still drop the theme to invalid", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  await assert.rejects(() => trashFile(deps, { themeId: "plain", path: "theme.json" }), /cannot be trashed/);
  assert.equal(existsInTheme(themesDir, "theme.json"), true);
});

test("theme_trash_file refuses a script (.js) file — the owner's own words: scripts remain un-trashable by an agent", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  await assert.rejects(() => trashFile(deps, { themeId: "plain", path: "main.js" }), /read-only in Explore and cannot be trashed/);
  assert.equal(existsInTheme(themesDir, "main.js"), true);
});

test("theme_trash_file refuses an 'other'-group file (.md), the same as rename would", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  await assert.rejects(() => trashFile(deps, { themeId: "plain", path: "NOTES.md" }), /read-only in Explore and cannot be trashed/);
  assert.equal(existsInTheme(themesDir, "NOTES.md"), true);
});

test("theme_trash_file refuses a path that is already inside .trash/", async () => {
  const { deps } = fakeRouteDeps();
  const first = (await trashFile(deps, { themeId: "plain", path: "styles.css" })) as { trashedPath: string };

  await assert.rejects(() => trashFile(deps, { themeId: "plain", path: first.trashedPath }), /already inside the trash/);
});

test("trashing two different files that once shared a path never collides — each trash op gets its own timestamp folder", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const firstTrash = (await trashFile(deps, { themeId: "plain", path: "styles.css" })) as { trashedPath: string };

  // A NEW styles.css now occupies the original path — trashing IT must not collide with the first.
  fs.writeFileSync(path.join(themesDir, "plain", "styles.css"), "body{color:blue}", "utf8");
  const secondTrash = (await trashFile(deps, { themeId: "plain", path: "styles.css" })) as { trashedPath: string };

  assert.notEqual(firstTrash.trashedPath, secondTrash.trashedPath);
  assert.equal(existsInTheme(themesDir, firstTrash.trashedPath), true, "the first trashed copy must survive the second trash");
  assert.equal(existsInTheme(themesDir, secondTrash.trashedPath), true);
});

test("theme_trash_file refuses when authorize() denies, and never touches disk — checked before any dialog is raised", async () => {
  const { deps, themesDir } = fakeRouteDeps({ allow: false });
  await assert.rejects(
    () => wired(deps, "theme_trash_file").handler(executionContext({ themeId: "plain", path: "styles.css" })),
    /not authorized/
  );
  assert.equal(existsInTheme(themesDir, "styles.css"), true);
});

// ---------------------------------------------------------------------------
// theme_list_files: includeTrash
// ---------------------------------------------------------------------------

test("theme_list_files hides trashed paths by default, and shows them with includeTrash: true", async () => {
  const { deps } = fakeRouteDeps();
  const trashed = (await trashFile(deps, { themeId: "plain", path: "styles.css" })) as { trashedPath: string };

  const hidden = await listFiles(deps);
  assert.equal(hidden.includes(trashed.trashedPath), false);

  const shown = await listFiles(deps, { includeTrash: true });
  assert.equal(shown.includes(trashed.trashedPath), true);
});

// ---------------------------------------------------------------------------
// theme_restore_trashed_file
// ---------------------------------------------------------------------------

test("theme_restore_trashed_file restores a trashed file to its original path by default", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const before = fs.readFileSync(path.join(themesDir, "plain", "styles.css"), "utf8");
  const trashed = (await trashFile(deps, { themeId: "plain", path: "styles.css" })) as { trashedPath: string };

  const restored = (await wired(deps, "theme_restore_trashed_file").handler(
    executionContext({ themeId: "plain", trashedPath: trashed.trashedPath })
  )) as { path: string; restoredFrom: string; status: string };

  assert.equal(restored.path, "styles.css");
  assert.equal(restored.restoredFrom, trashed.trashedPath);
  assert.equal(restored.status, "valid");
  assert.equal(existsInTheme(themesDir, trashed.trashedPath), false);
  assert.equal(fs.readFileSync(path.join(themesDir, "plain", "styles.css"), "utf8"), before);
  assert.equal((await listFiles(deps)).includes("styles.css"), true);
});

test("theme_restore_trashed_file honors an explicit restoreTo, different from the original path", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const trashed = (await trashFile(deps, { themeId: "plain", path: "styles.css" })) as { trashedPath: string };

  const restored = (await wired(deps, "theme_restore_trashed_file").handler(
    executionContext({ themeId: "plain", trashedPath: trashed.trashedPath, restoreTo: "restored-styles.css" })
  )) as { path: string };

  assert.equal(restored.path, "restored-styles.css");
  assert.equal(existsInTheme(themesDir, "restored-styles.css"), true);
  assert.equal(existsInTheme(themesDir, "styles.css"), false, "the original path is untouched by an explicit restoreTo");
});

test("theme_restore_trashed_file refuses a trashedPath that theme_trash_file never produced", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(
    () => wired(deps, "theme_restore_trashed_file").handler(executionContext({ themeId: "plain", trashedPath: "styles.css" })),
    /ever produced/
  );
});

test("theme_restore_trashed_file refuses a trashedPath that does not exist in this theme's trash", async () => {
  const { deps } = fakeRouteDeps();
  await assert.rejects(
    () =>
      wired(deps, "theme_restore_trashed_file").handler(
        executionContext({ themeId: "plain", trashedPath: ".trash/999999999999/styles.css" })
      ),
    /does not exist in this theme's trash/
  );
});

test("theme_restore_trashed_file refuses when the default (original) destination is already occupied", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const trashed = (await trashFile(deps, { themeId: "plain", path: "styles.css" })) as { trashedPath: string };
  // A new file now sits at the original path.
  fs.writeFileSync(path.join(themesDir, "plain", "styles.css"), "body{color:green}", "utf8");

  await assert.rejects(
    () => wired(deps, "theme_restore_trashed_file").handler(executionContext({ themeId: "plain", trashedPath: trashed.trashedPath })),
    /already exists in this theme/
  );
});

test("theme_restore_trashed_file refuses when an explicit restoreTo is already occupied", async () => {
  const { deps } = fakeRouteDeps();
  const trashed = (await trashFile(deps, { themeId: "plain", path: "styles.css" })) as { trashedPath: string };
  await assert.rejects(
    () =>
      wired(deps, "theme_restore_trashed_file").handler(
        executionContext({ themeId: "plain", trashedPath: trashed.trashedPath, restoreTo: "tokens.json" })
      ),
    /already exists in this theme/
  );
});

test("theme_restore_trashed_file refuses when authorize() denies, and never touches disk", async () => {
  const { deps } = fakeRouteDeps({ allow: false });
  await assert.rejects(
    () =>
      wired(deps, "theme_restore_trashed_file").handler(
        executionContext({ themeId: "plain", trashedPath: ".trash/1/styles.css" })
      ),
    /not authorized/
  );
});

// ---------------------------------------------------------------------------
// Trash is an audited path: every other write/rename tool refuses to touch it directly.
// ---------------------------------------------------------------------------

test("theme_write_file and theme_edit_file refuse writing directly into .trash/ — restore is the only door back out", async () => {
  const { deps } = fakeRouteDeps();
  const trashed = (await trashFile(deps, { themeId: "plain", path: "styles.css" })) as { trashedPath: string };

  await assert.rejects(
    () => wired(deps, "theme_write_file").handler(executionContext({ themeId: "plain", path: trashed.trashedPath, content: "x" })),
    /cannot be written to directly/
  );
  await assert.rejects(
    () =>
      wired(deps, "theme_edit_file").handler(
        executionContext({ themeId: "plain", path: trashed.trashedPath, oldString: "margin:0", newString: "margin:1px" })
      ),
    /cannot be written to directly/
  );
});

test("theme_rename_file refuses a path already inside .trash/ — restore it first", async () => {
  const { deps } = fakeRouteDeps();
  const trashed = (await trashFile(deps, { themeId: "plain", path: "styles.css" })) as { trashedPath: string };

  await assert.rejects(
    () => wired(deps, "theme_rename_file").handler(executionContext({ themeId: "plain", path: trashed.trashedPath, name: "renamed.css" })),
    /restore it first/
  );
});

test("a trash-then-restore round trip refreshes the live routeDeps.themes entry throughout", async () => {
  const { deps } = fakeRouteDeps();
  const trashed = (await trashFile(deps, { themeId: "plain", path: "styles.css" })) as { trashedPath: string };
  assert.equal(deps.themes.find((t) => t.manifest.id === "plain")?.status, "valid");

  await wired(deps, "theme_restore_trashed_file").handler(executionContext({ themeId: "plain", trashedPath: trashed.trashedPath }));
  assert.equal(deps.themes.find((t) => t.manifest.id === "plain")?.status, "valid");
});

// ---------------------------------------------------------------------------
// theme_trash_file's confirmation gate itself (2026-09-08, ADS-memory/reports/
// 2026-09-08-delete-confirmation-build.md) — the dialog, parking, cancel, and fail-closed decision.
// ---------------------------------------------------------------------------

test("the call stays open after the dialog is shown, and nothing is trashed while it is pending", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = buildAssistantToolRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === "theme_trash_file");
  assert.ok(trashTool);

  const emitted: unknown[] = [];
  const pending = trashTool.handler({ ...executionContext({ themeId: "plain", path: "styles.css" }), emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, "the dialog must be emitted before the call parks");
  const ui = (emitted[0] as { payload: { resource: UIResource } }).payload.resource;
  assert.equal(ui.type, "resource");
  assert.match(ui.resource.text, /plain/);
  assert.match(ui.resource.text, /styles\.css/);
  assert.equal(
    await Promise.race([pending, Promise.resolve("still-waiting" as const)]),
    "still-waiting",
    "the agent's call must not return before the human answers",
  );
  assert.equal(existsInTheme(themesDir, "styles.css"), true, "the file must be untouched while the dialog is open");

  const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match);
  surfaceExchanges.deliver({ exchangeId: match[1]!, toolId: "theme_trash_file", principalId: PRINCIPAL_ID, params: { decision: "cancel" } });
  await pending;
});

test("cancel: nothing is trashed, and the SAME call reports the cancellation", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = buildAssistantToolRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === "theme_trash_file");
  assert.ok(trashTool);

  const emitted: unknown[] = [];
  const pending = trashTool.handler({ ...executionContext({ themeId: "plain", path: "styles.css" }), emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match);
  surfaceExchanges.deliver({ exchangeId: match[1]!, toolId: "theme_trash_file", principalId: PRINCIPAL_ID, params: { decision: "cancel" } });

  const result = (await pending) as { trashed: boolean; cancelled: boolean };
  assert.equal(result.trashed, false);
  assert.equal(result.cancelled, true);
  assert.equal(existsInTheme(themesDir, "styles.css"), true);
});

test("an answer with no 'decision' field at all is NOT confirm — nothing is trashed (fail-closed)", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = buildAssistantToolRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === "theme_trash_file");
  assert.ok(trashTool);

  const emitted: unknown[] = [];
  const pending = trashTool.handler({ ...executionContext({ themeId: "plain", path: "styles.css" }), emitSurface: async (s) => void emitted.push(s) });
  await new Promise((resolve) => setImmediate(resolve));
  const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const match = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`));
  assert.ok(match);
  surfaceExchanges.deliver({ exchangeId: match[1]!, toolId: "theme_trash_file", principalId: PRINCIPAL_ID, params: {} });

  const result = (await pending) as { trashed: boolean; cancelled: boolean };
  assert.equal(result.trashed, false);
  assert.equal(result.cancelled, true);
  assert.equal(existsInTheme(themesDir, "styles.css"), true);
});

test("an unanswered dialog expires and reports 'expired', not a hang or a throw", async () => {
  const { deps } = fakeRouteDeps();
  const surfaceExchanges = createSurfaceExchangeStore({ idleTtlMs: 1 });
  const trashTool = buildAssistantToolRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === "theme_trash_file");
  assert.ok(trashTool);

  const result = (await trashTool.handler({ ...executionContext({ themeId: "plain", path: "styles.css" }), emitSurface: async () => undefined })) as {
    trashed: boolean;
    cancelled: boolean;
    reason: string;
    note: string;
  };

  assert.equal(result.trashed, false);
  assert.equal(result.cancelled, false);
  assert.equal(result.reason, "expired");
  assert.match(result.note, /did not respond/);
});

test("with no emitSurface, the trash is refused outright — there is no fallback second call", async () => {
  const { deps, themesDir } = fakeRouteDeps();
  const surfaceExchanges = createSurfaceExchangeStore();
  const trashTool = buildAssistantToolRegistrations(deps, { surfaceExchanges }).find((r) => r.descriptor.id === "theme_trash_file");
  assert.ok(trashTool);

  await assert.rejects(() => trashTool.handler(executionContext({ themeId: "plain", path: "styles.css" })), /no interactive confirmation channel/);
  assert.equal(surfaceExchanges.size(), 0, "no emit seam means no exchange was ever opened");
  assert.equal(existsInTheme(themesDir, "styles.css"), true);
});
