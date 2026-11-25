import { type SitesWorkspace } from "./shared-sites.ts";
import { formatErrorForLog } from "@jini-ai/core";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";

import { removeDirectoryTree } from "@jini-ai/platform/fs";
import { type OpenSiteEntry } from "./project-ipc.site-lifecycle.ts";
import { SITE_ORIGIN, readTrackedSites, untrackSite } from "./tracked-sites.ts";
import { mayEraseDirectory } from "@jini-ai/platform/fs";
import { type ProjectIpcDeps, type RegistryRow } from "./project-ipc.types.ts";
import { SITE_IDENTITY_MARKER } from "./site-dir-store.ts";
import { type SiteRetirementPort } from "./site-retirement.ts";
import { type ErasedRetirementCandidate } from "@jini-ai/desktop-host/electron/partitions";


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
 * write does the same (`site-child-registry.ts`'s `quarantineUnreadableFile`).
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
export async function handleDelete({ id, deps }: { id: string; deps: Pick<ProjectIpcDeps, "serializer" | "projectsPath" | "openSites" | "cancelPreviewCapture" | "repoRoot" | "readRegistry" | "registryPath" | "isLiveServeRow" | "recordSiteClosed" | "deletePreview" | "removeSiteTree" | "sharedSites" | "trimRetiredSiteCache" | "warn" | "retirement"> }, _options = {}): Promise<void> {
  await deps.serializer.run({ key: id, fn: () => deleteProject({ id, deps }) });
}

/**
 * {@link handleDelete}'s body, separated only so the serialized region is one named thing rather
 * than an inline closure — everything here assumes it holds this site's serializer key.
 *
 * @complexity see {@link handleDelete}.
 */
async function deleteProject({ id, deps }: { id: string; deps: Pick<ProjectIpcDeps, "projectsPath" | "openSites" | "cancelPreviewCapture" | "repoRoot" | "readRegistry" | "registryPath" | "isLiveServeRow" | "recordSiteClosed" | "deletePreview" | "removeSiteTree" | "sharedSites" | "trimRetiredSiteCache" | "warn" | "retirement"> }, _options = {}): Promise<void> {
  const row = readTrackedSites({ projectsPath: deps.projectsPath }).find((entry) => entry.siteDir === id);
  if (row === undefined) return;

  const openEntry = deps.openSites.get(id);
  const erasesFiles = mayEraseDirectory({ row: { directory: row.siteDir, origin: row.origin, identity: row.siteId }, createdOrigin: SITE_ORIGIN.created, protectedRoot: deps.repoRoot, ...SITE_IDENTITY_MARKER });

  // BEFORE any side effect, and only for the arm that erases (D-08). The serializer above makes the
  // stop-then-erase sequence safe against THIS process; nothing made it safe against a second copy
  // of the app, and nothing prevents one — `main.ts` calls no `requestSingleInstanceLock`, and
  // `site-child-registry.ts` is written throughout on the premise that two instances can run at once.
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
  // The row is the recovery handle for a partial erase: keep it until removal succeeds. Erase arm
  // only: the untrack arm keeps the folder, so it must never produce sign-in removal proof.
  if (erasesFiles) await eraseWithRetirementProof({ id, siteId: row.siteId, deps });
  untrackSite({ projectsPath: deps.projectsPath, siteDir: id });
  if (erasesFiles) removeFromSharedCatalog({ id, sharedSites: deps.sharedSites });
  // Unconditional — independent of `erasesFiles` below. A preview is this shell's own decoration,
  // not the operator's data, so a row that is merely REMOVED (adopted, files kept) still drops its
  // cached thumbnail: once the row is gone `buildSiteRecord` can never ask for it again
  // (`site-preview-store.ts`'s own doc on why an orphan is otherwise unreachable, not merely
  // unlikely), so leaving the file behind would only be litter for the boot sweep to find later.
  deps.deletePreview({ id });
  // Last, erase arm only, and only once the row is untracked: a refused or failed erase keeps the
  // card, and a kept card must reopen with its cache (and sign-in) exactly as it was. The untrack arm
  // keeps the folder, which the operator may add straight back (`handleLocate`/`handleAddSite` do not
  // take this serializer key), so a trim there could race the re-added card's own partition.
  if (erasesFiles) await trimRetiredCache({ id, deps });
}

/** {@link deleteProject}'s cache retirement. The removal already completed, so a cache failure is a
 * diagnostic, never a failed deletion; the message names no path (it would expose the owner's tree).
 * @complexity O(1) beyond the port's own clear.
 */
async function trimRetiredCache(
  { id, deps }: { id: string; deps: Pick<ProjectIpcDeps, "trimRetiredSiteCache" | "warn"> }, _options = {},
): Promise<void> {
  try { await deps.trimRetiredSiteCache({ siteDir: id }, {}); }
  catch (error) {
    deps.warn({ message: `tovu desktop: a removed website's browser cache could not be cleared. The website itself was removed. Details: ${cacheErrorCode({ error })}` });
  }
}

/** The redacted detail for a cache failure: its errno code or class name only, because the message of a
 * file-system error quotes the partition path under the owner's tree.
 * @complexity O(1).
 */
function cacheErrorCode({ error }: { error: unknown }, _options = {}): string {
  const code = (error as { code?: unknown } | null)?.code;
  // A fixed allowlist, never the error's own `name` or an arbitrary code: both are caller-controlled
  // strings, and a diagnostic sink must not become a channel for whatever a thrower put in them.
  return typeof code === "string" && KNOWN_CACHE_ERROR_CODES.has(code) ? code : UNKNOWN_CACHE_ERROR;
}

/** The errno codes a partition cache clear is known to surface; anything else is {@link UNKNOWN_CACHE_ERROR}. */
const KNOWN_CACHE_ERROR_CODES: ReadonlySet<string> = new Set([
  "EACCES", "EPERM", "EBUSY", "ENOENT", "ENOTEMPTY", "ENOTDIR", "EISDIR", "EEXIST", "EIO", "ENOSPC", "EROFS", "EMFILE", "ENFILE", "ETIMEDOUT",
]);
const UNKNOWN_CACHE_ERROR = "unknown-error";

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
 * @complexity O(n) in filesystem entries, delegated to removeDirectoryTree.
 */
async function eraseProjectDirectory(
  { id, deps }: { id: string; deps: Pick<ProjectIpcDeps, "removeSiteTree"> }, _options = {},
): Promise<void> {
  // The row is the recovery handle for a partial erase: keep it until removal succeeds.
  try { await (deps.removeSiteTree ?? removeDirectoryTree)({ root: id }, {}); }
  catch (error) {
    const reason = (error as NodeJS.ErrnoException).code === 'EACCES'
      ? 'Permission was denied.' : 'The folder could not be removed.';
    throw new Error(`Could not delete this website. ${reason} Its card has been kept so you can try again.`);
  }
}

/** Capture identity, erase, then record proof — all before the caller untracks, so a crash between
 * the record and untrack leaves a pending record AND a tracked row, which keeps the partition.
 * @throws {Error} {@link eraseProjectDirectory}'s message; nothing is recorded then.
 * @complexity O(n) in filesystem entries, plus O(records) for the ledger append.
 */
async function eraseWithRetirementProof(
  { id, siteId, deps }: { id: string; siteId: string | undefined; deps: Pick<ProjectIpcDeps, "removeSiteTree" | "retirement"> }, _options = {},
): Promise<void> {
  const candidate = captureRetirement({ siteDir: id, siteId, retirement: deps.retirement });
  await eraseProjectDirectory({ id, deps });
  if (candidate !== null) recordRetirement({ candidate, absence: deps.retirement.absence({ candidate }), retirement: deps.retirement, log: warnRetirement });
}

/** The website's identity before its folder is erased; `null` (no proof, logins kept) when unknown.
 * @complexity O(1) filesystem calls, delegated to the retirement port.
 */
function captureRetirement(
  { siteDir, siteId, retirement }: { siteDir: string; siteId: string | undefined; retirement: Pick<SiteRetirementPort, "capture"> }, _options = {},
): ErasedRetirementCandidate | null {
  if (siteId === undefined) return null;
  try { return retirement.capture({ siteDir, siteId }); }
  catch { return null; }
}

/**
 * Write the removal proof only once the erase succeeded AND the folder is certainly gone.
 *
 * Why this is positive proof rather than a reconstruction from missing rows: a partition whose site
 * has no tracked row may still belong to an untracked card, an unplugged drive or an older copy of
 * the app; only this arm, which itself just erased the folder it identified beforehand, knows the
 * website is deleted. A failure here only warns: the erase already happened and its result stands;
 * without a record the partition is merely ambiguous later (logins kept and listed), the safe side.
 * @complexity O(records) in the ledger, under its file lock.
 */
function recordRetirement(
  { candidate, absence, retirement, log }: {
    candidate: ErasedRetirementCandidate; absence: string; retirement: Pick<SiteRetirementPort, "append">; log: (required: { error: unknown }) => void;
  }, _options = {},
): void {
  if (absence !== "absent") return;
  try { retirement.append({ candidate }); }
  catch (error) { log({ error }); }
}

/** {@link recordRetirement}'s plain-words warning. @complexity O(1). */
function warnRetirement({ error }: { error: unknown }, _options = {}): void {
  console.warn("tovu desktop: could not record the deleted website's sign-in for later removal; it will be kept and listed instead.", formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS));
}
