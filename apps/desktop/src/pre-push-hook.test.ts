/**
 * @file END-TO-END tests for `scripts/hooks/pre-push`'s decision to run or skip the desktop gates.
 *
 * Every case runs the REAL hook with bash inside a throwaway repo that has a bare "origin", feeding
 * it the same `<local ref> <local sha> <remote ref> <remote sha>` lines git writes to a pre-push
 * hook's stdin. The repo's `apps/desktop/package.json` defines `gates` as an echo of a marker, so
 * "the gates ran" is observable without electron or the real gate suite.
 *
 * The case that motivated this file: a NEW branch has no @{push}, and the hook used to treat that
 * as "desktop changed" — so every new per-lot branch pushed from a cloud container (no electron)
 * was blocked by gates that could not run there.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "scripts", "hooks", "pre-push");
const ZERO = "0".repeat(40);
const GATES_RAN = "GATES-RAN-MARKER";

/** Environment for child git/bash: no GIT_* leaking in when these tests themselves run from a hook. */
const childEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")));

/** Runs git in `cwd` with a fixed identity and no hooks, throwing on a non-zero exit. */
function git(cwd: string, ...args: string[]): string {
  const result = spawnSync(
    "git",
    ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args],
    { cwd, encoding: "utf8", env: childEnv }
  );
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
}

/** Writes `file` (relative to `work`) and commits it, returning the new HEAD sha. */
function commitFile(work: string, file: string, content: string): string {
  mkdirSync(path.dirname(path.join(work, file)), { recursive: true });
  writeFileSync(path.join(work, file), content);
  git(work, "add", "--", file);
  git(work, "commit", "-q", "-m", `edit ${file}`);
  return git(work, "rev-parse", "HEAD");
}

/** A work repo whose `main` is already pushed to a bare origin, plus a cleanup function. */
function makeRepo(): { work: string; cleanup: () => void } {
  const root = mkdtempSync(path.join(os.tmpdir(), "tovu-prepush-"));
  const bare = path.join(root, "origin.git");
  const work = path.join(root, "work");
  git(root, "init", "-q", "--bare", bare);
  git(root, "init", "-q", "-b", "main", work);
  writeFileSync(path.join(work, "README.md"), "base\n");
  commitFile(work, "apps/desktop/package.json", JSON.stringify({ scripts: { gates: `echo ${GATES_RAN}` } }));
  git(work, "remote", "add", "origin", bare);
  git(work, "push", "-q", "origin", "main");
  return { work, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

/** Runs the real hook in `work` with `stdin` as git's ref lines; status is read off the child directly. */
function runHook(work: string, stdin: string): { status: number | null; stdout: string } {
  const result = spawnSync("bash", [HOOK, "origin", path.join(work, "..", "origin.git")], {
    cwd: work,
    input: stdin,
    encoding: "utf8",
    env: childEnv,
  });
  return { status: result.status, stdout: result.stdout ?? "" };
}

test("a NEW branch with no apps/desktop changes skips the gates", () => {
  const { work, cleanup } = makeRepo();
  try {
    git(work, "checkout", "-q", "-b", "lot-1");
    const sha = commitFile(work, "README.md", "lot change\n");
    const { status, stdout } = runHook(work, `refs/heads/lot-1 ${sha} refs/heads/lot-1 ${ZERO}\n`);
    assert.equal(status, 0);
    assert.match(stdout, /skipping desktop gates/);
    assert.doesNotMatch(stdout, new RegExp(GATES_RAN));
  } finally {
    cleanup();
  }
});

test("a NEW branch that changes apps/desktop runs the gates", () => {
  const { work, cleanup } = makeRepo();
  try {
    git(work, "checkout", "-q", "-b", "lot-2");
    const sha = commitFile(work, "apps/desktop/src/x.ts", "export {};\n");
    const { status, stdout } = runHook(work, `refs/heads/lot-2 ${sha} refs/heads/lot-2 ${ZERO}\n`);
    assert.equal(status, 0);
    assert.match(stdout, new RegExp(GATES_RAN));
  } finally {
    cleanup();
  }
});

test("a NEW branch that changes only eslint.config.mjs runs the gates, matching the workflow filter", () => {
  const { work, cleanup } = makeRepo();
  try {
    git(work, "checkout", "-q", "-b", "lot-3");
    const sha = commitFile(work, "eslint.config.mjs", "export default [];\n");
    const { stdout } = runHook(work, `refs/heads/lot-3 ${sha} refs/heads/lot-3 ${ZERO}\n`);
    assert.match(stdout, new RegExp(GATES_RAN));
  } finally {
    cleanup();
  }
});

test("an EXISTING branch keeps its behaviour: skip without desktop changes, gates with them", () => {
  const { work, cleanup } = makeRepo();
  try {
    const remoteSha = git(work, "rev-parse", "origin/main");
    const plainSha = commitFile(work, "README.md", "more\n");
    const skipped = runHook(work, `refs/heads/main ${plainSha} refs/heads/main ${remoteSha}\n`);
    assert.equal(skipped.status, 0);
    assert.match(skipped.stdout, /skipping desktop gates/);

    const desktopSha = commitFile(work, "apps/desktop/src/y.ts", "export {};\n");
    const gated = runHook(work, `refs/heads/main ${desktopSha} refs/heads/main ${remoteSha}\n`);
    assert.match(gated.stdout, new RegExp(GATES_RAN));
  } finally {
    cleanup();
  }
});

test("deleting a remote branch skips the gates", () => {
  const { work, cleanup } = makeRepo();
  try {
    const remoteSha = git(work, "rev-parse", "origin/main");
    const { status, stdout } = runHook(work, `(delete) ${ZERO} refs/heads/old-lot ${remoteSha}\n`);
    assert.equal(status, 0);
    assert.match(stdout, /skipping desktop gates/);
  } finally {
    cleanup();
  }
});

test("a NEW branch with no remote-tracking refs to compare against fails safe and runs the gates", () => {
  const { work, cleanup } = makeRepo();
  try {
    git(work, "update-ref", "-d", "refs/remotes/origin/main");
    git(work, "checkout", "-q", "-b", "lot-4");
    const sha = commitFile(work, "README.md", "no base\n");
    const { stdout } = runHook(work, `refs/heads/lot-4 ${sha} refs/heads/lot-4 ${ZERO}\n`);
    assert.match(stdout, new RegExp(GATES_RAN));
  } finally {
    cleanup();
  }
});

test("a failing gate still aborts the push with a non-zero exit", () => {
  const { work, cleanup } = makeRepo();
  try {
    commitFile(work, "apps/desktop/package.json", JSON.stringify({ scripts: { gates: "exit 1" } }));
    git(work, "checkout", "-q", "-b", "lot-5");
    const sha = git(work, "rev-parse", "HEAD");
    const { status } = runHook(work, `refs/heads/lot-5 ${sha} refs/heads/lot-5 ${ZERO}\n`);
    assert.equal(status, 1);
  } finally {
    cleanup();
  }
});
