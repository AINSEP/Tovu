#!/usr/bin/env node
/**
 * @file The BACKSTOP half of the packaging safety gate. Runs AFTER `electron-builder --mac`, as the
 * final link in `package.json`'s `package` script — it cannot live in `quality-gates.json` because
 * `npm run gates` (which that manifest drives) runs FIRST in that chain, before any `app.asar`
 * exists to inspect:
 *
 *     "package": "npm run gates && npm run build && npm run stage && electron-builder --mac && node scripts/verify-package.ts"
 *
 * The PRIMARY half — refusing to start a pack while apps/desktop is still moving — is
 * `scripts/check-tree-quiet.ts`, wired into `quality-gates.json` as the `tree-quiet` gate. Both are
 * required: refusing a dirty tree is free and should catch nearly everything, but this file is what
 * makes a corrupt artifact structurally impossible to ship even if that precondition were ever wrong
 * or bypassed — a corrupt, signed `app.asar` is a shipping incident, and this is the last chance to
 * catch one before it leaves the machine.
 *
 * All comparison logic — the checked prefix list (`VERIFIED_PREFIXES`), and the reasoning for why the
 * comparison must be byte-for-byte, never size, never asar's own recorded integrity hash — lives in
 * `../src/asar-verify.ts`, so it is unit-tested (including a DELIBERATE-CORRUPTION test) under the
 * normal `npm test` glob. This file only locates the freshly built `app.asar` and turns the result
 * into an exit code.
 *
 * Usage: node scripts/verify-package.ts [--asar <path-to-app.asar>]
 * Exit codes: 0 = every file under VERIFIED_PREFIXES is byte-identical to source.
 *             1 = a mismatch was found, or no app.asar could be located.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { VERIFIED_PREFIXES, formatMismatchReport, isEmptyVerification, verifyAsarAgainstSource } from "../src/asar-verify.ts";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Every `*.app` bundle under `dir`, recursively. `release/` can hold leftovers from earlier builds
 *  or probes, so finding ONE bundle is not enough on its own — see {@link resolveAsarPath}.
 *  @complexity O(n) in directory entries under `dir`. */
function findAppBundles(dir: string): string[] {
  const found: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (entry.name.endsWith(".app")) found.push(full);
    else found.push(...findAppBundles(full));
  }
  return found;
}

/**
 * The `app.asar` to verify: an explicit `--asar` wins (what a deliberate-corruption drill or a
 * one-off probe build uses); otherwise the most-recently-modified candidate found under `release/`,
 * across BOTH packaged layouts electron-builder produces:
 *   - macOS: any `.app` bundle under a `mac`-prefixed output directory, e.g.
 *     `release/mac-arm64/Tovu.app/Contents/Resources/app.asar` — `findAppBundles` already walks the
 *     whole tree, so `mac-arm64`, plain `mac`, or any other `mac`-prefixed directory is found with
 *     no glob needed (NOTE: do not write a literal asterisk immediately followed by a slash in this
 *     comment block — it closes the JSDoc block comment early and the rest parses as code).
 *   - Windows: `release/win-unpacked/resources/app.asar` — `win-unpacked` has no `.app` bundle at
 *     all, so it is checked for directly.
 * A fresh `electron-builder` run is what just produced the newest one; older probes or other arches
 * may still be sitting in the same output directory, so only the candidate's own `app.asar` mtime
 * (not the bundle directory's) decides "newest" across the two shapes uniformly.
 *
 * @complexity O(n) in bundles found under `release/`.
 */
function resolveAsarPath(argv: string[]): string {
  const flagAt = argv.indexOf("--asar");
  // `!`: only read once the check to its left has confirmed the arg after `--asar` is present.
  if (flagAt !== -1 && argv[flagAt + 1]) return path.resolve(argv[flagAt + 1]!);

  const releaseDir = path.join(DESKTOP_ROOT, "release");
  const candidates = findAppBundles(releaseDir).map((bundle) => path.join(bundle, "Contents/Resources/app.asar"));
  const winUnpackedAsar = path.join(releaseDir, "win-unpacked", "resources", "app.asar");
  candidates.push(winUnpackedAsar);

  const existing = candidates.filter((candidate) => existsSync(candidate));
  if (existing.length === 0) {
    throw new Error(
      `verify-package: no app.asar found under ${releaseDir} (checked *.app bundles and win-unpacked) — did electron-builder run?`,
    );
  }
  existing.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  // `!`: `existing.length === 0` above already threw, so index 0 exists.
  return existing[0]!;
}

function main(): void {
  const argv = process.argv.slice(2);
  let asarPath: string;
  try {
    asarPath = resolveAsarPath(argv);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
    return;
  }

  process.stdout.write(`verify-package: checking ${asarPath} against source under ${VERIFIED_PREFIXES.join(", ")}\n`);
  const { checkedCount, mismatches } = verifyAsarAgainstSource(asarPath, DESKTOP_ROOT, VERIFIED_PREFIXES);
  process.stdout.write(`verify-package: ${checkedCount} file(s) checked\n`);

  if (isEmptyVerification(checkedCount)) {
    process.stderr.write(
      "verify-package: verified nothing — path-separator or prefix bug (see asar-verify.ts's " +
        "toArchiveEntryPath doc comment); this is a failure, not a clean pass\n",
    );
    process.exit(1);
    return;
  }

  if (mismatches.length > 0) {
    process.stderr.write(`verify-package: ${formatMismatchReport(mismatches)}\n`);
    process.exit(1);
    return;
  }
  process.stdout.write("verify-package: OK — every file byte-identical to source\n");
}

main();
