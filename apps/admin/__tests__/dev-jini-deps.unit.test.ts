import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { adminJiniDependencyFingerprint } from "../dev-jini-deps";

function fixture(onCleanup: (cleanup: () => void) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "admin-jini-deps-"));
  onCleanup(() => fs.rmSync(root, { recursive: true, force: true }));
  const adminDir = path.join(root, "apps/admin");
  const local = path.join(adminDir, "node_modules/@jini-ai");
  const hoisted = path.resolve(adminDir, "../../node_modules/@jini-ai");
  const packages = new Map([
    [local, ["ui", "chat"]],
    [hoisted, ["core"]],
  ]);
  function version(scope: string, name: string, value: string) {
    const directory = path.join(scope, name);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ version: value }));
  }
  version(local, "ui", "0.6.19");
  version(local, "chat", "0.6.20");
  version(hoisted, "core", "0.6.19");
  const listings: string[] = [];
  const ports = {
    scopeExists: (directory: string) => packages.has(directory),
    listPackages: (directory: string) => {
      listings.push(directory);
      const names = packages.get(directory);
      if (!names) throw new Error(`Unexpected directory: ${directory}`);
      return names;
    },
  };
  return { adminDir, local, hoisted, packages, version, listings, ports,
    fingerprint: () => adminJiniDependencyFingerprint({ adminDir }, ports) };
}

test("installed chat upgrades change the fingerprint even when dependency ranges stay the same", async ({ onTestFinished }) => {
  const f = fixture(onTestFinished);
  const before = await f.fingerprint();
  f.version(f.local, "chat", "0.6.21");
  const upgraded = await f.fingerprint();
  expect(upgraded).not.toBe(before);
  expect(await f.fingerprint()).toBe(upgraded);
});

test("hoisted Jini versions and removed packages also invalidate the fingerprint", async ({ onTestFinished }) => {
  const f = fixture(onTestFinished);
  const before = await f.fingerprint();
  f.version(f.hoisted, "core", "0.6.21");
  const upgraded = await f.fingerprint();
  expect(upgraded).not.toBe(before);
  f.packages.set(f.local, ["chat"]);
  expect(await f.fingerprint()).not.toBe(upgraded);
});

test("directory enumeration order does not invalidate an unchanged install", async ({ onTestFinished }) => {
  const f = fixture(onTestFinished);
  const before = await f.fingerprint();
  expect(f.listings).toEqual([f.local, f.hoisted]);
  f.packages.set(f.local, ["chat", "ui"]);
  expect(await f.fingerprint()).toBe(before);
});

test("a missing local scope still fingerprints hoisted packages", async ({ onTestFinished }) => {
  const f = fixture(onTestFinished);
  f.packages.delete(f.local);
  const before = await f.fingerprint();
  expect(f.listings).toEqual([f.hoisted]);
  f.version(f.hoisted, "core", "0.6.21");
  expect(await f.fingerprint()).not.toBe(before);
  f.packages.clear();
  expect(await f.fingerprint()).not.toBe(before);
});

test("an unreadable Jini directory aborts config loading instead of reusing an old cache", async ({ onTestFinished }) => {
  const f = fixture(onTestFinished);
  const error = new Error("Cannot list installed Jini packages");
  await expect(adminJiniDependencyFingerprint({ adminDir: f.adminDir }, {
    ...f.ports, listPackages: () => { throw error; },
  })).rejects.toThrow(error);
});
