import "../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { createSiteRouteDeps } from "../deps.js";

// RED: mkdir/containment errors escaped composition and prevented the whole site booting.
test("bad private share storage logs and disables only sharing", async t => {
  const directory = await mkdtemp(path.join(tmpdir(), "share-boot-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const previous = process.env.TOVU_SHARE_STORAGE_DIR;
  t.after(() => { if (previous === undefined) delete process.env.TOVU_SHARE_STORAGE_DIR; else process.env.TOVU_SHARE_STORAGE_DIR = previous; });
  const errors: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { errors.push(args); });
  const siteDir = path.join(directory, "site"), themesDir = path.join(siteDir, "themes"), uploadsDir = path.join(siteDir, "uploads");
  await mkdir(themesDir, { recursive: true });
  await mkdir(uploadsDir, { recursive: true });
  const notDirectory = path.join(directory, "file");
  await writeFile(notDirectory, "not a directory");
  for (const [index, invalid] of [notDirectory, path.join(themesDir, "public-shares")].entries()) {
    process.env.TOVU_SHARE_STORAGE_DIR = invalid;
    let close: (() => Promise<void>) | undefined;
    const deps = await createSiteRouteDeps(path.join(directory, `content-${index}.db`), {
      themesDir, uploadsDir,
      siteBinding: { dir: siteDir, name: "site", dirOverridden: true, switcherCompatible: false },
      onStoreOpened: store => { close = () => store.close(); },
    });
    try {
      await deps.identityReady;
      assert.ok(deps.siteBackupSources);
      assert.equal(deps.siteShareBackend, undefined);
      assert.ok(errors.at(-1)?.some(value => String(value).includes("[site-share]")));
    } finally { await close?.(); }
  }
});
