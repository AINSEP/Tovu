import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPresentationSettingsRepo, PresentationSettingsValidationError } from "@jini-ai/cms/presentation";
import type { Tracker } from "@jini-ai/core/contracts/site/diagnostics-observability";
import { setActiveTheme } from "../set-active-theme.js";

const workspaceId = "ws-theme";
const before = { workspaceId, activeThemeId: "day", updatedAt: "2026-01-01T00:00:00.000Z" };
const changedAt = "2026-02-01T00:00:00.000Z";

async function fixture() {
  const repo = new InMemoryPresentationSettingsRepo({});
  await repo.save(before);
  const events: unknown[] = [];
  const tracker: Tracker = {
    capture(event, options) { events.push({ event, options }); },
    error: () => assert.fail("no error event expected"),
    trace: () => assert.fail("no trace expected"),
    metric: () => assert.fail("no metric expected"),
  };
  const deps = { repo, tracker, availableThemeIds: ["day", "night", "dusk"], clock: { nowMs: () => Date.parse(changedAt) } };
  const select = (activeThemeId: string, options?: Parameters<typeof setActiveTheme>[1]) =>
    setActiveTheme({ deps, input: { workspaceId, activeThemeId } }, options);
  return { deps, events, select, read: () => repo.findByWorkspaceId({ workspaceId }) };
}

test("a service theme change records its new id once, without emitting on a retry or opt-out", async () => {
  const f = await fixture();
  await f.select("night");
  assert.deepEqual(await f.read(), { workspaceId, activeThemeId: "night", updatedAt: changedAt });
  await f.select("night");
  await f.select("dusk", { capture: false, actorId: "owner-1", source: "assistant" });

  assert.deepEqual(await f.read(), { workspaceId, activeThemeId: "dusk", updatedAt: changedAt });
  assert.deepEqual(f.events, [{
    event: { name: "theme_changed", userId: "system:ws-theme" },
    options: { properties: { themeId: "night", source: "service" } },
  }]);
});

test("a throwing tracker cannot undo a valid theme, and an invalid theme never reaches it", async () => {
  const f = await fixture();
  const capture = f.deps.tracker.capture;
  f.deps.tracker.capture = (event, options) => {
    capture(event, options);
    throw new Error("analytics unavailable");
  };
  const options = { actorId: "owner-1", source: "assistant" } as const;
  assert.deepEqual((await f.select("night", options)).settings, {
    workspaceId, activeThemeId: "night", updatedAt: changedAt,
  });
  await assert.rejects(f.select("uninstalled", options), (error: unknown) =>
    error instanceof PresentationSettingsValidationError && error.message === "theme 'uninstalled' is not supported");
  assert.deepEqual(await f.read(), { workspaceId, activeThemeId: "night", updatedAt: changedAt });
  assert.deepEqual(f.events, [{
    event: { name: "theme_changed", userId: "owner-1" },
    options: { properties: { themeId: "night", source: "assistant" } },
  }]);
});
