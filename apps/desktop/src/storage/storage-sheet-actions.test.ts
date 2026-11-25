/** P11 ST-18b.T — capability-gated Clean and Compact, against injected ports. */
import assert from "node:assert/strict";
import test from "node:test";
import { createStorageItemIds } from "./storage-item-ids.ts";
import { bindStorageSheetActions, type SiteLeaseState, type StorageSheetActionsRequired } from "./storage-sheet-actions.ts";
import type { StorageOperation } from "./storage-report-cli.ts";
import type { StorageTarget } from "./storage-sheet-ipc.ts";

function harness({ operations = ["report", "move", "clean"] as StorageOperation[] | null, lease = ["stopped"] as SiteLeaseState[], confirmed = true, owner = true } = {}) {
  const cli: string[][] = [];
  const http: unknown[] = [];
  let n = 0;
  const itemIds = createStorageItemIds<StorageTarget>({ randomId: () => `id-${++n}`, now: () => 0 });
  const leases = [...lease];
  const deps: StorageSheetActionsRequired = {
    capabilities: async () => operations ? { state: "ok", operations: new Set(operations) } : { state: "unknown" },
    runningLease: async () => leases.length > 1 ? leases.shift()! : leases[0]!,
    runCli: async ({ cliArgs }) => { cli.push([...cliArgs]); return { state: "exited", code: 0, stdout: "{}" }; },
    ownerHttp: async ({ body }) => { http.push(body); return owner ? { state: "ok", previewToken: "tok-shown" } : { state: "refused" }; },
    itemIds,
    confirm: async () => confirmed,
  };
  const actions = bindStorageSheetActions(deps);
  const id = itemIds.issue({ senderId: 1, kind: "site", target: { kind: "site", dir: "/sites/a", label: "Site A" } });
  return { actions, cli, http, id };
}

test("T-18.7 no capability means no buttons", async () => {
  assert.deepEqual(await harness({ operations: null }).actions.tidyActions(), []);
  assert.deepEqual(await harness({ operations: ["report", "move"] }).actions.tidyActions(), []);
  assert.deepEqual(await harness().actions.tidyActions(), ["clean"], "compact stays hidden while the CLI does not list it");
  const h = harness();
  assert.deepEqual(await h.actions.preview({ senderId: 1, id: h.id, action: "compact" }), { state: "relist" });
  assert.deepEqual(h.cli, []);
});

test("running Clean spends only the preview token shown", async () => {
  const h = harness({ lease: ["running"] });
  const preview = await h.actions.preview({ senderId: 1, id: h.id, action: "clean" }) as { confirmationId: string };
  assert.deepEqual(await h.actions.act({ senderId: 1, confirmationId: preview.confirmationId }), { state: "done" });
  assert.deepEqual(h.http, [{ dryRun: true }, { dryRun: false, previewToken: "tok-shown" }]);
  assert.deepEqual(h.cli, []);
  assert.deepEqual(await h.actions.act({ senderId: 1, confirmationId: preview.confirmationId }), { state: "relist" }, "spent once");
});

test("owner check failure never falls back to CLI", async () => {
  const h = harness({ lease: ["running"], owner: false });
  assert.deepEqual(await h.actions.preview({ senderId: 1, id: h.id, action: "clean" }), { state: "open-site-storage" });
  assert.deepEqual(h.cli, []);
});

test("stopped Clean without confirmation never passes --apply", async () => {
  const h = harness({ confirmed: false });
  const preview = await h.actions.preview({ senderId: 1, id: h.id, action: "clean" }) as { confirmationId: string };
  assert.deepEqual(await h.actions.act({ senderId: 1, confirmationId: preview.confirmationId }), { state: "declined" });
  assert.deepEqual(await h.actions.act({ senderId: 1, confirmationId: "forged" }), { state: "relist" });
  assert.deepEqual(h.cli, [["storage", "clean", "/sites/a", "--json"]]);
  const ok = harness();
  const shown = await ok.actions.preview({ senderId: 1, id: ok.id, action: "clean" }) as { confirmationId: string };
  assert.deepEqual(await ok.actions.act({ senderId: 1, confirmationId: shown.confirmationId }), { state: "done" });
  assert.deepEqual(ok.cli.at(-1), ["storage", "clean", "/sites/a", "--apply", "--json"]);
});

test("site starts after preview and Compact does not open the database", async () => {
  const h = harness({ operations: ["report", "move", "clean", "compact"], lease: ["stopped", "running"] });
  const preview = await h.actions.preview({ senderId: 1, id: h.id, action: "compact" }) as { confirmationId: string };
  assert.deepEqual(await h.actions.act({ senderId: 1, confirmationId: preview.confirmationId }), { state: "kept", reason: "in-use" });
  assert.deepEqual(h.cli, []);
});
