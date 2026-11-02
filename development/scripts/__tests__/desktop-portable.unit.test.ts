import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const repo = path.resolve(import.meta.dirname, "../../..");

for (const platform of ["win32", "linux"]) {
  test(`desktop dev CLI launches preload, watcher and Electron portably on ${platform}`, (t) => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "desktop-portable-")));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const scripts = path.join(root, "development/scripts");
    fs.mkdirSync(scripts, { recursive: true });
    fs.symlinkSync(path.join(repo, "node_modules"), path.join(root, "node_modules"), "dir");
    fs.copyFileSync(path.join(repo, "development/scripts/dev-desktop.mjs"), path.join(scripts, "dev-desktop.mjs"));
    for (const [file, name, value] of [
      ["free-port", "pickFreePort", "null"], ["load-repo-root-env", "loadRepoRootEnvFile", "false"],
      ["local-dev-plugin-install", "localDevPluginInstallEnv", "({})"], ["port-listeners", "listenersOn", "[]"],
      ["prune-tsx-cache", "pruneTsxCache", "undefined"],
    ]) fs.writeFileSync(path.join(scripts, `${file}.mjs`), `export const ${name} = () => ${value};`);
    const preload = path.join(root, "spawn-port.mjs");
    fs.writeFileSync(preload, `
      import assert from 'node:assert/strict'; import cp from 'node:child_process';
      import fs from 'node:fs'; import path from 'node:path';
      import { syncBuiltinESMExports } from 'node:module'; import { EventEmitter } from 'node:events';
      Object.defineProperty(process, 'platform', { value: ${JSON.stringify(platform)} });
      process.env.TOVU_DESKTOP_DISABLE_ADMIN_VITE = '1'; process.env.ComSpec = 'cmd.exe';
      process.kill = () => true;
      const verify = (command, args, options) => {
        if (process.platform === 'win32') {
          assert.equal(command, 'cmd.exe', 'Windows must launch the npm.cmd shim through its owner');
          assert.deepEqual(args.slice(0, 3), ['/d', '/s', '/c']);
          assert.equal(options.windowsVerbatimArguments, true);
          assert.match(args[3], /^"npm\\.cmd /);
        } else assert.equal(command, 'npm');
        assert.ok(!options.shell, 'argument quoting belongs to Jini, not a second shell');
        return process.platform === 'win32' ? args[3].slice(1, -1).replace(/^npm\\.cmd /, '') : args.join(' ');
      };
      cp.spawnSync = (command, args, options) => {
        assert.equal(verify(command, args, options), 'run build:preload');
        console.log('preload complete'); return { status: 0 };
      };
      cp.spawn = (command, args, options) => {
        const invocation = verify(command, args, options);
        console.log('spawn:' + invocation);
        const child = Object.assign(new EventEmitter(), { pid: 99999999, exitCode: null, signalCode: null });
        if (invocation === 'run watch:renderer') {
          const entry = path.join(options.cwd, 'dist/renderer/index.html');
          fs.mkdirSync(path.dirname(entry), { recursive: true }); fs.writeFileSync(entry, 'fresh');
          const fresh = new Date(Date.now() + 1000); fs.utimesSync(entry, fresh, fresh);
        } else {
          assert.equal(invocation, process.platform === 'win32'
            ? 'run dev -- "--remote-debugging-port=9234"' : 'run dev -- --remote-debugging-port=9234');
          setTimeout(() => child.emit('exit', 0, null), 0);
        }
        return child;
      }; syncBuiltinESMExports();
    `);
    const child = spawnSync(process.execPath, ["--import", preload, path.join(scripts, "dev-desktop.mjs"), "--remote-debugging-port=9234"], {
      cwd: root, encoding: "utf8", timeout: 10_000, env: { ...process.env, NODE_OPTIONS: "" },
    });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stdout + child.stderr);
    assert.match(child.stdout, /preload complete[\s\S]*spawn:run watch:renderer[\s\S]*spawn:run dev -- "?--remote-debugging-port=9234"?/);
  });
}

test("desktop build:preload uses Node cleanup instead of Unix rm", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(repo, "apps/desktop/package.json"), "utf8"));
  assert.doesNotMatch(manifest.scripts["build:preload"], /\brm\s+-/);
  assert.match(manifest.scripts["build:preload"], /^node scripts\/clean-preload\.ts && tsc /);
});

test("preload cleanup removes only stale preload, contracts and speech output from any cwd", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "preload-clean-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const desktop = path.join(root, "apps/desktop");
  fs.mkdirSync(path.join(desktop, "scripts"), { recursive: true });
  fs.copyFileSync(path.join(repo, "apps/desktop/scripts/clean-preload.ts"), path.join(desktop, "scripts/clean-preload.ts"));
  for (const dir of ["preload", "contracts", "speech", "renderer"]) {
    fs.mkdirSync(path.join(desktop, "dist", dir), { recursive: true });
    fs.writeFileSync(path.join(desktop, "dist", dir, "stale.js"), "old output");
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const child = spawnSync(process.execPath, [path.join(desktop, "scripts/clean-preload.ts")], {
      cwd: root, encoding: "utf8", timeout: 5_000,
    });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr);
    for (const dir of ["preload", "contracts", "speech"]) assert.equal(fs.existsSync(path.join(desktop, "dist", dir)), false, dir);
    assert.equal(fs.readFileSync(path.join(desktop, "dist/renderer/stale.js"), "utf8"), "old output");
  }
});
