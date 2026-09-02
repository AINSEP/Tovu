import assert from "node:assert/strict";
import test from "node:test";

import { scanTextForSecrets, scanRepoForSecrets } from "../secret-scan-guard.js";

/**
 * @file Two things, matching `seal-aad-invariant.test.ts`'s own split (see that file for why):
 *
 *  1. Parser-shape unit tests against synthetic text — including the exact-length trap the AIza
 *     format needs (see `secret-scan-guard.ts`'s header) and one positive/negative pair per vendor
 *     pattern.
 *
 *  2. A REAL regression test against the actual tracked repo, proving it is clean today (given the
 *     ALLOWLIST) and that this check genuinely goes RED on a real hit — verified by hand: staging a
 *     realistic-length fake credential in a tracked scratch file and re-running this exact check
 *     failed, naming that file and line, before the file was removed and unstaged. See this task's
 *     handoff for the pasted before/after run output; this test's job is to keep failing that way
 *     forever, not to re-prove it once by hand.
 *
 * None of the strings below are real credentials — every one is synthetic, built only to match the
 * vendor's real character alphabet and length so the regex is exercised correctly. This is the same
 * technique the real leaked fixture in `secret-sealer.aesgcm.test.ts` should have used from the
 * start (see that file's history for the fix).
 */

test("a Google AIza key of the real 39-char length is flagged", () => {
  const fakeKey = `AIza${"x".repeat(35)}`; // 39 chars total — the real fixed length
  const hits = scanTextForSecrets(`const key = "${fakeKey}";`);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].patternName, "Google API key (AIza)");
});

test("EXACT-LENGTH TRAP: a longer valid-charset run than 39 chars is NOT flagged as a 39-char AIza key", () => {
  // This is the shape that would trip an unanchored `{35}` pattern — see the file header's
  // exact-length-trap note. All 44 characters are within AIza's valid charset.
  const longerRun = `AIza${"x".repeat(40)}`;
  assert.deepEqual(scanTextForSecrets(`const key = "${longerRun}";`), []);
});

test("an Anthropic-shaped fixture shorter than the real ~90+ char minimum is not flagged", () => {
  const shortFixture = `sk-ant-${"x".repeat(21)}`; // 28 chars total — this repo's real fixture length
  assert.deepEqual(scanTextForSecrets(shortFixture), []);
});

test("a real-length Anthropic key (90+ chars after sk-ant-) is flagged", () => {
  const realLength = `sk-ant-${"x".repeat(95)}`;
  const hits = scanTextForSecrets(realLength);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].patternName, "Anthropic API key (sk-ant-)");
});

test("a GitHub classic PAT-shaped fixture shorter than 36 chars after ghp_ is not flagged", () => {
  assert.deepEqual(scanTextForSecrets(`ghp_${"x".repeat(29)}`), []); // this repo's real fixture length
});

test("a real-length GitHub classic PAT (exactly 36 chars after ghp_) is flagged", () => {
  const hits = scanTextForSecrets(`ghp_${"x".repeat(36)}`);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].patternName, "GitHub personal access token (classic, ghp_)");
});

test("a GitHub fine-grained PAT-shaped fixture shorter than 80 chars is not flagged", () => {
  assert.deepEqual(scanTextForSecrets(`github_pat_${"x".repeat(32)}`), []); // this repo's real fixture length
});

test("an npm access token of the real length is flagged", () => {
  const hits = scanTextForSecrets(`npm_${"x".repeat(36)}`);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].patternName, "npm access token");
});

test("an AWS access key ID is flagged", () => {
  const hits = scanTextForSecrets(`AKIA${"Q".repeat(16)}`);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].patternName, "AWS access key ID");
});

test("a Slack token is flagged", () => {
  const hits = scanTextForSecrets(`xoxb-${"1".repeat(20)}`);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].patternName, "Slack token");
});

test("a PEM private key block is flagged regardless of surrounding content", () => {
  const src = "-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----";
  const hits = scanTextForSecrets(src);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].patternName, "PEM private key block");
});

test("ordinary opaque ids (uuids, long hex hashes) are never flagged", () => {
  const src = `id: "550e8400-e29b-41d4-a716-446655440000", sha: "${"a".repeat(64)}"`;
  assert.deepEqual(scanTextForSecrets(src), []);
});

test("REGRESSION: the real tracked repo has zero un-allowlisted credential-shaped strings today", () => {
  const violations = scanRepoForSecrets();
  assert.deepEqual(
    violations,
    [],
    `expected zero credential-shaped strings in tracked files, got: ${JSON.stringify(violations, null, 2)}`,
  );
});
