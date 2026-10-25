import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import {
  isAllowlisted,
  main,
  scanGitHistoryForSecrets,
  scanRepoForSecrets,
  scanTextForSecrets,
} from "../secret-scan-guard.js";

/**
 * @file In-process tests for the guard's injected ports (`repoRoot`, `patterns`, CLI log/error/exit),
 * written for the 2026-10-25 Stryker lane L14 gaps: each ALLOWLIST clause individually required,
 * SKIP_EXTENSIONS honoured (tip and history), the size cap and binary heuristic, and the CLI's
 * exit/output paths. `secret-scan-guard.test.ts` keeps the real-repo regression and the spawned-CLI
 * test; this file never touches the real repo.
 */

const GHP = `ghp_${"a".repeat(36)}`; // synthetic, real classic-PAT length
const GHP_NAME = "GitHub personal access token (classic, ghp_)";
const PEM = ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ");
const PEM_NAME = "PEM private key block";
const PEM_ALLOWLISTED_FILE = "apps/admin/.certs.disabled/localhost-key.pem";
const EIGHT_MIB = 8 * 1024 * 1024;

function tempRepo(t: TestContext): { root: string; write: (rel: string, data: string | Buffer) => void; commit: () => void; git: (...a: string[]) => string } {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "secret-scan-ports-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  const write = (rel: string, data: string | Buffer) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), data);
  };
  const commit = () => {
    git("add", "-A");
    git("commit", "-q", "--allow-empty", "-m", "fixture");
  };
  return { root, write, commit, git };
}

test("scanTextForSecrets: a non-global injected pattern still finds every occurrence, with exact index and value", () => {
  const hits = scanTextForSecrets("x TOKEN y TOKEN", { patterns: [{ name: "t", pattern: /TOKEN/ }] });
  assert.deepEqual(hits, [
    { patternName: "t", index: 2, value: "TOKEN" },
    { patternName: "t", index: 10, value: "TOKEN" },
  ]);
});

test("scanTextForSecrets: an already-global pattern is used as-is (no duplicate 'g' flag error)", () => {
  const hits = scanTextForSecrets("ab ab", { patterns: [{ name: "g", pattern: /ab/g }] });
  assert.deepEqual(hits.map((h) => h.index), [0, 3]);
});

test("scanTextForSecrets: a zero-length match advances instead of looping, reporting each position once", () => {
  const hits = scanTextForSecrets("xax", { patterns: [{ name: "z", pattern: /(?=x)/ }] });
  assert.deepEqual(hits, [
    { patternName: "z", index: 0, value: "" },
    { patternName: "z", index: 2, value: "" },
  ]);
});

test("scanTextForSecrets: hits from several patterns are reported in catalog order", () => {
  const hits = scanTextForSecrets("b a", { patterns: [{ name: "A", pattern: /a/ }, { name: "B", pattern: /b/ }] });
  assert.deepEqual(hits.map((h) => `${h.patternName}@${h.index}`), ["A@2", "B@0"]);
});

test("isAllowlisted: file, pattern name and exact value are EACH required (any one wrong → not allowlisted)", () => {
  assert.equal(isAllowlisted(PEM_ALLOWLISTED_FILE, PEM_NAME, PEM), true);
  const cases: Array<[string, string, string]> = [
    ["apps/admin/.certs.disabled/other-key.pem", PEM_NAME, PEM],
    [PEM_ALLOWLISTED_FILE, GHP_NAME, PEM],
    [PEM_ALLOWLISTED_FILE, PEM_NAME, `${PEM} `],
    ["", "", ""],
  ];
  for (const [file, name, value] of cases) {
    assert.equal(isAllowlisted(file, name, value), false, `${file} | ${name} | ${value}`);
  }
});

test("scanRepoForSecrets(repoRoot): reports the 1-based line, filters the exact allowlisted pair, keeps the same value elsewhere", (t) => {
  const repo = tempRepo(t);
  repo.write("a.txt", `one\ntwo\ntoken=${GHP}\n`);
  repo.write(PEM_ALLOWLISTED_FILE, PEM);
  repo.write("other/key.pem", `\n${PEM}`);
  repo.commit();
  assert.deepEqual(
    scanRepoForSecrets({ repoRoot: repo.root }).sort((x, y) => x.file.localeCompare(y.file)),
    [
      { file: "a.txt", patternName: GHP_NAME, line: 3 },
      { file: "other/key.pem", patternName: PEM_NAME, line: 2 },
    ],
  );
});

test("scanRepoForSecrets(repoRoot): an empty repository has no tracked files and no violations", (t) => {
  const repo = tempRepo(t);
  assert.deepEqual(scanRepoForSecrets({ repoRoot: repo.root }), []);
});

const SKIPPED = [".png", ".jpg", ".jpeg", ".gif", ".ico", ".icns", ".webp", ".avif", ".woff", ".woff2", ".ttf", ".otf", ".eot", ".mp4", ".webm", ".mov", ".mp3", ".wav", ".pdf"];

test("SKIP_EXTENSIONS: every listed media extension is skipped (case-insensitive) in the tip AND in history; .db/.sqlite/.svg are scanned", (t) => {
  const repo = tempRepo(t);
  for (const ext of SKIPPED) repo.write(`m/f${ext}`, GHP);
  repo.write("m/UPPER.PNG", GHP);
  for (const ext of [".db", ".sqlite", ".svg"]) repo.write(`s/f${ext}`, GHP);
  repo.commit();
  const expected = ["s/f.db", "s/f.sqlite", "s/f.svg"];
  assert.deepEqual(scanRepoForSecrets({ repoRoot: repo.root }).map((v) => v.file).sort(), expected);
  // Identical content is one blob in history (deduped by sha, first-seen path), so give each its own.
  const hist = tempRepo(t);
  SKIPPED.forEach((ext, i) => hist.write(`m/f${ext}`, `${i} ${GHP}`));
  hist.write("m/UPPER.PNG", `upper ${GHP}`);
  hist.write("s/f.db", `db ${GHP}`);
  hist.commit();
  assert.deepEqual(scanGitHistoryForSecrets({ repoRoot: hist.root }).map((v) => v.file), ["s/f.db"]);
});

test("tip scan: a tracked file missing from disk, a tracked symlink to a directory, and an over-cap file are skipped; exactly the cap is scanned", (t) => {
  const repo = tempRepo(t);
  repo.write("gone.txt", GHP);
  fs.mkdirSync(path.join(repo.root, "dir"));
  fs.writeFileSync(path.join(repo.root, "dir", ".keep"), "");
  fs.symlinkSync("dir", path.join(repo.root, "link-to-dir"));
  const atCap = Buffer.alloc(EIGHT_MIB, 0x20);
  atCap.write(GHP, EIGHT_MIB - GHP.length - 1);
  repo.write("at-cap.txt", atCap);
  const overCap = Buffer.alloc(EIGHT_MIB + 1, 0x20);
  overCap.write(GHP, 0);
  repo.write("over-cap.txt", overCap);
  repo.commit();
  fs.rmSync(path.join(repo.root, "gone.txt"));
  assert.deepEqual(scanRepoForSecrets({ repoRoot: repo.root }), [{ file: "at-cap.txt", patternName: GHP_NAME, line: 1 }]);
});

test("binary heuristic: a NUL within the first 8000 bytes reports 'binary'; a NUL only after byte 8000 reports a line (tip and history)", (t) => {
  const repo = tempRepo(t);
  repo.write("early.bin", Buffer.concat([Buffer.from("x"), Buffer.from([0]), Buffer.from(`\n${GHP}`)]));
  const late = Buffer.concat([Buffer.alloc(8000, 0x20), Buffer.from([0]), Buffer.from(`\n\n${GHP}`)]);
  repo.write("late.bin", late);
  repo.commit();
  const byFile = (vs: ReturnType<typeof scanRepoForSecrets>) => Object.fromEntries(vs.map((v) => [v.file, v.line]));
  assert.deepEqual(byFile(scanRepoForSecrets({ repoRoot: repo.root })), { "early.bin": "binary", "late.bin": 3 });
  assert.deepEqual(byFile(scanGitHistoryForSecrets({ repoRoot: repo.root })), { "early.bin": "binary", "late.bin": 3 });
});

test("history scan: an over-cap historical blob is skipped; a blob at exactly the cap is scanned; an empty repo yields nothing", (t) => {
  const empty = tempRepo(t);
  assert.deepEqual(scanGitHistoryForSecrets({ repoRoot: empty.root }), []);
  const repo = tempRepo(t);
  const atCap = Buffer.alloc(EIGHT_MIB, 0x20);
  atCap.write(GHP, 0);
  const overCap = Buffer.alloc(EIGHT_MIB + 1, 0x20);
  overCap.write(`${GHP}`, 100);
  repo.write("at.txt", atCap);
  repo.write("over.txt", overCap);
  repo.commit();
  assert.deepEqual(scanGitHistoryForSecrets({ repoRoot: repo.root }), [{ file: "at.txt", patternName: GHP_NAME, line: 1 }]);
});

function cli(root: string) {
  const out: string[] = [];
  const err: string[] = [];
  const codes: number[] = [];
  main({ repoRoot: root, log: (l) => out.push(l), error: (l) => err.push(l), exit: (c) => codes.push(c) });
  return { out, err, codes };
}

test("main(): a clean repo logs OK, writes no errors and does not exit", (t) => {
  const repo = tempRepo(t);
  repo.write("ok.txt", "nothing here");
  repo.commit();
  const r = cli(repo.root);
  assert.deepEqual(r.out, ["check:secret-scan — OK: no credential-shaped string found in any tracked file or git history."]);
  assert.deepEqual(r.err, []);
  assert.deepEqual(r.codes, []);
});

test("main(): a tip leak lists BOTH sections (it is also in history) and exits 1", (t) => {
  const repo = tempRepo(t);
  repo.write("leak.txt", `\n${GHP}`);
  repo.commit();
  const r = cli(repo.root);
  assert.deepEqual(r.out, []);
  assert.deepEqual(r.codes, [1]);
  assert.equal(r.err[0], "check:secret-scan — 1 credential-shaped string(s) found in tracked files:");
  assert.equal(r.err[1], `  - leak.txt:2 [${GHP_NAME}]`);
  assert.equal(r.err[2], "check:secret-scan — 1 credential-shaped string(s) found in git history (not necessarily present in the current tree):");
  assert.equal(r.err[3], `  - leak.txt:2 [${GHP_NAME}]`);
  assert.match(r.err[4] ?? "", /revoke\/rotate it immediately/);
  assert.equal(r.err.length, 5);
});

test("main(): a history-only leak omits the tracked-files section and still exits 1", (t) => {
  const repo = tempRepo(t);
  repo.write("leak.txt", GHP);
  repo.commit();
  repo.write("leak.txt", "removed");
  repo.commit();
  const r = cli(repo.root);
  assert.deepEqual(r.codes, [1]);
  assert.equal(r.err.some((l) => l.includes("found in tracked files")), false);
  assert.equal(r.err[0], "check:secret-scan — 1 credential-shaped string(s) found in git history (not necessarily present in the current tree):");
  assert.equal(r.err[1], `  - leak.txt:1 [${GHP_NAME}]`);
});

test("ALLOWLIST: each of the three reviewed entries allowlists exactly its own (file, pattern, value)", () => {
  assert.equal(isAllowlisted("development/e2e/byok-google-tool-schema.spec.ts", "Google API key (AIza)", "AIzaTest-FAKE-GEMINI-KEY-NOT-REAL-0000000000"), true);
  assert.equal(isAllowlisted(PEM_ALLOWLISTED_FILE, PEM_NAME, PEM), true);
  assert.equal(isAllowlisted("ADS-memory/reports/swarm-consensus/offloads/2026-08-12-deploy/sonnet5-round3.md", PEM_NAME, PEM), true);
  assert.equal(isAllowlisted("ADS-memory/reports/swarm-consensus/offloads/2026-08-12-deploy/sonnet5-round3.md", GHP_NAME, PEM), false);
});

test("scanTextForSecrets: two ADJACENT matches are both reported (a non-empty match does not skip a character)", () => {
  const hits = scanTextForSecrets("TOKENTOKEN", { patterns: [{ name: "t", pattern: /TOKEN/ }] });
  assert.deepEqual(hits.map((h) => h.index), [0, 5]);
});

test("history scan: identical content at two paths is scanned once and reported under its FIRST-seen path", (t) => {
  const repo = tempRepo(t);
  repo.write("a.txt", GHP);
  repo.write("b.txt", GHP);
  repo.commit();
  assert.deepEqual(scanGitHistoryForSecrets({ repoRoot: repo.root }), [{ file: "a.txt", patternName: GHP_NAME, line: 1 }]);
});
