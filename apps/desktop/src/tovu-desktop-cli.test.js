/**
 * @file Coverage for `bin/tovu-desktop.mjs` — the `add-site` command.
 *
 * Driven through `runTovuDesktopCli` with injected `io`, so the exit code and the exact operator-
 * facing output are both assertable without spawning a process or capturing the real stdout.
 *
 * The load-bearing assertions: a refusal EXITS NON-ZERO (a script that pipes this needs to be able
 * to tell), a refusal writes nothing, and an unquoted multi-word path is refused rather than
 * silently adding only its first word.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EXIT_OK, EXIT_REFUSED, EXIT_USAGE, parseArgv, runTovuDesktopCli } from "../bin/tovu-desktop.mjs";
import { SITE_ORIGIN, sitesFilePath, readTrackedSites, untrackSite } from "./tracked-sites.js";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-desktop-cli-"));
}

function siteFixture(name = "site") {
  const dir = path.join(tempDir(), name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "config.json"), JSON.stringify({ name }));
  fs.writeFileSync(path.join(dir, ".site-meta.json"), JSON.stringify({ siteId: `id-${name}` }));
  return dir;
}

/** Collect stdout and stderr separately — which stream a message went to is part of the contract. */
function capture() {
  const out = [];
  const err = [];
  return { out, err, io: { out: (t) => out.push(t), err: (t) => err.push(t) }, stdout: () => out.join(""), stderr: () => err.join("") };
}

test("add-site adds a real site and reports the path it recorded", () => {
  const userDataDir = tempDir();
  const siteDir = siteFixture();
  const io = capture();

  const code = runTovuDesktopCli(["add-site", siteDir, "--user-data-dir", userDataDir], io.io);

  assert.equal(code, EXIT_OK);
  assert.match(io.stdout(), /Added: /);
  assert.ok(io.stdout().includes(siteDir));
  // Stated in the output because the promise is load-bearing and people do not read source.
  assert.match(io.stdout(), /not moved, copied, or changed/);
  assert.equal(readTrackedSites(sitesFilePath(userDataDir))[0].origin, SITE_ORIGIN.adopted);
});

test("add-site ALWAYS announces which app-data directory it used", () => {
  const userDataDir = tempDir();
  const io = capture();

  runTovuDesktopCli(["add-site", siteFixture(), "--user-data-dir", userDataDir], io.io);

  // The mitigation for this CLI's one structural risk: `resolveDesktopUserDataDir` mirrors
  // Electron's convention instead of asking it, so a drift would show up as a row written where the
  // app never looks. Printing the directory on every run — not just on failure — is what makes that
  // visible instead of silent.
  assert.match(io.stdout(), new RegExp(`Using app data: ${userDataDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("add-site EXITS NON-ZERO and writes nothing when the folder is not a site", () => {
  const userDataDir = tempDir();
  const empty = path.join(tempDir(), "fresh");
  fs.mkdirSync(empty);
  const io = capture();

  const code = runTovuDesktopCli(["add-site", empty, "--user-data-dir", userDataDir], io.io);

  // A script piping this must be able to tell. Asserted as the specific refusal code, not merely
  // `!== 0`, so a usage bug cannot masquerade as a refusal.
  assert.equal(code, EXIT_REFUSED);
  assert.match(io.stderr(), /no Tovu site here to add/);
  assert.deepEqual(readTrackedSites(sitesFilePath(userDataDir)), []);
  // And nothing was initialized in the operator's folder.
  assert.deepEqual(fs.readdirSync(empty), []);
});

test("add-site refuses an incomplete and an occupied folder with their own reasons", () => {
  const userDataDir = tempDir();
  const incomplete = path.join(tempDir(), "half");
  fs.mkdirSync(incomplete);
  fs.writeFileSync(path.join(incomplete, ".site-meta.json"), "{}");
  const occupied = path.join(tempDir(), "docs");
  fs.mkdirSync(occupied);
  fs.writeFileSync(path.join(occupied, "a.txt"), "x");

  const first = capture();
  assert.equal(runTovuDesktopCli(["add-site", incomplete, "--user-data-dir", userDataDir], first.io), EXIT_REFUSED);
  assert.match(first.stderr(), /half-initialized or damaged/);

  const second = capture();
  assert.equal(runTovuDesktopCli(["add-site", occupied, "--user-data-dir", userDataDir], second.io), EXIT_REFUSED);
  assert.match(second.stderr(), /folder of unrelated files/);
  assert.match(second.stderr(), /subfolder/);

  assert.deepEqual(readTrackedSites(sitesFilePath(userDataDir)), []);
});

test("add-site with no path is a USAGE error, distinct from a refusal", () => {
  const io = capture();

  const code = runTovuDesktopCli(["add-site"], io.io);

  assert.equal(code, EXIT_USAGE);
  assert.match(io.stderr(), /needs the path to a site folder/);
  assert.match(io.stderr(), /Usage:/);
});

test("add-site REFUSES several paths rather than silently adding only the first", () => {
  const userDataDir = tempDir();
  const io = capture();

  // What an unquoted path containing spaces looks like by the time it reaches argv. Adding the
  // first word would point the app at a folder the operator never named.
  const code = runTovuDesktopCli(["add-site", "/Users/la/My", "Site", "Folder", "--user-data-dir", userDataDir], io.io);

  assert.equal(code, EXIT_USAGE);
  assert.match(io.stderr(), /takes one path, but got 3/);
  assert.match(io.stderr(), /quote it/);
  assert.deepEqual(readTrackedSites(sitesFilePath(userDataDir)), []);
});

test("add-site is idempotent and says so on the second run", () => {
  const userDataDir = tempDir();
  const siteDir = siteFixture();
  runTovuDesktopCli(["add-site", siteDir, "--user-data-dir", userDataDir], capture().io);
  const io = capture();

  const code = runTovuDesktopCli(["add-site", siteDir, "--user-data-dir", userDataDir], io.io);

  assert.equal(code, EXIT_OK);
  assert.match(io.stdout(), /Already in your websites/);
  assert.equal(readTrackedSites(sitesFilePath(userDataDir)).length, 1);
});

test("add-site tells the operator when it is restoring a website they removed", () => {
  const userDataDir = tempDir();
  const siteDir = siteFixture();
  runTovuDesktopCli(["add-site", siteDir, "--user-data-dir", userDataDir], capture().io);
  // The operator removing it in the app writes a tombstone; naming the folder again clears it.
  untrackSite(sitesFilePath(userDataDir), siteDir);
  const io = capture();

  runTovuDesktopCli(["add-site", siteDir, "--user-data-dir", userDataDir], io.io);

  assert.match(io.stdout(), /You had removed this website before/);
});

test("--help exits zero, a bare invocation exits with a usage code", () => {
  const help = capture();
  assert.equal(runTovuDesktopCli(["--help"], help.io), EXIT_OK);
  assert.match(help.stdout(), /tovu-desktop add-site/);

  // Different codes on purpose: `--help` is what the operator asked for, an empty argv is a mistake.
  assert.equal(runTovuDesktopCli([], capture().io), EXIT_USAGE);
});

test("an unknown command names itself and shows usage", () => {
  const io = capture();

  const code = runTovuDesktopCli(["remove-site", "/x"], io.io);

  assert.equal(code, EXIT_USAGE);
  assert.match(io.stderr(), /Unknown command 'remove-site'/);
});

test("parseArgv lifts --user-data-dir out from anywhere in argv", () => {
  assert.deepEqual(parseArgv(["add-site", "/a", "--user-data-dir", "/d"]), { positional: ["add-site", "/a"], userDataDir: "/d" });
  assert.deepEqual(parseArgv(["--user-data-dir", "/d", "add-site", "/a"]), { positional: ["add-site", "/a"], userDataDir: "/d" });
  assert.deepEqual(parseArgv(["add-site", "/a"]), { positional: ["add-site", "/a"], userDataDir: undefined });
});
