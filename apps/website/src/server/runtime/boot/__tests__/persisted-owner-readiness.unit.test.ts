import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_OWNER_CREDENTIALS, DEFAULT_OWNER_PASSWORD, createInMemoryIdentityRouteDeps } from "#src/features/identity/wiring";
import { createAppPermissionGrants } from "#src/server/runtime/composition/app-permission-grants";
import { assertSafeOwnerCredentialBeforeListen } from "../boot-readiness-gate.js";

test("an exposed listener refuses the stored default owner despite a strong environment password", async (t) => {
  let id = 0;
  const workspaceId = "owner-readiness";
  const deps = { workspaceId, ...createInMemoryIdentityRouteDeps({
    workspaceId, ownerCredentials: DEFAULT_OWNER_CREDENTIALS,
    permissionGrants: createAppPermissionGrants({}),
    clock: { nowMs: () => 0 }, idGen: { newId: () => `owner-${++id}` },
  }) };
  const previous = { password: process.env.TOVU_ADMIN_PASSWORD, mode: process.env.TOVU_RUNTIME_MODE };
  process.env.TOVU_ADMIN_PASSWORD = "strong-environment-password-fixture";
  t.after(() => {
    if (previous.password === undefined) delete process.env.TOVU_ADMIN_PASSWORD;
    else process.env.TOVU_ADMIN_PASSWORD = previous.password;
    if (previous.mode === undefined) delete process.env.TOVU_RUNTIME_MODE;
    else process.env.TOVU_RUNTIME_MODE = previous.mode;
  });
  // Local mode: ordinary `npm run dev` binds every interface with the seeded default on purpose.
  delete process.env.TOVU_RUNTIME_MODE;
  await assert.doesNotReject(assertSafeOwnerCredentialBeforeListen({ deps, host: undefined }));
  process.env.TOVU_RUNTIME_MODE = "production";
  for (const host of ["0.0.0.0", "192.0.2.1", undefined]) {
    await assert.rejects(assertSafeOwnerCredentialBeforeListen({ deps, host }), /default-owner-password/);
  }
  for (const host of ["127.0.0.1", "::1"]) {
    await assert.doesNotReject(assertSafeOwnerCredentialBeforeListen({ deps, host }));
  }
  const principalId = await deps.ownerPrincipalId;
  const owner = await deps.userRepo.findByPrincipalId({ workspaceId, principalId });
  assert.ok(owner);
  assert.equal(await deps.passwordHasher.verify({ hash: owner.passwordHash, password: DEFAULT_OWNER_PASSWORD }), true);
  await deps.userRepo.save({ ...owner, passwordHash: await deps.passwordHasher.hash({ password: "rotated-owner-password-fixture" }) });
  await assert.doesNotReject(assertSafeOwnerCredentialBeforeListen({ deps, host: "0.0.0.0" }));
});

test("both listener entrypoints check persisted owner credentials before starting serving work", () => {
  for (const [file, host] of [["../../../../index.ts", "bindHost"], ["../../../../cli/commands/serve.ts", "host"]]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const guard = source.indexOf(`await assertSafeOwnerCredentialBeforeListen({ deps, host: ${host} })`);
    assert.ok(guard >= 0, `${file} must call the persisted credential guard`);
    assert.ok(guard < source.indexOf("  await ensureAgentDaemonPortResolved();"), "refusal precedes serving workers and the authenticated app");
  }
});
