/**
 * @file Fails when the seeded default admin credentials appear anywhere in shipped UI source.
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 * `apps/admin/src/features/auth/Login.tsx` rendered
 * `local dev default: admin / <the default password>` unconditionally, so the production sign-in
 * page at tovu.fly.dev published a working username and password to anyone who loaded it.
 *
 * It had been fixed twice before (once by deleting the hint, once by gating it to dev builds) and
 * came back both times — most recently on 2026-09-02, when a force-push of this branch over the
 * public deploy mirror reverted the fix, because the branch predated it. A regression that
 * returns three times through three different routes is not a thing to remember; it is a thing to
 * gate.
 *
 * ---------------------------------------------------------------------------
 * What it checks, and why this shape
 * ---------------------------------------------------------------------------
 * The password's VALUE is read from {@link DEFAULT_OWNER_PASSWORD} rather than written here as a
 * literal. Two consequences, both deliberate:
 *   - changing the default in `wiring.ts` cannot silently un-protect this check;
 *   - this file never itself contains the credential, so it does not trip the sibling
 *     `secret-scan-guard.ts` (whose own test file did exactly that and turned CI red).
 *
 * Scope is `apps/admin/src` — the code that becomes the browser bundle a logged-out visitor can
 * fetch. Server source is deliberately NOT scanned: `wiring.ts` must name the default to seed the
 * owner account, and `apps/website`'s own tests legitimately authenticate with it. The invariant
 * is "the default never reaches a shipped UI string", not "the default is never written down".
 *
 * A gate-to-dev-builds fix was considered and rejected. A hint that only has to be correct about
 * its own build environment is a hint that can be wrong in production, and the failure mode there
 * is publishing credentials. There is no legitimate reason for the admin bundle to contain the
 * default password at all, so the check is absolute rather than conditional.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { DEFAULT_OWNER_PASSWORD } from "./wiring.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..", "..");

/** The shipped admin UI. Its build output is served to anyone who can reach `/admin/`. */
const SCANNED_ROOTS = ["apps/admin/src"] as const;

const SCANNED_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".css", ".html"]);

export interface DefaultCredentialHit {
  readonly file: string;
  readonly line: number;
}

/** Directory (or file) names never worth walking into or scanning: build output, dependencies,
 *  and test sources. Test sources are excluded because they are not reachable from the Vite entry
 *  point and so never enter the browser bundle a logged-out visitor can fetch. This is the one
 *  content-scope exclusion, and it is a statement about what ships, not a convenience:
 *  `api-request-unreachable.unit.test.ts` legitimately authenticates with the default to exercise
 *  an unreachable-API path. A test that renders the credential into a COMPONENT would still be
 *  caught, because the component itself is scanned. */
const SKIPPED_ENTRY_NAMES = new Set(["node_modules", "dist", ".vite", "__tests__"]);

/** True iff `entry` is a scannable source file this check must inspect. */
function isScannableFile(entry: string): boolean {
  return SCANNED_EXTENSIONS.has(path.extname(entry)) && !/\.(test|spec)\.[jt]sx?$/.test(entry);
}

/** `readdirSync`, or `[]` for a directory that cannot be listed (missing, not a directory,
 *  permission denied) — a walk that hits an unreadable directory should skip it, not throw. */
function readDirEntries(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** `true`/`false`/`null` for "is a directory" / "is a file" / "could not stat" (deleted between
 *  listing and stat, a broken symlink, or a permission error) — `null` tells the caller to skip the
 *  entry entirely rather than mis-scan it as either shape. */
function statIsDirectory(fullPath: string): boolean | null {
  try {
    return statSync(fullPath).isDirectory();
  } catch {
    return null;
  }
}

/** Recursively lists scannable files under `dir`, skipping build output and dependencies. */
function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readDirEntries(dir)) {
    if (SKIPPED_ENTRY_NAMES.has(entry)) continue;

    const full = path.join(dir, entry);
    const isDir = statIsDirectory(full);
    if (isDir === null) continue;

    if (isDir) {
      out.push(...listFiles(full));
    } else if (isScannableFile(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Returns every line in `text` containing `secret`. Exported so the test can exercise the matcher
 * on synthetic input without touching the filesystem.
 *
 * @complexity O(n) in the text length.
 */
export function findSecretInText(text: string, secret: string): number[] {
  const lines: number[] = [];
  text.split("\n").forEach((line, index) => {
    if (line.includes(secret)) lines.push(index + 1);
  });
  return lines;
}

/**
 * Scans the shipped admin UI for the seeded default password.
 *
 * @returns One entry per offending line. Empty means the invariant holds.
 */
export function scanForDefaultCredentialExposure(): DefaultCredentialHit[] {
  const hits: DefaultCredentialHit[] = [];
  for (const root of SCANNED_ROOTS) {
    const abs = path.join(REPO_ROOT, root);
    for (const file of listFiles(abs)) {
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      for (const line of findSecretInText(text, DEFAULT_OWNER_PASSWORD)) {
        hits.push({ file: path.relative(REPO_ROOT, file), line });
      }
    }
  }
  return hits;
}

function main(): void {
  const hits = scanForDefaultCredentialExposure();
  if (hits.length === 0) {
    console.log("check:default-credential — OK: the admin UI does not contain the default password.");
    return;
  }
  console.error(`check:default-credential — the seeded default password appears in ${hits.length} shipped UI line(s):`);
  for (const hit of hits) console.error(`  - ${hit.file}:${hit.line}`);
  console.error(
    "\nThe admin bundle is served to anyone who can reach /admin/, so this publishes working " +
      "credentials. Delete the occurrence. Do not gate it behind a dev-build check: a hint that " +
      "has to be right about its own build environment can be wrong in production.",
  );
  process.exit(1);
}

// Guarded so importing this module from a test does not scan the real repo and exit the runner.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
