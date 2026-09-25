import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { ToolExecutionContext, ToolHandler } from "@jini-ai/core";

import { listToolContributors, registerToolContributor, resetToolContributorsForTests } from "#src/assistant/tool-contribution-registry";
import { discoverAllBuiltInThemes, NO_THEME_ID } from "#src/features/theme/index";
import { InMemoryPresentationSettingsRepo, resolveActiveThemeId } from "#src/features/presentation/index";
import {
  buildSetActiveThemeRegistrations,
  contributeSetActiveThemeTools,
  setActiveThemeDerivedRisk,
  type SetActiveThemeToolDeps,
} from "#src/features/theme/set-active-theme-tool";

/**
 * @file `theme_set_active` (F7a, 2026-09-24) — TDD certification for the agent-tool half of
 * `setActiveTheme`/`resolveActiveThemeId`. The admin PATCH route's own branch coverage
 * (`server/inbound/admin-http/routes/presentation/__tests__/patch-active-theme.test.ts`) already
 * certifies the underlying domain calls; this suite targets the tool-wiring seam only: input shape,
 * ADR-021 authorization, the returned `previousThemeId`, and that both write paths share exactly one
 * `writableThemeIds` allowlist.
 *
 * Same fake-deps-not-full-composition shape `features/sites/__tests__/tool-registrations.unit.test.ts`
 * uses, for the same reason: this domain's own narrow deps type is the seam worth proving directly.
 */

const WORKSPACE_ID = "ws-theme-set-active";
const PRINCIPAL_ID = "principal-under-test";
const SEEDED_AT = "2026-09-24T00:00:00.000Z";

function themeManifest(id: string): string {
  return JSON.stringify({ id, name: id, version: "1.0.0", tier: "declarative", engine: 1 }, null, 2);
}

/** A themes root with two independently-valid declarative themes — the minimum needed to prove a
 *  real switch between two real ids, not just a no-op. */
function makeThemesRoot(ids: readonly string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-set-active-"));
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

interface FakeDepsOptions {
  allow?: boolean;
  seededActiveThemeId?: string;
}

function fakeDeps(options: FakeDepsOptions = {}): SetActiveThemeToolDeps {
  const themesDir = makeThemesRoot(["basic", "aurora"]);
  const themes = discoverAllBuiltInThemes({ dir: themesDir, source: "built-in" });
  const presentationRepo = new InMemoryPresentationSettingsRepo([
    { workspaceId: WORKSPACE_ID, activeThemeId: options.seededActiveThemeId ?? "basic", updatedAt: SEEDED_AT },
  ]);

  return {
    workspaceId: WORKSPACE_ID,
    authorize: async () =>
      options.allow === false ? { allowed: false, reason: "insufficient_permission" } : { allowed: true, reason: "matched" },
    clock: { nowIso: () => "2026-09-24T01:00:00.000Z" },
    themes,
    presentationRepo,
  };
}

function ctxFor(input: unknown): ToolExecutionContext {
  return {
    executionId: "exec-theme-set-active",
    principal: { id: PRINCIPAL_ID } as ToolExecutionContext["principal"],
    run: { id: "run-1" } as ToolExecutionContext["run"],
    input,
    signal: new AbortController().signal,
  };
}

function handlerFor(routeDeps: SetActiveThemeToolDeps): ToolHandler {
  const registrations = buildSetActiveThemeRegistrations(routeDeps);
  const registration = registrations.find((r) => r.descriptor.id === "theme_set_active");
  assert.ok(registration, "expected a 'theme_set_active' registration");
  return registration.handler;
}

test("theme_set_active: wires with a published schema and a cross-checked risk class", () => {
  const routeDeps = fakeDeps();
  const registrations = buildSetActiveThemeRegistrations(routeDeps);

  assert.deepEqual(registrations.map((r) => r.descriptor.id), ["theme_set_active"]);
  assert.ok(registrations[0]?.descriptor.inputSchema, "must publish an input schema");
  assert.ok(setActiveThemeDerivedRisk.has("theme_set_active"));
  assert.equal(registrations[0]?.descriptor.readOnly, false, "a durable-state write must not be read-only");
});

test("theme_set_active: the contributor registers under its own domain key, distinct from the themes file-op domain", () => {
  resetToolContributorsForTests();
  registerToolContributor(contributeSetActiveThemeTools());

  const contributors = listToolContributors();
  assert.equal(contributors.length, 1);
  assert.equal(contributors[0]?.domain, "theme-set-active");
  resetToolContributorsForTests();
});

test("theme_set_active: switches from basic to a second valid theme, returning the previous id, and resolveActiveThemeId reflects the switch", async () => {
  const routeDeps = fakeDeps();
  const handler = handlerFor(routeDeps);

  const result = await handler(ctxFor({ themeId: "aurora" }));

  assert.deepEqual(result, { previousThemeId: "basic", activeThemeId: "aurora" });
  assert.equal(await resolveActiveThemeId(routeDeps), "aurora");
});

test("theme_set_active: accepts the no-theme sentinel — the write allowlist `writableThemeIds` shares with the admin PATCH route", async () => {
  const routeDeps = fakeDeps();
  const handler = handlerFor(routeDeps);

  const result = await handler(ctxFor({ themeId: NO_THEME_ID }));

  assert.deepEqual(result, { previousThemeId: "basic", activeThemeId: NO_THEME_ID });
});

test("theme_set_active: an unknown theme id is rejected by name, and settings are left unchanged", async () => {
  const routeDeps = fakeDeps();
  const handler = handlerFor(routeDeps);

  await assert.rejects(
    () => handler(ctxFor({ themeId: "not-a-real-theme" })),
    (err: unknown) => err instanceof Error && err.message.includes("not-a-real-theme")
  );
  assert.equal(await resolveActiveThemeId(routeDeps), "basic", "a rejected switch must not have written");
});

test("theme_set_active: refuses a principal without theme.set, without writing", async () => {
  const routeDeps = fakeDeps({ allow: false });
  const handler = handlerFor(routeDeps);

  await assert.rejects(() => handler(ctxFor({ themeId: "aurora" })));
  assert.equal(await resolveActiveThemeId(routeDeps), "basic", "a refused call must not have written");
});
