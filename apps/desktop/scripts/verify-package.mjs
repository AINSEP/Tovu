#!/usr/bin/env node
/**
 * @file The BACKSTOP half of the packaging safety gate. Runs AFTER `electron-builder --mac`, as the
 * final link in `package.json`'s `package` script — it cannot live in `quality-gates.json` because
 * `npm run gates` (which that manifest drives) runs FIRST in that chain, before any `app.asar`
 * exists to inspect:
 *
 *     "package": "npm run gates && npm run build && npm run stage && electron-builder --mac && node scripts/verify-package.mjs"
 *
 * The PRIMARY half — refusing to start a pack while apps/desktop is still moving — is
 * `scripts/check-tree-quiet.mjs`, wired into `quality-gates.json` as the `tree-quiet` gate. Both are
 * required: refusing a dirty tree is free and should catch nearly everything, but this file is what
 * makes a corrupt artifact structurally impossible to ship even if that precondition were ever wrong
 * or bypassed — a corrupt, signed `app.asar` is a shipping incident, and this is the last chance to
 * catch one before it leaves the machine.
 *
 * All comparison logic — and the reasoning for why it must be byte-for-byte, never size, never
 * asar's own recorded integrity hash — lives in `../src/asar-verify.js`, so it is unit-tested
 * (including a DELIBERATE-CORRUPTION test) under the normal `npm test` glob. This file only locates
 * the freshly built `app.asar` and turns the result into an exit code.
 *
 * Usage: node scripts/verify-package.mjs [--asar <path-to-app.asar>]
 * Exit codes: 0 = every file under src/, bin/, main.js is byte-identical to source.
 *             1 = a mismatch was found, or no app.asar could be located.
 */
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { formatMismatchReport, verifyAsarAgainstSource } from "../src/asar-verify.js";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** What this gate verifies — exactly the recommendation in the incident report: the shell's own
 *  code. The staged Tovu payload (`apps/admin/dist`, `apps/site-chat/dist`, the runnable tree under
 *  `extraResources`) has its OWN freshness guard in `stage-payload.mjs` — a different failure, and
 *  explicitly out of scope here. */
const VERIFIED_PREFIXES = ["src", "bin", "main.js"];

/** Every `*.app` bundle under `dir`, recursively. `release/` can hold leftovers from earlier builds
 *  or probes, so finding ONE bundle is not enough on its own — see {@link resolveAsarPath}.
 *  @complexity O(n) in directory entries under `dir`. */
function findAppBundles(dir) {
  const found = [];
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
 * one-off probe build uses); otherwise the most-recently-modified `*.app` under `release/`, since a
 * fresh `electron-builder` run is what just produced it and older probes or other arches may still
 * be sitting in the same output directory.
 *
 * @complexity O(n) in bundles found under `release/`.
 */
function resolveAsarPath(argv) {
  const flagAt = argv.indexOf("--asar");
  if (flagAt !== -1 && argv[flagAt + 1]) return path.resolve(argv[flagAt + 1]);

  const releaseDir = path.join(DESKTOP_ROOT, "release");
  const bundles = findAppBundles(releaseDir);
  if (bundles.length === 0) {
    throw new Error(`verify-package: no *.app bundle found under ${releaseDir} — did electron-builder run?`);
  }
  bundles.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return path.join(bundles[0], "Contents/Resources/app.asar");
}

function main() {
  const argv = process.argv.slice(2);
  let asarPath;
  try {
    asarPath = resolveAsarPath(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
    return;
  }

  process.stdout.write(`verify-package: checking ${asarPath} against source under ${VERIFIED_PREFIXES.join(", ")}\n`);
  const { checkedCount, mismatches } = verifyAsarAgainstSource(asarPath, DESKTOP_ROOT, VERIFIED_PREFIXES);
  process.stdout.write(`verify-package: ${checkedCount} file(s) checked\n`);

  if (mismatches.length > 0) {
    process.stderr.write(`verify-package: ${formatMismatchReport(mismatches)}\n`);
    process.exit(1);
    return;
  }
  process.stdout.write("verify-package: OK — every file byte-identical to source\n");
}

main();
