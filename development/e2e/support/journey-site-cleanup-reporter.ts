import assert from "node:assert/strict";
import { chmod, lstat, readdir, rm, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FullResult, Reporter } from "@playwright/test/reporter";
import type { IsolatedJourneySite } from "./isolated-journey-site.js";

/** Playwright completes task teardown (including its managed web servers) before onEnd. Removing
 * a SQLite site in globalTeardown would instead race servers still holding its files open. */
export default class JourneySiteCleanupReporter implements Reporter {
  constructor(private readonly options: { site: IsolatedJourneySite } | { sites: IsolatedJourneySite[] }) {}

  async onEnd(): Promise<void | { status: FullResult["status"] }> {
    const sites = "sites" in this.options ? this.options.sites : [this.options.site];
    let failed = false;
    for (const site of sites) {
      if (!await this.deleteSite(site)) failed = true;
    }
    if (failed) return { status: "failed" };
  }

  private async deleteSite(site: IsolatedJourneySite): Promise<boolean> {
    try {
      assert.equal(site.ownerPid, process.pid, "Only delete this runner's isolated journey site");
      const runtimeDir = path.resolve(site.runtimeDir);
      assert.equal(path.dirname(runtimeDir), path.resolve(os.tmpdir()), "Journey runtime must be a direct temp child");
      assert.ok(path.basename(runtimeDir).startsWith("tovu-journeys-"), "Journey runtime must use the journeys prefix");
      assert.equal(path.resolve(site.siteDir), path.join(runtimeDir, "sites", "journey-site"));
      const stat = await lstat(runtimeDir);
      assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), "Journey runtime must be a real directory");
      await makeDirectoriesWritable(runtimeDir);
      await rm(runtimeDir, { recursive: true });
      await assert.rejects(access(runtimeDir), { code: "ENOENT" });
      await assert.rejects(access(site.siteDir), { code: "ENOENT" });
      console.log(`[journeys cleanup] Deleted isolated site and runtime: ${runtimeDir}`);
      return true;
    } catch (error) {
      console.error("[journeys cleanup] Could not prove isolated site deletion:", error);
      return false;
    }
  }
}

/** Installed agent-plugin packages are stored read-only (content-addressed `package/sha256/<hash>`
 * dirs are 0555), and unlinking a file needs write permission on its directory, so a plain
 * recursive rm fails with EACCES. Only directories need it; symlinks are never followed. */
async function makeDirectoriesWritable(dir: string): Promise<void> {
  await chmod(dir, 0o700);
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) await makeDirectoriesWritable(path.join(dir, entry.name));
  }
}
