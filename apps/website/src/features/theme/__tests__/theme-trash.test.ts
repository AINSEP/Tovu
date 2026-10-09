import { type ToolExecutionContext, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { bindRemoveEntity, createTrashService, InMemoryTrashRepo, type TrashAdapter, type TrashPort } from "@jini-ai/cms/trash";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { InMemoryPresentationSettingsRepo } from "#src/features/presentation/index";
import { discoverAllBuiltInThemes } from "#src/features/theme/index";
import { createThemeTrashAdapter } from "#src/features/theme/theme-trash";
import { buildTrashThemeRegistrations, trashThemeDerivedRisk, type TrashThemeToolDeps } from "#src/features/theme/trash-theme-tool";
import { THEME_ENTITY_TYPE, unhideIfRemoveThrows } from "#src/features/trash/index";
import { deriveTrashItemRegistrations, type TrashItemToolDeps } from "#src/features/trash/trash-item-tool";

/**
 * @file `theme_trash` (2026-10-08) — whole-theme delete through the generic Trash: the folder moves
 * to `<themesDir>-trash/`, a Trash row is written, `trash_restore_item`'s `TrashPort.restore` brings
 * it back, and only the Trash's own (human-confirmed) purge removes bytes. Real folders on disk, the
 * real `createTrashService` over an in-memory repo, no composition root.
 */

const WORKSPACE_ID = "ws-theme-trash";
const PRINCIPAL_ID = "principal-under-test";
const AT = "2026-10-08T01:00:00.000Z";

function themeManifest(id: string): string {
  return JSON.stringify({ id, name: `${id} theme`, version: "1.0.0", tier: "declarative", engine: 1 }, null, 2);
}

function writeTheme(dir: string, id: string): void {
  fs.mkdirSync(path.join(dir, "templates"), { recursive: true });
  fs.writeFileSync(path.join(dir, "theme.json"), themeManifest(id), "utf8");
  fs.writeFileSync(path.join(dir, "tokens.json"), '{"--ink":"#000"}', "utf8");
  fs.writeFileSync(path.join(dir, "styles.css"), "body{margin:0}", "utf8");
  fs.writeFileSync(path.join(dir, "templates", "home.json"), '{"type":"doc","content":[]}', "utf8");
  fs.writeFileSync(path.join(dir, "templates", "entry.json"), '{"type":"doc","content":[]}', "utf8");
}

interface Harness {
  deps: TrashThemeToolDeps;
  trash: TrashPort;
  repo: InMemoryTrashRepo;
  themesDir: string;
  handler: ToolHandler;
  registrations: ToolRegistration[];
}

/** A site themes root with `basic` (active) and `aurora` at the top level and `nordic` under `static/`. */
function harness(t: test.TestContext, options: { deny?: readonly string[] } = {}): Harness {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-trash-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const themesDir = path.join(root, "themes");
  writeTheme(path.join(themesDir, "basic"), "basic");
  writeTheme(path.join(themesDir, "aurora"), "aurora");
  writeTheme(path.join(themesDir, "static", "nordic"), "nordic");

  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" });
  const adapter: TrashAdapter = createThemeTrashAdapter({ themes, themesDir });
  const adapters = new Map<string, TrashAdapter>([[THEME_ENTITY_TYPE, adapter]]);
  const repo = new InMemoryTrashRepo({});
  let sequence = 0;
  const trash = createTrashService({
    repo,
    adapters,
    idGen: { newId: () => `trash-${(sequence += 1)}` },
    transaction: ({ work }) => work(),
    entityPolicy: ({ entityType }) => adapters.has(entityType),
  });
  const deps: TrashThemeToolDeps = {
    workspaceId: WORKSPACE_ID,
    themesDir,
    themes,
    authorize: async (request) => {
      const permission = (request as { permission: string }).permission;
      return options.deny?.includes(permission) ? { allowed: false, reason: "insufficient_permission" } : { allowed: true, reason: "matched" };
    },
    clock: createFakeClock({ startIso: AT }),
    presentationRepo: new InMemoryPresentationSettingsRepo({}, { initialRows: [
      { workspaceId: WORKSPACE_ID, activeThemeId: "basic", updatedAt: AT },
    ] }),
    removeTheme: unhideIfRemoveThrows(adapter, bindRemoveEntity({ trash, entityType: THEME_ENTITY_TYPE })),
  };
  const registrations = buildTrashThemeRegistrations(deps);
  const registration = registrations.find((r) => r.descriptor.id === "theme_trash");
  assert.ok(registration, "expected a 'theme_trash' registration");
  return { deps, trash, repo, themesDir, handler: registration.handler, registrations };
}

function ctxFor(input: unknown): ToolExecutionContext {
  return {
    executionId: "exec-theme-trash",
    principal: { id: PRINCIPAL_ID } as ToolExecutionContext["principal"],
    run: { id: "run-1" } as ToolExecutionContext["run"],
    input,
    signal: new AbortController().signal,
  };
}

function themeIds(deps: TrashThemeToolDeps): string[] {
  return deps.themes.map((theme) => theme.manifest.id).sort();
}

test("theme_trash: wires as a mutating tool, never read-only", (t) => {
  const { registrations } = harness(t);
  assert.deepEqual(registrations.map((r) => r.descriptor.id), ["theme_trash"]);
  assert.equal(trashThemeDerivedRisk.get("theme_trash"), "deletes-durable-state");
  assert.equal(registrations[0]?.descriptor.readOnly, false);
});

test("theme_trash: refuses the ACTIVE theme with the exact message naming it, and moves nothing", async (t) => {
  const { handler, themesDir, deps, repo } = harness(t);

  await assert.rejects(handler(ctxFor({ themeId: "basic" })), {
    message:
      "theme_trash: 'basic' is the active theme, so it cannot be moved to the Trash. " +
      "Switch the site to another theme first (theme_set_active), then trash 'basic'. Nothing was changed.",
  });
  assert.equal(fs.existsSync(path.join(themesDir, "basic", "theme.json")), true);
  assert.deepEqual(themeIds(deps), ["aurora", "basic", "nordic"]);
  assert.equal((await repo.list({ workspaceId: WORKSPACE_ID, now: AT, limit: 10 })).items.length, 0);
});

test("theme_trash: refuses an unknown theme id, listing the ids that exist", async (t) => {
  const { handler } = harness(t);
  await assert.rejects(handler(ctxFor({ themeId: "missing" })), {
    message: "theme_trash: no theme with id 'missing' (valid ids: aurora, basic, nordic). Nothing was changed.",
  });
});

test("theme_trash: refuses without theme.edit before touching anything", async (t) => {
  const { handler, themesDir } = harness(t, { deny: ["theme.edit"] });
  await assert.rejects(handler(ctxFor({ themeId: "aurora" })));
  assert.equal(fs.existsSync(path.join(themesDir, "aurora", "theme.json")), true);
});

test("theme_trash: moves the WHOLE folder to the Trash, then trash_restore_item's restore brings it back", async (t) => {
  const { handler, themesDir, deps, trash } = harness(t);

  const result = await handler(ctxFor({ themeId: "aurora" }));
  assert.deepEqual(result, { themeId: "aurora", name: "aurora theme", trashed: true });
  assert.equal(fs.existsSync(path.join(themesDir, "aurora")), false);
  assert.equal(fs.readFileSync(path.join(`${themesDir}-trash`, "aurora", "aurora", "styles.css"), "utf8"), "body{margin:0}");
  assert.deepEqual(themeIds(deps), ["basic", "nordic"], "the live registry drops the trashed theme");

  const page = await trash.list({ workspaceId: WORKSPACE_ID, now: AT, limit: 10 });
  assert.deepEqual(page.items.map((item) => [item.entityType, item.entityId, item.displayTitle]), [["theme", "aurora", "aurora theme"]]);

  assert.equal(await trash.restore({ workspaceId: WORKSPACE_ID, entityType: THEME_ENTITY_TYPE, entityId: "aurora", at: AT }), "restored");
  assert.equal(fs.readFileSync(path.join(themesDir, "aurora", "styles.css"), "utf8"), "body{margin:0}");
  assert.deepEqual(themeIds(deps), ["aurora", "basic", "nordic"], "restore rediscovers the theme");
  assert.equal((await trash.list({ workspaceId: WORKSPACE_ID, now: AT, limit: 10 })).items.length, 0);
});

test("theme_trash: an engine-subfolder theme restores into the SAME subfolder it came from", async (t) => {
  const { handler, themesDir, deps, trash } = harness(t);

  await handler(ctxFor({ themeId: "nordic" }));
  assert.equal(fs.existsSync(path.join(themesDir, "static", "nordic")), false);
  assert.equal(fs.existsSync(path.join(`${themesDir}-trash`, "static", "nordic", "nordic", "theme.json")), true);

  assert.equal(await trash.restore({ workspaceId: WORKSPACE_ID, entityType: THEME_ENTITY_TYPE, entityId: "nordic", at: AT }), "restored");
  assert.equal(fs.existsSync(path.join(themesDir, "static", "nordic", "theme.json")), true);
  assert.deepEqual(themeIds(deps), ["aurora", "basic", "nordic"]);
});

test("theme_trash: only the Trash's own purge removes the bytes", async (t) => {
  const { handler, themesDir, trash } = harness(t);
  await handler(ctxFor({ themeId: "aurora" }));
  const [item] = (await trash.list({ workspaceId: WORKSPACE_ID, now: AT, limit: 10 })).items;
  assert.ok(item);

  const report = await trash.purgeSelected({ workspaceId: WORKSPACE_ID, ids: [item.id], actor: { principalId: PRINCIPAL_ID }, authorizeItem: async () => true });
  assert.equal(report.purged, 1);
  assert.equal(fs.existsSync(path.join(`${themesDir}-trash`, "aurora")), false);
  assert.equal(fs.existsSync(path.join(themesDir, "aurora")), false);
});

test("trash_item accepts entityType 'theme' and routes it through theme_trash (active refusal included)", async (t) => {
  const { deps, registrations, themesDir } = harness(t);
  const routeDeps = {
    ...deps,
    isTrashableEntityType: (entityType: string) => entityType === THEME_ENTITY_TYPE,
  } as unknown as TrashItemToolDeps;
  const [trashItem] = deriveTrashItemRegistrations({ registrations, routeDeps, surfaces: {} as never });
  assert.ok(trashItem);
  const schema = trashItem.descriptor.inputSchema as { properties: { entityType: { enum: string[] } } };
  assert.deepEqual(schema.properties.entityType.enum, ["theme"]);

  await assert.rejects(trashItem.handler(ctxFor({ entityType: "theme", entityId: "basic" })), /'basic' is the active theme/);
  const outcome = await trashItem.handler(ctxFor({ entityType: "theme", entityId: "aurora" }));
  assert.deepEqual(outcome, { entityType: "theme", entityId: "aurora", via: "theme_trash", outcome: { themeId: "aurora", name: "aurora theme", trashed: true } });
  assert.equal(fs.existsSync(path.join(themesDir, "aurora")), false);
});
