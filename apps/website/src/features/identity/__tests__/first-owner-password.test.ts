import assert from "node:assert/strict";
import test from "node:test";
import { FirstOwnerPasswordRequiredError, isServerSite, resolveFirstOwnerPassword } from "../first-owner-password.js";
import { DEFAULT_OWNER_PASSWORD, resolveOwnerCredentials } from "../wiring.js";

const SERVER = { TOVU_RUNTIME_MODE: "production" } as const;
const DESKTOP = { ELECTRON_RUN_AS_NODE: "1" } as const;

test("isServerSite: a production-mode launch that is not the desktop shell", () => {
  assert.equal(isServerSite({ env: SERVER }), true);
  assert.equal(isServerSite({ env: { ...SERVER, ...DESKTOP } }), false);
  assert.equal(isServerSite({ env: {} }), false, "local dev / tests are not a server site");
});

test("resolveFirstOwnerPassword: a server site with no TOVU_ADMIN_PASSWORD refuses the default", () => {
  assert.throws(() => resolveFirstOwnerPassword({ env: SERVER }), (error: unknown) => {
    assert.ok(error instanceof FirstOwnerPasswordRequiredError);
    assert.match(error.message, /^ERR-OWNER-PASSWORD-REQUIRED: /);
    assert.match(error.message, /TOVU_ADMIN_PASSWORD/);
    assert.ok(!error.message.includes(DEFAULT_OWNER_PASSWORD), "the message never echoes the default password");
    return true;
  });
});

test("resolveFirstOwnerPassword: a server site whose TOVU_ADMIN_PASSWORD is the default, or blank, is refused", () => {
  for (const password of [DEFAULT_OWNER_PASSWORD, "", "   "]) {
    assert.throws(() => resolveFirstOwnerPassword({ env: { ...SERVER, TOVU_ADMIN_PASSWORD: password } }), FirstOwnerPasswordRequiredError);
  }
});

test("resolveFirstOwnerPassword: a server site with a policy-violating TOVU_ADMIN_PASSWORD is refused with the policy reason", () => {
  // Jini's policy (`validatePasswordPolicy`) rejects empty and over-512-code-point passwords only.
  assert.throws(() => resolveFirstOwnerPassword({ env: { ...SERVER, TOVU_ADMIN_PASSWORD: "a".repeat(513) } }), (error: unknown) => {
    assert.ok(error instanceof FirstOwnerPasswordRequiredError);
    assert.match(error.message, /no more than 512 characters/);
    return true;
  });
});

test("resolveFirstOwnerPassword: a server site with a set password seeds that password", () => {
  const password = "a-real-operator-chosen-passphrase-42";
  assert.equal(resolveFirstOwnerPassword({ env: { ...SERVER, TOVU_ADMIN_PASSWORD: password } }), password);
});

test("resolveFirstOwnerPassword: desktop and local behaviour is byte-identical to resolveOwnerCredentials today", () => {
  const envs: Record<string, string | undefined>[] = [
    { ...DESKTOP },
    { ...DESKTOP, ...SERVER },
    { ...DESKTOP, ...SERVER, TOVU_ADMIN_PASSWORD: "" },
    { ...DESKTOP, TOVU_ADMIN_PASSWORD: "x" },
    {},
    { TOVU_ADMIN_PASSWORD: "" },
    { NODE_ENV: "development", TOVU_ADMIN_PASSWORD: DEFAULT_OWNER_PASSWORD },
  ];
  for (const env of envs) {
    assert.equal(resolveFirstOwnerPassword({ env }), resolveOwnerCredentials({ env }).password, JSON.stringify(env));
  }
  assert.equal(resolveFirstOwnerPassword({ env: { ...DESKTOP } }), DEFAULT_OWNER_PASSWORD);
});
