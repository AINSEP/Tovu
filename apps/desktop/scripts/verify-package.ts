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
 * into an exit code. The lookup and exit-code decision live in `../src/verify-package-cli.ts`
 * (tested there with fakes); this file only binds the real filesystem, verifier, and streams.
 *
 * Usage: node scripts/verify-package.ts [--asar <path-to-app.asar>]
 * Exit codes: 0 = every file under VERIFIED_PREFIXES is byte-identical to source.
 *             1 = a mismatch was found, or no app.asar could be located.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { VERIFIED_PREFIXES, bundledNpmFailures, formatMismatchReport, isEmptyVerification, verifyAsarAgainstSource } from "../src/asar-verify.ts";
import { runVerifyPackage } from "../src/verify-package-cli.ts";

const DESKTOP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

process.exitCode = runVerifyPackage({ argv: process.argv.slice(2), desktopRoot: DESKTOP_ROOT }, {
  fs: { existsSync, readdirSync, statSync },
  verify: verifyAsarAgainstSource, isEmptyVerification, formatMismatchReport, bundledNpmFailures,
  prefixes: VERIFIED_PREFIXES, stdout: process.stdout, stderr: process.stderr,
});
