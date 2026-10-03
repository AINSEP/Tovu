import assert from "node:assert/strict";
import test from "node:test";
import { repositoryTargetError } from "../repository-target.js";

// F4.4: each fixture violates only the field under test, without a provider-specific guard.
test("generic owner and repo reject separators, whitespace, controls, dot segments and overlong names", () => {
  const invalid = ["", ".", "..", "a/b", "a\\b", "a b", "a\tb", "a\u0000b", "a\u001fb", "a\u007fb", "x".repeat(101)];
  for (const value of invalid) {
    assert.equal(repositoryTargetError({ owner: value, repo: "valid" }), `invalid owner '${value.slice(0, 60)}'`);
    assert.equal(repositoryTargetError({ owner: "valid", repo: value }), `invalid repo '${value.slice(0, 100)}'`);
  }
  assert.equal(repositoryTargetError({ owner: "x".repeat(100), repo: "r".repeat(100) }), null);
  assert.equal(repositoryTargetError({ owner: "team_name", repo: "repo.v2" }), null);
});

test("host refusal wins before generic validation, and a host approval still gets generic validation", () => {
  const seen: unknown[] = [];
  assert.equal(repositoryTargetError({ owner: "a/b", repo: "repo" }, (p) => { seen.push(p); return "host refuses owner"; }), "host refuses owner");
  assert.deepEqual(seen, [{ owner: "a/b", repo: "repo" }]);
  assert.equal(repositoryTargetError({ owner: "team", repo: "a/b" }, () => null), "invalid repo 'a/b'");
});

// BUG probe (F4.4): a final line terminator must not evade the one-path-segment rule.
test("a trailing newline is invalid in an owner URL segment", () => {
  assert.equal(repositoryTargetError({ owner: "team\n", repo: "archive" }), "invalid owner 'team\n'");
});

test("a trailing newline is invalid in a repository URL segment", () => {
  assert.equal(repositoryTargetError({ owner: "team", repo: "archive\n" }), "invalid repo 'archive\n'");
});
