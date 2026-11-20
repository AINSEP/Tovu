import { type SitesWorkspace } from "./shared-sites.ts";
import { classifySiteDirSafely, SITE_IDENTITY_MARKER } from "./site-dir-store.ts";
import path from "node:path";
import { type OpenSiteEntry } from "./project-ipc.site-lifecycle.ts";
import { mayEraseDirectory } from "@jini-ai/platform/fs";
import { sitePartition } from "./desktop-auth.ts";
import { type OpenSites, type ProjectIpcDeps, type SiteRow } from "./project-ipc.types.ts";
import { SITE_ORIGIN } from "./tracked-sites.ts";


/**
 * Why this site's server is not running, when it stopped on its own — `null` when it was never
 * started, was stopped deliberately, or when `openSites` is a store that cannot say (a plain `Map`
 * in a test that is not exercising liveness).
 *
 * Operator-facing prose, not a raw exit record: this string is rendered on the card. `code` and
 * `signal` are mutually exclusive in Node's `exit` event — whichever is non-null is the reason.
 *
 * @complexity O(1).
 */
function describeLastExit({ openSites, siteDir }: { openSites: OpenSites; siteDir: string }, _options = {}): string | null {
  const exit = typeof openSites.lastExitOf === "function" ? openSites.lastExitOf({ key: siteDir }) : null;
  if (exit === null) return null;
  if (exit.signal !== null && exit.signal !== undefined) return `The site's server was stopped by ${exit.signal}.`;
  return `The site's server exited (code ${exit.code}).`;
}

/**
 * What to report as a site's `status` and `desiredState`, from the two facts that decide them: is
 * its `tovu serve` alive right now, and is a start or a stop in flight on it.
 *
 * Its own function because those two facts do not compose by precedence alone — a `stopping` site
 * IS still alive, and a `starting` one is NOT yet, so the transition has to win over `running` in
 * one direction and over `stopped` in the other. Inlined in {@link buildSiteRecord} that reads as
 * three nested ternaries whose ordering is load-bearing and invisible.
 *
 * `desiredState` follows the transition's INTENT rather than its current liveness: an operator
 * mid-stop wants this site down, which is the honest thing for a card to say while the drain runs.
 *
 * @complexity O(1).
 */
function siteLifecycle({ running, transition }: { running: boolean; transition: "starting" | "stopping" | null }, _options = {}) {
  if (transition === "starting") return { status: "starting" as const, desiredState: "running" as const };
  if (transition === "stopping") return { status: "stopping" as const, desiredState: "stopped" as const };
  if (running) return { status: "running" as const, desiredState: "running" as const };
  return { status: "stopped" as const, desiredState: "stopped" as const };
}

/** Retry/sleep/error details apply only after liveness and explicit transitions have settled. */
function siteRecordPresentation({ lifecycle, sharedRunning, siteDir, deps }: {
  lifecycle: ReturnType<typeof siteLifecycle>; sharedRunning: SharedRunning; siteDir: string; deps: SiteRecordDeps;
}, _options = {}) {
  const runtime = deps.siteRuntime?.get(siteDir);
  if (lifecycle.status === "stopped" && runtime?.status) return { status: runtime.status,
    desiredState: runtime.status === "starting" ? "running" as const : "stopped" as const, detail: runtime.detail ?? null };
  return { ...lifecycle, detail: siteStatusDetail({ sharedRunning, status: lifecycle.status, openSites: deps.openSites, siteDir }) };
}

type SiteRecordDeps = Pick<ProjectIpcDeps, "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions" | "sharedSites" | "siteRuntime"> & Partial<Pick<ProjectIpcDeps, "classifySiteDir" | "externalSites">>;
export type SharedRunning = ReturnType<ReturnType<SitesWorkspace["running"]>["read"]> | undefined;

/** The admin URL of a server this window does not own: an external one it attached to, or the other app's. */
function siteExternalUrl({ openEntry, sharedRunning, status }: { openEntry: OpenSiteEntry | undefined; sharedRunning: SharedRunning; status: string }, _options = {}): string | undefined {
  // The lease stays live during drain. Advertising it here makes a mounted tab queue Start
  // behind this Stop through its external-workspace attachment effect.
  if (status === "stopping") return undefined;
  if (openEntry) return openEntry.server.external ? `${openEntry.server.origin}/admin/` : undefined;
  return sharedRunning && sharedRunning.port > 0 ? `${sharedRunning.scheme}://localhost:${sharedRunning.port}/admin/` : undefined;
}

/** Which app runs the site, or the last exit of a settled stop; see the `statusDetail` field below. */
function siteStatusDetail({ sharedRunning, status, openSites, siteDir }: { sharedRunning: SharedRunning; status: string; openSites: OpenSites; siteDir: string }, _options = {}): string | null {
  if (sharedRunning) {
    const detail = sharedRunning.port > 0 ? `port ${sharedRunning.port}` : "starting";
    return `Running in ${sharedRunning.app} (${detail})`;
  }
  return status === "stopped" ? describeLastExit({ openSites, siteDir }) : null;
}

/**
 * Only for a site this window can stop although another process serves it; absent, the card
 * offers no Stop for it at all. See `external-site-stop.ts`.
 */
function siteExternalLauncher({ externalUrl, sharedRunning, externalSites }: { externalUrl: string | undefined; sharedRunning: SharedRunning; externalSites: SiteRecordDeps["externalSites"] }, _options = {}) {
  return externalUrl && sharedRunning ? externalSites?.launcherOf({ lease: sharedRunning }) ?? undefined : undefined;
}

/** The card name: an alias, the config's name, or (config gone) the last known name. */
function siteDisplayName({ row, validSite, readSiteName }: { row: SiteRow; validSite: boolean; readSiteName: (required: { siteDir: string }) => string }, _options = {}): string {
  return row.displayNameAlias ?? (validSite ? readSiteName({ siteDir: row.siteDir }) : row.displayName ?? path.basename(row.siteDir));
}

/** Join local liveness and shared-lease startup with the explicit transition's intent. O(1). */
export function siteRecordLifecycle(
  { siteDir, openEntry, sharedRunning, transitions }: { siteDir: string; openEntry: OpenSiteEntry | undefined; sharedRunning: SharedRunning; transitions: SiteRecordDeps["transitions"] }, _options = {},
): { sharedPort: number; lifecycle: ReturnType<typeof siteLifecycle> } {
  const sharedPort = sharedRunning?.port ?? 0;
  const running = openEntry !== undefined || sharedPort > 0;
  // `openSites` answers "is it alive", which is a two-valued answer to a four-valued question:
  // both transitions take real wall-clock time, and during either one the two-valued answer is
  // wrong in the direction the operator can SEE — a Start they just pressed reads `stopped` for the
  // whole boot, a Stop reads `running` until the child is gone, and both look like a dead button.
  // `@jini-ai/sidecar/supervisor` is what makes the other two answers producible; absent (every test that
  // is not exercising them) it reads `null` and nothing here changes.
  const sharedStarting = sharedRunning && !sharedPort ? "starting" : null;
  const lifecycle = siteLifecycle({ running, transition: transitions?.get({ key: siteDir }) ?? sharedStarting });
  return { sharedPort, lifecycle };
}

/**
 * One tracked row plus `openSites` (ground truth for "running") joined into the `SiteRecord`
 * shape `contracts/project.ts` declares. Every field this shell cannot really know — `templateId`,
 * `templateVersion`, `database` — gets a stated, honest default rather than a fabricated value:
 * every project a JSON-file-tracked site can describe today was created outside a provisioner this
 * shell drives, so there is no template or vendor-database fact to report.
 *
 * @complexity O(1).
 */
export function buildSiteRecord(row: SiteRow, deps: SiteRecordDeps) {
  const validSite = (deps.classifySiteDir ?? classifySiteDirSafely)({ dir: row.siteDir }) === "site";
  const openEntry = deps.openSites.get(row.siteDir);
  const sharedRunning: SharedRunning = deps.sharedSites?.running({ path: row.siteDir }).read({});
  const { sharedPort, lifecycle } = siteRecordLifecycle({ siteDir: row.siteDir, openEntry, sharedRunning, transitions: deps.transitions });
  const presentation = siteRecordPresentation({ lifecycle, sharedRunning, siteDir: row.siteDir, deps });
  const externalUrl = siteExternalUrl({ openEntry, sharedRunning, status: presentation.status });
  return {
    id: row.siteDir,
    slug: path.basename(row.siteDir),
    // The config may be gone even when a themes-only folder remains; keep the last known name.
    displayName: siteDisplayName({ row, validSite, readSiteName: deps.readSiteName }),
    installDir: row.siteDir,
    port: openEntry?.server.port ?? sharedPort,
    runningApp: sharedRunning?.app,
    externalUrl,
    externalLauncher: siteExternalLauncher({ externalUrl, sharedRunning, externalSites: deps.externalSites }),
    // Independent of `running` — a project's partition is a pure function of its own directory
    // (`desktop-auth.ts`'s `sitePartition`), not of whether a server currently answers on it. The
    // embedded-tab renderer needs it either way: `SiteWorkspace`'s `<webview>` sets it up front,
    // before the tab knows whether the site is up yet.
    partition: sitePartition({ siteDir: row.siteDir }),
    templateId: "tovu",
    templateVersion: null,
    database: { kind: "sqlite" as const },
    desiredState: presentation.desiredState,
    status: presentation.status,
    // Not always `null` any more: a site that DIED is `stopped` exactly like one that was never
    // started, and before `@jini-ai/sidecar/supervisor` owned that transition the two were indistinguishable
    // to the renderer (D-06). This is the one place the difference can be told.
    //
    // Only for a settled `stopped`. Mid-transition the prior crash is not what the operator is
    // looking at — a card that says "Starting" and "the server exited (code 1)" in the same breath
    // is reporting two different moments as one.
    statusDetail: presentation.detail,
    createdAt: row.createdAt,
    updatedAt: row.createdAt,
    // Computed by the SAME function `handleDelete` obeys, never re-derived from `origin` in the
    // renderer — a UI that decided this for itself could drift from the rule main actually enforces
    // and label a button with a consequence that will not happen. See Jini's directory-delete-guard.ts.
    deleteErasesFiles: mayEraseDirectory({ row: { directory: row.siteDir, origin: row.origin, identity: row.siteId }, createdOrigin: SITE_ORIGIN.created, protectedRoot: deps.repoRoot, ...SITE_IDENTITY_MARKER }),
    // A version token, never the image — see `SiteRecord.previewVersion`'s own doc on why this
    // record (polled every 4s) must never carry a payload. `null` for a site with no capture yet,
    // which is every site's ordinary state until it has been opened once.
    previewVersion: deps.readPreviewVersion({ siteDir: row.siteDir }),
    // Asked of the disk on every poll, never stored: a folder renamed or deleted behind the app's
    // back is exactly the case a stored flag would get wrong. Admission also rejects a leftover
    // themes-only/corrupt directory — the same Locate / Remove recovery applies to it.
    folderMissing: !validSite,
  };
}
