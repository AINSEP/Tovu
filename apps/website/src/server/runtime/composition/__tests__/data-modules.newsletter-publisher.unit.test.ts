/**
 * @file Byte-identity pin for the newsletter data module this host binds. `checkNamespaceAdoption`
 * compares the stored provenance on every boot, so the bound module (Jini factory + this host's
 * `FIRST_PARTY_PUBLISHER`) must stay identical to the pre-move `NEWSLETTER_DATA_MODULE` constant.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { FIRST_PARTY_DATA_MODULES, FIRST_PARTY_PUBLISHER } from "../data-modules.js";

const PRE_MOVE = JSON.parse(readFileSync(new URL("./fixtures/newsletter-data-module.pre-move.json", import.meta.url), "utf8"));

test("the bound newsletter module deep-equals the pre-move constant, publisher tovu-core", () => {
  const bound = FIRST_PARTY_DATA_MODULES.find((decl) => decl.pluginId === "newsletter");
  assert.equal(FIRST_PARTY_PUBLISHER, "tovu-core");
  assert.equal(bound?.provenance.publisher, "tovu-core");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(bound)), PRE_MOVE);
});
