/** Review B-2 RED: no pre-write allocation journal/reconciliation; pre-catalog status was ready. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createSiteImportBackend } from "../import-backend.js";
import { SiteImportRegistry } from "../import-registry.js";
import type { SiteImportRecord } from "../import-registry.js";
import { importFixture, OWNER_PASSWORD } from "./import.fixture.js";

for (const placement of ["inSite", "appData"] as const) for (const boundary of ["allocated", "restored", "before-register", "registered"]) {
  test(`B hard interruption ${boundary} reconciles under locks: ${placement}`, { timeout: 60_000 }, async t => {
    const h = await importFixture(t, placement);
    const upload = await h.backend.upload({ principalId: "recipient", archive: h.archive });
    const pending = await h.backend.importBackup({ principalId: "recipient", source: { uploadId: upload.uploadId }, requestId: "interrupted" });
    const child = fork(fileURLToPath(new URL("./import-interruption.fixture.ts", import.meta.url)), [h.root, pending.importId, boundary], { execArgv: ["--import", "tsx"], stdio: ["ignore", "ignore", "inherit", "ipc"] });
    t.after(() => child.kill("SIGKILL"));
    await new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("exit", (code, signal) => { try { assert.equal(signal, "SIGKILL", `child exited ${code}`); resolve(); } catch (error) { reject(error); } }); });
    const interrupted = JSON.parse(fs.readFileSync(path.join(h.root, "interruption.json"), "utf8")) as SiteImportRecord;
    assert.equal(interrupted.status, "creating", "ready requires catalog registration and return");
    assert.ok(interrupted.creation, "identity and both storage paths must be durable before writes");
    if (boundary === "allocated") assert.equal(fs.existsSync(interrupted.creation.dir), false);
    if (boundary === "restored") assert.equal(fs.existsSync(interrupted.creation.dbPath), true);
    if (boundary === "before-register") {
      assert.equal(fs.existsSync(path.join(interrupted.creation.dir, ".site-meta.json")), true);
      assert.deepEqual(h.workspace.registry({}).list({}), []);
    }
    const backend = createSiteImportBackend({ ...h.backendPorts, registry: new SiteImportRegistry({ directory: h.registry.directory }) });
    // list acquires the transfer lane and recovers dead creation/home/name lock owners.
    const recovered = (await backend.list({ principalId: "recipient" }))[0]!;
    assert.equal(recovered.state, boundary === "registered" ? "ready" : "failed");
    assert.equal(fs.existsSync(h.registry.stagePath(pending)), false);
    if (boundary === "registered") {
      assert.equal(h.workspace.registry({}).list({}).length, 1);
      assert.equal((await backend.completeOwner({ principalId: "recipient", importId: pending.importId, adminPassword: OWNER_PASSWORD })).newSiteId, interrupted.creation.siteId);
      assert.equal(h.workspace.registry({}).list({}).length, 1);
    } else {
      assert.equal(fs.existsSync(interrupted.creation.dir), false);
      assert.equal(fs.existsSync(interrupted.creation.dbPath), false);
      assert.deepEqual(h.workspace.registry({}).list({}), []);
      await assert.rejects(backend.completeOwner({ principalId: "recipient", importId: pending.importId, adminPassword: OWNER_PASSWORD }), /not awaiting/i);
    }
    assert.equal((await backend.list({ principalId: "recipient" }))[0]!.state, recovered.state, "recovery is idempotent");
    assert.deepEqual(h.started, []);
  });
}
