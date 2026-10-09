import assert from "node:assert/strict";
import { chmod, lstat, readdir, rm, access, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from "@playwright/test/reporter";
import type { IsolatedJourneySite } from "./isolated-journey-site.js";

/** Playwright completes task teardown (including its managed web servers) before onEnd. Removing
 * a SQLite site in globalTeardown would instead race servers still holding its files open. */
export default class JourneySiteCleanupReporter implements Reporter {
  private readonly remaining = new Map<string, Set<string>>();
  private readonly pinRuntimes = new Map<string, Set<string>>();
  private readonly notifications: Promise<void>[] = [];
  constructor(private readonly options: { site: IsolatedJourneySite } | { sites: IsolatedJourneySite[] }) {}

  private fileKey(test: TestCase): string {
    return `${test.parent.project()?.name ?? ""}\0${test.location.file}`;
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    for (const test of suite.allTests()) {
      const key = this.fileKey(test);
      const ids = this.remaining.get(key) ?? new Set<string>();
      ids.add(test.id); this.remaining.set(key, ids);
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const key = this.fileKey(test);
    const runtimes = this.pinRuntimes.get(key) ?? new Set<string>();
    for (const attachment of result.attachments) {
      if (attachment.name === "pin-site-owner" && attachment.body) runtimes.add(attachment.body.toString("utf8"));
    }
    this.pinRuntimes.set(key, runtimes);
    if (result.status !== test.expectedStatus && result.status !== "skipped" && result.retry < test.retries) return;
    this.remaining.get(key)?.delete(test.id);
    if (this.remaining.get(key)?.size) return;
    // Public reporter events know when a FILE is complete; a worker fixture alone doesn't, since
    // Playwright reuses workers across files. Notify the owning worker only AFTER test fixture
    // teardown (including contexts). That worker stops its processes and proves deletion; this
    // reporter never deletes another process's site. File-transition/worker-finally are fallbacks.
    for (const runtime of runtimes) {
      const notification = (async () => {
        const dir = path.resolve(runtime);
        assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
        assert.ok(path.basename(dir).startsWith("tovu-journeys-pins-"));
        try {
          const stat = await lstat(dir);
          assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
          await writeFile(path.join(dir, "file-complete"), "complete", { mode: 0o600 });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      })();
      // Reporter hooks are synchronous; retain rejections for onEnd without an unhandled promise.
      void notification.catch(() => {});
      this.notifications.push(notification);
    }
    this.pinRuntimes.delete(key);
  }

  async onEnd(): Promise<void | { status: FullResult["status"] }> {
    const sites = "sites" in this.options ? this.options.sites : [this.options.site];
    const notified = await Promise.allSettled(this.notifications);
    let failed = notified.some((result) => result.status === "rejected");
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
      await makeDirectoriesWritable({ dir: runtimeDir });
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
export async function makeDirectoriesWritable({ dir }: { dir: string }, _optional = {}): Promise<void> {
  await chmod(dir, 0o700);
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) await makeDirectoriesWritable({ dir: path.join(dir, entry.name) });
  }
}
