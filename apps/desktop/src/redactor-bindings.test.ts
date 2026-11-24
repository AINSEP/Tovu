import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { redactLocalText } from "@jini-ai/diagnostics/local-text";
import { redactTovuLocalText } from "@tovu/contracts/diagnostics-redaction";

/**
 * @file Pins the desktop production redactor bindings (rv1123n FIX 12). The neutral Jini redactor does
 * not know Tovu's own credential shape, so a desktop path that quietly rebinds to it would leak a
 * Tovu application key into logs, smoke output or the agent transcript while every other test stays
 * green. Two checks: the two redactors really differ on a Tovu-pattern key (so the pin can tell them
 * apart), and each production file that scrubs text imports the Tovu-bound one and never the plain one.
 */

// Built in pieces so no secret-shaped literal sits in the source: `tovu_ak_<12 hex>.<24 token chars>`.
const TOKEN = "Z9y8X7w6V5u4T3s2R1q0P9o8";
const KEY = `tovu_ak_${["abcdef012345", TOKEN].join(".")}`;

test("redactTovuLocalText scrubs a Tovu application key that the plain redactor leaves in place", () => {
  const text = `upstream rejected ${KEY}`;
  assert.equal(redactTovuLocalText({ text }).includes(TOKEN), false);
  assert.equal(redactLocalText({ text }).includes(TOKEN), true, "the plain redactor must not already cover Tovu keys, or this pin tells nothing");
});

const DESKTOP_ROOT = path.resolve(import.meta.dirname, "..");
const BOUND_FILES = [
  "src/desktop-agent-service.ts",
  "src/tovu-server.ts",
  "src/smoke-bridge.ts",
  "scripts/check-tree-quiet.ts",
];

for (const file of BOUND_FILES) {
  test(`${file} scrubs with redactTovuLocalText, not the plain redactor`, () => {
    const source = readFileSync(path.join(DESKTOP_ROOT, file), "utf8");
    assert.match(source, /import \{[^}]*\bredactTovuLocalText\b[^}]*\} from "@tovu\/contracts\/diagnostics-redaction"/);
    assert.match(source, /\bredactTovuLocalText\(/);
    assert.doesNotMatch(source, /from "@jini-ai\/diagnostics\/local-text"/);
    assert.doesNotMatch(source, /\bredactLocalText\b/);
  });
}
