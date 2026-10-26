/**
 * Platforms without `O_NOFOLLOW` or `O_NONBLOCK` (Windows) open planned files with plain `O_RDONLY`.
 * This process replaces `node:fs` constants before `sources.ts` loads, so the fallback is proven on
 * Linux too.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test, { mock } from "node:test";

const constants = { ...fs.constants, O_NOFOLLOW: undefined, O_NONBLOCK: undefined };
mock.module("node:fs", { defaultExport: { ...fs, constants }, namedExports: { ...fs, constants } });

test("without O_NOFOLLOW or O_NONBLOCK a planned file is opened read-only", async () => {
  const { readPlannedFile } = await import("../sources.js");
  const flags: number[] = [];
  const result = await readPlannedFile({ path: "themes/a", bytes: 1, scope: "themes", root: "/never", absPath: "/never/read", mtimeMs: 1, identity: null }, { fileSystem: {
    open: async (_file, openFlags) => { flags.push(openFlags); throw new Error("not opened"); },
    lstat: async () => ({ isDirectory: () => false, isSymbolicLink: () => false, dev: 1n, ino: 1n }),
    realpath: async (file) => file,
  } });
  assert.deepEqual(flags, [fs.constants.O_RDONLY]);
  assert.deepEqual(result, { ok: false, message: "'themes/a' changed since the plan was made. Call site_backup_plan again." });
});
