import { shareSiteDirectories } from "./shared-sites.ts";
import { ensureIndependentSiteIdentity } from "./site-directory-identity.ts";
import { classifySiteDirSafely } from "./site-dir-store.ts";

import fsp from "node:fs/promises";
import { PROJECT_NOT_OPEN_MESSAGE } from "./contracts/project.ts";
import { readTrackedSites } from "./tracked-sites.ts";
import { type OpenSiteSurfaceInput, type ProjectIpcDeps, type SiteTransitionsLike } from "./project-ipc.types.ts";
import { buildSiteRecord, type SharedRunning } from "./project-ipc.records.ts";


/**
 * Hands one of a running project's surfaces to the operator's default browser. Refuses a project
 * that is not currently open rather than guessing a port — nothing durable records a stopped
 * project's last-known port today (see `tracked-sites.ts`'s header on why status is derived,
 * not stored), so "not running" and "never had a port to report" are the same state here.
 *
 * @throws {Error} when the project is not open.
 * @complexity O(1).
 */
export async function handleOpenExternal(input: OpenSiteSurfaceInput, deps: Pick<ProjectIpcDeps, "openSites" | "shell">): Promise<void> {
  const openEntry = deps.openSites.get(input.siteId);
  if (openEntry === undefined) {
    throw new Error(PROJECT_NOT_OPEN_MESSAGE);
  }
  const url = `${openEntry.server.origin}${input.view === "site" ? "/" : "/admin/"}`;
  await deps.shell.openExternal(url);
}

/**
 * One site's cached preview as a `data:` URL, fetched ON DEMAND rather than riding along on
 * `buildSiteRecord`'s `previewVersion` field — see that field's own doc, and `site-preview-store.ts`'s
 * header, on why the polled record and the actual bytes are deliberately two different round trips.
 *
 * No tracked-row check, unlike every other handler here: `id` only ever reaches this as an input to
 * a digest (`site-preview-store.ts`'s `previewPath`), never as a filesystem path this function opens
 * directly, and reading is the only thing it does — there is no write or delete for a stale or
 * foreign id to cause.
 *
 * @returns the URL, or `null` when no capture exists yet — the ordinary state for a site that has
 *   never been opened, not an error to surface.
 * @complexity O(1) beyond `readPreviewDataUrl`'s own cost.
 */
export function handleGetPreview({ id, deps }: { id: string; deps: Pick<ProjectIpcDeps, "readPreviewDataUrl"> }, _options = {}) {
  return deps.readPreviewDataUrl({ id });
}

/**
 * A project tab's "not running yet" answer: ensure the site's `tovu serve` is up, spawning it if it
 * is not already running, or reusing it if another tab already has it open — never a `BrowserWindow`.
 * Reuses `openSiteServer` — `main.ts`'s spawn-only counterpart to the `openSiteWindow` "Open
 * Site…"/"Open Recent"/startup already use — through `serializer.run`, so opening the same tab twice
 * fast cannot double-spawn its server (see `main.ts`'s own doc on `openSiteServer`/
 * `keyed-serializer.ts`).
 *
 * Returns the project's fresh record rather than nothing: the renderer's `<webview>` needs the
 * `port` this call just produced, and re-deriving it would mean a second `list` round trip for
 * every tab open.
 *
 * The tracked-row check happens INSIDE the serialized region, not before it (D-05/SEC-02). Read
 * outside, it answered a question about a moment that had already passed: a delete queued on the
 * same key could untrack the row and erase the directory between the check and the spawn, and this
 * would then start a `tovu serve` on a path that no longer exists. Inside, "is this project still
 * tracked" is asked at the only instant its answer is still true when acted on.
 *
 * The boot is marked `starting` for its whole duration (`site-transitions.ts`) — seconds, during
 * which `openSites` still says "not running" and a card left to that alone shows the operator a
 * Start button that appears to have done nothing. The mark is released before the record below is
 * built, so what this RESOLVES with is the settled answer, never `starting`.
 *
 * @throws {Error} when `id` names a project this shell is not tracking — a stale id from a renderer
 *   that has not yet re-polled past a delete, refused rather than opening an arbitrary path.
 * @complexity O(n + r + m) for n tracked rows, r catalog rows and m marker bytes, beyond
 *   `openSiteServer` and any already-queued operation on the same site.
 */
export async function handleStart<TCtx>({ id, deps }: { id: string; deps: Pick<ProjectIpcDeps<TCtx>, "serializer" | "projectsPath" | "openSiteServer" | "ctx" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions" | "sharedSites" | "siteRuntime"> & Partial<Pick<ProjectIpcDeps, "classifySiteDir" | "startAllowed">> }, _options = {}) {
  return await deps.serializer.run({ key: id, fn: async () => {
    const row = readTrackedSites({ projectsPath: deps.projectsPath }).find((entry) => entry.siteDir === id);
    if (row === undefined) {
      throw new Error(`Unknown project: ${id}`);
    }
    if (deps.startAllowed && !deps.startAllowed()) return buildSiteRecord(row, deps);
    if ((deps.classifySiteDir ?? classifySiteDirSafely)({ dir: row.siteDir }) !== "site") throw new Error("Folder moved or not a site. Locate the website folder or remove this card.");
    ensureIndependentSiteIdentity({ siteDir: row.siteDir }, { workspace: deps.sharedSites });
    if (deps.sharedSites) shareSiteDirectories({ workspace: deps.sharedSites, dirs: [row.siteDir], createdBy: "Desktop", allowRelocation: true });
    await markTransition({ transitions: deps.transitions, siteDir: id, transition: "starting", body: () => explainMissingSiteDir({ siteDir: id, starting: deps.openSiteServer({ siteDir: id, ctx: deps.ctx }) }) });
    return buildSiteRecord(row, deps);
  } });
}

/**
 * Rewrites `tovu serve`'s `SITE_DIR_INVALID` into "folder not found" when the tracked folder itself
 * is gone. A folder renamed or moved on disk (`sites/tovu-com` → `sites/tovu-dev`, 2026-09-28) is
 * still tracked by its old path, and serve's own "config.json is missing at …" sent the operator
 * looking for a config file rather than for the folder. Checked only after serve has refused, so a
 * start that succeeds pays nothing, and every other failure passes through untouched.
 */
async function explainMissingSiteDir({ siteDir, starting }: { siteDir: string; starting: Promise<unknown> }, _options = {}): Promise<void> {
  try {
    await starting;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("SITE_DIR_INVALID")) throw error;
    const folderExists = await fsp.stat(siteDir).then(() => true, () => false);
    if (folderExists) throw error;
    throw new Error(`Site folder not found: ${siteDir}. It was moved, renamed or deleted — remove this site from the list, then use Add Site on its new location.`);
  }
}

/**
 * Take one site's `tovu serve` down — the card's Stop, and the first way this app has ever had to
 * stop a single site from inside itself. Before it, `before-quit` (every site at once) and
 * `handleDelete` (the project is going away) were the only two, so an operator who wanted one site
 * down had to kill its process from a terminal.
 *
 * **Drains rather than kills.** `server.stop()` is `tovu-server.ts`'s `stopChild`: SIGTERM to the
 * child, which runs `serve.ts`'s own BR-07 shutdown — stop accepting, finish in-flight requests,
 * stop the agent daemon, close the sqlite handle — with a SIGKILL of the process GROUP only as the
 * 5 s escalation. That is the same call `before-quit` and `handleDelete` make; nothing here is a
 * shortcut past it, and nothing is left orphaned: `stopChild` resolves only once the child is
 * really gone.
 *
 * **The entry is dropped BEFORE the stop is awaited, deliberately** — the window-`closed` path in
 * `main.ts` does the identical thing for the identical reason. `site-supervisor.ts` watches each
 * entry's child and reports an exit it did not expect through `onUnexpectedExit`, which logs a
 * crash and records a `lastExitOf` the card then shows as "the site's server was stopped by
 * SIGTERM". For a stop the operator ASKED for, that is a lie in the one place they can read it.
 * Removing the entry first is what makes the supervisor's own identity check see this exit as no
 * longer its business. The teardown remains visible to Quit through the injected Jini shutdown
 * tracker; if exit cannot be confirmed, Stop rejects and retains the crash-safety row.
 *
 * The crash-safety row is dropped only AFTER the stop, never before: it exists so the NEXT launch
 * can reap a child this process left running, so it has to outlive the child. Dropping it up front
 * would mean a hard kill of the app mid-drain left a `tovu serve` that `reconcileOrphans` could
 * never find — the exact bug the window-`closed` path's own comment records.
 *
 * Stopping a site nobody started is a no-op that still returns its record, not an error: the
 * renderer polls every 4 s, so a card can be a click behind main's truth through no fault of the
 * operator's, and refusing would surface an error for a state they already wanted.
 *
 * **A site another process serves** (the shared lease names someone else — `npm run dev`, a sibling
 * instance) is stopped through `deps.externalSites` (owner 2026-10-13; the renderer confirms first).
 * Without that port wired, it is refused as before: "Stop it in that app."
 *
 * @returns the project's fresh record, so the card settles on `stopped` without waiting for a poll.
 * @throws {Error} when `id` names a project this shell is not tracking — same refusal, and same
 *   reason, as {@link handleStart}'s — or the child fails to exit after forced shutdown, or an
 *   external server's identity cannot be proved or it does not exit in time.
 * @complexity O(1) beyond `server.stop()`'s own drain (bounded by grace plus exit wait), plus however long
 *   an already-queued operation on the same site takes to settle.
 */
export async function handleStop({ id, deps }: { id: string; deps: Pick<ProjectIpcDeps, "serializer" | "projectsPath" | "openSites" | "cancelPreviewCapture" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "registryPath" | "recordSiteClosed" | "transitions" | "sharedSites" | "siteRuntime" | "pendingTeardowns" | "externalSites"> }, _options = {}) {
  return await deps.serializer.run({ key: id, fn: async () => {
    const row = readTrackedSites({ projectsPath: deps.projectsPath }).find((entry) => entry.siteDir === id);
    if (row === undefined) {
      throw new Error(`Unknown project: ${id}`);
    }
    const running = deps.sharedSites?.running({ path: id }).read({});
    const openEntry = deps.openSites.get(id);
    const externalSites = deps.externalSites;
    if (running && (!openEntry || openEntry.server.external) && externalSites) {
      await markTransition({ transitions: deps.transitions, siteDir: id, transition: "stopping", body: () => stopExternalServer({ id, lease: running, externalSites, deps }) });
      return buildSiteRecord(row, deps);
    }
    if (running && !openEntry) throw new Error(`Running in ${running.app} (port ${running.port}). Stop it in that app.`);
    await markTransition({ transitions: deps.transitions, siteDir: id, transition: "stopping", body: () => stopSiteServer({ id, deps }) });
    return buildSiteRecord(row, deps);
  } });
}

/**
 * {@link handleStop} for a site another process serves. This window's own attachment (if any) is
 * withdrawn FIRST, for the reason {@link stopSiteServer} drops its entry before stopping: the
 * attachment's lease watcher would otherwise report the exit the operator asked for as a crash.
 * Assumes it holds this site's serializer key.
 * @complexity see `external-site-stop.ts`'s `stopExternalSite`.
 */
async function stopExternalServer(
  { id, lease, externalSites, deps }: {
    id: string; lease: NonNullable<SharedRunning>; externalSites: NonNullable<ProjectIpcDeps["externalSites"]>;
    deps: Pick<ProjectIpcDeps, "openSites" | "cancelPreviewCapture" | "registryPath" | "recordSiteClosed" | "pendingTeardowns" | "sharedSites">;
  },
  _options = {},
): Promise<void> {
  await stopSiteServer({ id, deps });
  await externalSites.stop({ lease, readLease: () => deps.sharedSites?.running({ path: id }).read({}) });
}

/**
 * {@link handleStop}'s side effect, split out so the handler above reads as its three steps — find
 * the row, stop the server, report the result — rather than interleaving the drain's own ordering
 * rules with them. Assumes it holds this site's serializer key.
 *
 * @complexity see {@link handleStop}.
 */
async function stopSiteServer({ id, deps }: { id: string; deps: Pick<ProjectIpcDeps, "openSites" | "cancelPreviewCapture" | "registryPath" | "recordSiteClosed" | "pendingTeardowns"> }, _options = {}): Promise<void> {
  deps.cancelPreviewCapture?.({ siteDir: id }, {});
  const openEntry = deps.openSites.get(id);
  if (openEntry === undefined) return;
  if (!openEntry.server.stop) throw new Error(`Cannot stop ${id}: its running server has no stop method.`);
  deps.openSites.delete(id);
  const teardown = openEntry.server.stop().then(() => {
    // By pid, never by site dir alone: a live SIBLING app instance can hold its own row for this same
    // site, and a close by site dir would take that one too (D-07). A failed Stop keeps this row.
    deps.recordSiteClosed({ registryDir: deps.registryPath, siteDir: id }, { pid: openEntry.server.pid });
  }, error => {
    // Stop could not confirm exit. Keep this live child supervised so Keep running can retain
    // its normal memory and crash recovery, rather than losing it from the lifecycle entirely.
    if (!deps.openSites.has(id)) deps.openSites.set(id, openEntry);
    throw error;
  });
  // openSites no longer exposes this child, so Quit must find its drain in the existing tracker.
  deps.pendingTeardowns?.track({ promise: teardown });
  await teardown;
}

/**
 * Run `body` with `siteDir` marked as mid-`transition`, when a transitions store was wired in.
 *
 * The optional half is what the two handlers would otherwise each repeat: `deps.transitions` is
 * absent in every test that is not exercising transition status, and a handler that had to
 * null-check it inline would state the boot/drain's own logic twice.
 *
 * @complexity O(1) beyond `body`'s own cost.
 */
function markTransition<T>({ transitions, siteDir, transition, body }: { transitions: SiteTransitionsLike | undefined; siteDir: string; transition: "starting" | "stopping"; body: () => Promise<T> }, _options = {}
): Promise<T> {
  return transitions === undefined ? body() : transitions.during({ siteDir, transition, body });
}
