import { createContributionRegistry } from "@jini-ai/core";
import type { ToolContributor as OwnedToolContributor, DerivedToolContributor as OwnedDerivedToolContributor } from "#src/assistant/index";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ToolExecutionContext, ToolHandler } from "@jini-ai/core";

import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { InMemoryPresentationSettingsRepo, resolveActiveThemeId } from "#src/features/presentation/index";
import {
  buildDuplicateThemeRegistrations,
  contributeDuplicateThemeTools,
  duplicateThemeAgentToolCatalog,
  duplicateThemeDerivedRisk,
  type DuplicateThemeToolDeps,
} from "#src/features/theme/duplicate-theme-tool";
import { createFakeClock } from "#src/__tests__/support/fake-clock";

/**
 * @file `theme_duplicate` (2026-10-08) — the agent-tool seam over `duplicateDiscoveredTheme`. The
 * copy itself (caps, symlinks, id assignment, staging) is certified by
 * `features/theme/__tests__/duplicate-theme.test.ts`; this suite proves what only the tool adds:
 * registration, the two-permission rule (`theme.edit` always, `theme.set` only with `activate`,
 * checked before anything is written), the `activate` path, and that a refusal carries the schema.
 *
 * Same fake-deps shape as `tool-registrations.theme-set-active.test.ts`: real themes on disk, an
 * in-memory presentation repo, no composition root.
 */

const contributions = {
  contributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedToolContributor }) => contribution.domain }),
  derivedContributors: createContributionRegistry({ keyOf: ({ contribution }: { contribution: OwnedDerivedToolContributor }) => contribution.domain }),
};

const WORKSPACE_ID = "ws-theme-duplicate";
const PRINCIPAL_ID = "principal-under-test";

function themeManifest(id: string): string {
  return JSON.stringify({ id, name: id, version: "2.3.0", tier: "declarative", engine: 1 }, null, 2);
}

/** A themes root with two independently-valid declarative themes. */
function makeThemesRoot(ids: readonly string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-duplicate-tool-"));
  for (const id of ids) {
    const dir = path.join(root, id);
    fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
    fs.writeFileSync(path.join(dir, "theme.json"), themeManifest(id), "utf8");
    fs.writeFileSync(path.join(dir, "tokens.json"), '{"--ink":"#000"}', "utf8");
    fs.writeFileSync(path.join(dir, "styles.css"), "body{margin:0}", "utf8");
    fs.writeFileSync(path.join(dir, "templates", "home.json"), '{"type":"doc","content":[]}', "utf8");
    fs.writeFileSync(path.join(dir, "templates", "entry.json"), '{"type":"doc","content":[]}', "utf8");
  }
  return root;
}

/** `deny` lists the permissions the fake authorizer refuses; `asked` records every permission checked. */
function fakeDeps(options: { deny?: readonly string[] } = {}): DuplicateThemeToolDeps & { asked: string[] } {
  const themesDir = makeThemesRoot(["basic", "aurora"]);
  const asked: string[] = [];
  return {
    asked,
    workspaceId: WORKSPACE_ID,
    themesDir,
    authorize: async (request) => {
      const permission = (request as { permission: string }).permission;
      asked.push(permission);
      return options.deny?.includes(permission) ? { allowed: false, reason: "insufficient_permission" } : { allowed: true, reason: "matched" };
    },
    clock: createFakeClock({ startIso: "2026-10-08T01:00:00.000Z" }),
    themes: discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" }),
    presentationRepo: new InMemoryPresentationSettingsRepo({}, { initialRows: [
      { workspaceId: WORKSPACE_ID, activeThemeId: "basic", updatedAt: "2026-10-08T00:00:00.000Z" },
    ] }),
  };
}

function ctxFor(input: unknown): ToolExecutionContext {
  return {
    executionId: "exec-theme-duplicate",
    principal: { id: PRINCIPAL_ID } as ToolExecutionContext["principal"],
    run: { id: "run-1" } as ToolExecutionContext["run"],
    input,
    signal: new AbortController().signal,
  };
}

function handlerFor(routeDeps: DuplicateThemeToolDeps): ToolHandler {
  const registration = buildDuplicateThemeRegistrations(routeDeps).find((r) => r.descriptor.id === "theme_duplicate");
  assert.ok(registration, "expected a 'theme_duplicate' registration");
  return registration.handler;
}

/** Folder names under the themes root, minus the preview-refresh marker the tool writes. */
function themeFolders(themesDir: string): string[] {
  return fs.readdirSync(themesDir).filter((name) => !name.startsWith(".")).sort();
}

test("theme_duplicate: wires with its catalog schema, a mutating risk class, and is not read-only", () => {
  const registrations = buildDuplicateThemeRegistrations(fakeDeps());

  assert.deepEqual(registrations.map((r) => r.descriptor.id), ["theme_duplicate"]);
  assert.deepEqual(registrations[0]?.descriptor.inputSchema, duplicateThemeAgentToolCatalog[0]?.inputSchema);
  assert.equal(duplicateThemeDerivedRisk.get("theme_duplicate"), "mutates-durable-state");
  assert.equal(registrations[0]?.descriptor.readOnly, false);
});

test("theme_duplicate: the contributor registers under its own 'theme-duplicate' domain key", () => {
  contributions.contributors.clear({});
  contributions.contributors.register({ contribution: contributeDuplicateThemeTools() });

  assert.deepEqual(contributions.contributors.list({}).map((c) => c.domain), ["theme-duplicate"]);
  contributions.contributors.clear({});
});

test("theme_duplicate: copies the source into a new, valid, discovered theme and leaves the live site on the source", async () => {
  const routeDeps = fakeDeps();

  const result = await handlerFor(routeDeps)(ctxFor({ sourceThemeId: "basic", newName: "Roastery" }));

  assert.deepEqual(result, {
    themeId: "roastery",
    name: "Roastery",
    tier: "declarative",
    sourceThemeId: "basic",
    files: 5,
    bytes: (result as { bytes: number }).bytes,
    status: "valid",
    errors: [],
    activated: false,
  });
  assert.ok((result as { bytes: number }).bytes > 0);
  const manifest = JSON.parse(fs.readFileSync(path.join(routeDeps.themesDir, "roastery", "theme.json"), "utf8")) as Record<string, unknown>;
  assert.equal(manifest.id, "roastery");
  assert.equal(manifest.name, "Roastery");
  assert.equal(manifest.version, "1.0.0");
  assert.deepEqual(manifest.lineage, { from: "basic", tier: "declarative", version: "2.3.0" });
  assert.equal(JSON.parse(fs.readFileSync(path.join(routeDeps.themesDir, "basic", "theme.json"), "utf8")).id, "basic", "the source must be untouched");
  assert.ok(routeDeps.themes.some((t) => t.manifest.id === "roastery"), "the copy must be in the shared discovered-themes array");
  assert.equal(await resolveActiveThemeId(routeDeps), "basic");
  assert.deepEqual(routeDeps.asked, ["theme.edit"], "without activate, only theme.edit is checked");
});

test("theme_duplicate: a derived id that is taken is suffixed, not refused", async () => {
  const routeDeps = fakeDeps();

  const result = await handlerFor(routeDeps)(ctxFor({ sourceThemeId: "basic", newName: "Aurora" }));

  assert.equal((result as { themeId: string }).themeId, "aurora-1");
});

test("theme_duplicate: activate:true also switches the live theme and returns the previous id for undo", async () => {
  const routeDeps = fakeDeps();

  const result = await handlerFor(routeDeps)(ctxFor({ sourceThemeId: "aurora", newName: "Roastery", newId: "roast", activate: true }));

  assert.equal((result as { themeId: string }).themeId, "roast");
  assert.equal((result as { activated: boolean }).activated, true);
  assert.equal((result as { previousThemeId: string }).previousThemeId, "basic");
  assert.equal(await resolveActiveThemeId(routeDeps), "roast");
  assert.deepEqual(routeDeps.asked, ["theme.edit", "theme.set"]);
});

test("theme_duplicate: activate:true without theme.set is refused before anything is copied", async () => {
  const routeDeps = fakeDeps({ deny: ["theme.set"] });

  await assert.rejects(() => handlerFor(routeDeps)(ctxFor({ sourceThemeId: "basic", newName: "Roastery", activate: true })), /not authorized/);
  assert.deepEqual(themeFolders(routeDeps.themesDir), ["aurora", "basic"], "a refused activate must not leave a half-done copy");
  assert.equal(await resolveActiveThemeId(routeDeps), "basic");
});

test("theme_duplicate: a principal without theme.edit is refused and nothing is written", async () => {
  const routeDeps = fakeDeps({ deny: ["theme.edit"] });

  await assert.rejects(() => handlerFor(routeDeps)(ctxFor({ sourceThemeId: "basic", newName: "Roastery" })), /not authorized/);
  assert.deepEqual(themeFolders(routeDeps.themesDir), ["aurora", "basic"]);
});

test("theme_duplicate: an unknown source is refused by name with the published schema attached for retry", async () => {
  const routeDeps = fakeDeps();

  await assert.rejects(
    () => handlerFor(routeDeps)(ctxFor({ sourceThemeId: "no-such-theme", newName: "Roastery" })),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /theme 'no-such-theme' was not found — discovered themes are: basic, aurora|theme 'no-such-theme' was not found — discovered themes are: aurora, basic/);
      assert.match(error.message, /"additionalProperties":false/, "the schema must travel with the refusal, per withSchemaOnRejection");
      return true;
    }
  );
  assert.deepEqual(themeFolders(routeDeps.themesDir), ["aurora", "basic"]);
});

test("theme_duplicate: an explicit newId that is already taken is refused, not suffixed", async () => {
  const routeDeps = fakeDeps();

  await assert.rejects(
    () => handlerFor(routeDeps)(ctxFor({ sourceThemeId: "basic", newName: "Roastery", newId: "aurora" })),
    /theme id 'aurora' is already taken — pick another newId, or omit it to get a free one/
  );
  assert.deepEqual(themeFolders(routeDeps.themesDir), ["aurora", "basic"]);
});
