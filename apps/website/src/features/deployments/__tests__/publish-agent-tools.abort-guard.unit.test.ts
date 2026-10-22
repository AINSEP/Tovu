import assert from "node:assert/strict";
import test from "node:test";
import { abortGuardedCredentialRepo, buildStaticPublishRegistrations, contributeStaticPublishTools, staticPublishDerivedRisk } from "../publish-agent-tools.js";
import type { VendorCredentialSetRepoPort } from "../../vendor-credentials/index.js";

/** abortGuardedCredentialRepo: writes refuse an aborted signal before reaching the store; reads,
 *  deletes, label updates and non-function vault members pass straight through unchanged. */

type Call = [method: string, input: unknown];

function fakeStore(calls: Call[], withVault: boolean): VendorCredentialSetRepoPort {
  const record = (method: string) => async (input: unknown) => { calls.push([method, input]); return `${method}-result`; };
  const vault = {
    marker: "vault-config",
    put: record("vault.put"),
    applyBatch: record("vault.applyBatch"),
    find: record("vault.find"),
  };
  return {
    ...(withVault ? { vault } : {}),
    insert: record("insert"),
    update: record("update"),
    findById: record("findById"),
    findDefaultByVendor: record("findDefaultByVendor"),
    listByVendor: record("listByVendor"),
    listByWorkspace: record("listByWorkspace"),
    delete: record("delete"),
    updateAccountLabel: record("updateAccountLabel"),
  } as unknown as VendorCredentialSetRepoPort;
}

const call = (repo: VendorCredentialSetRepoPort, method: string, input: unknown): Promise<unknown> =>
  (repo as unknown as Record<string, (input: unknown) => Promise<unknown>>)[method]!(input);
const vaultCall = (repo: VendorCredentialSetRepoPort, method: string, input: unknown): Promise<unknown> =>
  (repo.vault as unknown as Record<string, (input: unknown) => Promise<unknown>>)[method]!(input);

test("every read/delete/label method forwards its input to the store and returns the store's result", async () => {
  const calls: Call[] = [];
  const repo = abortGuardedCredentialRepo({ store: fakeStore(calls, false), signal: new AbortController().signal });
  for (const method of ["findById", "findDefaultByVendor", "listByVendor", "listByWorkspace", "delete", "updateAccountLabel", "insert", "update"]) {
    assert.equal(await call(repo, method, { id: method }), `${method}-result`);
  }
  assert.deepEqual(calls.map(([method]) => method), ["findById", "findDefaultByVendor", "listByVendor", "listByWorkspace", "delete", "updateAccountLabel", "insert", "update"]);
  assert.deepEqual(calls[0]![1], { id: "findById" });
  assert.equal("vault" in repo, false, "no vault is invented when the store has none");
});

test("after abort, insert/update and the vault's put/applyBatch throw before the store sees them; reads still pass", async () => {
  const calls: Call[] = [];
  const controller = new AbortController();
  const repo = abortGuardedCredentialRepo({ store: fakeStore(calls, true), signal: controller.signal });
  controller.abort(new Error("user cancelled"));
  assert.throws(() => call(repo, "insert", {}), /user cancelled/);
  assert.throws(() => call(repo, "update", {}), /user cancelled/);
  assert.throws(() => vaultCall(repo, "put", {}), /user cancelled/);
  assert.throws(() => vaultCall(repo, "applyBatch", {}), /user cancelled/);
  assert.equal(await vaultCall(repo, "find", { id: "v1" }), "vault.find-result");
  assert.equal(await call(repo, "listByWorkspace", { workspaceId: "w" }), "listByWorkspace-result");
  assert.deepEqual(calls, [["vault.find", { id: "v1" }], ["listByWorkspace", { workspaceId: "w" }]]);
});

test("the vault proxy forwards writes while not aborted and exposes non-function members as-is", async () => {
  const calls: Call[] = [];
  const repo = abortGuardedCredentialRepo({ store: fakeStore(calls, true), signal: new AbortController().signal });
  assert.equal((repo.vault as unknown as { marker: string }).marker, "vault-config");
  assert.equal(await vaultCall(repo, "put", { record: 1 }), "vault.put-result");
  assert.equal(await vaultCall(repo, "applyBatch", { ops: [] }), "vault.applyBatch-result");
  assert.deepEqual(calls, [["vault.put", { record: 1 }], ["vault.applyBatch", { ops: [] }]]);
});

test("contributeStaticPublishTools contributes the static-publish builder with its derived risk", () => {
  const contributor = contributeStaticPublishTools();
  assert.equal(contributor.domain, "static-publish");
  assert.equal(contributor.build, buildStaticPublishRegistrations);
  assert.equal(contributor.risk, staticPublishDerivedRisk);
});
