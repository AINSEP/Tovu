import { renameSiteFolder } from "../../platform/site-dir/move-sites-home.js";

/** Rename a local folder through the shared stopped-site mover and report committed paths.
 * @throws Validation, running-site, collision and verified relocation errors from the owner.
 * @example await runSiteRenameCommand({ oldName: "old-site", newName: "new-site" });
 * @complexity The site's bytes and database verification, delegated to renameSiteFolder.
 */
export async function runSiteRenameCommand(
  input: { oldName: string; newName: string },
  { rename = renameSiteFolder, writeStdout = (text: string) => process.stdout.write(text) }: {
    rename?: typeof renameSiteFolder; writeStdout?: (text: string) => void;
  } = {},
): Promise<void> {
  const changed = await rename(input);
  writeStdout(`${JSON.stringify(changed)}\n`);
}
