// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; selectors and flows unverified.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Fresh-build gate for the desktop journeys (SCOPE.md §3.2). `electron .` loads whatever is in
 * `apps/desktop/dist/`, so a stale renderer or preload would make every journey test yesterday's
 * code (or blank the window when the preload bridge lost a method). This builds the preload and
 * renderer, then fails loud if any built output is still older than its newest source.
 *
 * The guest admin is NOT built here: each `tovu serve` child serves `apps/admin/dist`. This only
 * refuses to start when that build is missing or older than `apps/admin/src`, and names the command.
 */
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const DESKTOP_DIR = path.join(REPO_ROOT, "apps", "desktop");
const ADMIN_DIR = path.join(REPO_ROOT, "apps", "admin");

function newestMtime(dir: string, skip: (rel: string) => boolean = () => false): number {
  let newest = 0;
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const rel = path.relative(dir, full);
      if (skip(rel)) continue;
      if (entry.isDirectory()) walk(full);
      else newest = Math.max(newest, fs.statSync(full).mtimeMs);
    }
  };
  walk(dir);
  return newest;
}

const isTestFile = (rel: string) => /(^|\/)(__tests__|node_modules)(\/|$)|\.test\.tsx?$/.test(rel);

function assertFresh(built: string, sourceDir: string, fix: string): void {
  if (!fs.existsSync(built)) throw new Error(`desktop journeys: ${built} is missing. ${fix}`);
  const builtAt = fs.statSync(built).mtimeMs;
  const sourceAt = newestMtime(sourceDir, isTestFile);
  if (builtAt < sourceAt) {
    throw new Error(`desktop journeys: ${built} is older than the newest file in ${sourceDir}. ${fix}`);
  }
}

export default async function desktopGlobalSetup(): Promise<void> {
  execFileSync("npm", ["run", "build"], { cwd: DESKTOP_DIR, stdio: "inherit" });
  assertFresh(path.join(DESKTOP_DIR, "dist", "renderer", "index.html"), path.join(DESKTOP_DIR, "src", "renderer"), "The renderer build did not refresh it.");
  assertFresh(path.join(DESKTOP_DIR, "dist", "preload", "preload.mjs"), path.join(DESKTOP_DIR, "src", "preload"), "The preload build did not refresh it.");
  assertFresh(path.join(ADMIN_DIR, "dist", "index.html"), path.join(ADMIN_DIR, "src"), "Run `npm run build` in apps/admin first; the site tab's guest admin is served from that build.");
}
