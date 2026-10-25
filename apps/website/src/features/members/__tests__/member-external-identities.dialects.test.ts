/** Amended Google login design S1: memory, SQLite and PGlite share the same contract. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { eachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { InMemoryMemberExternalIdentityRepo } from "../repo.memory.js";
import { SqlMemberExternalIdentityRepo } from "../repo.js";
import { runExternalIdentityContract } from "./member-external-identities.contract.js";

runExternalIdentityContract({ name: "memory", open: async () => new InMemoryMemberExternalIdentityRepo({}) });
for (const adapter of eachDialect({ tables: ["member_external_identities"], make: kernel => kernel })) {
  runExternalIdentityContract({ name: adapter.name, open: async t => {
    const kernel = adapter.make();
    if (adapter.dialect === "sqlite") t.after(() => kernel.close());
    return new SqlMemberExternalIdentityRepo({ kernel });
  } });
  test(`[${adapter.name}] identity changes roll back with the caller's member transaction`, async t => {
    const kernel = adapter.make();
    if (adapter.dialect === "sqlite") t.after(() => kernel.close());
    const repo = new SqlMemberExternalIdentityRepo({ kernel });
    await assert.rejects(kernel.transaction(async () => {
      await repo.save({ id: "rollback", workspaceId: "w", memberId: "m", providerId: "google",
        issuer: "https://accounts.google.com", subject: "rollback-sub", linkedAt: "2026-10-24T20:00:00.000Z" });
      throw new Error("rollback identity");
    }), /rollback identity/);
    assert.deepEqual(await repo.listByMember({ workspaceId: "w", memberId: "m" }), []);
    const record = { id: "existing", workspaceId: "w", memberId: "m", providerId: "google",
      issuer: "https://accounts.google.com", subject: "existing-sub", linkedAt: "2026-10-24T20:00:00.000Z" };
    await repo.save(record);
    await assert.rejects(kernel.transaction(async () => {
      await repo.unlink({ workspaceId: "w", memberId: "m", providerId: "google", unlinkedAt: "2026-10-24T20:01:00.000Z" });
      throw new Error("rollback unlink");
    }), /rollback unlink/);
    assert.deepEqual(await repo.findByMemberAndProvider({ workspaceId: "w", memberId: "m", providerId: "google" }), record);
  });
}
