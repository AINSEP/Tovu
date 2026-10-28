import assert from "node:assert/strict";
import test from "node:test";
import { ToolInputError } from "@jini-ai/core";
import { InMemoryPresentationSettingsRepo } from "../../presentation/index.js";
import { createFakeClock } from "../../../__tests__/support/fake-clock.js";
import { applyActiveTheme, type SetActiveThemeToolDeps } from "../set-active-theme-tool.js";

/**
 * @file applyActiveTheme's error contract: a validation refusal becomes a ToolInputError listing the
 * valid ids, while any other settings-write fault propagates unchanged (it is not the caller's input).
 */

function deps(presentationRepo: InMemoryPresentationSettingsRepo): SetActiveThemeToolDeps {
  return {
    workspaceId: "ws",
    authorize: async () => ({ allowed: true, reason: "matched" }),
    clock: createFakeClock({ startIso: "2026-10-06T00:00:00.000Z" }),
    themes: [],
    presentationRepo,
  };
}

function seededRepo({ activeThemeId = "none" } = {}): InMemoryPresentationSettingsRepo {
  return new InMemoryPresentationSettingsRepo({}, { initialRows: [{ workspaceId: "ws", activeThemeId, updatedAt: "2026-10-05T00:00:00.000Z" }] });
}

test("a settings-write fault that is not a validation refusal propagates unchanged", async t => {
  // Jini 1ffa665a3 makes same-value writes a no-op; use a real transition to reach save.
  const repo = seededRepo({ activeThemeId: "previous-theme" });
  const fault = new Error("presentation store offline");
  t.mock.method(repo, "save", async () => { throw fault; });
  await assert.rejects(applyActiveTheme({ routeDeps: deps(repo), themeId: "none" }), error => error === fault);
  assert.equal((await repo.findByWorkspaceId({ workspaceId: "ws" }))?.activeThemeId, "previous-theme");
});

test("setting the active theme again preserves its timestamp without writing", async t => {
  const repo = seededRepo();
  const save = t.mock.method(repo, "save", async () => { assert.fail("same-value selection must not save"); });
  assert.deepEqual(await applyActiveTheme({ routeDeps: deps(repo), themeId: "none" }), { previousThemeId: "none", activeThemeId: "none" });
  assert.equal(save.mock.callCount(), 0);
  assert.equal((await repo.findByWorkspaceId({ workspaceId: "ws" }))?.updatedAt, "2026-10-05T00:00:00.000Z");
});

test("an unknown id is refused as a ToolInputError naming the valid ids, and nothing is saved", async () => {
  const repo = seededRepo();
  await assert.rejects(applyActiveTheme({ routeDeps: deps(repo), themeId: "ghost" }), (error: unknown) =>
    error instanceof ToolInputError && /\(valid ids: none\)$/.test(error.message));
  assert.equal((await repo.findByWorkspaceId({ workspaceId: "ws" }))?.activeThemeId, "none");
});
