import assert from "node:assert/strict";
import test from "node:test";
import { warnInheritedAdminPassword } from "../dev.mjs";

test("dev warns once when TOVU_ADMIN_PASSWORD is inherited, names its remaining use, and never discloses it", () => {
  const messages = [];
  warnInheritedAdminPassword({ env: { TOVU_ADMIN_PASSWORD: "inherited-password-fixture" } }, { warn: (line) => messages.push(line) });
  assert.deepEqual(messages, ["tovu dev: TOVU_ADMIN_PASSWORD is ignored for newly created sites; it still applies to the serving site's first-boot owner seeding when no owner exists."]);
});

test("dev stays quiet when TOVU_ADMIN_PASSWORD is absent; a set empty variable still gets the warning", () => {
  const messages = [];
  warnInheritedAdminPassword({ env: {} }, { warn: (line) => messages.push(line) });
  assert.deepEqual(messages, []);
  warnInheritedAdminPassword({ env: { TOVU_ADMIN_PASSWORD: "" } }, { warn: (line) => messages.push(line) });
  assert.equal(messages.length, 1);
});
