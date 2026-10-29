import assert from "node:assert/strict";
import test from "node:test";
import { InMemorySettingsRepo, type SettingDefinitionRecord } from "@jini-ai/core/settings";
import { ASSISTANT_SUBAGENTS_NAMESPACE } from "#src/contracts/headless/index";
import { ASSISTANT_PERMANENT_DELETES_NAMESPACE } from "#src/contracts/headless/index";
import { touchesAssistantSubagents } from "../assistant-subagents-access.js";

/**
 * @file Branch pins for the generic-settings fence around the owner-only agent permissions.
 * `system/__tests__/assistant-subagents.test.ts` proves the routes refuse the obvious bypasses;
 * this suite pins every decision of the predicate itself (non-object bodies, coercion of the
 * namespace, alias resolution, key-less resets, and the batch rule that a key-less definition item
 * is never expanded) so a refactor cannot silently open one of them.
 */

const WS = "ws";
const PROTECTED = ASSISTANT_SUBAGENTS_NAMESPACE;

function definition(input: { namespace: string; key: string; workspaceId?: string | null; aliasOf?: [string, string] }): SettingDefinitionRecord {
  return {
    settingId: `${input.workspaceId ?? "platform"}:${input.namespace}.${input.key}`, version: 1,
    workspaceId: input.workspaceId ?? null, namespace: input.namespace, key: input.key,
    ownerKind: "core", ownerId: null, schema: { type: "boolean" }, defaultValue: false, scopes: 2, secret: false,
    status: input.aliasOf ? "alias" : "active",
    aliasOfNamespace: input.aliasOf?.[0] ?? null, aliasOfKey: input.aliasOf?.[1] ?? null,
    coercionTag: null, createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-20T00:00:00.000Z",
  };
}

/** Real in-memory repo that also records which lookups the predicate made, in order. */
class RecordingRepo extends InMemorySettingsRepo {
  readonly calls: string[] = [];
  override async listActiveDefinitions(required: { workspaceId: string | null }): Promise<SettingDefinitionRecord[]> {
    this.calls.push(`list:${required.workspaceId}`);
    return super.listActiveDefinitions(required);
  }
  override async findActiveDefinition(required: { namespace: string; key: string; workspaceId: string | null }): Promise<SettingDefinitionRecord | null> {
    this.calls.push(`find:${required.workspaceId}:${required.namespace}.${required.key}`);
    return super.findActiveDefinition(required);
  }
}

function repoWith(definitions: SettingDefinitionRecord[] = []): RecordingRepo {
  return new RecordingRepo({ definitions: [
    definition({ namespace: PROTECTED, key: "enabled" }),
    definition({ namespace: "core.execution", key: "mode" }),
    ...definitions,
  ] });
}

const touches = (body: unknown, repo: RecordingRepo, namespaces?: readonly string[]) =>
  touchesAssistantSubagents({ body, repo, workspaceId: WS, ...(namespaces ? { namespaces } : {}) });

test("null and non-object bodies touch nothing and make no lookups", async () => {
  const repo = repoWith();
  for (const body of [null, undefined, PROTECTED, 7, true]) assert.equal(await touches(body, repo), false);
  assert.deepEqual(repo.calls, []);
});

test("a body naming either default protected namespace is refused without any lookup", async () => {
  const repo = repoWith();
  assert.equal(await touches({ namespace: ASSISTANT_SUBAGENTS_NAMESPACE, key: "enabled" }, repo), true);
  assert.equal(await touches({ namespace: ASSISTANT_PERMANENT_DELETES_NAMESPACE }, repo), true);
  assert.deepEqual(repo.calls, []);
});

test("renaming into a protected namespace is refused through newNamespace", async () => {
  const repo = repoWith();
  assert.equal(await touches({ namespace: "core.execution", key: "mode", newNamespace: PROTECTED }, repo), true);
  assert.deepEqual(repo.calls, []);
});

test("a non-string namespace is compared by its string form, so a one-element array is still refused", async () => {
  assert.equal(await touches({ namespace: [PROTECTED], key: "enabled" }, repoWith()), true);
});

test("a non-string namespace that names nothing protected is skipped without lookups", async () => {
  const repo = repoWith();
  assert.equal(await touches({ namespace: 5, key: "enabled" }, repo), false);
  assert.equal(await touches([PROTECTED], repo), false);
  assert.deepEqual(repo.calls, []);
});

test("a keyed write through an alias of the protected setting is refused", async () => {
  const repo = repoWith([definition({ namespace: "core.alias", key: "allow", aliasOf: [PROTECTED, "enabled"] })]);
  assert.equal(await touches({ namespace: "core.alias", key: "allow" }, repo), true);
});

test("a keyed write to an ordinary or unknown setting is allowed after one resolution", async () => {
  const repo = repoWith();
  assert.equal(await touches({ namespace: "core.execution", key: "mode" }, repo), false);
  assert.deepEqual(repo.calls, ["find:ws:core.execution.mode", "find:null:core.execution.mode"]);
  assert.equal(await touches({ namespace: "core.unknown", key: "missing" }, repoWith()), false);
});

test("a key-less reset expands platform then workspace definitions of that namespace only", async () => {
  const repo = repoWith([
    definition({ namespace: "site.alias", key: "ok", workspaceId: WS }),
    definition({ namespace: "site.alias", key: "elsewhere", workspaceId: "other", aliasOf: [PROTECTED, "enabled"] }),
  ]);
  assert.equal(await touches({ namespace: "site.alias", scope: "workspace" }, repo), false);
  assert.deepEqual(repo.calls, ["list:null", "list:ws", "find:ws:site.alias.ok"]);
});

test("a key-less reset of a namespace holding a platform alias of the protected setting is refused", async () => {
  const repo = repoWith([definition({ namespace: "core.alias", key: "allow", aliasOf: [PROTECTED, "enabled"] })]);
  assert.equal(await touches({ namespace: "core.alias", scope: "workspace" }, repo), true);
});

test("a key-less reset of a namespace holding a workspace alias of the protected setting is refused", async () => {
  const repo = repoWith([
    definition({ namespace: "site.alias", key: "plain", workspaceId: WS }),
    definition({ namespace: "site.alias", key: "allow", workspaceId: WS, aliasOf: [PROTECTED, "enabled"] }),
  ]);
  assert.equal(await touches({ namespace: "site.alias" }, repo), true);
});

test("a non-string key outside a batch is treated as a key-less reset", async () => {
  const repo = repoWith([definition({ namespace: "core.alias", key: "allow", aliasOf: [PROTECTED, "enabled"] })]);
  assert.equal(await touches({ namespace: "core.alias", key: 9 }, repo), true);
  assert.deepEqual(repo.calls.slice(0, 2), ["list:null", "list:ws"]);
});

test("a definition batch skips non-object items and refuses a later protected item", async () => {
  const repo = repoWith();
  assert.equal(await touches({ definitions: [null, 3, "x", { namespace: PROTECTED, key: "enabled" }] }, repo), true);
  assert.deepEqual(repo.calls, []);
});

test("a definition batch never expands a key-less item, even over an aliasing namespace", async () => {
  const repo = repoWith([definition({ namespace: "core.alias", key: "allow", aliasOf: [PROTECTED, "enabled"] })]);
  assert.equal(await touches({ definitions: [{ namespace: "core.alias", op: "retype" }] }, repo), false);
  assert.deepEqual(repo.calls, []);
});

test("a definition batch resolves keyed items and refuses an alias of the protected setting", async () => {
  const repo = repoWith([definition({ namespace: "core.alias", key: "allow", aliasOf: [PROTECTED, "enabled"] })]);
  assert.equal(await touches({ definitions: [{ namespace: "core.execution", key: "mode" }, { namespace: "core.alias", key: "allow" }] }, repo), true);
});

test("an empty or harmless definition batch is allowed", async () => {
  assert.equal(await touches({ definitions: [] }, repoWith()), false);
  assert.equal(await touches({ definitions: [{ namespace: "core.execution", key: "mode", op: "retype" }] }, repoWith()), false);
});

test("a non-array definitions field makes the body itself the single item", async () => {
  assert.equal(await touches({ definitions: { namespace: PROTECTED }, namespace: "core.execution", key: "mode" }, repoWith()), false);
});

test("the first protected key ends the scan without resolving later keys or items", async () => {
  const repo = repoWith([
    definition({ namespace: "core.alias", key: "allow", aliasOf: [PROTECTED, "enabled"] }),
    definition({ namespace: "core.alias", key: "later" }),
  ]);
  assert.equal(await touches({ namespace: "core.alias" }, repo), true);
  assert.deepEqual(repo.calls, ["list:null", "list:ws", "find:ws:core.alias.allow", "find:null:core.alias.allow", "find:ws:core.assistant-full-cli.enabled", "find:null:core.assistant-full-cli.enabled"]);
});

test("explicit namespaces replace the defaults rather than adding to them", async () => {
  const repo = repoWith();
  assert.equal(await touches({ namespace: PROTECTED, key: "enabled" }, repo, ["site.assistant"]), false);
  assert.equal(await touches({ namespace: "site.assistant", key: "provider" }, repo, ["site.assistant"]), true);
});
