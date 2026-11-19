import { duplicateSiteNameError } from "./site-name-policy.ts";
import { siteNameError } from "./contracts/site-name.ts";
import { readTrackedSites } from "./tracked-sites.ts";
import { readSiteIdentity } from "./project-delete-guard.ts";
import { type SiteRow, type ProjectIpcDeps, type RenameSiteInput } from "./project-ipc.types.ts";
import { otherSiteNames, rememberSiteAlias, rememberSiteName } from "./project-ipc.catalog.ts";
import { buildSiteRecord } from "./project-ipc.records.ts";


/**
 * Whether this row recorded an identity that the directory no longer has.
 *
 * `false` for a row that recorded none — which is every ADOPTED row, since `buildTrackedRow`
 * (`tracked-sites.ts`) stamps `siteId` only on a `created` one. That is the deliberate fail-OPEN
 * half of {@link handleRename}'s guard, argued in its own doc: a check that cannot run is not the
 * same as a check that failed, and treating it as failure would make rename impossible on every
 * site the operator adopted.
 *
 * Its own function so the three clauses read as one question at the call site, and so the
 * "recorded nothing" and "recorded something that changed" cases are visibly different answers.
 *
 * @complexity O(1) beyond `readSiteIdentity`'s single file read.
 */
function identityHasChanged(row: SiteRow): boolean {
  if (typeof row.siteId !== "string" || row.siteId === "") return false;
  return readSiteIdentity({ siteDir: row.siteDir }) !== row.siteId;
}

/**
 * The name a rename asked for, once it passes the site-name rule and no other tracked site has it.
 *
 * @throws {Error} operator-facing: a missing or invalid name (`site-config.ts`'s 1..200-after-trim
 *   check), or a name another site on this computer already uses.
 * @complexity O(n) in the tracked-site count, for the duplicate check.
 */
function acceptedNewSiteName({ requestedName, siteDir, deps }: {
  requestedName: unknown; siteDir: string; deps: Pick<ProjectIpcDeps, "projectsPath" | "readSiteName">;
}, _options = {}): string {
  const nameError = siteNameError({ name: requestedName });
  if (nameError || typeof requestedName !== "string") throw new Error(nameError ?? "A site name is required to rename a website.");
  const duplicateError = duplicateSiteNameError({ name: requestedName, names: otherSiteNames({ deps, siteDir }) });
  if (duplicateError) throw new Error(duplicateError);
  return requestedName;
}

/**
 * Change a site's display name — `config.json`'s `name`, the one `readSiteName` reads for every
 * card's `displayName`.
 *
 * **WHY THE GUARD IS NOT `isStillTheRecordedSite`.** That predicate (`project-delete-guard.ts`) is
 * the right identity test for DELETE and the wrong one here, and the difference is not a judgement
 * call — it returns `false` immediately unless `row.siteId` is a non-empty string, and
 * `buildTrackedRow` (`tracked-sites.ts`) stamps `siteId` ONLY on a `created` row. Every site the
 * operator adopted — "Add Tovu Website", a rescan, "Open Site…" — has no `siteId` and never will,
 * so gating rename on it would refuse rename on essentially every real site: a feature that fails
 * closed into uselessness.
 *
 * The asymmetry is in what each direction costs, which is exactly how `project-delete-guard.ts`'s
 * own header argues its case. Delete's fail-closed direction costs the operator a leftover folder
 * they can remove in Finder, while its wrong direction costs them their content — so it refuses
 * whatever it cannot positively prove. Rename's fail-closed direction costs the whole feature on
 * every site, while its wrong direction writes a display name into a site whose name that card is
 * ALREADY showing (`readSiteName` reads whatever `config.json` sits at that path). Non-destructive,
 * reversible, and the operator is renaming what they can see.
 *
 * So this checks what is actually checkable, and reuses the delete guard's own primitive
 * (`readSiteIdentity`) rather than inventing a second notion of site identity:
 *
 * 1. The row is tracked. An id this shell does not know is not a site it may write to.
 * 2. The directory still classifies as a complete Tovu site. This is the check that catches the
 *    moved-, emptied-, or deleted-folder cases, and it is the one that matters most often.
 * 3. When the row DOES carry a `siteId`, the directory's own identity must still match it.
 *    Best-effort by necessity rather than by choice — applied whenever it can be proven at all.
 *
 * **Residual risk, stated rather than hidden:** on an adopted row whose directory was swapped for
 * a different Tovu site, step 3 cannot fire and this renames the site that is there now. That is
 * the same directory whose name the card is already displaying, so the operator is not misled about
 * WHICH name they are changing — and the write is one reversible string, not a deletion.
 *
 * @returns the refreshed `SiteRecord`, so the card re-renders without a second `list` round trip.
 * @throws {Error} operator-facing, for every refusal above and for an invalid name
 *   (`site-config.ts`'s own 1..200-after-trim check, which mirrors what `tovu serve` re-applies at
 *   every boot).
 * @complexity O(n) in the tracked-site count, for the row lookup.
 */
export function handleRename(input: RenameSiteInput, deps: Pick<ProjectIpcDeps, "projectsPath" | "classifySiteDir" | "writeSiteName" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions" | "sharedSites" | "siteRuntime">) {
  const id = input?.id;
  const row = readTrackedSites({ projectsPath: deps.projectsPath }).find((tracked) => tracked.siteDir === id);
  if (row === undefined) {
    throw new Error(`This app is not tracking a site at ${id}, so there is nothing to rename.`);
  }

  // The SAFE classifier (`deps.classifySiteDir` is `classifySiteDirSafely` — see `main.ts`), so an
  // unreadable directory becomes a refusal with a reason rather than a throw from inside the guard.
  const kind = deps.classifySiteDir({ dir: row.siteDir });
  if (kind !== "site") {
    throw new Error(
      `${row.siteDir} is no longer a complete Tovu site (${kind}), so its name cannot be changed. ` +
        `If you moved the site, remove this card and add it again from its new location.`,
    );
  }

  if (identityHasChanged(row)) {
    throw new Error(
      `The site now at ${row.siteDir} is not the one this card was made for, so it was not renamed. ` +
        `Remove this card and add the site again from its current location.`,
    );
  }

  const requestedName = acceptedNewSiteName({ requestedName: input?.name, siteDir: row.siteDir, deps });
  const name = deps.writeSiteName({ siteDir: row.siteDir, rawName: requestedName });
  // An explicit successful rename replaces any Add alias; otherwise the card would keep its old name.
  row.displayNameAlias = undefined;
  rememberSiteAlias({ projectsPath: deps.projectsPath, siteDir: row.siteDir });
  rememberSiteName({ projectsPath: deps.projectsPath, siteDir: row.siteDir, displayName: name });

  retitleOpenSite({ siteDir: row.siteDir, name, openSites: deps.openSites });

  return buildSiteRecord(row, deps);
}

/** Refresh the native Window menu's name after a successful site rename.
 * @complexity O(1) time and space.
 */
function retitleOpenSite(
  { siteDir, name, openSites }: { siteDir: string; name: string; openSites: ProjectIpcDeps["openSites"] }, _options = {},
): void {
  // The open window's title, when there is one. There usually is NOT: a card opens its site as a
  // `<webview>` tab inside the sites home window (whose own title is pinned to "Tovu"), and
  // `openSiteServer` is spawn-only. Only "Open Site…"/"Open Recent" produce a titled window
  // (`main.ts`'s `openSiteWindow`). Worth the line anyway — `readSiteName`'s own doc says that
  // title is "what makes Electron's native Window menu double as a site switcher (distinct titles,
  // distinct entries)", so a stale one is a stale CONTROL, not a stale label.
  //
  // "Open Recent" itself needs no refresh: `main.ts` builds those items with the directory path as
  // the label, not the site name, so a rename cannot stale them.
  const openWindow = openSites.get(siteDir)?.window;
  if (openWindow) {
    // The real window has these methods; see `OpenSiteEntry.window`'s optional test seam.
    if (!openWindow.isDestroyed) throw new Error(`Cannot retitle ${siteDir}: its window has no isDestroyed method.`);
    if (!openWindow.isDestroyed()) {
      if (!openWindow.setTitle) throw new Error(`Cannot retitle ${siteDir}: its window has no setTitle method.`);
      openWindow.setTitle(name);
    }
  }
}
