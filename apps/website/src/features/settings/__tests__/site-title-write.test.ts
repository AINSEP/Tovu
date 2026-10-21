import { createSettingsPrincipalLookup } from "../index.js";
import assert from "node:assert/strict";
import test from "node:test";

import type { JsonValue } from "@jini-ai/core/primitives";
import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { ensureSettingDefinitions, getEffective, InMemorySettingsRepo, SCOPE_BIT, type AuthorizeFn } from "@jini-ai/core/settings";

import { set, ValueValidationFailedError } from "../index.js";
import { ensureSiteTitleSettingDefinition, SITE_TITLE_KEY, SITE_TITLE_NAMESPACE } from "../site-title.js";

/**
 * @file SPEC-050 REQ-08 (AC-14) at Tovu's settings write chokepoint: the `set` this directory's
 * barrel exports, which the admin settings route and both composition roots' `RouteDeps.set` bind.
 * An owner write to `core.site.title` is trimmed and must be 1..200 characters after trimming. An
 * invalid one is rejected before the ledger is touched. The same rule over HTTP is in
 * `server/inbound/public-http/routes/site/__tests__/integration/site-title.integration.test.ts`.
 */

const SYSTEM_PRINCIPAL_ID = "system-settings-migration";
const OWNER_PRINCIPAL_ID = "owner-principal";
const WORKSPACE_ID = "ws-site-title-write";
const REJECTION = "value for 'core.site.title' must be 1..200 characters after trimming";
const SITE_TITLE = { namespace: SITE_TITLE_NAMESPACE, key: SITE_TITLE_KEY };

const clock = { nowIso: () => "2026-09-12T00:00:00.000Z", nowMs: () => Date.parse("2026-09-12T00:00:00.000Z") };
let idCounter = 0;
const ids = { newId: () => `site-title-write-id-${++idCounter}` };
const allowAll: AuthorizeFn = async () => ({ allowed: true, reason: "test" });

async function makeLedger() {
  const ledger = { settingsRepo: new InMemorySettingsRepo(), clock, ids, principals: createSettingsPrincipalLookup({ repo: new InMemoryPrincipalRepo({}) }) };
  await ensureSiteTitleSettingDefinition(ledger, { systemPrincipalId: SYSTEM_PRINCIPAL_ID });
  return ledger;
}

type Ledger = Awaited<ReturnType<typeof makeLedger>>;

function ownerWrite(ledger: Ledger, target: { namespace: string; key: string }, value: JsonValue) {
  return set({
    deps: { repo: ledger.settingsRepo, clock, ids, authorize: allowAll, principals: ledger.principals },
    input: { ...target, scope: "workspace", workspaceId: WORKSPACE_ID, value, callerPrincipalId: OWNER_PRINCIPAL_ID },
  });
}

async function storedValue(ledger: Ledger, target: { namespace: string; key: string }): Promise<JsonValue | undefined> {
  const resolved = await getEffective({ repo: ledger.settingsRepo }, { ...target, scopeContext: { workspaceId: WORKSPACE_ID } });
  return resolved?.sourceLayer === "workspace" ? resolved.value : undefined;
}

/** `workspaceId` is load-bearing: without it the ledger returns only platform-wide revisions, never a workspace value's. */
async function revisionCount(ledger: Ledger): Promise<number> {
  return (await ledger.settingsRepo.listRevisionsSince({ sinceSeq: 0, limit: 10_000, workspaceId: WORKSPACE_ID })).length;
}

function isTitleRejection(err: unknown): true {
  assert.ok(err instanceof ValueValidationFailedError, `expected ValueValidationFailedError, got ${String(err)}`);
  assert.equal(err.message, REJECTION);
  return true;
}

test("AC-14 (REQ-08): a padded title is stored, returned and read back trimmed", async () => {
  const ledger = await makeLedger();

  const result = await ownerWrite(ledger, SITE_TITLE, "  My Site  ");

  assert.equal(result.value, "My Site");
  assert.equal(await storedValue(ledger, SITE_TITLE), "My Site");
});

test("REQ-08: both bounds apply after trimming, so 1 and 200 characters are accepted", async () => {
  const ledger = await makeLedger();
  const twoHundred = "x".repeat(200);

  for (const [written, expected] of [
    ["a", "a"],
    [" a ", "a"],
    [twoHundred, twoHundred],
    [`\t${twoHundred}\n`, twoHundred],
  ] as const) {
    await ownerWrite(ledger, SITE_TITLE, written);
    assert.equal(await storedValue(ledger, SITE_TITLE), expected, `written length ${written.length}`);
  }
});

test("AC-14 (REQ-08): an empty, blank or 201-character title is rejected with a validation error and nothing stored changes", async () => {
  const ledger = await makeLedger();
  const beforeAccepted = await revisionCount(ledger);
  await ownerWrite(ledger, SITE_TITLE, "My Site");
  const before = await revisionCount(ledger);
  assert.equal(before, beforeAccepted + 1, "the revision count must see this workspace's value writes");

  for (const invalid of ["", "   ", "\t\n ", "x".repeat(201), ` ${"x".repeat(201)} `]) {
    await assert.rejects(() => ownerWrite(ledger, SITE_TITLE, invalid), isTitleRejection, `length ${invalid.length}`);
  }

  assert.equal(await storedValue(ledger, SITE_TITLE), "My Site", "the previous title is still the stored value");
  assert.equal(await revisionCount(ledger), before, "a rejected write appends no revision");
});

test("REQ-08 is scoped to core.site.title: a sibling key and a same-named key in another namespace store a blank value untouched", async () => {
  const ledger = await makeLedger();
  const sibling = { namespace: SITE_TITLE_NAMESPACE, key: "tagline" };
  const otherNamespace = { namespace: "core.brand", key: SITE_TITLE_KEY };
  for (const target of [sibling, otherNamespace]) {
    await ensureSettingDefinitions(ledger, {
      namespace: target.namespace,
      definitions: [{ key: target.key, schema: { type: "string" }, defaultValue: "", scopes: SCOPE_BIT.workspace }],
      systemPrincipalId: SYSTEM_PRINCIPAL_ID,
    });
  }

  for (const target of [sibling, otherNamespace]) {
    await ownerWrite(ledger, target, "   ");
    assert.equal(await storedValue(ledger, target), "   ", `${target.namespace}.${target.key}`);
  }
});

test("REQ-08 leaves a non-string title to the definition schema's own rejection", async () => {
  const ledger = await makeLedger();

  await assert.rejects(() => ownerWrite(ledger, SITE_TITLE, 42), (err: unknown) => {
    assert.ok(err instanceof ValueValidationFailedError);
    assert.equal(err.message, "value for 'core.site.title' does not match the definition schema");
    return true;
  });
});

for (const policy of ["missing", "deny", "allow", "throw"] as const) {
  test(`public assistant enable policy ${policy} is enforced before persistence`, async (t) => {
    const ledger = await makeLedger();
    await ensureSettingDefinitions(ledger, { namespace: "site.assistant", ownerKind: "site", workspaceId: WORKSPACE_ID,
      definitions: [{ key: "public_enabled", schema: { type: "boolean" }, defaultValue: false, scopes: SCOPE_BIT.workspace }],
      systemPrincipalId: SYSTEM_PRINCIPAL_ID });
    let calls = 0;
    const optional = policy === "missing" ? {} : { canEnablePublicAssistant: async ({ workspaceId }: { workspaceId: string }) => {
      assert.equal(workspaceId, WORKSPACE_ID);
      calls++;
      if (policy === "throw") throw new Error("policy unavailable");
      return policy === "allow";
    } };
    const required = { deps: { repo: ledger.settingsRepo, clock, ids, authorize: allowAll, principals: ledger.principals },
      input: { namespace: "site.assistant", key: "public_enabled", scope: "workspace" as const, workspaceId: WORKSPACE_ID,
        value: true, callerPrincipalId: OWNER_PRINCIPAL_ID } };
    const before = await revisionCount(ledger);
    if (policy === "allow") {
      assert.equal((await set(required, optional)).value, true);
      assert.equal(await storedValue(ledger, required.input), true);
    } else {
      await assert.rejects(set(required, optional), policy === "throw" ? /policy unavailable/ : /usable provider key and a model/);
      assert.equal(await revisionCount(ledger), before);
    }
    assert.equal(calls, policy === "missing" ? 0 : 1);
    assert.equal((await set({ ...required, input: { ...required.input, value: false } }, optional)).value, false);
    assert.equal(calls, policy === "missing" ? 0 : 1, "disabling does not consult enable policy");
    const definition = await ledger.settingsRepo.findActiveDefinition({ namespace: "site.assistant", key: "public_enabled", workspaceId: WORKSPACE_ID });
    assert.ok(definition);
    // A repository port that resolves a definition still cannot authorize a workspace-less enable.
    t.mock.method(ledger.settingsRepo, "findActiveDefinition", async () => definition);
    await assert.rejects(set({ ...required, input: { ...required.input, workspaceId: undefined } }, optional), /usable provider key and a model/);
    assert.equal(calls, policy === "missing" ? 0 : 1, "missing workspace fails before policy");
  });
}

test("core.comments/provider is refused at the chokepoint unless written by the comments selection store (comments.configure)", async () => {
  const ledger = await makeLedger();
  await ensureSettingDefinitions(ledger, {
    namespace: "core.comments", systemPrincipalId: SYSTEM_PRINCIPAL_ID, definitions: [{ key: "provider", schema: { type: "string" }, defaultValue: "built-in" }],
  });
  const target = { namespace: "core.comments", key: "provider" };
  const before = await revisionCount(ledger);
  await assert.rejects(ownerWrite(ledger, target, ""), (err: unknown) => err instanceof ValueValidationFailedError && /comments_set_provider/.test(err.message));
  assert.equal(await revisionCount(ledger), before, "nothing reaches the ledger");
  await set({ deps: { repo: ledger.settingsRepo, clock, ids, authorize: allowAll, principals: ledger.principals },
    input: { ...target, scope: "workspace", workspaceId: WORKSPACE_ID, value: "", callerPrincipalId: OWNER_PRINCIPAL_ID, requiredPermissionOverride: "comments.configure" } });
  assert.equal(await storedValue(ledger, target), "");
});

test("core.theme/previewSwitcher fails closed when no theme write policy is composed", async () => {
  const ledger = await makeLedger();
  await ensureSettingDefinitions(ledger, {
    namespace: "core.theme", systemPrincipalId: SYSTEM_PRINCIPAL_ID, definitions: [{ key: "previewSwitcher", schema: { type: "boolean" }, defaultValue: false }],
  });
  const before = await revisionCount(ledger);
  await assert.rejects(ownerWrite(ledger, { namespace: "core.theme", key: "previewSwitcher" }, true),
    (err: unknown) => err instanceof ValueValidationFailedError && err.message === "Theme preview write policy is unavailable.");
  assert.equal(await revisionCount(ledger), before, "nothing reaches the ledger");
});
