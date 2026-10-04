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
// Vendor selection and secrets are code coupling. The ordinary verb "resend" and the
// bundled-plugin catalog's opaque package id do not select a mail implementation.
const VENDOR_ID_PATTERN = /\b(?:driver|provider)\s*[:=]\s*["'`](?:resend|postmark|sendgrid|mailgun)["'`]|\b(?:resend|postmark|sendgrid|mailgun)_[a-z0-9_]+\b/gi;

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
  const files = listSourceFiles(SRC_ROOT);
  assert.ok(files.length > 100, `expected the core source tree, found ${files.length} files at ${SRC_ROOT}`);
  for (const file of files) {
    const code = stripComments(file, fs.readFileSync(file, "utf8"));
    const hits = [...(code.match(VENDOR_PATTERN) ?? []), ...(code.match(VENDOR_ID_PATTERN) ?? [])];
    if (hits.length) offenders.push(`${path.relative(SRC_ROOT, file)}: ${[...new Set(hits)].join(", ")}`);
  }
  assert.deepEqual(offenders, []);
});

test("the boundary scanner detects vendor identifiers and environment keys after stripping comments", () => {
  for (const code of ['const driver = "resend";', 'const key = process.env.RESEND_API_KEY;', 'const driver = "SENDGRID";']) {
    assert.ok(stripComments("probe.ts", code).match(VENDOR_ID_PATTERN), code);
  }
  assert.equal(stripComments("probe.ts", '// resend RESEND_API_KEY\nconst driver = "smtp";').match(VENDOR_ID_PATTERN), null);
});
