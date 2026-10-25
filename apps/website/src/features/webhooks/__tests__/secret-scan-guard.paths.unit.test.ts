import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { type TestContext } from "node:test";

import { main, scanGitHistoryForSecrets, scanRepoForSecrets } from "../secret-scan-guard.js";

/**
 * @file Owner-approved FU-A 2d (2026-10-25): a credential can live in a file or directory NAME, so
 * tracked and historical paths are scanned before extension filtering and blob dedupe, and every
 * diagnostic redacts the matched value (a report must never re-leak the token it found).
 */

const GHP = `ghp_${"a".repeat(36)}`; // synthetic, real classic-PAT length
const GHP_NAME = "GitHub personal access token (classic, ghp_)";

function tempRepo(t: TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "secret-scan-paths-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  const write = (rel: string, data: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), data);
  };
  const remove = (rel: string) => fs.rmSync(path.join(root, rel));
  const commit = () => { git("add", "-A"); git("commit", "-q", "--allow-empty", "-m", "fixture"); };
  return { root, write, remove, commit };
}

test("tip: an EMPTY file whose name is a token is reported as a path hit, redacted", (t) => {
  const repo = tempRepo(t);
  repo.write(`${GHP}.txt`, "");
  repo.commit();
  const violations = scanRepoForSecrets({ repoRoot: repo.root });
  assert.deepEqual(violations, [{ file: "[redacted].txt", patternName: GHP_NAME, line: "path" }]);
  assert.equal(JSON.stringify(violations).includes(GHP), false);
});

test("tip: path hits come before extension filtering (a skipped media extension) and cover directory names", (t) => {
  const repo = tempRepo(t);
  repo.write(`img/${GHP}.png`, "");
  repo.write(`dir-${GHP}/x.txt`, "");
  repo.commit();
  assert.deepEqual(scanRepoForSecrets({ repoRoot: repo.root }), [
    { file: "dir-[redacted]/x.txt", patternName: GHP_NAME, line: "path" },
    { file: "img/[redacted].png", patternName: GHP_NAME, line: "path" },
  ]);
});

test("tip: a content hit under a credential-named path is reported with the path redacted", (t) => {
  const repo = tempRepo(t);
  repo.write(`notes-${GHP}.txt`, `x\n${GHP}`);
  repo.commit();
  assert.deepEqual(scanRepoForSecrets({ repoRoot: repo.root }), [
    { file: "notes-[redacted].txt", patternName: GHP_NAME, line: "path" },
    { file: "notes-[redacted].txt", patternName: GHP_NAME, line: 2 },
  ]);
});

test("history: a removed token-named file sharing its (empty) blob with an innocent file is still reported", (t) => {
  const repo = tempRepo(t);
  repo.write("a.txt", "");
  repo.write(`${GHP}.txt`, "");
  repo.commit();
  repo.remove(`${GHP}.txt`);
  repo.commit();
  assert.deepEqual(scanRepoForSecrets({ repoRoot: repo.root }), []);
  assert.deepEqual(scanGitHistoryForSecrets({ repoRoot: repo.root }), [{ file: "[redacted].txt", patternName: GHP_NAME, line: "path" }]);
});

test("history: a token-named path with a skipped extension is reported once even if committed twice", (t) => {
  const repo = tempRepo(t);
  repo.write(`${GHP}.png`, "one");
  repo.commit();
  repo.write(`${GHP}.png`, "two");
  repo.commit();
  assert.deepEqual(scanGitHistoryForSecrets({ repoRoot: repo.root }), [{ file: "[redacted].png", patternName: GHP_NAME, line: "path" }]);
});

test("main(): the CLI report never prints the token found in a path", (t) => {
  const repo = tempRepo(t);
  repo.write(`${GHP}.txt`, "");
  repo.commit();
  const err: string[] = [];
  const codes: number[] = [];
  main({ repoRoot: repo.root, log: () => {}, error: (l) => err.push(l), exit: (c) => codes.push(c) });
  assert.deepEqual(codes, [1]);
  assert.equal(err[1], `  - [redacted].txt:path [${GHP_NAME}]`);
  assert.equal(err.join("\n").includes(GHP), false);
});
