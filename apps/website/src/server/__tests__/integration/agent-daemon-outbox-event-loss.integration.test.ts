import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { eq } from "drizzle-orm";
import type { DomainEvent } from "@jini-ai/cms/core";

import { processOutbox } from "#src/contracts/core/events/index";
import { outboxEvents } from "#src/platform/db/schema.sqlite";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { createAgentDaemonRouteDeps } from "../../runtime/composition/agent-daemon-deps.js";
import { createSqliteRouteDeps } from "../../runtime/composition/deps.js";

/**
 * @file Regression proof for the agent daemon's lost outbox events (2026-09-14).
 *
 * The agent daemon is a separate OS process that shares the site's `content.db` but builds its own
 * `RouteDeps`, and so its own in-memory bus. The site's subscribers (SEO sitemap invalidation, form
 * notify, webhook fan-out) live only on the serving process's bus. Post tools call `processOutbox`
 * with the daemon's deps right after each write (`features/post/tool-registrations.ts`). Before the
 * fix that drain claimed the shared rows, published them on the daemon's bus, and marked them
 * `delivered`, so the serving process never saw them: neither the daemon's own event nor a pending
 * row the serving process had enqueued.
 *
 * Both processes use their REAL composition functions over one temp `content.db`, each with its own
 * connection, as in production: `createSqliteRouteDeps` for the serving process (`src/index.ts`) and
 * `createAgentDaemonRouteDeps` for the daemon (what `agent-daemon-server.ts` calls; that wiring is
 * pinned by `inbound/assistant/__tests__/agent-daemon-server.outbox-enqueue-only-wiring.unit.test.ts`).
 * The spy is attached only to the serving process's bus, so only a serving-process delivery can
 * satisfy the assertion.
 */

/** Points every `siteDir()`-derived default at the temp site, so nothing is written under `sites/`. */
function useTempSiteDir(t: TestContext, dir: string): void {
  // An existing themes dir makes `seedSiteThemes` skip its ~19MB stock copy.
  fs.mkdirSync(path.join(dir, "themes"), { recursive: true });
  const vars = { TOVU_SITE_DIR: dir, TOVU_THEMES_DIR: path.join(dir, "themes"), TOVU_MEDIA_UPLOADS_DIR: path.join(dir, "uploads") };
  for (const [key, value] of Object.entries(vars)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
}

/** Awaits the composition root's fire-and-forget `*Ready` installs before the next root opens the db. */
async function settle(deps: object): Promise<void> {
  await Promise.allSettled(
    Object.entries(deps)
      .filter(([key, value]) => key.endsWith("Ready") && value instanceof Promise)
      .map(([, value]) => value as Promise<unknown>),
  );
}

function makeEvent(id: string, name: string, workspaceId: string, occurredAt: string): DomainEvent {
  return { id, name, workspaceId, occurredAt, payload: { entryId: "post-daemon-edit" } };
}

test("an outbox drain in the agent daemon no longer swallows events: both the daemon's own event and the serving process's pending row reach the serving process's subscriber", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-daemon-outbox-loss-"));
  const dbPath = path.join(dir, "content.db");
  useTempSiteDir(t, dir);
  const roots: object[] = [];
  t.after(async () => {
    await Promise.all(roots.map(settle));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const server = createSqliteRouteDeps(dbPath);
  roots.push(server);
  // Same ordering as the real boot: `index.ts` spawns the daemon only after these settle.
  await settle(server);
  const received: string[] = [];
  await server.bus.subscribe("entry.updated", async (event) => {
    received.push(event.id);
  });
  await server.bus.subscribe("comments.approved", async (event) => {
    received.push(event.id);
  });

  const daemon = createAgentDaemonRouteDeps({ env: { TOVU_WORKSPACE: server.workspaceId } }, { dbPath });
  roots.push(daemon);
  await settle(daemon);

  const now = server.clock.nowIso();
  const serverPending = makeEvent("evt-server-pending-1", "comments.approved", server.workspaceId, now);
  const daemonEdit = makeEvent("evt-daemon-edit-1", "entry.updated", server.workspaceId, now);
  await server.outbox.enqueue(serverPending);
  await daemon.outbox.enqueue(daemonEdit);

  // The exact drain every post tool runs after its write, here with the daemon's deps.
  await processOutbox({ outbox: daemon.outbox, bus: daemon.bus, clock: daemon.clock });
  // The serving process's drain (the background drainer makes this same call).
  await processOutbox({ outbox: server.outbox, bus: server.bus, clock: server.clock });

  assert.deepEqual(
    [...received].sort(),
    [daemonEdit.id, serverPending.id].sort(),
    "the daemon's drain claimed these rows and published them to its own subscriber-less bus, so the serving process never saw them",
  );

  const reader = openContentDb(dbPath);
  try {
    for (const id of [daemonEdit.id, serverPending.id]) {
      const row = reader.select().from(outboxEvents).where(eq(outboxEvents.id, id)).get();
      assert.equal(row?.status, "delivered", `row ${id} must end delivered by the serving process`);
    }
  } finally {
    reader.$client.close();
  }
});

test("memory mode (TOVU_DB=memory): the daemon's composition is enqueue-only as well", async () => {
  const daemon = createAgentDaemonRouteDeps({ env: { TOVU_DB: "memory" } });
  await daemon.outbox.enqueue(makeEvent("evt-daemon-memory-1", "entry.updated", daemon.workspaceId, daemon.clock.nowIso()));

  const claimed = await processOutbox({ outbox: daemon.outbox, bus: daemon.bus, clock: daemon.clock });

  assert.equal(claimed, 0, "a drain through the daemon's deps must claim nothing in memory mode too");
});
