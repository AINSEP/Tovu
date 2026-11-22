import assert from "node:assert/strict";
import { test } from "node:test";

import { OriginRegistry, createVerifiedOrigin, type VerifiedOrigin } from "@jini-ai/core/contracts/server/verified-origin";

import { recordingKernel } from "#src/__tests__/lane-su-pins/support/recording-kernel";
import { sql } from "kysely";
import type { ContentKernel } from "../../content-kernel.js";
import { registerConfiguredOrigin, SqliteOriginSettingRepo } from "../../sqlite/origin-repo.sqlite.js";

/**
 * @file S5c T0: the verified-origin repo and the configured-origin writer on the unmoved code, before they move to
 * Jini `@jini-ai/db/verified-origin`. Each test names the one-line mutation of `origin-repo.ts` that turns it red.
 * Real SQLite kernel (the recorder from the lane-su pins). The gates that consume the repo are pinned through the
 * real `OriginRegistry` over the real SQL repo.
 */

const STAMP = "2026-11-18T00:00:00.000Z";
const origin = (over: Partial<VerifiedOrigin> = {}): VerifiedOrigin =>
  createVerifiedOrigin({ scheme: "https", host: "example.com", verifiedAt: STAMP, source: "workspace-setting", ...over });

/** Both allowlists of a workspace's row set directly: the writer under test never writes them. */
async function setAllowlists(kernel: ContentKernel, workspaceId: string, redirect: string[], egress: string[]): Promise<void> {
  await kernel.execute(sql`UPDATE origin_settings SET redirect_allowlist_json = ${JSON.stringify(redirect)}, egress_allowlist_json = ${JSON.stringify(egress)} WHERE workspace_id = ${workspaceId}`);
}

async function twoWorkspaces() {
  const { kernel, keys } = recordingKernel();
  await registerConfiguredOrigin({ db: kernel, workspaceId: "ws-a", origin: origin({ host: "a.example.com" }) });
  await registerConfiguredOrigin({ db: kernel, workspaceId: "ws-b", origin: origin({ host: "b.example.com" }) });
  await setAllowlists(kernel, "ws-a", ["redirect-a.example.com"], ["egress-a.example.com"]);
  await setAllowlists(kernel, "ws-b", ["redirect-b.example.com"], ["egress-b.example.com"]);
  keys.length = 0;
  return { kernel, keys, repo: new SqliteOriginSettingRepo({ store: kernel }) };
}

test("each read returns only its own workspace's origin and allowlists", async () => {
  const { repo } = await twoWorkspaces();
  assert.equal((await repo.findByWorkspaceId({ workspaceId: "ws-a" }))?.host, "a.example.com");
  assert.equal((await repo.findByWorkspaceId({ workspaceId: "ws-b" }))?.host, "b.example.com");
  assert.deepEqual(await repo.findRedirectAllowlist({ workspaceId: "ws-a" }), ["redirect-a.example.com"]);
  assert.deepEqual(await repo.findRedirectAllowlist({ workspaceId: "ws-b" }), ["redirect-b.example.com"]);
  assert.deepEqual(await repo.findEgressAllowlist({ workspaceId: "ws-a" }), ["egress-a.example.com"]);
  assert.deepEqual(await repo.findEgressAllowlist({ workspaceId: "ws-b" }), ["egress-b.example.com"]);
  assert.equal(await repo.findByWorkspaceId({ workspaceId: "ws-c" }), null);
});

test("the same origin twice is inserted then unchanged with no second write; a changed origin is updated", async () => {
  const { kernel } = recordingKernel();
  const writes: string[] = [];
  const counting: ContentKernel = { ...kernel, run: (fn) => { writes.push("run"); return kernel.run(fn); } };
  assert.equal(await registerConfiguredOrigin({ db: counting, workspaceId: "ws-a", origin: origin() }), "inserted");
  writes.length = 0;
  assert.equal(await registerConfiguredOrigin({ db: counting, workspaceId: "ws-a", origin: origin({ verifiedAt: "2027-01-01T00:00:00.000Z" }) }), "unchanged");
  assert.equal(writes.length, 1, "an unchanged origin costs the one read and no write");
  assert.equal(await registerConfiguredOrigin({ db: counting, workspaceId: "ws-a", origin: origin({ host: "new.example.com" }) }), "updated");
  assert.equal((await new SqliteOriginSettingRepo({ store: kernel }).findByWorkspaceId({ workspaceId: "ws-a" }))?.host, "new.example.com");
});

test("a correcting write leaves both allowlists as found", async () => {
  const { kernel, repo } = await twoWorkspaces();
  await registerConfiguredOrigin({ db: kernel, workspaceId: "ws-a", origin: origin({ host: "moved.example.com" }) });
  assert.deepEqual(await repo.findRedirectAllowlist({ workspaceId: "ws-a" }), ["redirect-a.example.com"]);
  assert.deepEqual(await repo.findEgressAllowlist({ workspaceId: "ws-a" }), ["egress-a.example.com"]);
});

test("the configured-origin write takes the per-workspace lock inside the transaction, before the read", async () => {
  const { kernel, keys } = recordingKernel();
  const events: string[] = [];
  const wrapped: ContentKernel = {
    ...kernel,
    transaction: async (fn) => { events.push("begin"); return kernel.transaction(fn); },
    lockKey: async (key) => { events.push(`lock:${key}`); await kernel.lockKey(key); },
    run: (fn) => { events.push("run"); return kernel.run(fn); },
  };
  await registerConfiguredOrigin({ db: wrapped, workspaceId: "ws-a", origin: origin() });
  assert.deepEqual(events.slice(0, 3), ["begin", "lock:origin_settings:ws-a", "run"]);
  assert.deepEqual(keys, ["origin_settings:ws-a"]);
});

test("OriginRegistry over the real repo: an egress target is allowed for its own workspace, refused for another, and refused when in no allowlist", async () => {
  const { repo } = await twoWorkspaces();
  const registry = new OriginRegistry({ repo });
  const egress = (workspaceId: string, url: string) => registry.isAllowedEgressTarget({ context: { workspaceId }, url });
  assert.equal(await egress("ws-a", "https://egress-a.example.com/hook"), true);
  assert.equal(await egress("ws-b", "https://egress-a.example.com/hook"), false);
  assert.equal(await egress("ws-a", "https://elsewhere.example.org/hook"), false);
  assert.equal(await registry.isAllowedRedirectTarget({ context: { workspaceId: "ws-a" }, url: "https://redirect-a.example.com/x" }), true);
  assert.equal(await registry.isAllowedRedirectTarget({ context: { workspaceId: "ws-b" }, url: "https://redirect-a.example.com/x" }), false);
});

test("OriginRegistry over the real repo: an unconfigured workspace refuses every egress target (fail closed) and the canonical origin is returned for a configured one", async () => {
  const { repo } = await twoWorkspaces();
  const registry = new OriginRegistry({ repo });
  assert.equal(await registry.isAllowedEgressTarget({ context: { workspaceId: "ws-none" }, url: "https://egress-a.example.com/hook" }), false);
  assert.equal(await registry.isAllowedEgressTarget({ context: { workspaceId: "ws-none" }, url: "https://example.com/" }), false);
  assert.equal((await registry.canonicalOrigin({ workspaceId: "ws-a" })).host, "a.example.com");
});
