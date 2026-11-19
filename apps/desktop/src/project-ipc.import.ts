import { shareSiteDirectories } from "./shared-sites.ts";
import path from "node:path";
import { uniqueSiteName } from "./site-name-policy.ts";
import type { SiteArchiveSource } from "./site-archive-import.ts";
import { readTrackedSites } from "./tracked-sites.ts";
import { type ProjectIpcDeps } from "./project-ipc.types.ts";
import { otherSiteNames, rememberSiteAlias, rememberSiteName } from "./project-ipc.catalog.ts";
import { buildSiteRecord } from "./project-ipc.records.ts";
import { recordCreatedSite } from "./project-ipc.create.ts";


/**
 * "Add Tovu Website" — track a folder that ALREADY holds a Tovu site.
 *
 * The sibling of {@link handleCreate}, and the difference is the entire point: `create` takes an
 * EMPTY folder and runs `tovu init` into it, while this one takes a folder that is already a site
 * and writes nothing but a registry row. `adoptSiteDir` cannot be reused here for exactly that
 * reason — it is `resolveOrInitSiteDir({onMissingSite: "init"})`, so handing it an empty folder
 * creates a site there, which for this verb is the operator's mistake being silently acted on
 * rather than reported.
 *
 * It also closes the old confusion where "Create website" adopted a picked existing site.
 * Create now chooses a free directory under sites home; Add owns the existing-folder choice.
 *
 * Main owns the existing-folder dialog, so the renderer never names a path.
 *
 * The row is recorded `adopted` by `addSitePointer` itself, never `created`, so
 * `project-delete-guard.ts` can never let a later delete erase a folder this app did not make.
 *
 * @returns null when the folder picker is cancelled.
 * @throws {AddSitePointerError} when the folder is not a
 *   complete Tovu site — either way an operator-facing message that names the fix.
 * @complexity O(n) in the tracked-project count, plus one classification.
 */
export async function handleAddSite(
  deps: Pick<ProjectIpcDeps, "dialog" | "addSitePointer" | "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions" | "sharedSites" | "siteRuntime">,
  input: { folder?: unknown } = {},
) {
  // A dropped folder arrives with its path; everything else goes through main's own dialog.
  const folder = input.folder === undefined ? await pickSiteFolder(deps) : droppedPath({ value: input.folder });
  if (folder === null) return null;

  const { siteDir, alreadyTracked } = deps.addSitePointer({ siteDir: folder, projectsPath: deps.projectsPath }, { workspace: deps.sharedSites });
  if (deps.sharedSites) shareSiteDirectories({ workspace: deps.sharedSites, dirs: [siteDir], createdBy: "Desktop", allowRelocation: true });
  // addSitePointer just tracked this exact siteDir above.
  const row = readTrackedSites({ projectsPath: deps.projectsPath }).find((entry) => entry.siteDir === siteDir);
  if (!row) throw new Error(`Added site ${siteDir} is missing from tracked projects.`);
  // Read back rather than synthesized: an already-tracked folder keeps its ORIGINAL `createdAt` and
  // origin, and a fabricated row would report today's date and reorder the operator's grid.
  if (!alreadyTracked) {
    const originalName = deps.readSiteName({ siteDir });
    const displayName = uniqueSiteName({ name: originalName, names: otherSiteNames({ deps, siteDir }) });
    row.displayNameAlias = displayName !== originalName ? displayName : undefined;
    rememberSiteAlias({ projectsPath: deps.projectsPath, siteDir, displayNameAlias: row.displayNameAlias });
  }
  const record = buildSiteRecord(row, deps);
  rememberSiteName({ projectsPath: deps.projectsPath, siteDir, displayName: record.displayName });
  return { ...record, alreadyTracked };
}

/** Main's folder dialog; `null` when cancelled, which is a completed choice, not a failure to show. */
async function pickSiteFolder(deps: Pick<ProjectIpcDeps, "dialog">): Promise<string | null> {
  const picked = await deps.dialog.showOpenDialog({
    title: "Choose your Tovu website's folder",
    message: "Pick a folder that already contains a Tovu website. Nothing in it will be changed.",
    buttonLabel: "Add website",
    // No `createDirectory`: a folder the operator makes in this dialog is
    // empty by definition, and an empty folder is precisely what this verb refuses. Offering the
    // button would invite the one mistake the refusal then has to explain.
    properties: ["openDirectory"],
  });
  const [folder] = picked.filePaths;
  return picked.canceled || folder === undefined ? null : folder;
}

/** A path the renderer read off a drop. What it holds is checked by the verb it goes to. */
function droppedPath({ value }: { value: unknown }): string {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new Error("That drop did not include a location on this computer. Use the Choose button instead.");
  return value;
}

/** A dropped archive: it must at least be a .zip on this computer; what is inside it is checked by the importer. */
function droppedArchive({ value }: { value: unknown }): SiteArchiveSource {
  const file = droppedPath({ value });
  if (!/\.zip$/i.test(file)) throw new Error("That is not a .tovu.zip file. Export a website from Tovu to get one.");
  return { file };
}

/** Main's archive file dialog; `null` when cancelled, which is a completed choice, not a failure. */
async function pickArchive(deps: Pick<ProjectIpcDeps, "dialog">): Promise<SiteArchiveSource | null> {
  const picked = await deps.dialog.showOpenDialog({ title: "Choose a .tovu.zip file", buttonLabel: "Import website",
    properties: ["openFile"], filters: [{ name: "Tovu website", extensions: ["zip"] }] });
  const [file] = picked.filePaths;
  return picked.canceled || file === undefined ? null : { file };
}

/** Which archive to import; `null` when the dialog was cancelled. Remote input is checked by the importer. */
async function archiveSource(
  { input }: { input: { file?: unknown; url?: unknown; pick?: unknown } | null | undefined },
  deps: Pick<ProjectIpcDeps, "dialog">,
): Promise<SiteArchiveSource | null> {
  if (typeof input?.url === "string") return { url: input.url };
  if (input?.file !== undefined) return droppedArchive({ value: input.file });
  if (input?.pick !== true) throw new Error("Import needs a file or a share link.");
  return pickArchive(deps);
}

/**
 * A .tovu.zip or share link becomes a new tracked site: `importSiteArchive` makes it, or rolls it
 * back and rejects with the reason, and it then ends the way Create does.
 * @returns the new record and the importer's notices; `null` when the dialog or the import was cancelled.
 * @complexity One child process, then {@link recordCreatedSite}.
 */
export async function handleImportArchive(
  input: Parameters<typeof archiveSource>[0]["input"],
  deps: Pick<ProjectIpcDeps, "dialog" | "importSiteArchive" | "cliMode" | "projectsPath" | "openSites" | "readSiteName" | "repoRoot" | "readPreviewVersion" | "transitions" | "siteFolders" | "sharedSites" | "siteRuntime">,
) {
  const source = await archiveSource({ input }, deps);
  if (source === null) return null;
  const imported = await deps.importSiteArchive({ source, repoRoot: deps.repoRoot, cliMode: deps.cliMode });
  if (imported === null) return null;
  const displayName = uniqueSiteName({ name: deps.readSiteName({ siteDir: imported.dir }), names: otherSiteNames({ deps, siteDir: imported.dir }) });
  return { ...recordCreatedSite({ siteDir: imported.dir, displayName }, deps), warnings: imported.warnings };
}
