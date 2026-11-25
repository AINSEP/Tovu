import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { prepareDependencyCacheStamp } from "../lib/dependency-cache-stamp.mjs";
import { startAdminVite } from "../dev.mjs";

/**
 * @file The dev launcher re-optimizes Vite's dependency cache exactly when linked `@jini-ai/*`
 * output changed. Relinking or rebuilding local Jini output does not always update Vite's own
 * lockfile key, so the launcher keeps its own stamp. Everything runs against an in-memory FS.
 */

const SCOPE = "/repo/apps/admin/node_modules/@jini-ai";
const STAMP = "/repo/apps/admin/node_modules/.vite/tovu-jini-deps.json";
const REAL = "/jini/packages/core";

/** In-memory port. Files are `path -> { text, mtimeMs }`; links resolve a scope entry to its real dir. */
function memoryFs({ files, links = {} }) {
  const dirsOf = (p) => { const out = []; for (let d = path.dirname(p); d !== "/"; d = path.dirname(d)) out.push(d); return out; };
  const isDir = (p) => [...files.keys()].some((f) => dirsOf(f).includes(p)) || Object.keys(links).some((l) => dirsOf(l).includes(p) || l === p);
  return {
    files,
    writes: [],
    exists: ({ path: p }) => files.has(p) || isDir(p),
    readText: ({ path: p }) => { if (!files.has(p)) throw new Error(`ENOENT ${p}`); return files.get(p).text; },
    list: ({ path: p }) => {
      const names = new Map();
      for (const f of [...files.keys(), ...Object.keys(links)]) {
        if (!f.startsWith(`${p}/`)) continue;
        const [head, ...rest] = f.slice(p.length + 1).split("/");
        names.set(head, rest.length > 0);
      }
      // A link is a symlink entry: Dirent#isDirectory() is false for it.
      return [...names].map(([name, isDirectory]) => ({ name, isDirectory: isDirectory && !links[`${p}/${name}`] }));
    },
    resolveRealPath: ({ path: p }) => links[p] ?? p,
    mtimeMs: ({ path: p }) => files.get(p).mtimeMs,
    ensureDir() {},
    writeText({ path: p, value }) { this.writes.push(p); files.set(p, { text: value, mtimeMs: 1 }); },
  };
}

function jiniTree({ version = "1.0.0", distMtime = 100 } = {}) {
  return new Map([
    [`${REAL}/package.json`, { text: JSON.stringify({ version }), mtimeMs: 1 }],
    [`${REAL}/dist/index.js`, { text: "", mtimeMs: 50 }],
    [`${REAL}/dist/sub/deep/chunk.js`, { text: "", mtimeMs: distMtime }],
  ]);
}

const port = (files) => memoryFs({ files, links: { [`${SCOPE}/core`]: REAL } });
const prepare = (fs) => prepareDependencyCacheStamp({ scopeDir: SCOPE, stampFile: STAMP, fs });

test("a changed package version forces one re-optimize and the next unchanged launch does not", () => {
  const files = jiniTree();
  assert.deepEqual(prepare(port(files)), { force: true }, "first launch has no stamp");
  assert.deepEqual(prepare(port(files)), { force: false });
  files.set(`${REAL}/package.json`, { text: JSON.stringify({ version: "1.0.1" }), mtimeMs: 1 });
  assert.deepEqual(prepare(port(files)), { force: true }, "only the version changed");
  assert.deepEqual(prepare(port(files)), { force: false });
});

test("an in-place nested dist rebuild invalidates the stamp without a parent directory mtime change", () => {
  const files = jiniTree({ distMtime: 100 });
  const fs = port(files);
  // Directory mtimes are deliberately unreadable: only file mtimes may drive the stamp.
  const origMtime = fs.mtimeMs;
  fs.mtimeMs = (args) => { if (!files.has(args.path)) throw new Error("directory mtime must not be consulted"); return origMtime(args); };
  prepare(fs);
  assert.deepEqual(prepare(fs), { force: false });
  files.set(`${REAL}/dist/sub/deep/chunk.js`, { text: "", mtimeMs: 200 });
  assert.deepEqual(prepare(fs), { force: true });
  assert.match(files.get(STAMP).text, /"newestDistMtimeMs":200/);
});

test("a changed @jini-ai tree forces exactly one Vite re-optimize, then the stamp holds", () => {
  const files = jiniTree();
  const calls = [];
  const launch = () => startAdminVite({ apiPort: 3301, vitePort: 5274, apiScheme: "http" },
    { startChild: (...args) => calls.push(args), prepareDepsCache: () => prepare(port(files)) });
  launch();
  launch();
  files.set(`${REAL}/dist/index.js`, { text: "", mtimeMs: 999 });
  launch();
  launch();
  assert.deepEqual(calls.map(([, , args]) => args), [
    ["--prefix", "apps/admin", "run", "dev", "--", "--force"],
    ["--prefix", "apps/admin", "run", "dev"],
    ["--prefix", "apps/admin", "run", "dev", "--", "--force"],
    ["--prefix", "apps/admin", "run", "dev"],
  ]);
});

test("a missing scope directory stamps an empty list and the stamp lists packages by name", () => {
  const empty = memoryFs({ files: new Map() });
  assert.deepEqual(prepare(empty), { force: true });
  assert.equal(empty.files.get(STAMP).text, "[]");
  const files = jiniTree();
  const fs = port(files);
  prepare(fs);
  assert.deepEqual(JSON.parse(files.get(STAMP).text), [{ name: "core", realPath: REAL, version: "1.0.0", newestDistMtimeMs: 100 }]);
});
