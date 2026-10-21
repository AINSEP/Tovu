/**
 * @file `core.forms/receiver` — where form submissions go. Ensured with the "auto" default; read back
 * as the effective string, and as `undefined` when the definition is missing or holds a non-string.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { InMemorySettingsRepo } from "@jini-ai/core/settings";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";

import { ensureFormDestinationSetting, readFormDestinationSetting } from "../form-destination.js";
import { createSettingsPrincipalLookup } from "../index.js";

const clock = { nowIso: () => "2026-10-21T00:00:00.000Z", nowMs: () => Date.parse("2026-10-21T00:00:00.000Z") };
let next = 0;
const ids = { newId: () => `form-destination-${++next}` };
const principals = createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) });

test("an ensured receiver setting reads back its 'auto' default", async () => {
  const settingsRepo = new InMemorySettingsRepo();
  await ensureFormDestinationSetting({ deps: { settingsRepo, clock, ids, principals }, systemPrincipalId: "system" });
  assert.equal(await readFormDestinationSetting({ settingsRepo, workspaceId: "ws-1" }), "auto");
});

test("a missing definition, or a non-string stored default, reads as undefined", async () => {
  const settingsRepo = new InMemorySettingsRepo();
  assert.equal(await readFormDestinationSetting({ settingsRepo, workspaceId: "ws-1" }), undefined);

  await ensureFormDestinationSetting({ deps: { settingsRepo, clock, ids, principals }, systemPrincipalId: "system" });
  const definition = await settingsRepo.findActiveDefinition({ namespace: "core.forms", key: "receiver", workspaceId: null });
  assert.ok(definition);
  await settingsRepo.saveDefinition({ ...definition, defaultValue: 42 });
  assert.equal(await readFormDestinationSetting({ settingsRepo, workspaceId: "ws-1" }), undefined);
});
