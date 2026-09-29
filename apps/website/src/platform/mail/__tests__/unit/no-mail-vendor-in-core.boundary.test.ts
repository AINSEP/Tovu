import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { stripComments } from "#src/platform/db/kernel/__tests__/raw-sqlite-scan";

/**
 * @file Boundary: hosted mail providers live in Agent Plugins (`content/agent-plugins/<id>/`), loaded
 * through `features/agent-plugins/mail-adapter-registry.ts`. No core source file may name one in code
 * (comments are blanked first, so prose naming a provider as an example does not count). Tests are
 * exempt: they exercise the bundled plugin by name.
 */

const SRC_ROOT = path.resolve(import.meta.dirname, "../../../..");

/** Provider names, API hosts and the old in-core adapter class. */
const VENDOR_PATTERN = /\bResend\b|resend\.com|HttpApiMailerAdapter|\bPostmark\b|postmarkapp\.com|\bSendGrid\b|sendgrid\.com|\bMailgun\b|mailgun\.net/g;

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) files.push(full);
  }
  return files;
}

test("no core source file names a hosted mail provider in code", () => {
  const offenders: string[] = [];
  for (const file of listSourceFiles(SRC_ROOT)) {
    const code = stripComments(file, fs.readFileSync(file, "utf8"));
    const hits = code.match(VENDOR_PATTERN);
    if (hits) offenders.push(`${path.relative(SRC_ROOT, file)}: ${[...new Set(hits)].join(", ")}`);
  }
  assert.deepEqual(offenders, []);
});
