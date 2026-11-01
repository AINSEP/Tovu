import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import express from "express";
import { bootAuthenticated } from "./helpers/http-test-server.js";

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
  initSite: async () => {},
  bootSiteDir: async () => ({ workspaceId: "ws" }),
  createSiteRouteDeps: async () => ({ workspaceId: "ws" }),
  resolveSiteDatabasePaths: () => ({ contentDbPath: "fake.db" }),
  drainBootReadiness: async () => {},
  createApp: (_deps: unknown, options: { onBootWork(work: Promise<void>): void }) => {
    const work = fault === "work" ? Promise.reject(new Error("background boot failed")) : Promise.resolve();
    void work.catch(() => {}); // The real app observes its boot pass too; teardown still sees the rejection.
    options.onBootWork(work);
    const app = express();
    app.post("/api/admin/v1/auth/login", (_req, res) => { res.setHeader("set-cookie", "session=fixture"); res.json({}); });
    return app;
  },
  bootAuthenticated: async (_app: unknown, t: import("node:test").TestContext) => {
    if (process.env.TEARDOWN_REAL_HTTP === "1") {
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
  closeSiteDirBoot: async () => { console.log("database closed"); },
};
const bootSite = new Function(...Object.keys(bindings), code)(...Object.values(bindings));
test("helper lifecycle", async t => { await bootSite(t, "pglite"); });
process.once("exit", () => { console.log(`socket env: ${process.env[envKey]}`); });
