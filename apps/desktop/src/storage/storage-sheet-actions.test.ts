/** P11 ST-18b.T — capability-gated Clean and Compact, against injected ports. */
import assert from "node:assert/strict";
import test from "node:test";
import { createStorageItemIds } from "./storage-item-ids.ts";
import { bindStorageSheetActions, type OwnerCleanupRead, type SiteLeaseState, type StorageSheetActionsRequired } from "./storage-sheet-actions.ts";
import type { StorageOperation } from "./storage-report-cli.ts";
import type { StorageTarget } from "./storage-sheet-ipc.ts";

/** `cliCodes` / `ownerReads` are consumed one per call, the last value repeating (like `lease`). */
function harness({ operations = ["report", "move", "clean"] as StorageOperation[] | null, lease = ["stopped"] as SiteLeaseState[], confirmed = true, owner = true, cliCodes = [0], ownerReads = undefined as OwnerCleanupRead[] | undefined } = {}) {
  const cli: string[][] = [];
  const http: unknown[] = [];
  let n = 0;
  const itemIds = createStorageItemIds<StorageTarget>({ randomId: () => `id-${++n}`, now: () => 0 });
  const leases = [...lease];
  const codes = [...cliCodes];
  const owners = ownerReads ? [...ownerReads] : undefined;
  const next = <T,>(queue: T[]): T => queue.length > 1 ? queue.shift()! : queue[0]!;
  const deps: StorageSheetActionsRequired = {
    capabilities: async () => operations ? { state: "ok", operations: new Set(operations) } : { state: "unknown" },
    runningLease: async () => leases.length > 1 ? leases.shift()! : leases[0]!,
    runCli: async ({ cliArgs }) => { cli.push([...cliArgs]); return { state: "exited", code: next(codes), stdout: "{}" }; },
    ownerHttp: async ({ body }) => {
      http.push(body);
      if (owners) return next(owners);
      return owner ? { state: "ok", previewToken: "tok-shown" } : { state: "refused" };
    },
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

test("Compact disappears at apply when the current CLI no longer advertises it", async () => {
  const cli: string[][] = [];
  const confirmations: unknown[] = [];
  let supportsCompact = true;
  let sequence = 0;
  const itemIds = createStorageItemIds<StorageTarget>({ randomId: () => String(++sequence), now: () => 0 });
  const id = itemIds.issue({ senderId: 1, kind: "site", target: { kind: "site", dir: "/sites/shop", label: "Shop" } });
  const actions = bindStorageSheetActions({
    itemIds,
    capabilities: async () => ({ state: "ok", operations: new Set<StorageOperation>(supportsCompact ? ["report", "compact"] : ["report"]) }),
    runningLease: async () => "stopped",
    runCli: async ({ cliArgs }) => { cli.push([...cliArgs]); return { state: "exited", code: 0, stdout: "" }; },
    ownerHttp: async () => { throw new Error("Compact must never contact an owner endpoint"); },
    confirm: async (request) => { confirmations.push(request); return true; },
  });
  const shown = await actions.preview({ senderId: 1, id, action: "compact" });
  assert.ok(shown.state === "ready", "expected a usable confirmation");
  supportsCompact = false;
  assert.deepEqual(await actions.act({ senderId: 1, confirmationId: shown.confirmationId }), { state: "kept", reason: "unknown" });
  assert.deepEqual(confirmations, [{ action: "compact", label: "Shop" }]);
  assert.deepEqual(cli, []);

  supportsCompact = true;
  const retry = await actions.preview({ senderId: 1, id, action: "compact" });
  assert.ok(retry.state === "ready", "expected a usable confirmation");
  assert.deepEqual(await actions.act({ senderId: 1, confirmationId: retry.confirmationId }), { state: "done" });
  assert.deepEqual(cli, [["storage", "compact", "/sites/shop", "--json"]]);
});

test("overlapping owner confirmations cannot start two Compact jobs for the same site", { timeout: 2000 }, async () => {
  let sequence = 0;
  let approve!: (value: boolean) => void;
  const confirmation = new Promise<boolean>((resolve) => { approve = resolve; });
  let finish!: () => void;
  const inFlight = new Promise<void>((resolve) => { finish = resolve; });
  const cli: string[][] = [];
  const itemIds = createStorageItemIds<StorageTarget>({ randomId: () => String(++sequence), now: () => 0 });
  const id = itemIds.issue({ senderId: 1, kind: "site", target: { kind: "site", dir: "/sites/shop", label: "Shop" } });
  const actions = bindStorageSheetActions({
    itemIds,
    capabilities: async () => ({ state: "ok", operations: new Set<StorageOperation>(["compact"]) }),
    runningLease: async () => "stopped",
    runCli: async ({ cliArgs }) => {
      cli.push([...cliArgs]);
      if (cli.length === 1) await inFlight;
      return { state: "exited", code: 0, stdout: "" };
    },
    ownerHttp: async () => { throw new Error("Compact must never contact an owner endpoint"); },
    confirm: () => confirmation,
  });
  const a = await actions.preview({ senderId: 1, id, action: "compact" });
  const b = await actions.preview({ senderId: 1, id, action: "compact" });
  assert.ok(a.state === "ready", "expected a usable confirmation");
  assert.ok(b.state === "ready", "expected a usable confirmation");
  assert.notEqual(a.confirmationId, b.confirmationId);
  const first = actions.act({ senderId: 1, confirmationId: a.confirmationId });
  const second = actions.act({ senderId: 1, confirmationId: b.confirmationId });
  approve(true);

  try {
    assert.deepEqual(await second, { state: "kept", reason: "in-use" });
  } finally {
    finish();
    await first;
  }
  assert.deepEqual(await first, { state: "done" });
  assert.deepEqual(cli, [["storage", "compact", "/sites/shop", "--json"]]);
});

test("an unreadable lease, or Compact on a running site, offers no confirmation and touches nothing", async () => {
  const unknown = harness({ lease: ["unknown"] });
  assert.deepEqual(await unknown.actions.preview({ senderId: 1, id: unknown.id, action: "clean" }), { state: "relist" });
  assert.deepEqual([unknown.cli, unknown.http], [[], []]);
  const running = harness({ operations: ["clean", "compact"], lease: ["running"] });
  assert.deepEqual(await running.actions.preview({ senderId: 1, id: running.id, action: "compact" }), { state: "relist" });
  assert.deepEqual([running.cli, running.http], [[], []], "Compact never asks the owner of a running site");
});

test("a stopped Clean whose dry run fails is not offered", async () => {
  const h = harness({ cliCodes: [3] });
  assert.deepEqual(await h.actions.preview({ senderId: 1, id: h.id, action: "clean" }), { state: "relist" });
  assert.deepEqual(h.cli, [["storage", "clean", "/sites/a", "--json"]]);
});

test("an owner preview without a token is refused rather than run through the CLI", async () => {
  const h = harness({ lease: ["running"], ownerReads: [{ state: "ok" }] });
  assert.deepEqual(await h.actions.preview({ senderId: 1, id: h.id, action: "clean" }), { state: "open-site-storage" });
  assert.deepEqual(h.http, [{ dryRun: true }]);
  assert.deepEqual(h.cli, []);
});

test("an owner that refuses at apply sends the user to site storage, not to done", async () => {
  const h = harness({ lease: ["running"], ownerReads: [{ state: "ok", previewToken: "tok-shown" }, { state: "refused" }] });
  const preview = await h.actions.preview({ senderId: 1, id: h.id, action: "clean" }) as { confirmationId: string };
  assert.deepEqual(await h.actions.act({ senderId: 1, confirmationId: preview.confirmationId }), { state: "open-site-storage" });
  assert.deepEqual(h.http, [{ dryRun: true }, { dryRun: false, previewToken: "tok-shown" }]);
  assert.deepEqual(h.cli, []);
});

test("a Clean apply that exits non-zero keeps the site as in use instead of reporting done", async () => {
  const h = harness({ cliCodes: [0, 1] });
  const preview = await h.actions.preview({ senderId: 1, id: h.id, action: "clean" }) as { confirmationId: string };
  assert.deepEqual(await h.actions.act({ senderId: 1, confirmationId: preview.confirmationId }), { state: "kept", reason: "in-use" });
  assert.deepEqual(h.cli, [["storage", "clean", "/sites/a", "--json"], ["storage", "clean", "/sites/a", "--apply", "--json"]]);
});

test("a confirmation acted on while that site's job runs is kept without asking the owner again", { timeout: 2000 }, async () => {
  let sequence = 0;
  let finish!: () => void;
  const inFlight = new Promise<void>((resolve) => { finish = resolve; });
  const asked: unknown[] = [];
  const cli: string[][] = [];
  const itemIds = createStorageItemIds<StorageTarget>({ randomId: () => String(++sequence), now: () => 0 });
  const id = itemIds.issue({ senderId: 1, kind: "site", target: { kind: "site", dir: "/sites/shop", label: "Shop" } });
  const actions = bindStorageSheetActions({
    itemIds,
    capabilities: async () => ({ state: "ok", operations: new Set<StorageOperation>(["compact"]) }),
    runningLease: async () => "stopped",
    runCli: async ({ cliArgs }) => { cli.push([...cliArgs]); await inFlight; return { state: "exited", code: 0, stdout: "" }; },
    ownerHttp: async () => { throw new Error("Compact must never contact an owner endpoint"); },
    confirm: async (request) => { asked.push(request); return true; },
  });
  const a = await actions.preview({ senderId: 1, id, action: "compact" });
  const b = await actions.preview({ senderId: 1, id, action: "compact" });
  assert.ok(a.state === "ready" && b.state === "ready", "expected two usable confirmations");
  const first = actions.act({ senderId: 1, confirmationId: a.confirmationId });
  while (cli.length === 0) await new Promise((resolve) => setImmediate(resolve));
  try {
    assert.deepEqual(await actions.act({ senderId: 1, confirmationId: b.confirmationId }), { state: "kept", reason: "in-use" });
    assert.deepEqual(asked, [{ action: "compact", label: "Shop" }], "the second confirmation never reaches the owner");
  } finally {
    finish();
  }
  assert.deepEqual(await first, { state: "done" });
  assert.equal(cli.length, 1);
});
