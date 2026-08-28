import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminSettingsEventsRoute } from "../../inbound/admin-http/routes/settings/events.js";
import type { RouteDeps } from "../../routes/types.js";
import { bootAuthenticated } from "../helpers/http-test-server.js";

/**
 * @file What a settings SSE frame's `id` may disclose.
 *
 * `setting_revisions.seq` is one AUTOINCREMENT shared by every workspace, so any
 * id derived from it is a position in a GLOBAL sequence. Two different amounts
 * of leakage follow from that, and only one of them is accepted:
 *
 * - **Accepted.** A workspace's own revision carries a global seq, so
 *   differencing the ids of ITS OWN consecutive events reveals roughly how many
 *   settings writes happened platform-wide in between. That is a coarse
 *   aggregate count — not values, not identities, not attributable to any
 *   particular tenant — and closing it costs either a ledger schema change on
 *   the write path every writer shares (including the separate agent-daemon
 *   process) or an encrypted cursor whose key, if it ever changes, makes
 *   reconnecting tabs silently skip the writes they missed. Neither is worth a
 *   coarse write-count. Revisit if the ledger ever carries higher-frequency or
 *   more attributable events than administrative settings changes.
 *
 * - **NOT accepted, and what this file guards.** Emitting the global ledger HEAD
 *   instead of the workspace's own revision seq. `tick` deliberately advances its
 *   internal `cursor` to the head so it can skip past other tenants' rows
 *   cheaply, and the tempting simplification is to emit that same number. It
 *   would turn the bounded leak above into a live readout of the global head on
 *   every frame — precise rather than differential, and observable without the
 *   subscriber writing anything at all.
 *
 * The discriminating case is a neighbour writing AFTER this workspace does: the
 * two numbers are equal until that happens, so a test that omits it passes
 * against either behaviour.
 */

const OTHER_WORKSPACE = "00000000-0000-4000-8000-000000000ffd";
const NOW = "2026-08-01T00:00:00.000Z";

function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));
  registerAdminSettingsEventsRoute(app, deps);
  return { app, deps };
}

/** A revision row appended straight to the ledger — the feed polls the ledger, so how the row got there is irrelevant. */
function revision(required: { settingId: string; workspaceId: string | null }) {
  return {
    entityKind: "value" as const,
    settingId: required.settingId,
    scope: "workspace" as const,
    workspaceId: required.workspaceId,
    principalId: null,
    op: "set" as const,
    beforeJson: null,
    afterJson: "x",
    defVersion: 1,
    actor: "00000000-0000-4000-8000-0000000000a1",
    originPluginId: null,
    changeSetId: null,
    createdAt: NOW,
  };
}

/** Reads the stream until the first `settings-changed` event, and returns the `id:` that came with it. */
async function readFirstChangeFrameId(body: ReadableStream<Uint8Array>, timeoutMs: number): Promise<number> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  const deadline = Date.now() + timeoutMs;

  try {
    while (Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
      if (!buffered.includes("event: settings-changed")) continue;

      const upToEvent = buffered.slice(0, buffered.indexOf("event: settings-changed"));
      const ids = [...upToEvent.matchAll(/^id: (\d+)$/gm)];
      assert.ok(ids.length > 0, `a settings-changed frame arrived with no id line: ${JSON.stringify(buffered)}`);
      return Number(ids[ids.length - 1]![1]);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  throw new Error(`no settings-changed frame within ${timeoutMs}ms; received: ${JSON.stringify(buffered)}`);
}

test("the emitted id is this workspace's own revision seq, not the global ledger head", async (t) => {
  const { app, deps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await deps.settingsReady;

  // A definition must exist or `collectChangedNamespaces` resolves no namespace
  // and the frame is never emitted.
  await deps.settingsRepo.saveDefinition({
    settingId: "setting-feed",
    version: 1,
    workspaceId: null,
    namespace: "site.feed",
    key: "watched",
    ownerKind: "site",
    ownerId: null,
    schema: { type: "string" },
    defaultValue: "a",
    scopes: 7,
    secret: false,
    status: "active",
    aliasOfNamespace: null,
    aliasOfKey: null,
    coercionTag: null,
    createdAt: NOW,
    updatedAt: NOW,
  });

  const controller = new AbortController();
  t.after(() => controller.abort());
  const stream = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/events`, {
    headers: { cookie },
    signal: controller.signal,
  });
  assert.equal(stream.status, 200);
  assert.ok(stream.body, "the feed must stream a body");

  // Connect first so the cursor starts at the head, THEN write — otherwise the
  // write is already behind the cursor and nothing is ever emitted.
  await new Promise((resolve) => setTimeout(resolve, 50));

  const ownSeq = await deps.settingsRepo.appendRevision(
    revision({ settingId: "setting-feed", workspaceId: deps.workspaceId })
  );

  // The discriminating step: a neighbour writes AFTER we did, pushing the global
  // head past our row. Without this the head and our own seq are identical and
  // the assertion below cannot tell the two behaviours apart.
  for (let i = 0; i < 5; i += 1) {
    await deps.settingsRepo.appendRevision(revision({ settingId: "setting-feed", workspaceId: OTHER_WORKSPACE }));
  }
  const globalHead = await deps.settingsRepo.maxRevisionSeq();
  assert.ok(globalHead > ownSeq, "the neighbour's writes must have pushed the global head past ours");

  const emittedId = await readFirstChangeFrameId(stream.body, 8_000);

  assert.equal(
    emittedId,
    ownSeq,
    `the frame id must be this workspace's own revision seq (${ownSeq}), not the global head (${globalHead})`
  );
  assert.notEqual(emittedId, globalHead, "emitting the global head would publish platform-wide write position");
});
