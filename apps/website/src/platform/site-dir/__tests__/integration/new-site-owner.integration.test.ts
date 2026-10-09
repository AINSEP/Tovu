import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { initSite } from "../../init-site.js";
import { createSite } from "../../site-registry.js";
import { resolveNewSiteAdminPassword } from "../../new-site-owner.js";
import { assertSiteOwnerLogin } from "../helpers/assert-site-owner-login.js";

const INHERITED_PASSWORD = "inherited-deployment-password-fixture";

test("REGRESSION: init seeds admin / tovu-dev even with TOVU_ADMIN_PASSWORD set; first serve still logs in", async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-new-site-owner-"));
  const previous = process.env.TOVU_ADMIN_PASSWORD;
  process.env.TOVU_ADMIN_PASSWORD = INHERITED_PASSWORD;
  try {
    const dir = path.join(parent, "default-site");
    await initSite({ dir });
    await assertSiteOwnerLogin({ dir, password: "tovu-dev", rejectedPassword: INHERITED_PASSWORD });
  } finally {
    if (previous === undefined) delete process.env.TOVU_ADMIN_PASSWORD;
    else process.env.TOVU_ADMIN_PASSWORD = previous;
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("init uses the exact explicit password on SQLite and PGlite; neither init nor serve replaces it with env", async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-explicit-site-owner-"));
  const previous = process.env.TOVU_ADMIN_PASSWORD;
  process.env.TOVU_ADMIN_PASSWORD = INHERITED_PASSWORD;
  try {
    for (const kind of ["sqlite", "pglite"] as const) {
      const dir = path.join(parent, kind);
      const password = " x🔑 "; // No trimming; current policy has no length minimum beyond presence.
      await initSite({ dir, adminPassword: password, storage: { kind } });
      await assertSiteOwnerLogin({ dir, password, rejectedPassword: "tovu-dev" });
      const config = fs.readFileSync(path.join(dir, "config.json"), "utf8");
      const meta = fs.readFileSync(path.join(dir, ".site-meta.json"), "utf8");
      assert.ok(!config.includes(password) && !meta.includes(password));
    }
  } finally {
    if (previous === undefined) delete process.env.TOVU_ADMIN_PASSWORD;
    else process.env.TOVU_ADMIN_PASSWORD = previous;
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("site-registry creation shares init's explicit/default owner contract", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-registry-owner-"));
  fs.mkdirSync(path.join(cwd, "sites"));
  try {
    for (const adminPassword of [undefined, "chosen-registry-password"]) {
      const name = adminPassword === undefined ? "default-site" : "custom-site";
      const site = await createSite({ name, adminPassword }, { cwd });
      await assertSiteOwnerLogin({ dir: site.dir, password: adminPassword ?? "tovu-dev" });
    }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("new-site password validation reuses the current policy and never discloses rejected values", async () => {
  assert.equal(resolveNewSiteAdminPassword({}), "tovu-dev");
  assert.equal(resolveNewSiteAdminPassword({ adminPassword: "a" }), "a");
  assert.equal(resolveNewSiteAdminPassword({ adminPassword: "🔑".repeat(512) }), "🔑".repeat(512));
  for (const adminPassword of [null, 1, {}, []]) {
    assert.throws(() => resolveNewSiteAdminPassword({ adminPassword }), { message: "Admin password must be a string." });
  }
  assert.throws(() => resolveNewSiteAdminPassword({ adminPassword: "" }), { message: "Password is required." });
  assert.throws(() => resolveNewSiteAdminPassword({ adminPassword: "🔑".repeat(513) }), { message: "Password must be no more than 512 characters." });
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-invalid-owner-"));
  const dir = path.join(parent, "rejected");
  try {
    await assert.rejects(initSite({ dir, adminPassword: "" }), { message: "Password is required." });
    assert.equal(fs.existsSync(dir), false);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
