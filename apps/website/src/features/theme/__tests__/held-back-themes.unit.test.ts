import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { explainThemeTree as explainWithChecks } from "#src/features/site-backup/import-restore-placement";
import { checkHeldBackTheme, listHeldBackThemes, restoreHeldBackTheme } from "#src/features/theme/held-back-themes";
import { heldBackThemeName, isAbsent, isHeldBackFolder, parseHeldBackId, recordHeldBackChoice, readHeldBackChoice } from "#src/features/theme/held-back-choice";
import { THEME_PLACEMENT_CHECKS } from "#src/server/runtime/composition/theme-placement-checks";
/** The held-back re-check as the host binds it (`modules/theme-held-back.ts`). */
const explainThemeTree = (required: { root: string; id: string; files: readonly string[] }) => explainWithChecks({ ...required, themeChecks: THEME_PLACEMENT_CHECKS });

/**
 * @file The held-back theme service under the routes: id grammar, the link refusal, the import-time
 * marker writer, and the list's handling of a live compiled theme's preserved build source.
 */

const FIXTURE = path.resolve(import.meta.dirname, "../../../../../../development/fixtures/themes/minimal-declarative");

function site() {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-held-back-unit-"));
  const held = path.join(siteDir, ".import-quarantine", "themes");
  return { siteDir, themesDir: path.join(siteDir, "themes"), held };
}

function placeTheme(dir: string) {
  fs.cpSync(FIXTURE, dir, { recursive: true });
}

test("held-back id grammar rejects traversal, absolute paths and unknown tiers", () => {
  for (const themeId of ["../x", "static/../../etc", "/etc/passwd", "static/..", "static/.hidden", "templated/x", "static/a/b", "", "static/"]) {
    assert.throws(() => parseHeldBackId({ themeId }), (err: { code?: string }) => err.code === "INVALID_ID", themeId);
  }
  assert.deepEqual(parseHeldBackId({ themeId: "__original-themes__/static/My_Theme.v2" }), { id: "__original-themes__/static/My_Theme.v2", tierPath: "__original-themes__/static", name: "My_Theme.v2" });
});

test("held-back check refuses a tree that contains a link and never follows it", () => {
  const { siteDir, themesDir, held } = site();
  const dir = path.join(held, "declarative", "minimal-declarative");
  placeTheme(dir);
  const outside = path.join(siteDir, "secret.txt");
  fs.writeFileSync(outside, "do not read");
  fs.symlinkSync(outside, path.join(dir, "css", "linked.css"));
  const check = checkHeldBackTheme({ siteDir, themesDir, explainThemeTree, themeId: "declarative/minimal-declarative" });
  assert.equal(check.passes, false);
  assert.equal(check.digest, null);
  assert.match(check.problems.join(" "), /contains a link \(css\/linked\.css\)/);
  assert.throws(() => restoreHeldBackTheme({ siteDir, themesDir, explainThemeTree, themes: [], themeId: "declarative/minimal-declarative", approvedDigest: "x".repeat(64) }), (err: { code?: string }) => err.code === "CHECK_FAILED");
  assert.ok(fs.lstatSync(path.join(dir, "css", "linked.css")).isSymbolicLink());

  // A held-back folder that is itself a link is not addressable at all.
  fs.symlinkSync(dir, path.join(held, "declarative", "linked-theme"));
  assert.throws(() => checkHeldBackTheme({ siteDir, themesDir, explainThemeTree, themeId: "declarative/linked-theme" }), (err: { code?: string }) => err.code === "HELD_BACK_NOT_FOUND");
  assert.deepEqual(listHeldBackThemes({ siteDir, themesDir }).map(theme => theme.id), ["declarative/minimal-declarative"]);
});

test("held-back list skips a live compiled theme's preserved build source and keeps originals apart", () => {
  const { siteDir, themesDir, held } = site();
  fs.mkdirSync(path.join(themesDir, "static", "built"), { recursive: true });
  fs.mkdirSync(path.join(held, "static", "built", "src"), { recursive: true });
  fs.writeFileSync(path.join(held, "static", "built", "src", "main.tsx"), "export {};\n");
  placeTheme(path.join(held, "__original-themes__", "declarative", "minimal-declarative"));
  assert.deepEqual(listHeldBackThemes({ siteDir, themesDir }).map(({ id, tier, original }) => ({ id, tier, original })), [
    { id: "__original-themes__/declarative/minimal-declarative", tier: "declarative", original: true },
  ]);
});

test("held-back marker writer: writes the marker only when the chosen theme ended in quarantine", () => {
  const { siteDir, held } = site();
  placeTheme(path.join(held, "declarative", "minimal-declarative"));

  recordHeldBackChoice({ siteDir, chosenThemeId: "minimal-declarative", finalThemeId: "minimal-declarative" });
  assert.equal(readHeldBackChoice({ siteDir }), null, "kept live: no marker");
  recordHeldBackChoice({ siteDir, chosenThemeId: "not-held", finalThemeId: "starter" });
  assert.equal(readHeldBackChoice({ siteDir }), null, "switched off but not quarantined: no marker");
  // `themes/static/../declarative/minimal-declarative` would resolve to the real held-back folder.
  recordHeldBackChoice({ siteDir, chosenThemeId: "../declarative/minimal-declarative", finalThemeId: "starter" });
  assert.equal(fs.existsSync(path.join(siteDir, ".import-quarantine", "held-back-choice.json")), false, "an archive id is never used as a path");
  recordHeldBackChoice({ siteDir, chosenThemeId: null, finalThemeId: "starter" });
  assert.equal(readHeldBackChoice({ siteDir }), null);

  recordHeldBackChoice({ siteDir, chosenThemeId: "minimal-declarative", finalThemeId: "starter" });
  assert.deepEqual(readHeldBackChoice({ siteDir }), { chosenThemeId: "declarative/minimal-declarative", fallbackThemeId: "starter" });
});

test("held-back marker writer: a marker that arrived inside the imported archive is cleared when none is due", () => {
  const { siteDir, held } = site();
  placeTheme(path.join(held, "declarative", "minimal-declarative"));
  // Import places unknown archive files under `.import-quarantine/` verbatim, so an archive can
  // ship its own `held-back-choice.json`; only the import-time decision may leave one behind.
  const forged = path.join(siteDir, ".import-quarantine", "held-back-choice.json");
  fs.mkdirSync(path.dirname(forged), { recursive: true });
  fs.writeFileSync(forged, JSON.stringify({ chosenThemeId: "declarative/minimal-declarative", fallbackThemeId: "starter" }));
  recordHeldBackChoice({ siteDir, chosenThemeId: "starter", finalThemeId: "starter" });
  assert.equal(readHeldBackChoice({ siteDir }), null);
});

test("held-back list reads the manifest name without following a link and within a size bound", () => {
  const { siteDir, themesDir, held } = site();
  const linked = path.join(held, "declarative", "linked-manifest");
  placeTheme(linked);
  const outside = path.join(siteDir, "outside.json");
  fs.writeFileSync(outside, JSON.stringify({ name: "Read Through A Link" }));
  fs.rmSync(path.join(linked, "theme.json"));
  fs.symlinkSync(outside, path.join(linked, "theme.json"));
  const huge = path.join(held, "declarative", "huge-manifest");
  placeTheme(huge);
  // Valid JSON with a name, but far beyond any real manifest: must not be read whole.
  fs.writeFileSync(path.join(huge, "theme.json"), JSON.stringify({ name: "Huge", pad: "x".repeat(2 * 1024 * 1024) }));
  const names = Object.fromEntries(listHeldBackThemes({ siteDir, themesDir }).map(theme => [theme.id, theme.name]));
  assert.equal(names["declarative/linked-manifest"], "linked-manifest");
  assert.equal(names["declarative/huge-manifest"], "huge-manifest");
});

test("held-back restore refuses a live themes parent that is redirected by a link, and moves nothing", () => {
  const { siteDir, themesDir, held } = site();
  const dir = path.join(held, "declarative", "minimal-declarative");
  placeTheme(dir);
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-held-back-elsewhere-"));
  fs.mkdirSync(themesDir, { recursive: true });
  fs.symlinkSync(elsewhere, path.join(themesDir, "declarative"));
  const check = checkHeldBackTheme({ siteDir, themesDir, explainThemeTree, themeId: "declarative/minimal-declarative" });
  assert.equal(check.passes, true);
  assert.throws(
    () => restoreHeldBackTheme({ siteDir, themesDir, explainThemeTree, themes: [], themeId: "declarative/minimal-declarative", approvedDigest: check.digest! }),
    (err: { code?: string }) => err.code === "LIVE_FOLDER_UNSAFE",
  );
  assert.deepEqual(fs.readdirSync(elsewhere), []);
  assert.ok(fs.lstatSync(path.join(dir, "theme.json")).isFile());
});

test("held-back checks use code-unit file order for the approved digest", t => {
  const { siteDir, themesDir, held } = site();
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  const dir = path.join(held, "declarative", "minimal-declarative");
  placeTheme(dir);
  fs.writeFileSync(path.join(dir, "Z.css"), "upper-case-path");
  fs.writeFileSync(path.join(dir, "a.css"), "lower-case-path");
  const paths = (fs.readdirSync(dir, { recursive: true }) as string[]).filter(file => fs.statSync(path.join(dir, file)).isFile()).sort();
  const expected = createHash("sha256");
  for (const file of paths) {
    const bytes = fs.readFileSync(path.join(dir, file));
    expected.update(`${file}\0${bytes.byteLength}\0${createHash("sha256").update(bytes).digest("hex")}\n`);
  }
  const observed: string[] = [];
  const check = checkHeldBackTheme({ siteDir, themesDir, themeId: "declarative/minimal-declarative", explainThemeTree: required => {
    observed.push(...required.files);
    return explainThemeTree(required);
  } });
  assert.equal(check.passes, true);
  assert.deepEqual(observed, paths.map(file => `themes/declarative/minimal-declarative/${file}`));
  assert.ok(paths.indexOf("Z.css") < paths.indexOf("a.css"));
  assert.equal(check.digest, expected.digest("hex"));
});

test("isAbsent takes one args object, so the object form works with the optional pad omitted: only a missing path counts as absent", () => {
  assert.equal(isAbsent({ err: Object.assign(new Error("gone"), { code: "ENOENT" }) }), true);
  assert.equal(isAbsent({ err: Object.assign(new Error("not a folder"), { code: "ENOTDIR" }) }), true);
  assert.equal(isAbsent({ err: Object.assign(new Error("denied"), { code: "EACCES" }) }), false);
  assert.equal(isAbsent({ err: null }), false);
});

test("a malformed held-back manifest falls back to the folder name", t => {
  const { siteDir } = site();
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(siteDir, "theme.json"), "{invalid");
  assert.equal(heldBackThemeName({ dir: siteDir, fallback: "editorial-rose" }), "editorial-rose");
});

test("a marker filed as a directory reports a read fault instead of hiding the held-back notice", t => {
  const { siteDir } = site();
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(siteDir, ".import-quarantine", "held-back-choice.json"), { recursive: true });
  assert.throws(() => readHeldBackChoice({ siteDir }), { code: "EISDIR" });
});

test("a quarantine path loop is reported as a filesystem fault, not as an empty roster", t => {
  const { siteDir, themesDir, held } = site();
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  const quarantine = path.dirname(held);
  fs.symlinkSync(quarantine, quarantine);
  assert.throws(() => listHeldBackThemes({ siteDir, themesDir }), { code: "ELOOP" });
  assert.throws(() => isHeldBackFolder({ siteDir, id: "static/evening" }), { code: "ELOOP" });
});

test("checking a held-back manifest does not swallow a real read fault", t => {
  const { siteDir } = site();
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  const manifest = path.join(siteDir, "theme.json");
  fs.writeFileSync(manifest, '{"name":"Evening"}');
  const failure = Object.assign(new Error("manifest disk read failed"), { code: "EIO" });
  const open = fs.openSync;
  const calls: unknown[][] = [];
  t.mock.method(fs, "openSync", (...args: Parameters<typeof fs.openSync>) => {
    const [file, flags] = args;
    if (file !== manifest) return open(...args);
    calls.push([file, flags]);
    throw failure;
  });
  assert.throws(() => heldBackThemeName({ dir: siteDir, fallback: "evening" }), error => error === failure);
  assert.deepEqual(calls, [[manifest, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW]]);
});

test("listing propagates a read fault while resolving an otherwise addressable theme", t => {
  const { siteDir, themesDir, held } = site();
  t.after(() => fs.rmSync(siteDir, { recursive: true, force: true }));
  const dir = path.join(held, "static", "evening");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "theme.json"), '{"name":"Evening"}');
  assert.deepEqual(listHeldBackThemes({ siteDir, themesDir }).map(({ id, name }) => ({ id, name })),
    [{ id: "static/evening", name: "Evening" }]);

  const failure = Object.assign(new Error("quarantine disk read failed"), { code: "EIO" });
  const realpath = fs.realpathSync;
  t.mock.method(fs, "realpathSync", (file: fs.PathLike) => {
    if (file === dir) throw failure;
    return realpath(file);
  });
  assert.throws(() => listHeldBackThemes({ siteDir, themesDir }), error => error === failure);
});
