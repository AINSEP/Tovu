/** @file gapb: member Trash uses the existing registry/table adapter and Jini Trash service.
 * Tests fail without the member entry, credential wrapper, live-read filters and stale-write fence.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { SqlMemberRepo, SqlMemberSessionRepo } from "#src/features/members/repo";
import { InMemoryMemberRepo } from "#src/features/members/repo.memory";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import type { MembersWriteServiceDeps } from "#src/features/members/ports";
import { membersWriteService } from "#src/features/members/write-service";
import { createTrashService } from "@jini-ai/cms/trash";
import { createSqliteTrashDb } from "../db-port.sqlite.js";
import { SqliteTrashRepo, createContentDbTransactionRunner } from "../repo.sqlite.js";
import { buildTrashRegistry } from "../registry.js";
import { createTableTrashAdapter } from "../table-adapter.js";
import { createMemberTrashAdapter } from "../adapters/member.js";
import { moveToTrash } from "../move-to-trash.js";
import { buildTrashRegistrations } from "../tool-registrations.js";
import { deriveTrashItemRegistrations } from "../trash-item-tool.js";
import { buildTrashAgentToolCatalog, trashToolEntityTypes } from "../agent-tools.js";
import type { ToolExecutionContext } from "@jini-ai/core";
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { TRASH_RETENTION_DAYS } from "../ports.js";

const WS = "member-trash-workspace";
const AT = "2026-10-09T12:00:00.000Z";
const LATER = "2026-10-09T12:01:00.000Z";

function harness() {
  const db = openContentDb(":memory:");
  const client = db.$client;
  client.prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)").run(WS, WS, WS, AT);
  const kernel = createSqliteTrashDb({ db });
  const registry = buildTrashRegistry();
  const adapter = createMemberTrashAdapter({
    adapter: createTableTrashAdapter({ entry: registry.get("member")!, db: kernel }), db: kernel,
  });
  const adapters = new Map([["member", adapter]]);
  let seq = 0;
  const trash = createTrashService({ repo: new SqliteTrashRepo(client), adapters,
    idGen: { newId: () => `member-trash-${++seq}` },
    transaction: ({ work }) => createContentDbTransactionRunner(client)(work),
    entityPolicy: ({ entityType }) => adapters.has(entityType),
  }, { retentionDays: TRASH_RETENTION_DAYS });
  const granted = new Set(["member.manage", "content.read"]);
  const authorize = async ({ permission }: { permission: string }) => ({ allowed: granted.has(permission), reason: "test grant" });
  const members = new SqlMemberRepo(kernel);
  const sessions = new SqlMemberSessionRepo(kernel);
  function seed(id = "member-1", status = "active", fields = "{}") {
    client.prepare(`INSERT INTO members (id, workspace_id, email, status, fields_json, created_at, updated_at, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)`).run(id, WS, `${id}@example.test`, status, fields, AT, AT);
    client.prepare(`INSERT INTO member_sessions (id, workspace_id, member_id, token_hash, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)`).run(`session-${id}`, WS, id, `hash-${id}`, AT, "2027-01-01T00:00:00.000Z");
    client.prepare(`INSERT INTO member_magic_tokens (id, workspace_id, member_id, token_hash, purpose, created_at, expires_at)
      VALUES (?, ?, ?, ?, 'sign_in', ?, ?)`).run(`link-${id}`, WS, id, `link-hash-${id}`, AT, "2027-01-01T00:00:00.000Z");
  }
  const move = (id = "member-1", workspaceId = WS, expectedVersion = 1) => moveToTrash({
    workspaceId, entityType: "member", entityId: id, expectedVersion, actor: { principalId: "operator", pluginId: "assistant" },
  }, { registry, db: kernel, trash, clock: { nowIso: () => AT }, authorize });
  const tools = buildTrashRegistrations({ registry, trash, authorize, workspaceId: WS, clock: { nowIso: () => LATER },
    userRepo: { findByPrincipalId: async () => null, findByUsername: async () => null, list: async () => [], save: async () => {} },
  });
  const invoke = (id: string, input: unknown) => tools.find(t => t.descriptor.id === id)!.handler({
    executionId: "execution", principal: { id: "operator" }, run: { id: "run" }, input, signal: new AbortController().signal,
  } as ToolExecutionContext);
  return { db, client, kernel, registry, trash, granted, adapter, members, sessions, seed, move, invoke };
}

for (const status of ["active", "pending", "disabled"]) {
  test(`gapb member: ${status} survives Trash/list/restore; credentials never revive`, async t => {
    const h = harness(); t.after(() => h.client.close()); h.seed("member-1", status); h.seed("member-2");
    const stale = (await h.members.findById({ workspaceId: WS, id: "member-1" }))!;
    assert.deepEqual(await h.move(), { ok: true, version: 2 });
    assert.equal((await h.members.findByEmail({ workspaceId: WS, email: stale.email }))!.credentialsRevokedAt, AT);
    assert.equal(await h.members.findById({ workspaceId: WS, id: "member-1" }), null);
    assert.deepEqual((await h.members.list({ workspaceId: WS })).map(m => m.id), ["member-2"]);
    assert.equal((await h.members.findByEmail({ workspaceId: WS, email: stale.email }))!.status, "trash", "email stays reserved");
    await assert.rejects(h.members.save(stale), { message: "member changed or is in Trash; re-read it before updating" });
    const page = await h.trash.list({ workspaceId: WS, now: AT, limit: 50 });
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0]!.priorMarker, status);
    assert.equal(page.items[0]!.purgeAfter, "2026-12-08T12:00:00.000Z", "60-day backstop");
    assert.equal(page.items[0]!.actorPluginId, "assistant");
    const listed = await h.invoke("trash_list_items", {}) as { items: { entityType: string }[] };
    assert.equal(listed.items[0]!.entityType, "member");
    assert.deepEqual(await h.invoke("trash_restore_item", { entityType: "member", entityId: "member-1" }),
      { restored: true, entityType: "member", entityId: "member-1" });
    assert.equal((await h.members.findById({ workspaceId: WS, id: "member-1" }))!.status, status);
    assert.equal((await h.members.findById({ workspaceId: WS, id: "member-1" }))!.credentialsRevokedAt, LATER);
    await assert.rejects(h.members.save({ ...stale, version: 2 }), { message: "member changed or is in Trash; re-read it before updating" });
    assert.equal((h.client.prepare("SELECT revoked_at FROM member_sessions WHERE id = 'session-member-1'").get() as { revoked_at: string }).revoked_at, AT);
    assert.equal((h.client.prepare("SELECT consumed_at FROM member_magic_tokens WHERE id = 'link-member-1'").get() as { consumed_at: string }).consumed_at, AT);
    assert.equal((await h.sessions.findByTokenHash({ workspaceId: WS, tokenHash: "hash-member-2" }))!.revokedAt, undefined);
    await assert.rejects(h.sessions.save({ id: "late-session", workspaceId: WS, memberId: "member-1", tokenHash: "late-hash", createdAt: AT, expiresAt: "2027-01-01T00:00:00.000Z" }),
      { message: "member changed before the session was saved; request a new sign-in link" });
  });
}

test("gapb member: permissions, wrong workspace and stale version cannot touch credentials", async t => {
  const h = harness(); t.after(() => h.client.close()); h.seed(); h.granted.delete("member.manage");
  assert.deepEqual(await h.move(), { ok: false, reason: "forbidden", permission: "member.manage" });
  h.granted.add("member.manage");
  assert.deepEqual(await h.move("member-1", "other-workspace"), { ok: false, reason: "not-found" });
  assert.deepEqual(await h.move("member-1", WS, 5), { ok: false, reason: "version-changed" });
  assert.equal((await h.sessions.findByTokenHash({ workspaceId: WS, tokenHash: "hash-member-1" }))!.revokedAt, undefined);
  await h.move(); h.granted.delete("member.manage");
  assert.deepEqual((await h.invoke("trash_list_items", {}) as { items: unknown[] }).items, []);
  await assert.rejects(h.invoke("trash_restore_item", { entityType: "member", entityId: "member-1" }));
  assert.equal(await h.members.findById({ workspaceId: WS, id: "member-1" }), null);
});

test("gapb member: malformed payload is byte-identical and purge cascades credentials only after Trash", async t => {
  const h = harness(); t.after(() => h.client.close()); h.seed("member-1", "active", "{broken"); h.seed("member-2");
  assert.equal(await h.adapter.purge({ workspaceId: WS, entityId: "member-1", expectedVersion: 1 }), "version-changed");
  await h.move();
  assert.equal((h.client.prepare("SELECT fields_json FROM members WHERE id = 'member-1'").get() as { fields_json: string }).fields_json, "{broken");
  assert.equal(await h.adapter.purge({ workspaceId: WS, entityId: "member-1", expectedVersion: 1 }), "version-changed");
  // This is the adapter called by the admin/sweeper, never an agent tool.
  assert.equal(await h.adapter.purge({ workspaceId: WS, entityId: "member-1", expectedVersion: 2 }), "purged");
  assert.equal(await h.members.findById({ workspaceId: WS, id: "member-1" }), null);
  assert.equal(await h.sessions.findByTokenHash({ workspaceId: WS, tokenHash: "hash-member-1" }), null);
  assert.ok(await h.members.findById({ workspaceId: WS, id: "member-2" }));
});

test("gapb member: revocation failure rolls back marker and Trash index together", async t => {
  const h = harness(); t.after(() => h.client.close()); h.seed();
  h.client.exec("CREATE TRIGGER refuse_member_revocation BEFORE UPDATE ON member_sessions BEGIN SELECT RAISE(ABORT, 'revocation failed'); END");
  await assert.rejects(h.move(), /revocation failed/);
  assert.equal((await h.members.findById({ workspaceId: WS, id: "member-1" }))!.status, "active");
  assert.equal((await h.members.findById({ workspaceId: WS, id: "member-1" }))!.credentialsRevokedAt, undefined);
  assert.equal((await h.trash.list({ workspaceId: WS, now: AT, limit: 50 })).items.length, 0);
});

test("gapb member: Trash revokes credentials and purge works without a core-commerce blocker", async t => {
  const h = harness(); t.after(() => h.client.close()); h.seed();
  assert.equal(h.registry.get("member")!.blocker, undefined);
  assert.deepEqual(await h.move(), { ok: true, version: 2 });
  assert.equal((await h.sessions.findByTokenHash({ workspaceId: WS, tokenHash: "hash-member-1" }))!.revokedAt, AT);
  assert.equal(await h.adapter.purge({ workspaceId: WS, entityId: "member-1", expectedVersion: 2 }), "purged");
  assert.equal(await h.members.findByEmail({ workspaceId: WS, email: "member-1@example.test" }), null);
  assert.equal(await h.sessions.findByTokenHash({ workspaceId: WS, tokenHash: "hash-member-1" }), null);
});

test("gapb member: generic tool schemas include member without a per-resource delete tool", t => {
  const h = harness(); t.after(() => h.client.close());
  const [tool] = deriveTrashItemRegistrations({ registrations: [], surfaces: {
    surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }),
  }, routeDeps: {
    registry: h.registry, db: h.kernel, trash: h.trash, authorize: async () => ({ allowed: true, reason: "test" }),
    workspaceId: WS, clock: { nowIso: () => AT }, isTrashableEntityType: type => type === "member",
    postRepo: { findById: async () => null }, commentRepo: { findById: async () => null }, commentsReady: Promise.resolve(),
  } });
  const schema = tool!.descriptor.inputSchema as { properties: { entityType: { enum: string[] } } };
  assert.ok(schema.properties.entityType.enum.includes("member"));
  assert.equal(h.registry.get("member")!.permission, "member.manage");
  assert.equal(buildTrashAgentToolCatalog(trashToolEntityTypes(h.registry)).some(t => t.name === "members_delete"), false);
});

test("gapb member: memory reader retains email reservation but prevents list/get/update resurrection", async () => {
  const member = { id: "member-1", workspaceId: WS, email: "member-1@example.test", status: "trash" as const, createdAt: AT, updatedAt: AT, version: 2 };
  const repo = new InMemoryMemberRepo([member]);
  assert.equal(await repo.findById({ workspaceId: WS, id: member.id }), null);
  assert.deepEqual(await repo.list({ workspaceId: WS }), []);
  assert.equal((await repo.findByEmail({ workspaceId: WS, email: member.email }))!.status, "trash");
  await assert.rejects(repo.save({ ...member, status: "active" }));
});


test("gapb member: sign-in request for a trashed email keeps the neutral response without mail or token mint", async () => {
  const blocked = { id: "member-1", workspaceId: WS, email: "member-1@example.test", status: "trash" as const, createdAt: AT, updatedAt: AT, version: 2 };
  const fail = async () => { assert.fail("a trashed account must not mint a credential or send mail"); };
  const deps = {
    clock: createFakeClock({ startIso: AT }), members: new InMemoryMemberRepo([blocked]),
    magicLinks: { save: fail }, mailer: { send: fail }, ids: { newId: () => { assert.fail("must not mint"); } },
  } as unknown as MembersWriteServiceDeps;
  assert.deepEqual(await membersWriteService.requestSignInLink({ deps, input: { workspaceId: WS, email: blocked.email } }), { delivered: true });
});


test("gapb member: a late link minted before restore cannot sign the restored account in", async () => {
  const restored = { id: "member-1", workspaceId: WS, email: "member-1@example.test", status: "active" as const, credentialsRevokedAt: LATER, createdAt: AT, updatedAt: LATER, version: 3 };
  const deps = {
    clock: createFakeClock({ startIso: LATER }), members: new InMemoryMemberRepo([restored]),
    magicLinks: { findByTokenHash: async () => ({ id: "late-link", workspaceId: WS, memberId: restored.id,
      tokenHash: "fake-hash", purpose: "signin", createdAt: AT, expiresAt: "2027-01-01T00:00:00.000Z" }), consume: async () => {} },
    sessions: { save: async () => { assert.fail("must not mint a session"); } },
  } as unknown as MembersWriteServiceDeps;
  await assert.rejects(membersWriteService.completeSignIn({ deps, input: { workspaceId: WS, token: "fake-link" } }),
    { message: "sign-in link predates credential revocation; request a new sign-in link" });
});


test("gapb member: corrupt payload restores without parsing; repeat hide does not revoke a sibling", async t => {
  const h = harness(); t.after(() => h.client.close()); h.seed("member-1", "disabled", "{broken"); h.seed("member-2");
  const hidden = await h.adapter.hide({ workspaceId: WS, entityId: "member-1", at: AT, expectedVersion: 1 });
  assert.deepEqual(hidden, { ok: true, version: 2, priorMarker: "disabled" });
  const repeat = await h.adapter.hide({ workspaceId: WS, entityId: "member-1", at: LATER, expectedVersion: 2 });
  assert.ok(repeat.ok && repeat.noop);
  const restored = await h.adapter.unhide({ workspaceId: WS, entityId: "member-1", at: LATER, expectedVersion: 2 }, { priorMarker: "disabled" });
  assert.ok(restored.ok);
  assert.deepEqual(h.client.prepare("SELECT status, fields_json FROM members WHERE id = 'member-1'").get(), { status: "disabled", fields_json: "{broken" });
  assert.equal((await h.sessions.findByTokenHash({ workspaceId: WS, tokenHash: "hash-member-2" }))!.revokedAt, undefined);
});


test("member restore cutoff rejects a link minted late while hidden without reviving credentials", async t => {
  const h = harness(); t.after(() => h.client.close()); h.seed();
  await h.move();
  // A request that began before Trash may save a token after the bulk consume has run.
  h.client.prepare(`INSERT INTO member_magic_tokens
    (id, workspace_id, member_id, token_hash, purpose, created_at, expires_at)
    VALUES ('late-hidden', ?, 'member-1', 'hidden-hash', 'sign_in', ?, '2027-01-01T00:00:00.000Z')`)
    .run(WS, "2026-10-09T12:00:30.000Z");
  const beforeRestore = (await h.members.findByEmail({ workspaceId: WS, email: "member-1@example.test" }))!;
  assert.equal(beforeRestore.credentialsRevokedAt, AT);
  await h.invoke("trash_restore_item", { entityType: "member", entityId: "member-1" });
  const restored = (await h.members.findById({ workspaceId: WS, id: "member-1" }))!;
  assert.equal(restored.credentialsRevokedAt, LATER);
  await assert.rejects(h.sessions.save({ id: "hidden-session", workspaceId: WS, memberId: "member-1",
    tokenHash: "hidden-session-hash", createdAt: "2026-10-09T12:00:30.000Z", expiresAt: "2027-01-01T00:00:00.000Z" }),
    { message: "member changed before the session was saved; request a new sign-in link" });
  const deps = {
    clock: createFakeClock({ startIso: LATER }), members: h.members,
    magicLinks: { findByTokenHash: async () => ({ id: "late-hidden", workspaceId: WS, memberId: restored.id,
      tokenHash: "hidden-hash", purpose: "signin", createdAt: "2026-10-09T12:00:30.000Z", expiresAt: "2027-01-01T00:00:00.000Z" }),
      consume: async () => {} },
    sessions: { save: async () => { assert.fail("must not mint a session from a hidden-period link"); } },
  } as unknown as MembersWriteServiceDeps;
  await assert.rejects(membersWriteService.completeSignIn({ deps, input: { workspaceId: WS, token: "late-hidden-token" } }),
    { message: "sign-in link predates credential revocation; request a new sign-in link" });
});

test("member restore cutoff failure rolls back status, marker and Trash index", async t => {
  const h = harness(); t.after(() => h.client.close()); h.seed(); await h.move();
  h.client.exec("CREATE TRIGGER refuse_restore_cutoff BEFORE UPDATE OF credentials_revoked_at ON members BEGIN SELECT RAISE(ABORT, 'restore cutoff failed'); END");
  await assert.rejects(h.invoke("trash_restore_item", { entityType: "member", entityId: "member-1" }), /restore cutoff failed/);
  const stillHidden = (await h.members.findByEmail({ workspaceId: WS, email: "member-1@example.test" }))!;
  assert.equal(stillHidden.status, "trash");
  assert.equal(stillHidden.credentialsRevokedAt, AT);
  assert.equal((await h.trash.list({ workspaceId: WS, now: LATER, limit: 50 })).items.length, 1);
});

test("member adapter: a refused or no-op marker flip returns verbatim and never touches credentials", async () => {
  const { client, kernel, registry, seed } = harness();
  seed("member-scripted");
  const inner = createTableTrashAdapter({ entry: registry.get("member")!, db: kernel });
  const outcomes = [
    { ok: false as const, reason: "version-changed" as const },
    { ok: false as const, reason: "blocked" as const, code: "member-blocker", count: 2 },
    { ok: true as const, version: 2, noop: true as const },
  ];
  const credentialState = () => ({
    member: client.prepare("SELECT credentials_revoked_at FROM members WHERE id = ?").get("member-scripted"),
    session: client.prepare("SELECT revoked_at FROM member_sessions WHERE member_id = ?").get("member-scripted"),
    link: client.prepare("SELECT consumed_at FROM member_magic_tokens WHERE member_id = ?").get("member-scripted"),
  });
  const before = credentialState();
  assert.deepEqual(before, { member: { credentials_revoked_at: null }, session: { revoked_at: null }, link: { consumed_at: null } });
  for (const outcome of outcomes) {
    const seen: unknown[] = [];
    const adapter = createMemberTrashAdapter({ adapter: {
      ...inner,
      hide: async (input, options) => { seen.push(["hide", input.entityId, options]); return outcome; },
      unhide: async (input, options) => { seen.push(["unhide", input.entityId, options]); return outcome; },
    }, db: kernel });
    const input = { workspaceId: WS, entityId: "member-scripted", at: LATER, expectedVersion: 1 };
    assert.deepEqual(await adapter.hide(input), outcome);
    assert.deepEqual(await adapter.unhide(input), outcome);
    assert.deepEqual(seen, [["hide", "member-scripted", {}], ["unhide", "member-scripted", {}]], "options default to {} and reach the wrapped adapter");
    assert.deepEqual(credentialState(), before, `outcome ${JSON.stringify(outcome)} must not revoke anything`);
  }
});
