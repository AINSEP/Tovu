import assert from "node:assert/strict";
import test from "node:test";
import type { ToolExecutionContext } from "@jini-ai/core";
import { InMemorySettingsRepo } from "@jini-ai/core/settings";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { InMemoryPresentationSettingsRepo } from "#src/features/presentation/index";
import { createSettingsPrincipalLookup, set } from "#src/features/settings/index";
import { ensurePreviewSwitcherSetting } from "../preview-switcher.js";
import { contributePreviewSwitcherTools } from "../preview-switcher-tools.js";

test("preview switcher tool reads a value revision and refuses a stale replacement", async () => {
  const settingsRepo = new InMemorySettingsRepo();
  const principalRepo = createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) });
  const clock = { nowMs: () => 0, nowIso: () => "1970-01-01T00:00:00.000Z" };
  let next = 0;
  const idGen = { newId: () => `id-${++next}` };
  await ensurePreviewSwitcherSetting({ deps: { settingsRepo, principals: principalRepo, clock, ids: idGen }, systemPrincipalId: "system" });
  const presentationRepo = new InMemoryPresentationSettingsRepo({}, { initialRows: [{ workspaceId: "ws", activeThemeId: "none", updatedAt: "t0" }] });
  const registrations = contributePreviewSwitcherTools().build({
    settingsRepo, principalRepo, clock, idGen, presentationRepo, workspaceId: "ws", themes: [],
    authorize: async () => ({ allowed: true, reason: "test" }),
    set: (required, optional = {}) => set(required, { ...optional, preparePreviewSwitcherWrite: async (write) => write }),
  }, undefined);
  const read = registrations.find((item) => item.descriptor.id === "theme_get_preview_switcher");
  const write = registrations.find((item) => item.descriptor.id === "theme_update_preview_switcher");
  assert.ok(read && write);
  const context = (input: unknown) => ({ executionId: "exec", principal: { id: "editor" }, run: { id: "run" }, input, signal: new AbortController().signal }) as ToolExecutionContext;
  const before = await read.handler(context({}));
  const config = { enabled: false, themes: [], position: "top" };
  await assert.rejects(write.handler(context(config)), /theme_get_preview_switcher/);
  assert.deepEqual(before, { enabled: false, themes: [], position: "top", revisionSeq: 0 });
  await write.handler(context({ ...config, expectedRevisionSeq: 0 }));
  await assert.rejects(write.handler(context({ ...config, expectedRevisionSeq: 0 })), /NOT applied/);
  const after = await read.handler(context({}));
  assert.ok(after && typeof after === "object" && "revisionSeq" in after && typeof after.revisionSeq === "number" && after.revisionSeq > 0);
});
