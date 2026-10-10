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
import path from "node:path";
import * as asar from "@electron/asar";
import { filesUnderPrefixes as files, verifyAsarAgainstSource as verify, toArchiveEntryPath as entryPath, isEmptyVerification as empty, bundledNpmFailures as npmFailures, createNodePackagingFilesystem, createAsarArchiveReader } from "@jini-ai/devops/packaging/electron";
import type { AsarHeaderNode, AsarMismatch, AsarVerification } from "@jini-ai/devops/packaging/electron";
export type { AsarHeaderNode, AsarMismatch, AsarVerification };
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

/** Compare content through shared verification, binding the host filesystem and archive SDK. */
export function verifyAsarAgainstSource(asarPath: string, sourceRoot: string, prefixes: string[]): AsarVerification {
  return verify({ archivePath: asarPath, sourceRoot, prefixes, separator: path.sep, fs: createNodePackagingFilesystem({}), archive: createAsarArchiveReader({ asar }) }, {
    readFailureMessage: ({ error }) => `present in the asar header but extractFile could not read it (${(error as Error).message})`,
    contentMismatchMessage: "content differs from source (sizes can still match — this is compared byte-for-byte, never by length)",
  });
}
export const filesUnderPrefixes = (headerFiles: Record<string, AsarHeaderNode> | undefined, prefixes: string[]) => files({ headerFiles, prefixes });
export const isEmptyVerification = (checkedCount: number) => empty({ checkedCount });
export const toArchiveEntryPath = (relPath: string, sep: string = path.sep) => entryPath({ relPath, separator: sep });
/**
 * The bundled npm's missing load-bearing files across `resourcesDirs`, as report lines — checked on
 * disk, not in the asar, because `extraResources` ships `Resources/npm/` as real files outside it
 * (`plan-desktop-bundled-npx-2026-09-24.md` §5, §6 S5). `bin/npx-cli.js` proves npm staged;
 * `node_modules/@npmcli/arborist/package.json` proves the SEPARATE `staging/npm/node_modules`
 * `extraResources` entry ran, which electron-builder's copy filter silently drops otherwise.
 *
 * An empty `resourcesDirs` is itself a failure: checking nothing must never read as a clean pass,
 * the same rule {@link isEmptyVerification} applies to the asar comparison.
 *
 * @returns one line per missing file, or `[]` when every dir has both.
 * @complexity O(n) in `resourcesDirs.length`.
 */
export function bundledNpmFailures(resourcesDirs: string[]): string[] {
  const fs = createNodePackagingFilesystem({});
  const requiredFiles = ["npm/bin/npx-cli.js", "npm/node_modules/@npmcli/arborist/package.json"];
  if (!resourcesDirs.length) return npmFailures({ resourcesDirs, requiredFiles, fs });
  return resourcesDirs.flatMap(dir => npmFailures({ resourcesDirs: [dir], requiredFiles, fs }).map(file => `${file} (under ${dir})`));
}
