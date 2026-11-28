/**
 * @file P11 ST-18b.T — capability-gated Clean and Compact for the desktop Storage sheet.
 *
 * STAGED, NOT MOUNTED. A button exists only when the bundled CLI's strict `{ operations }` read
 * lists it; an unknown read, version or shape omits it (never a dead button, never inferred from a
 * package version). Compact is therefore hidden today: the website CLI binds `compactStoppedSite:
 * undefined`, so `storage capabilities` does not list `compact` until ST-7b.T is enabled.
 *
 *  - Stopped Clean: `storage clean <dir> --json` dry run at preview; only a matching, unspent
 *    confirmation (plus the main dialog) passes `--apply`. The child's maintenance lease refuses
 *    if the site starts in between.
 *  - Running Clean: the site's own owner-authenticated, same-origin `/api/admin/storage/cleanup`;
 *    the server's dry run issues a preview token and ONLY that token is spent with `dryRun: false`.
 *    An owner/transport refusal answers `open-site-storage` — it never falls back to the CLI.
 *  - Compact: stopped only, capability and state re-read at action time, one job per site.
 */
import type { DesktopStorageActionKind, DesktopStorageActionResult, DesktopStoragePreview, DesktopStorageTidyAction } from "@tovu/contracts/desktop-storage";
import type { RunCli, StorageCapabilities } from "./storage-report-cli.ts";
import type { StorageItemIds } from "./storage-item-ids.ts";
import type { StorageTarget } from "./storage-sheet-ipc.ts";

export type SiteLeaseState = "stopped" | "running" | "unknown";
export type OwnerCleanupRead =
  | { readonly state: "ok"; readonly previewToken?: string }
  | { readonly state: "refused" };
export interface StorageSheetActionsRequired {
  readonly capabilities: () => Promise<StorageCapabilities>;
  readonly runningLease: (required: { dir: string }) => Promise<SiteLeaseState>;
  readonly runCli: RunCli;
  /** The trusted owner transport of the CURRENTLY held site session; never launches or acquires. */
  readonly ownerHttp: (required: { dir: string; body: { dryRun: true } | { dryRun: false; previewToken: string } }) => Promise<OwnerCleanupRead>;
  readonly itemIds: StorageItemIds<StorageTarget>;
  readonly confirm: (required: { action: DesktopStorageActionKind; label: string }) => Promise<boolean>;
}
export type TidyActionResult = DesktopStorageActionResult | { readonly state: "open-site-storage" };

type Pending = { readonly mode: "stopped-clean" } | { readonly mode: "running-clean"; readonly previewToken: string } | { readonly mode: "compact" };

const operationsOf = async (deps: StorageSheetActionsRequired): Promise<ReadonlySet<string>> => {
  const read = await deps.capabilities();
  return read.state === "ok" ? read.operations : new Set();
};

/** A running site cleans only through its owner's preview token; no token means refused, never the CLI. */
async function stageRunningClean(deps: StorageSheetActionsRequired, dir: string): Promise<Pending | "refused"> {
  const preview = await deps.ownerHttp({ dir, body: { dryRun: true } });
  return preview.state === "ok" && preview.previewToken ? { mode: "running-clean", previewToken: preview.previewToken } : "refused";
}

async function stage(deps: StorageSheetActionsRequired, action: "clean" | "compact", dir: string): Promise<Pending | "refused" | undefined> {
  const state = await deps.runningLease({ dir });
  if (state === "unknown") return undefined;
  if (action === "compact") return state === "stopped" ? { mode: "compact" } : undefined;
  if (state === "running") return stageRunningClean(deps, dir);
  const dryRun = await deps.runCli({ cliArgs: ["storage", "clean", dir, "--json"] });
  return dryRun.state === "exited" && dryRun.code === 0 ? { mode: "stopped-clean" } : undefined;
}

async function run(deps: StorageSheetActionsRequired, pending: Pending, dir: string): Promise<TidyActionResult> {
  if (pending.mode === "running-clean") {
    const done = await deps.ownerHttp({ dir, body: { dryRun: false, previewToken: pending.previewToken } });
    return done.state === "ok" ? { state: "done" } : { state: "open-site-storage" };
  }
  // Recheck at apply: a site that started since the preview is never handed to the writable CLI.
  if (await deps.runningLease({ dir }) !== "stopped") return { state: "kept", reason: "in-use" };
  if (pending.mode === "compact" && !(await operationsOf(deps)).has("compact")) return { state: "kept", reason: "unknown" };
  const cliArgs = pending.mode === "compact" ? ["storage", "compact", dir, "--json"] : ["storage", "clean", dir, "--apply", "--json"];
  const read = await deps.runCli({ cliArgs });
  return read.state === "exited" && read.code === 0 ? { state: "done" } : { state: "kept", reason: "in-use" };
}

/** Asks the owner, then runs at most one job per site. The in-use check repeats after the
 *  confirmation await: two confirmations approved together must not both start a job. */
async function confirmThenRun(required: {
  deps: StorageSheetActionsRequired;
  runningJobs: Set<string>;
  entry: { pending: Pending; dir: string };
  prompt: { action: DesktopStorageActionKind; label: string };
}): Promise<TidyActionResult> {
  const { deps, runningJobs, entry } = required;
  if (runningJobs.has(entry.dir)) return { state: "kept", reason: "in-use" };
  if (!await deps.confirm(required.prompt)) return { state: "declined" };
  if (runningJobs.has(entry.dir)) return { state: "kept", reason: "in-use" };
  runningJobs.add(entry.dir);
  try { return await run(deps, entry.pending, entry.dir); } finally { runningJobs.delete(entry.dir); }
}

/**
 * @returns `tidyActions` for the view, plus `preview`/`act` for the two tidy actions.
 * @complexity O(1) per call plus one child or HTTP round trip.
 */
export function bindStorageSheetActions(deps: StorageSheetActionsRequired, _optional: Record<string, never> = {}) {
  const pending = new Map<string, { pending: Pending; dir: string }>();
  const runningJobs = new Set<string>();
  return {
    async tidyActions(): Promise<readonly DesktopStorageTidyAction[]> {
      const operations = await operationsOf(deps);
      return (["clean", "compact"] as const).filter((action) => operations.has(action));
    },
    async preview({ senderId, id, action }: { senderId: number; id: string; action: "clean" | "compact" }): Promise<DesktopStoragePreview | { state: "open-site-storage" }> {
      const target = deps.itemIds.resolve({ senderId, id, kind: "site" });
      if (!target || target.kind !== "site" || !(await operationsOf(deps)).has(action)) return { state: "relist" };
      const staged = await stage(deps, action, target.dir);
      if (staged === "refused") return { state: "open-site-storage" };
      if (!staged) return { state: "relist" };
      const confirmationId = deps.itemIds.issueConfirmation({ senderId, id, action });
      pending.set(confirmationId, { pending: staged, dir: target.dir });
      return { state: "ready", confirmationId, action, label: target.label };
    },
    async act({ senderId, confirmationId }: { senderId: number; confirmationId: string }): Promise<TidyActionResult> {
      const entry = pending.get(confirmationId);
      pending.delete(confirmationId);
      const spent = deps.itemIds.spendConfirmation({ senderId, confirmationId });
      const target = spent ? deps.itemIds.resolve({ senderId, id: spent.id, kind: "site" }) : undefined;
      if (!entry || !spent || !target || target.kind !== "site" || target.dir !== entry.dir) return { state: "relist" };
      return confirmThenRun({ deps, runningJobs, entry, prompt: { action: spent.action as DesktopStorageActionKind, label: target.label } });
    },
  };
}
