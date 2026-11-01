import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import express from "express";
import { bootAuthenticated } from "./helpers/http-test-server.js";
import { startStubProviderServer } from "./helpers/stub-provider-server.js";

// Execute the actual helper with only filesystem/DB/HTTP effects replaced. Real node:test hooks
// are essential: a throwing hook skips later hooks, which an ordinary callback test would miss.
const source = ts.createSourceFile("helper.ts", readFileSync(new URL("./helpers/unrun-site-boot.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "bootSite")!;
const code = ts.transpileModule(`return (${declaration.getText(source).replace(/^export /, "")});`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const fault = process.env.TEARDOWN_FAULT;
const envKey = "TOVU_HELPER_TEARDOWN_FIXTURE_SOCKET";
process.env[envKey] = "original";
const parent = path.join(os.tmpdir(), "helper-teardown-fake-parent");
const socketDir = path.join(os.tmpdir(), "helper-teardown-fake-socket");
const bindings = {
  os, path, process,
  fs: {
    mkdtempSync: () => parent,
    rmSync: (dir: string) => {
      console.log(dir === parent ? "parent removed" : "socket removed");
      if (fault === "remove" && dir === parent) throw new Error("fixture removal failed");
    },
  },
  PG_SOCKET_ENV: envKey, PGLITE_DATA_DIR_NAME: "data", PGLITE_SOCKET_FILE: "socket",
  defaultPgliteSocketDir: () => socketDir,
  initSite: async () => { if (fault === "init") throw new Error("init failed"); },
  bootSiteDir: async () => { if (fault === "boot") throw new Error("boot failed"); return { workspaceId: "ws" }; },
  createSiteRouteDeps: async (_file: string, options: { onStoreOpened(store: unknown): void }) => {
    options.onStoreOpened({ marker: "composed" });
    if (fault === "compose") throw new Error("compose failed");
    return { workspaceId: "ws" };
  },
  resolveSiteDatabasePaths: () => ({ contentDbPath: "fake.db" }),
  drainBootReadiness: async () => { if (fault === "readiness") throw new Error("readiness failed"); },
  createApp: (_deps: unknown, options: { onBootWork(work: Promise<void>): void }) => {
    const work = fault === "work" ? Promise.reject(new Error("background boot failed")) : Promise.resolve();
    void work.catch(() => {}); // The real app observes its boot pass too; teardown still sees the rejection.
    options.onBootWork(work);
    if (fault === "work") options.onBootWork(new Promise(resolve => setImmediate(() => { console.log("sibling work settled"); resolve(); })));
    const app = express();
    app.post("/api/admin/v1/auth/login", (_req, res) => { res.setHeader("set-cookie", "session=fixture"); res.json({}); });
    return app;
  },
  bootAuthenticated: async (_app: unknown, t: import("node:test").TestContext) => {
    if (process.env.TEARDOWN_REAL_HTTP === "1") {
      // Coordinator-only socket check: the real listener must match its advertised URL too.
      let provider: Server | undefined;
      const originalListen = Server.prototype.listen;
      const listen = t.mock.method(Server.prototype, "listen", function(this: Server, ...args: unknown[]) {
        provider = this;
        return Reflect.apply(originalListen, this, args);
      });
      const providerUrl = await startStubProviderServer(t, () => ({ status: 200, body: "provider ready" }));
      listen.mock.restore();
      const address = provider!.address();
      assert.ok(address && typeof address === "object");
      assert.equal(address.address, "127.0.0.1");
      assert.equal(await (await fetch(providerUrl)).text(), "provider ready");
      const site = await bootAuthenticated(_app as express.Express, t);
      // The real server close hook precedes this check and the site's database teardown.
      t.after(async () => {
        const response = await fetch(site.baseUrl).then(() => "still listening", () => "closed");
        if (response !== "closed") throw new Error("server leaked after teardown");
        console.log("server closed");
      });
      return site;
    }
    t.after(() => { console.log("server closed"); });
    if (fault === "login") throw new Error("login failed after listening");
    return { baseUrl: "http://fixture", cookie: "session" };
  },
  closeSiteDirBoot: async (_boot: unknown, composed: { marker: string }) => {
    if (composed?.marker !== "composed") throw new Error("composed store was not retained");
    console.log("database closed");
  },
};
const bootSite = new Function(...Object.keys(bindings), code)(...Object.values(bindings));
test("helper lifecycle", async t => { await bootSite(t, "pglite", { configureDeps: () => { if (fault === "configure") throw new Error("configure failed"); } }); });
process.once("exit", () => { console.log(`socket env: ${process.env[envKey]}`); });
