import { type SitesWorkspace } from "./shared-sites.ts";
import { formatErrorForLog } from "@jini-ai/core";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";

import { removeSiteTree } from "./remove-site-tree.ts";
import { type OpenSiteEntry } from "./project-ipc.site-lifecycle.ts";
import { readTrackedSites, untrackSite } from "./tracked-sites.ts";
import { mayEraseSiteDirectory } from "./project-delete-guard.ts";
import { type ProjectIpcDeps, type RegistryRow, type MayEraseRowLike } from "./project-ipc.types.ts";


/**
 * The exact operator-facing refusal when a SECOND copy of this app still has this site open.
 * Exported so tests assert on the real string rather than a paraphrase of it.
 *
 * @complexity O(n) in foreign row count.
 */
export function foreignServerMessage({ siteDir, foreign }: { siteDir: string; foreign: Array<{ pid: number }> }, _options = {}): string {
  const pids = foreign.map((row) => row.pid).join(", ");
  return (
    `Another copy of Tovu still has this site open (process ${pids}). Close that window first. ` +
    `Deleting now would erase ${siteDir} out from under a server that is still writing to its database.`
  );
}

/**
 * The exact operator-facing refusal when a crash-safety registry file cannot be read, so whether a
 * second copy of this app has the site open is unknown.
 *
 * @complexity O(n) in unreadable path count.
 */
export function unreadableRegistryMessage({ unreadable }: { unreadable: string[] }, _options = {}): string {
  return `Could not read ${unreadable.join(", ")}, so Tovu cannot tell whether another copy of Tovu still has this site open. Nothing was deleted. Restart Tovu and try again.`;
}

/**
 * Crash-safety rows naming a LIVE `tovu serve` for `siteDir` that belongs to some process OTHER
 * than the one this instance is holding — i.e. a second copy of this app with the same site open.
 *
 * `openSites` cannot answer this: it is this process's own in-memory map, so a sibling instance's
 * child is invisible to it. The on-disk registry is the only thing that sees both, and it is
 * already written to see them — each instance records only into its own file there, so a sibling's
 * row survives this instance opening the same site.
 *
 * `isLiveServeRow` is the registry's own identity proof (pid alive AND its live argv still names
 * this site dir and port), so a pid the OS recycled to something unrelated can never make this
 * refuse. Stale rows therefore cannot wedge a delete.
 *
 * An UNREADABLE registry file throws instead: its rows are unknown, and reading it as "no rows" is
 * exactly how this guard used to wave an erase through a torn sibling file. It does not wedge for
 * long — the next boot moves a dead instance's unreadable file aside, and a live one's own next
 * write does the same (`site-process-registry.ts`'s `quarantineUnreadableFile`).
 *
 * @param required.ownPid this instance's own child's pid, excluded — its row is not foreign.
 * @complexity O(n) in registry rows, times one `ps` call per row matching `siteDir` (in practice
 *   zero or one).
 */
function liveForeignServers({ deps, siteDir, ownPid }: { deps: Pick<ProjectIpcDeps, "readRegistry" | "registryPath" | "isLiveServeRow">; siteDir: string; ownPid: number | undefined }, _options = {}): RegistryRow[] {
  const registry = deps.readRegistry({ registryDir: deps.registryPath });
  if (registry.unreadable.length > 0) throw new Error(unreadableRegistryMessage({ unreadable: registry.unreadable }));
  return registry.sites.filter((row) => row.siteDir === siteDir && row.pid !== ownPid && deps.isLiveServeRow(row));
}

/**
 * Stops the project if it is running, erases its directory ONLY when this app created it,
 * then untracks it. Failed removal retains the row as the operator's recovery handle.
 *
 * That last word is load-bearing and is the whole reason this function consults
 * `project-delete-guard.ts` rather than calling `fs.rm` on whatever id arrives. A tracked row can
 * point at a folder the app merely adopted (`seedDevFallbackSite` seeds exactly one such row,
 * `<repo>/sites/tovu-dev`, someone's real 44 MB site), and for those the delete means "take this
 * card off my Projects screen" — the row goes, every byte stays. The renderer says which of the two
 * a given card will do, from the same guard's answer carried on `SiteRecord.deleteErasesFiles`,
 * so the confirm overlay never promises a consequence this function will not deliver.
 *
 * Idempotent on an id that is not tracked (already gone) rather than throwing — the
 * operator's confirm dialog already happened in the renderer, so a second delete of the same
 * project (a slow poll racing a fast double-click) should not surface a scary error for something
 * that already succeeded.
 *
 * The server is stopped and the in-memory `openSites`/on-disk crash-safety row are cleared BEFORE
 * the directory is removed, so `content.db` is never unlinked out from under a live handle. The
 * window's own `closed` listener (`main.ts`) still fires afterward and repeats the same two
 * cleanup calls — both are idempotent (`stopChild` checks `exitCode`/`signalCode` first;
 * `openSites.delete` and `recordSiteClosed` are no-ops on an absent entry), so the double call is
 * harmless rather than a race.
 *
 * **Runs through the SAME `serializer` key `handleStart` uses, and that is what makes the paragraph
 * above true** (D-05/SEC-02). It used to be false for one interleaving: `openSiteServer` publishes
 * into `openSites` only AFTER `startSiteBackend` resolves, and that can take the full
 * `DEFAULT_READY_TIMEOUT_MS` (180s) while `tovu serve` boots. Start a site, go back to All, delete
 * it, and the delete saw no entry, skipped the stop, and recursively erased the directory the child
 * was booting in — then the start completed and published a running entry for a project that no
 * longer existed. Serializing the two verbs against each other is the whole fix: the delete now
 * queues behind the in-flight start and finds the entry it must stop.
 *
 * @complexity O(1) beyond `fs.rm`'s own cost over the site directory's contents, plus however long
 *   an already-queued operation on the same site takes to settle.
 */
export async function handleDelete({ id, deps }: { id: string; deps: Pick<ProjectIpcDeps, "serializer" | "projectsPath" | "openSites" | "cancelPreviewCapture" | "repoRoot" | "readRegistry" | "registryPath" | "isLiveServeRow" | "recordSiteClosed" | "deletePreview" | "removeSiteTree" | "sharedSites"> }, _options = {}): Promise<void> {
  await deps.serializer.run({ key: id, fn: () => deleteProject({ id, deps }) });
}

/**
 * {@link handleDelete}'s body, separated only so the serialized region is one named thing rather
 * than an inline closure — everything here assumes it holds this site's serializer key.
 *
 * @complexity see {@link handleDelete}.
 */
async function deleteProject({ id, deps }: { id: string; deps: Pick<ProjectIpcDeps, "projectsPath" | "openSites" | "cancelPreviewCapture" | "repoRoot" | "readRegistry" | "registryPath" | "isLiveServeRow" | "recordSiteClosed" | "deletePreview" | "removeSiteTree" | "sharedSites"> }, _options = {}): Promise<void> {
  const row = readTrackedSites({ projectsPath: deps.projectsPath }).find((entry) => entry.siteDir === id);
  if (row === undefined) return;

  const openEntry = deps.openSites.get(id);
  const erasesFiles = mayEraseSiteDirectory({ row: row as unknown as MayEraseRowLike, options: { repoRoot: deps.repoRoot } });

  // BEFORE any side effect, and only for the arm that erases (D-08). The serializer above makes the
  // stop-then-erase sequence safe against THIS process; nothing made it safe against a second copy
  // of the app, and nothing prevents one — `main.ts` calls no `requestSingleInstanceLock`, and
  // `site-process-registry.ts` is written throughout on the premise that two instances can run at once.
  // Instance A deleting a site instance B has open recursively erased the directory out from under
  // B's live `tovu serve`, which went on writing into unlinked files.
  //
  // Refusing the whole operation rather than untracking-without-erasing: `deleteErasesFiles` is what
  // the confirm overlay showed the operator, and this function's own contract is that the overlay
  // never promises a consequence it will not deliver. A quiet downgrade to "card removed, folder
  // kept" would break that in the direction they cannot see.
  //
  // The non-erasing arm is deliberately NOT gated. There it means "take this card off my Projects
  // screen"; a sibling instance keeping its own copy running is not endangered by that.
  if (erasesFiles) assertNoOtherServer({ id, openEntry, deps });

  deps.cancelPreviewCapture?.({ siteDir: id }, {});
  if (openEntry !== undefined) {
    // The real server always has stop; the field is optional for tests of other handlers.
    if (!openEntry.server.stop) throw new Error(`Cannot delete ${id}: its running server has no stop method.`);
    await openEntry.server.stop();
    closeStoppedProject({ id, openEntry, deps });
  }
  // The row is the recovery handle for a partial erase: keep it until removal succeeds.
  if (erasesFiles) await eraseProjectDirectory({ id, deps });
  untrackSite({ projectsPath: deps.projectsPath, siteDir: id });
  if (erasesFiles) removeFromSharedCatalog({ id, sharedSites: deps.sharedSites });
  // Unconditional — independent of `erasesFiles` below. A preview is this shell's own decoration,
  // not the operator's data, so a row that is merely REMOVED (adopted, files kept) still drops its
  // cached thumbnail: once the row is gone `buildSiteRecord` can never ask for it again
  // (`site-preview-store.ts`'s own doc on why an orphan is otherwise unreachable, not merely
  // unlikely), so leaving the file behind would only be litter for the boot sweep to find later.
  deps.deletePreview({ id });

}

/** {@link deleteProject}'s erase gate (D-08): refuse while another app or instance serves the site.
 * @complexity O(r) registry rows.
 */
function assertNoOtherServer(
  { id, openEntry, deps }: { id: string; openEntry: OpenSiteEntry | undefined; deps: Pick<ProjectIpcDeps, "readRegistry" | "registryPath" | "isLiveServeRow" | "sharedSites"> }, _options = {},
): void {
  const ownPid = openEntry?.server.pid;
  const shared = deps.sharedSites?.running({ path: id }).read({});
  if (shared && (shared.pid !== ownPid || openEntry?.server.external)) throw new Error(`Running in ${shared.app} (port ${shared.port}). Stop it in that app before deleting.`);
  const foreign = liveForeignServers({ deps, siteDir: id, ownPid });
  if (foreign.length > 0) throw new Error(foreignServerMessage({ siteDir: id, foreign }));
}

/** Drop an erased site from the shared catalog; a failure only warns, the folder is already gone.
 * @complexity O(1).
 */
function removeFromSharedCatalog({ id, sharedSites }: { id: string; sharedSites: SitesWorkspace | undefined }, _options = {}): void {
  try { sharedSites?.registry({}).remove({ path: id }); }
  catch (error) { console.warn("tovu desktop: could not remove the erased website from the shared catalog.", formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS)); }
}

/** Remove this process's stopped handle and close its window before folder deletion.
 * @complexity O(1) time and space.
 */
function closeStoppedProject(
  { id, openEntry, deps }: { id: string; openEntry: OpenSiteEntry; deps: Pick<ProjectIpcDeps, "openSites" | "recordSiteClosed" | "registryPath"> }, _options = {},
): void {
  deps.openSites.delete(id);
  // By pid: `recordSiteOpened` can leave a still-draining earlier child's row for this same site dir,
  // and a close by site dir alone would drop that one too (D-07).
  deps.recordSiteClosed({ registryDir: deps.registryPath, siteDir: id }, { pid: openEntry.server.pid });
  // A sites-home-opened (embedded-tab) entry has no `window` at all — see `openSiteServer` in
  // `main.ts` — so this is optional, not a missing null check.
  const window = openEntry.window;
  if (window) {
    // The real window has these methods; they are optional only for tests that never invoke them.
    if (!window.isDestroyed) throw new Error(`Cannot close ${id}: its window has no isDestroyed method.`);
    if (!window.isDestroyed()) {
      if (!window.destroy) throw new Error(`Cannot close ${id}: its window has no destroy method.`);
      window.destroy();
    }
  }
}

/** Erase the folder; translate failures while leaving untracking to the caller.
 * @throws {Error} with the existing retry instruction on a partial erase.
 * @complexity O(n) in filesystem entries, delegated to removeSiteTree.
 */
async function eraseProjectDirectory(
  { id, deps }: { id: string; deps: Pick<ProjectIpcDeps, "removeSiteTree"> }, _options = {},
): Promise<void> {
  // The row is the recovery handle for a partial erase: keep it until removal succeeds.
  try { await (deps.removeSiteTree ?? removeSiteTree)({ root: id }, {}); }
  catch (error) {
    const reason = (error as NodeJS.ErrnoException).code === 'EACCES'
      ? 'Permission was denied.' : 'The folder could not be removed.';
    throw new Error(`Could not delete this website. ${reason} Its card has been kept so you can try again.`);
  }
}
