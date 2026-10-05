import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { parseDeployTargetsFile } from "#src/features/deployments/deploy-targets/registry";
import { parseSourceControlProvidersFile } from "#src/features/source-control/provider-registry";

import { parseDescriptorI18n } from "../../descriptor-i18n.js";

/**
 * @file A plugin descriptor's optional `i18n` block: locale → English source text → translation.
 * Parsed generically, carried on the deploy-target and git-host descriptors, and checked against the
 * two bundled descriptor files so a translation never outlives the English it translates.
 */

const CONTENT = path.resolve(import.meta.dirname, "../../../../../../../content/agent-plugins");

test("absent i18n parses to undefined; a well-formed block round-trips", () => {
  assert.equal(parseDescriptorI18n(undefined, "i18n"), undefined);
  const block = { es: { Owner: "Propietario" }, "pt-BR": { Owner: "Proprietário" } };
  assert.deepEqual(parseDescriptorI18n(block, "i18n"), block);
});

test("each malformed shape is refused with its exact reason", () => {
  assert.equal(parseDescriptorI18n([], "i18n"), "i18n must map locales to translations");
  assert.equal(parseDescriptorI18n({ "Not A Locale": {} }, "i18n"), "i18n has an invalid locale 'Not A Locale'");
  assert.equal(parseDescriptorI18n({ es: "Propietario" }, "i18n"), "i18n.es must map English text to its translation");
  assert.equal(parseDescriptorI18n({ es: { Owner: "" } }, "i18n"), "i18n.es translations must be non-empty strings of at most 2000 characters");
  assert.equal(parseDescriptorI18n({ es: { Owner: 7 } }, "i18n"), "i18n.es translations must be non-empty strings of at most 2000 characters");
  assert.equal(parseDescriptorI18n({ es: { " ": "x" } }, "i18n"), "i18n.es keys must be non-empty English text of at most 500 characters");
  assert.equal(parseDescriptorI18n({ es: { ["a".repeat(501)]: "x" } }, "i18n"), "i18n.es keys must be non-empty English text of at most 500 characters");
});

test("translation length accepts 2000 characters and refuses 2001", () => {
  const atLimit = { es: { Owner: "x".repeat(2000) } };
  assert.deepEqual(parseDescriptorI18n(atLimit, "i18n"), atLimit);
  assert.equal(parseDescriptorI18n({ es: { Owner: "x".repeat(2001) } }, "i18n"), "i18n.es translations must be non-empty strings of at most 2000 characters");
});

test("the caps on locales and strings per locale hold", () => {
  const tooManyLocales = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`x${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`, {}]));
  assert.equal(parseDescriptorI18n(tooManyLocales, "i18n"), "i18n must declare at most 64 locales");
  const tooManyStrings = { es: Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`s${i}`, "t"])) };
  assert.equal(parseDescriptorI18n(tooManyStrings, "i18n"), "i18n.es must declare at most 200 strings");
});

test("a deploy target carries its i18n block; a bad one refuses the file with the target's path", () => {
  const base = { id: "fixture-host", label: "Fixture", module: "targets/fixture.mjs" };
  const ok = parseDeployTargetsFile(JSON.stringify({ schemaVersion: 1, targets: [{ ...base, i18n: { es: { Fixture: "Accesorio" } } }] }));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.ok && ok.descriptors[0]?.i18n, { es: { Fixture: "Accesorio" } });

  const bad = parseDeployTargetsFile(JSON.stringify({ schemaVersion: 1, targets: [{ ...base, i18n: { es: { Fixture: "" } } }] }));
  assert.deepEqual(bad, { ok: false, reason: "targets[0].i18n.es translations must be non-empty strings of at most 2000 characters" });
});

test("a git host carries its i18n block; a bad one refuses the file with the provider's path", () => {
  const base = { id: "fixture-git", label: "Fixture Git", apiOrigin: "https://git.example.com", module: "source-control/fixture.mjs" };
  const ok = parseSourceControlProvidersFile(JSON.stringify({ schemaVersion: 1, providers: [{ ...base, i18n: { de: { "Fixture Git": "Vorrichtung" } } }] }));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.ok && ok.descriptors[0]?.i18n, { de: { "Fixture Git": "Vorrichtung" } });

  const bad = parseSourceControlProvidersFile(JSON.stringify({ schemaVersion: 1, providers: [{ ...base, i18n: { "Bad Locale": {} } }] }));
  assert.deepEqual(bad, { ok: false, reason: "providers[0].i18n has an invalid locale 'Bad Locale'" });
});

/** Every person-facing string a descriptor entry declares (the text an `i18n` key may translate). */
function declaredStrings(entry: Record<string, any>): Set<string> {
  const out = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string") out.add(value);
  };
  add(entry.label);
  add(entry.projectName?.label);
  add(entry.projectName?.help);
  add(entry.credential?.vendorLabel);
  add(entry.credential?.help);
  add(entry.credential?.userHelp);
  for (const field of [...(entry.config ?? []), ...(entry.credential?.fields ?? [])]) {
    add(field.label);
    add(field.help);
    add(field.userHelp);
  }
  return out;
}

for (const [file, listKey] of [
  ["deploy/tovu-deploy-targets.json", "targets"],
  ["github/tovu-source-control.json", "providers"],
] as const) {
  test(`${file}: every i18n key is a string that entry declares (no stale translation)`, () => {
    const json = JSON.parse(readFileSync(path.join(CONTENT, file), "utf8")) as Record<string, Record<string, any>[]>;
    for (const entry of json[listKey]!) {
      const declared = declaredStrings(entry);
      for (const [locale, entries] of Object.entries((entry.i18n ?? {}) as Record<string, Record<string, string>>)) {
        for (const source of Object.keys(entries)) assert.ok(declared.has(source), `${entry.id} ${locale}: '${source}' is not a string this entry declares`);
      }
    }
  });
}

test("both bundled descriptor files still parse with their i18n blocks", () => {
  assert.equal(parseDeployTargetsFile(readFileSync(path.join(CONTENT, "deploy/tovu-deploy-targets.json"), "utf8")).ok, true);
  assert.equal(parseSourceControlProvidersFile(readFileSync(path.join(CONTENT, "github/tovu-source-control.json"), "utf8")).ok, true);
});
