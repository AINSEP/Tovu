/** Audit HIGH #1: post-hash authorization and rollback on the real SQLite/PGlite lifecycle. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test, type TestContext } from "node:test";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import type { ContentKernel } from "#src/platform/db/content-kernel";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import type { MembersWriteServiceDeps } from "../ports.js";
import { SqlMagicLinkTokenRepo, SqlMemberRepo, SqlMemberSessionRepo } from "../repo.js";
import { InMemoryMemberSubscriptionRepo, InMemoryMemberTierRepo } from "../repo.memory.js";
import { resetPassword, setMemberPassword, signInWithPassword } from "../password-auth.js";
import { issueMemberSession } from "../write-service.js";
import { MemberAuthError, MemberConflictError, MemberReauthenticationRequiredError, MemberValidationError } from "../types.js";

const WS = "password-lifecycle";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const hash = (value: string) => `test:${digest(value)}`;
type Workflow = "change" | "reset" | "first-password";

/** Only hashing is controlled; authorization, transactions, locks and persistence stay real. */
function harness(kernel: ContentKernel) {
  const clock = createFakeClock({ startIso: "2026-10-24T12:00:00.000Z" });
  let sequence = 0;
  const members = new SqlMemberRepo(kernel);
  const sessions = new SqlMemberSessionRepo(kernel);
  const magicLinks = new SqlMagicLinkTokenRepo(kernel);
  const deps: MembersWriteServiceDeps = {
    credentialLifecycle: kernel, clock, ids: { newId: () => `password-${++sequence}` }, members, sessions, magicLinks,
    tiers: new InMemoryMemberTierRepo(), subscriptions: new InMemoryMemberSubscriptionRepo(),
    principals: new InMemoryPrincipalRepo({}),
    passwordHasher: { hash: async ({ password }) => hash(password), verify: async input => input.hash === hash(input.password) },
    mailer: {
      capabilities: () => ({ driver: "memory", supportsIdempotencyKey: true, supportsWebhookFeedback: false,
        maxBatchSize: 1, supportsAttachments: false }),
      send: async () => { throw new Error("password mutation must not send mail"); }, sendBatch: async () => [],
    },
  };
  async function seed(required: { password: string | null }, _options = {}) {
    const member = { id: "member", workspaceId: WS, email: "member@example.test", status: "active" as const,
      createdAt: clock.nowIso(), updatedAt: clock.nowIso(), version: 1 };
    await members.save(member);
    if (required.password !== null) await members.setPasswordHash({ workspaceId: WS, memberId: member.id, passwordHash: hash(required.password) });
    return member;
  }
  async function resetToken() {
    const token = `reset-${++sequence}`;
    await magicLinks.save({ id: token, workspaceId: WS, memberId: "member", purpose: "password_reset",
      tokenHash: digest(token), createdAt: clock.nowIso(), expiresAt: "2026-10-25T12:00:00.000Z" });
    return token;
  }
  const change = (required: { sessionToken: string; password: string; currentPassword?: string }, _options = {}) =>
    setMemberPassword({ deps, input: { workspaceId: WS, ...required } });
  const reset = (required: { token: string; password: string }, _options = {}) =>
    resetPassword({ deps, input: { workspaceId: WS, ...required } });
  const credential = () => members.findPasswordHash({ workspaceId: WS, memberId: "member" });
  const profile = () => members.findById({ workspaceId: WS, id: "member" });
  const session = async () => issueMemberSession({ deps, member: (await profile())!, nowIso: clock.nowIso() });
  const login = (required: { password: string }, _options = {}) => signInWithPassword({ deps,
    input: { workspaceId: WS, email: "member@example.test", ...required } });
  return { kernel, deps, clock, members, sessions, magicLinks, seed, resetToken, change, reset, credential, profile, session, login };
}

/** A barrier controls one selected hash without timers or blocking the victim's hash. */
function pauseHash(required: { deps: MembersWriteServiceDeps; password: string }, _options = {}) {
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const hasher = required.deps.passwordHasher!;
  const original = hasher.hash.bind(hasher);
  hasher.hash = async input => {
    if (input.password === required.password) { entered(); await gate; }
    return original(input);
  };
  return { started, release };
}

describeEachDialect("atomic member password lifecycle", {
  tables: ["member_sessions", "member_magic_tokens", "members"], make: harness,
}, (make, dialect) => {
  function open(t: TestContext) {
    const h = make();
    if (dialect === "sqlite") t.after(() => h.kernel.close());
    return h;
  }

  for (const earlier of ["change", "reset", "first-password"] satisfies Workflow[]) {
    for (const winner of ["change", "reset"] as const) {
      test(`${earlier} hashing cannot overwrite a completed victim ${winner}`, { timeout: 20_000 }, async t => {
        const h = open(t);
        await h.seed({ password: earlier === "first-password" ? null : "old" });
        const attacker = await h.session();
        const victim = await h.session();
        const earlierToken = await h.resetToken();
        const victimToken = await h.resetToken();
        const writes: string[] = [];
        const setHash = h.members.setPasswordHash.bind(h.members);
        h.members.setPasswordHash = async input => { writes.push(input.passwordHash); await setHash(input); };
        const pause = pauseHash({ deps: h.deps, password: "attacker-new" });
        const pending = earlier === "reset"
          ? h.reset({ token: earlierToken, password: "attacker-new" })
          : h.change({ sessionToken: attacker.rawSessionToken, password: "attacker-new",
            currentPassword: earlier === "change" ? "old" : undefined });
        const rejected = assert.rejects(pending, MemberAuthError);
        await pause.started;
        try {
          h.clock.advanceMs(1);
          if (winner === "reset") await h.reset({ token: victimToken, password: "victim-new" });
          else await h.change({ sessionToken: victim.rawSessionToken, password: "victim-new",
            currentPassword: earlier === "first-password" ? undefined : "old" });
          assert.equal(await h.credential(), hash("victim-new"));
          const profile = await h.profile();
          const sessions = await h.sessions.listByMember({ workspaceId: WS, memberId: "member" });
          assert.ok(sessions.find(row => row.id === attacker.session.id)?.revokedAt);
          pause.release();
          await rejected;
          assert.deepEqual(writes, [hash("victim-new")], "stale authorization must be rejected before any credential write");
          assert.equal(await h.credential(), hash("victim-new"));
          assert.deepEqual(await h.profile(), profile);
          assert.deepEqual(await h.sessions.listByMember({ workspaceId: WS, memberId: "member" }), sessions);
          await assert.rejects(h.login({ password: "attacker-new" }), MemberAuthError);
          await h.login({ password: "victim-new" });
        } finally { pause.release(); }
      });
    }
  }

  for (const workflow of ["change", "reset"] as const) {
    test(`${workflow} rolls back hash, revocations and profile on a profile conflict`, async t => {
      const h = open(t); await h.seed({ password: "old" });
      const current = await h.session(); await h.session();
      const token = await h.resetToken();
      const before = await h.profile();
      const sessions = await h.sessions.listByMember({ workspaceId: WS, memberId: "member" });
      const save = h.members.save.bind(h.members);
      let reachedProfile = false;
      h.members.save = async record => {
        reachedProfile = true;
        assert.equal(h.kernel.inTransaction(), true);
        assert.equal(await h.credential(), hash("new"), "the real credential update has executed");
        // Force the repository's real optimistic conflict after the credential and revocation writes.
        await save({ ...record, version: -1 });
      };
      h.clock.advanceMs(1);
      const pending = workflow === "reset" ? h.reset({ token, password: "new" })
        : h.change({ sessionToken: current.rawSessionToken, password: "new", currentPassword: "old" });
      await assert.rejects(pending, MemberConflictError);
      assert.equal(reachedProfile, true);
      assert.equal(await h.credential(), hash("old"));
      assert.deepEqual(await h.profile(), before);
      assert.deepEqual(await h.sessions.listByMember({ workspaceId: WS, memberId: "member" }), sessions);
      if (workflow === "reset") assert.ok((await h.magicLinks.findByTokenHash({ workspaceId: WS, tokenHash: digest(token) }))?.consumedAt,
        "rollback must not refund the spent reset link");
    });
  }

  test("same-session changes in the same clock tick must revalidate the credential", { timeout: 20_000 }, async t => {
    const h = open(t); await h.seed({ password: "old" });
    const current = await h.session();
    // Establish a cutoff first so both requests observe the same cutoff, session and clock tick.
    await h.change({ sessionToken: current.rawSessionToken, password: "old", currentPassword: "old" });
    const pause = pauseHash({ deps: h.deps, password: "earlier" });
    const rejected = assert.rejects(h.change({ sessionToken: current.rawSessionToken, password: "earlier", currentPassword: "old" }), MemberAuthError);
    await pause.started;
    try {
      await h.change({ sessionToken: current.rawSessionToken, password: "later", currentPassword: "old" });
      pause.release(); await rejected;
      assert.equal(await h.credential(), hash("later"));
      await h.login({ password: "later" });
    } finally { pause.release(); }
  });

  test("passwordless inbox proof must still be recent after hashing", { timeout: 20_000 }, async t => {
    const h = open(t); await h.seed({ password: null }); const current = await h.session();
    const pause = pauseHash({ deps: h.deps, password: "new" });
    const rejected = assert.rejects(h.change({ sessionToken: current.rawSessionToken, password: "new" }), MemberReauthenticationRequiredError);
    await pause.started;
    h.clock.advanceMs(15 * 60_000 + 1);
    pause.release(); await rejected;
    assert.equal(await h.credential(), null);
  });

  test("a presenting session that expires during hashing cannot change credentials", { timeout: 20_000 }, async t => {
    const h = open(t); await h.seed({ password: "old" }); const current = await h.session();
    const pause = pauseHash({ deps: h.deps, password: "new" });
    const rejected = assert.rejects(h.change({ sessionToken: current.rawSessionToken, password: "new", currentPassword: "old" }), MemberAuthError);
    await pause.started;
    h.clock.set(current.session.expiresAt);
    pause.release(); await rejected;
    assert.equal(await h.credential(), hash("old"));
  });

  test("reset authorization that expires during hashing cannot change credentials", { timeout: 20_000 }, async t => {
    const h = open(t); await h.seed({ password: "old" }); const token = await h.resetToken();
    const record = await h.magicLinks.findByTokenHash({ workspaceId: WS, tokenHash: digest(token) });
    const pause = pauseHash({ deps: h.deps, password: "new" });
    const rejected = assert.rejects(h.reset({ token, password: "new" }), MemberAuthError);
    await pause.started;
    h.clock.set(record!.expiresAt);
    pause.release(); await rejected;
    assert.equal(await h.credential(), hash("old"));
  });

  test("normal changes authorize and write under the member lock in one transaction", async t => {
    const h = open(t); await h.seed({ password: "old" });
    const current = await h.session(); const other = await h.session();
    let transactions = 0;
    let locked = false;
    h.deps.credentialLifecycle = {
      transaction: work => { transactions++; return h.kernel.transaction(work); },
      lockKey: async key => {
        assert.equal(h.kernel.inTransaction(), true);
        assert.equal(key, `trash:member:${WS}:member`);
        await h.kernel.lockKey(key); locked = true;
      },
    };
    const setHash = h.members.setPasswordHash.bind(h.members);
    h.members.setPasswordHash = async input => {
      assert.equal(h.kernel.inTransaction(), true); assert.equal(locked, true);
      await setHash(input);
    };
    h.clock.advanceMs(1);
    assert.deepEqual(await h.change({ sessionToken: current.rawSessionToken, password: "new", currentPassword: "old" }), { ok: true });
    assert.equal(transactions, 1);
    assert.equal((await h.profile())?.credentialsRevokedAt, h.clock.nowIso());
    const sessions = await h.sessions.listByMember({ workspaceId: WS, memberId: "member" });
    assert.equal(sessions.find(row => row.id === current.session.id)?.revokedAt, undefined);
    assert.equal(sessions.find(row => row.id === other.session.id)?.revokedAt, h.clock.nowIso());
    await h.login({ password: "new" });
  });

  test("missing transactional composition fails closed before hashing or writing", async t => {
    const h = open(t); await h.seed({ password: "old" }); const current = await h.session();
    h.deps.credentialLifecycle = undefined;
    h.deps.passwordHasher!.hash = async () => assert.fail("must fail before hashing");
    await assert.rejects(h.change({ sessionToken: current.rawSessionToken, password: "new", currentPassword: "old" }), MemberValidationError);
    assert.equal(await h.credential(), hash("old"));
  });
});
