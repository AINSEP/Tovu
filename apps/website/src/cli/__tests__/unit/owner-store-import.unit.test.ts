import assert from "node:assert/strict";
import test from "node:test";
import type { LegacyOwnerEntry, LegacyOwnerSnapshot } from "@jini-ai/server/owner-store";
import type { SecretsVaultService, VaultSummary } from "@jini-ai/platform/secrets/credential-sets";
import { EMPTY_IMPORT, importLegacyKeys } from "../../commands/owner-store-import.js";

/** The import plan against a fake project vault: every outcome is decided before any write, and
 * only `apply` writes, inside the one project transaction. The real vault/CHECK path is covered by
 * the CLI integration test; this file pins each refusal and conflict by name.
 */
const legacy = (overrides: Partial<LegacyOwnerEntry> = {}): LegacyOwnerEntry => ({
  id: "deploy", kind: "vendor", ownerKey: "tovu", binding: null, provider: "vercel", label: "Deployment key", isDefault: true,
  meta: { credentialType: "vendor", worksFor: ["vercel"] }, payload: { vendorId: "vercel", token: "legacy-secret" }, ...overrides,
});
const row = (entry: LegacyOwnerEntry, overrides: Partial<VaultSummary> = {}) => ({ id: entry.id, kind: entry.kind, ownerKey: "tovu",
  binding: entry.binding, provider: entry.provider, label: entry.label, meta: entry.meta, revision: 1, configured: true, isDefault: false,
  ...overrides }) as unknown as VaultSummary;
const snapshot = (entries: LegacyOwnerEntry[], destinations: Partial<Omit<LegacyOwnerSnapshot, "entries">> = {}): LegacyOwnerSnapshot =>
  ({ entries, grants: [], revocations: [], ...destinations });

function target({ rows = [], stored = {}, failPut }: { rows?: VaultSummary[]; stored?: Record<string, unknown>; failPut?: string } = {}) {
  const events: string[] = [];
  const puts: Record<string, unknown>[] = [];
  const gets: Record<string, unknown>[] = [];
  let inside = false;
  const vault = {
    put: async (input: Record<string, unknown>) => {
      assert.equal(inside, true, "every write runs inside the project transaction");
      if (input.id === failPut) throw new Error("refused");
      puts.push(input);
      return {};
    },
    get: async (input: Record<string, unknown>) => { gets.push(input); return Object.hasOwn(stored, String(input.id)) ? { payload: stored[String(input.id)] } : null; },
  } as unknown as SecretsVaultService;
  const transaction = async <T>({ run }: { run: () => Promise<T> }) => {
    events.push("begin"); inside = true;
    try { return await run(); } finally { inside = false; events.push("end"); }
  };
  return { target: { vault, workspaceId: "project", transaction, rows }, events, puts, gets };
}

const item = (entry: LegacyOwnerEntry, status: string, reason?: string) =>
  ({ id: entry.id, label: entry.label, kind: entry.kind, provider: entry.provider, status, ...(reason ? { reason } : {}) });

test("a dry run plans every entry and writes nothing, not even a transaction", async () => {
  const entries = [legacy(), legacy({ id: "mail", label: "Mail key", provider: "resend" })];
  const f = target();
  const report = await importLegacyKeys({ snapshot: snapshot(entries), target: f.target });
  assert.deepEqual(report, { applied: false, items: entries.map(entry => item(entry, "new")), pending: [] });
  assert.deepEqual(f.events, []);
  assert.deepEqual(f.puts, []);
});

test("apply writes only the new entries, non-default and project-owned, in one transaction", async () => {
  const fresh = legacy();
  const plugin = legacy({ id: "plugin", label: "Plugin key", ownerKey: "plugin" });
  const f = target();
  const report = await importLegacyKeys({ snapshot: snapshot([fresh, plugin]), target: f.target }, { apply: true });
  assert.deepEqual(report.items, [item(fresh, "imported"), item(plugin, "unsupported", "owner")]);
  assert.equal(report.applied, true);
  assert.deepEqual(f.events, ["begin", "end"]);
  assert.deepEqual(f.puts, [{ id: "deploy", kind: "vendor", ownerKey: "tovu", binding: null, provider: "vercel", label: "Deployment key",
    meta: fresh.meta, payload: fresh.payload, isDefault: false, expectedRevision: null, workspaceId: "project", principalId: null }],
  "the legacy default flag is not carried over: no project default moves");
});

test("a vault refusal mid-apply rejects the whole import; the transaction owns the rollback", async () => {
  const f = target({ failPut: "mail" });
  await assert.rejects(importLegacyKeys({ snapshot: snapshot([legacy(), legacy({ id: "mail", label: "Mail key", provider: "resend" })]), target: f.target }, { apply: true }),
    { message: "refused" });
  assert.deepEqual(f.events, ["begin", "end"]);
});

test("the same id with the same metadata and decrypted payload is already imported; apply writes nothing", async () => {
  const entry = legacy();
  const f = target({ rows: [row(entry)], stored: { deploy: entry.payload } });
  const report = await importLegacyKeys({ snapshot: snapshot([entry]), target: f.target }, { apply: true });
  assert.deepEqual(report, { applied: false, items: [item(entry, "already-imported")], pending: [] });
  assert.deepEqual(f.gets, [{ id: "deploy", kind: "vendor", ownerKey: "tovu", binding: null, workspaceId: "project", principalId: null }]);
  assert.deepEqual(f.events, []);
});

test("the same id with a different secret, metadata or identity is a conflict and stays untouched", async () => {
  const entry = legacy();
  for (const [rows, stored] of [
    [[row(entry)], { deploy: { vendorId: "vercel", token: "a-different-secret" } }],
    [[row(entry)], {}],
    [[row(entry, { meta: { credentialType: "vendor", worksFor: ["other"] } })], { deploy: entry.payload }],
    [[row(entry, { label: "Renamed" })], { deploy: entry.payload }],
    [[row(entry, { provider: "netlify" })], { deploy: entry.payload }],
  ] as const) {
    const f = target({ rows: [...rows], stored: { ...stored } });
    const report = await importLegacyKeys({ snapshot: snapshot([entry]), target: f.target }, { apply: true });
    assert.deepEqual(report.items, [item(entry, "conflict", "different-secret")]);
    assert.equal(report.applied, false);
    assert.deepEqual(f.puts, []);
  }
});

// Before: "a taken name (same kind and label, or the same media provider) is a conflict; another kind is not"
// refused a vendor label any other vendor row used. The project index is per (kind, provider) group, so an
// equal label under another provider imports; media-provider rows are now refused by kind (see below).
test("a taken name (same kind, provider and label) is a conflict; another provider or kind is not", async () => {
  const vendor = legacy();
  const otherProvider = legacy({ id: "netlify-deploy", provider: "netlify" });
  const repo = legacy({ id: "repo", kind: "source-control", label: "Repo key", provider: "github" });
  const repoOtherProvider = legacy({ id: "repo-gitlab", kind: "source-control", label: "Repo key", provider: "gitlab" });
  const sameLabelOtherKind = legacy({ id: "repo-2", kind: "source-control", label: "Deployment key", provider: "github" });
  const rows = [row(legacy({ id: "other-deploy" })), row(legacy({ id: "other-repo", kind: "source-control", label: "Repo key", provider: "github" }))];
  const f = target({ rows });
  const report = await importLegacyKeys({ snapshot: snapshot([vendor, otherProvider, repo, repoOtherProvider, sameLabelOtherKind]), target: f.target }, { apply: true });
  assert.deepEqual(report.items, [item(vendor, "conflict", "label-taken"), item(otherProvider, "imported"), item(repo, "conflict", "label-taken"),
    item(repoOtherProvider, "imported"), item(sameLabelOtherKind, "imported")]);
  assert.deepEqual(f.puts.map(put => put.id), ["netlify-deploy", "repo-gitlab", "repo-2"]);
});

test("media-provider and publish-peer keys are listed as unsupported, not imported: no project reader uses them yet", async () => {
  const entries = [legacy({ id: "photos", kind: "media-provider", label: "Photos", provider: "s3", meta: {} }),
    legacy({ id: "peer", kind: "publish-peer", label: "Staging peer", provider: null, meta: {} })];
  const f = target();
  const report = await importLegacyKeys({ snapshot: snapshot(entries), target: f.target }, { apply: true });
  assert.deepEqual(report.items, entries.map(entry => item(entry, "unsupported", "kind")));
  assert.equal(report.applied, false);
  assert.deepEqual(f.events, []);
});

test("site-assistant and database-destination kinds are refused by name; plugin-owned rows by owner", async () => {
  const entries = [legacy({ id: "assistant", kind: "site-assistant", label: "Assistant" }),
    legacy({ id: "db", kind: "database-destination", label: "Warehouse" }), legacy({ id: "plugin", ownerKey: "plugin-x" })];
  const f = target();
  const report = await importLegacyKeys({ snapshot: snapshot(entries), target: f.target }, { apply: true });
  assert.deepEqual(report.items, [item(entries[0]!, "unsupported", "kind"), item(entries[1]!, "unsupported", "kind"), item(entries[2]!, "unsupported", "owner")]);
  assert.equal(report.applied, false);
  assert.deepEqual(f.events, []);
});

test("every recorded site destination is reported pending: grants keep a copy, revocations may still hold one", async () => {
  const entries = [legacy(), legacy({ id: "mail", label: "Mail key", provider: "resend" })];
  const f = target();
  const report = await importLegacyKeys({ snapshot: snapshot(entries, {
    grants: [{ entryId: "deploy", consumerId: "/sites/blog" }, { entryId: "gone", consumerId: "/sites/blog" }],
    revocations: [{ entryId: "mail", consumerId: "/sites/shop" }] }), target: f.target });
  assert.deepEqual(report.pending, [{ entryId: "deploy", site: "/sites/blog", reason: "keeps-copy" }, { entryId: "mail", site: "/sites/shop", reason: "revoked-copy" }]);
});

test("an empty snapshot is the empty report and touches nothing", async () => {
  const f = target();
  assert.deepEqual(await importLegacyKeys({ snapshot: snapshot([]), target: f.target }, { apply: true }), { applied: false, items: [], pending: [] });
  assert.deepEqual(EMPTY_IMPORT, { applied: false, items: [], pending: [] });
  assert.equal(Object.isFrozen(EMPTY_IMPORT), true);
  assert.deepEqual(f.events, []);
});
