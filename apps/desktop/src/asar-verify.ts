/**
 * @file Byte-for-byte verification of a packaged `app.asar` against the source tree it was built
 * from — the BACKSTOP half of the packaging safety gate. The PRIMARY half refuses to pack a moving
 * tree at all: see `tree-quiet.ts` + `scripts/check-tree-quiet.ts`, registered as the `tree-quiet`
 * gate in `quality-gates.json`. This half runs AFTER `electron-builder`, from
 * `scripts/verify-package.ts`, because there is no artifact to inspect before that step runs.
 *
 * ## Why this has to compare CONTENT, and never size or asar's own recorded hash
 *
 * `ADS-memory/reports/2026-09-12-packaging-asar-corruption.md` found that packing while
 * `apps/desktop/src` (or its build output) is being written concurrently shifts app.asar's internal
 * file offsets: an asar archive is a JSON header of `{size, offset}` entries followed by one
 * concatenated data region, and if a file's size changes between the header pass and the data pass,
 * every entry after it in the data region is off by the delta. The header still says "this file is N
 * bytes at offset X", and N bytes are duly read at offset X — but those bytes now belong to a
 * DIFFERENT file. The corruption is therefore **length-correct and content-wrong**. Concretely, in
 * the incident that produced this file: `src/tracked-sites.js` in the archive was 20944 bytes — the
 * same length as the real source file — but held the text of `src/tovu-server.js`.
 *
 * That property is exactly why nothing else in the toolchain notices: the archive is structurally
 * valid, `asar list`/`asar extract` both succeed, every path is present at its expected length, code
 * signing hashes the corrupt bytes and signs them validly, and electron-builder exits 0. A SIZE
 * comparison passes the corrupt build — size is the one property that survives intact.
 *
 * It also means the archive's own per-file `integrity.hash` (asar's built-in SHA256, visible via
 * `getRawHeader`) is USELESS here: electron-builder computes that hash from whatever bytes it
 * actually wrote into the data region at pack time, so a shifted-offset file hashes perfectly
 * consistently with its own (wrong) content. Trusting that hash "verifies" a corrupt build just as
 * happily as a clean one. Neither shortcut — size, nor asar's own integrity field — can detect this
 * failure class. Only comparing the shipped bytes against the SOURCE file on disk can.
 *
 * The next person to "optimize" this module is likely to reach for one of those two shortcuts — this
 * comment exists so they don't have to rediscover why both fail from scratch.
 *
 * ## Dependency note
 *
 * `@electron/asar` is NOT yet an explicit entry in `package.json` — it is only present today as a
 * transitive dependency of `electron-builder` (already resolved at 3.4.1 in `package-lock.json`).
 * It should be added explicitly, but that edit was deliberately deferred: adding it to
 * `devDependencies` without also running `npm install` to regenerate the lockfile risks a
 * package.json/package-lock.json mismatch that `npm ci` (used by `.github/workflows/desktop.yml`)
 * would refuse, and running `npm install` while other agents have `apps/desktop` open was judged
 * riskier than the gap. Add `"@electron/asar": "^3.4.1"` to `devDependencies` and run
 * `npm install --prefix apps/desktop` once the tree is quiet.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { extractFile, getRawHeader } from "@electron/asar";

/**
 * What the packaging backstop verifies, matched as TOP-LEVEL `app.asar` entries: the shell's own code —
 * `main.ts`, `src/` (main process + the unsandboxed and sandboxed preload sources), and `dist/` (that same
 * preload code, but the COMPILED artifacts electron actually loads: `dist/preload/preload.mjs`,
 * `dist/speech/preload-speech.cjs`, and `dist/contracts/*.js` — shared modules the compiled preload imports
 * at runtime, see `src/preload/preload.mts`'s `../contracts/*.js` imports — plus `dist/renderer/**`, the
 * sites-home window's UI that `main.ts` loads via `loadFile`). `electron-builder.yml`'s `files:` ships both
 * `src/**` and `dist/**` into the same archive, so both are equally exposed to the length-correct/
 * content-wrong packaging race this module exists to catch (see the file header above) — there is no reason
 * to verify one and not the other.
 *
 * A single top-level `"dist"` entry is deliberately used instead of enumerating `dist/preload`,
 * `dist/speech`, `dist/contracts` individually: {@link filesUnderPrefixes} already walks every nested file
 * under ONE top-level prefix (see its "nested files under a directory prefix" test), so `"dist"` alone
 * covers the whole subtree today AND any subdirectory added under it later, with no enumeration to keep in
 * sync.
 *
 * Deliberately NOT covered — a different failure, out of scope here: the staged Tovu payload
 * (`apps/admin/dist`, `apps/site-chat/dist`, the runnable tree under `extraResources`), which has its own
 * freshness guard in `scripts/stage-payload.ts`.
 */
export const VERIFIED_PREFIXES: string[] = ["src", "bin", "main.ts", "dist"];

/** A node in an asar header's `files` tree, as far as this module reads one: a directory carries
 *  `files`, a symlink carries `link`, and a file carries `size` and `offset`. */
interface AsarHeaderNode {
  files?: Record<string, AsarHeaderNode>;
  link?: string;
  size?: number;
  offset?: string;
}

/** One file whose shipped bytes do not match source, and why. */
interface AsarMismatch {
  relPath: string;
  reason: string;
}

/** {@link verifyAsarAgainstSource}'s result. */
interface AsarVerification {
  checkedCount: number;
  mismatches: AsarMismatch[];
}

/**
 * Every leaf FILE path (POSIX, no leading slash) under one of `prefixes` in an asar header's `files`
 * metadata tree. Pure and dependency-free — takes the already-parsed header object rather than an
 * archive path — so the tree-walk itself (files vs. directories vs. symlinks, and a prefix that
 * names a file directly, like `"main.ts"`, vs. one that names a directory, like `"src"`) is testable
 * against a plain object literal fixture, with no real `.asar` file anywhere near the test.
 *
 * @param headerFiles the `files` object from `getRawHeader(archivePath).header`.
 * @param prefixes top-level entry names to include, e.g. `["src", "bin", "main.ts"]`. A prefix
 *   absent from the archive is silently skipped — that is a scope decision for the caller, not
 *   something this function should fail on.
 * @returns POSIX-style relative paths, e.g. `"src/tracked-sites.ts"`.
 * @complexity O(n) in archive entries under the given prefixes.
 */
export function filesUnderPrefixes(headerFiles: Record<string, AsarHeaderNode> | undefined, prefixes: string[]): string[] {
  const collected: string[] = [];

  function walk(node: AsarHeaderNode, currentPath: string): void {
    if (node && typeof node === "object" && node.files) {
      for (const [name, child] of Object.entries(node.files)) {
        walk(child, `${currentPath}/${name}`);
      }
      return;
    }
    // A leaf is either a file (`size`/`offset`) or a symlink (`link`). Symlinks carry no bytes of
    // their own to compare and this repo's desktop archive has none under src/bin, so they are
    // simply excluded rather than treated as an error.
    if (node && typeof node === "object" && !("link" in node)) {
      collected.push(currentPath);
    }
  }

  for (const prefix of prefixes) {
    const node = headerFiles?.[prefix];
    if (node) walk(node, prefix);
  }
  return collected;
}

/** One mismatch, rendered — every failing path named individually and why. A gate that says
 *  "corrupt" without saying which files sends the next person hunting through a multi-hundred-MB
 *  archive by hand, which is exactly what this incident required the first time.
 *  @complexity O(1). */
function formatMismatch({ relPath, reason }: AsarMismatch): string {
  return `  MISMATCH  ${relPath}  — ${reason}`;
}

/**
 * The full mismatch report for a human. Pure formatting only — no filesystem, no archive access.
 *
 * @param mismatches as produced by {@link verifyAsarAgainstSource}.
 * @complexity O(n) in mismatches.
 */
export function formatMismatchReport(mismatches: AsarMismatch[]): string {
  return [
    `${mismatches.length} file(s) in app.asar do NOT match source, byte-for-byte:`,
    ...mismatches.map(formatMismatch),
    "This is the length-correct/content-wrong signature of a packaging race (source tree edited " +
      "mid-pack shifts app.asar's internal file offsets) — see this file's header comment and " +
      "ADS-memory/reports/2026-09-12-packaging-asar-corruption.md for the full mechanism.",
  ].join("\n");
}

/**
 * Compares every file {@link filesUnderPrefixes} finds under `prefixes` in `asarPath` against the
 * same relative path under `sourceRoot`, byte-for-byte via `Buffer#equals` — never length, never a
 * hash. This is the one impure function in this module: it reads a real archive and a real
 * filesystem. It is kept here anyway (rather than moved into `scripts/`, this repo's usual home for
 * anything that touches disk) specifically so it stays under `src/**\/*.test.ts` and can be proven,
 * against a real built-then-corrupted fixture archive, to actually catch the failure it exists for
 * — see `asar-verify.test.ts`.
 *
 * @param asarPath path to the built `app.asar`.
 * @param sourceRoot the source tree root the archive should match (`apps/desktop` in production).
 * @param prefixes top-level archive entries to check, e.g. `["src", "bin", "main.ts"]`.
 * @returns `{ checkedCount, mismatches }` — `mismatches` is `[]` when every file matched.
 * @complexity O(n) in files checked, each a full read of both copies.
 */
export function verifyAsarAgainstSource(asarPath: string, sourceRoot: string, prefixes: string[]): AsarVerification {
  const { header } = getRawHeader(asarPath);
  const relPaths = filesUnderPrefixes(header.files, prefixes);

  const mismatches: AsarMismatch[] = [];
  for (const relPath of relPaths) {
    const sourcePath = path.join(sourceRoot, relPath);
    let sourceBuf: Buffer;
    try {
      sourceBuf = readFileSync(sourcePath);
    } catch {
      mismatches.push({ relPath, reason: "shipped in app.asar but missing from the source tree" });
      continue;
    }
    // No leading slash: `extractFile`'s path argument is resolved relative to the archive root by
    // splitting on the OS path separator (`filesystem.js`'s `searchNodeFromDirectory`), and a
    // leading "/" produces a spurious empty first segment that walks into a fresh, empty directory
    // node instead of the real root — silently "not found" for every nested path. This is the
    // opposite convention from `listPackage()`'s OUTPUT, which prefixes every entry with "/" for
    // display; that display format is not the input format `extractFile` expects.
    const shippedBuf = extractFile(asarPath, relPath);
    if (!sourceBuf.equals(shippedBuf)) {
      mismatches.push({
        relPath,
        reason: "content differs from source (sizes can still match — this is compared byte-for-byte, never by length)",
      });
    }
  }

  return { checkedCount: relPaths.length, mismatches };
}

export type { AsarHeaderNode, AsarMismatch, AsarVerification };
