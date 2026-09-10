import assert from "node:assert/strict";
import test from "node:test";

import { CustomCredentialValidationError } from "../store.js";
import { isWorkflowPath, normalizeWriteFilePath, validateWriteFilesInput, WRITE_FILES_LIMITS } from "../write-files-validation.js";

/**
 * @file `write-files-validation.ts` — every refusal here must fire BEFORE `custom_credential_write_files`
 * ever resolves a credential or makes a network call (this file's own header). Covers: owner/repo/
 * branch/commitMessage shape, path safety (absolute, `..`, NUL, oversized, reserved `.git`), the
 * per-file/aggregate size caps, the file-count cap, duplicate-path detection, and `isWorkflowPath`'s
 * exact-match contract.
 */

const VALID = { owner: "octo", repo: "demo", branch: "main", commitMessage: "deploy", files: [{ path: "fly.toml", content: "app = 'demo'" }] };

test("a well-formed call validates and normalizes cleanly", () => {
  const result = validateWriteFilesInput(VALID);
  assert.deepEqual(result, { owner: "octo", repo: "demo", branch: "main", commitMessage: "deploy", files: [{ path: "fly.toml", content: "app = 'demo'" }] });
});

// ---------------------------------------------------------------------------
// owner / repo / branch / commitMessage shape
// ---------------------------------------------------------------------------

test("rejects an invalid owner", () => {
  assert.throws(() => validateWriteFilesInput({ ...VALID, owner: "-bad-owner" }), CustomCredentialValidationError);
  assert.throws(() => validateWriteFilesInput({ ...VALID, owner: "" }), CustomCredentialValidationError);
  assert.throws(() => validateWriteFilesInput({ ...VALID, owner: 42 }), CustomCredentialValidationError);
});

test("rejects an invalid repo", () => {
  assert.throws(() => validateWriteFilesInput({ ...VALID, repo: ".." }), CustomCredentialValidationError);
  assert.throws(() => validateWriteFilesInput({ ...VALID, repo: "has spaces" }), CustomCredentialValidationError);
});

test("rejects an invalid branch", () => {
  assert.throws(() => validateWriteFilesInput({ ...VALID, branch: "has spaces" }), CustomCredentialValidationError);
  assert.throws(() => validateWriteFilesInput({ ...VALID, branch: "" }), CustomCredentialValidationError);
});

test("accepts a branch name containing slashes", () => {
  const result = validateWriteFilesInput({ ...VALID, branch: "feature/deploy-fly" });
  assert.equal(result.branch, "feature/deploy-fly");
});

test("rejects an empty or oversized commitMessage", () => {
  assert.throws(() => validateWriteFilesInput({ ...VALID, commitMessage: "" }), CustomCredentialValidationError);
  assert.throws(() => validateWriteFilesInput({ ...VALID, commitMessage: "  " }), CustomCredentialValidationError);
  assert.throws(() => validateWriteFilesInput({ ...VALID, commitMessage: "x".repeat(501) }), CustomCredentialValidationError);
});

// ---------------------------------------------------------------------------
// path safety — each refused BEFORE any network call
// ---------------------------------------------------------------------------

test("rejects an absolute path", () => {
  assert.throws(() => normalizeWriteFilePath("/etc/passwd"), CustomCredentialValidationError);
  assert.throws(() => normalizeWriteFilePath("C:\\Windows\\system.ini"), CustomCredentialValidationError);
});

test("rejects a '..' traversal segment", () => {
  assert.throws(() => normalizeWriteFilePath("../../etc/passwd"), CustomCredentialValidationError);
  assert.throws(() => normalizeWriteFilePath("a/../../b"), CustomCredentialValidationError);
});

test("rejects a NUL byte", () => {
  assert.throws(() => normalizeWriteFilePath("fly.toml\0.png"), CustomCredentialValidationError);
});

test("rejects a path over the length cap", () => {
  assert.throws(() => normalizeWriteFilePath("a".repeat(WRITE_FILES_LIMITS.maxPathLength + 1)), CustomCredentialValidationError);
});

test("rejects an empty path, and a path that normalizes to nothing", () => {
  assert.throws(() => normalizeWriteFilePath(""), CustomCredentialValidationError);
  assert.throws(() => normalizeWriteFilePath("."), CustomCredentialValidationError);
  assert.throws(() => normalizeWriteFilePath("./"), CustomCredentialValidationError);
});

test("rejects a path naming or nesting under the reserved '.git' directory, case-insensitively", () => {
  assert.throws(() => normalizeWriteFilePath(".git"), CustomCredentialValidationError);
  assert.throws(() => normalizeWriteFilePath(".git/config"), CustomCredentialValidationError);
  assert.throws(() => normalizeWriteFilePath(".GIT/hooks/pre-commit"), CustomCredentialValidationError);
  assert.throws(() => normalizeWriteFilePath(".Git/HEAD"), CustomCredentialValidationError);
});

test("normalizes backslashes and a leading './' the same way package-paths.ts's lexical rules do", () => {
  assert.equal(normalizeWriteFilePath("./fly.toml"), "fly.toml");
  assert.equal(normalizeWriteFilePath("sub\\dir\\file.txt"), "sub/dir/file.txt");
});

test("a normal nested path is accepted unchanged", () => {
  assert.equal(normalizeWriteFilePath(".github/workflows/fly-deploy.yml"), ".github/workflows/fly-deploy.yml");
});

// ---------------------------------------------------------------------------
// counts and size caps
// ---------------------------------------------------------------------------

test("rejects an empty files array", () => {
  assert.throws(() => validateWriteFilesInput({ ...VALID, files: [] }), CustomCredentialValidationError);
});

test("rejects more files than the count cap", () => {
  const files = Array.from({ length: WRITE_FILES_LIMITS.maxFiles + 1 }, (_, i) => ({ path: `file-${i}.txt`, content: "x" }));
  assert.throws(() => validateWriteFilesInput({ ...VALID, files }), CustomCredentialValidationError);
});

test("accepts exactly the count cap", () => {
  const files = Array.from({ length: WRITE_FILES_LIMITS.maxFiles }, (_, i) => ({ path: `file-${i}.txt`, content: "x" }));
  const result = validateWriteFilesInput({ ...VALID, files });
  assert.equal(result.files.length, WRITE_FILES_LIMITS.maxFiles);
});

test("rejects a single file over the per-file byte cap", () => {
  const files = [{ path: "big.txt", content: "x".repeat(WRITE_FILES_LIMITS.maxFileBytes + 1) }];
  assert.throws(() => validateWriteFilesInput({ ...VALID, files }), CustomCredentialValidationError);
});

test("rejects files that individually pass the per-file cap but exceed the aggregate cap together", () => {
  // 5 files at 90% of the per-file cap sum to well over the (smaller) aggregate cap, while every
  // single file individually stays under both the per-file cap and the file-count cap.
  const perFile = Math.floor(WRITE_FILES_LIMITS.maxFileBytes * 0.9);
  const files = Array.from({ length: 5 }, (_, i) => ({ path: `f${i}.txt`, content: "x".repeat(perFile) }));
  for (const f of files) assert.ok(Buffer.byteLength(f.content, "utf8") <= WRITE_FILES_LIMITS.maxFileBytes);
  assert.ok(perFile * files.length > WRITE_FILES_LIMITS.maxTotalBytes);
  assert.throws(() => validateWriteFilesInput({ ...VALID, files }), CustomCredentialValidationError);
});

test("rejects a duplicate path within the same call, even when spelled differently before normalization", () => {
  const files = [
    { path: "./fly.toml", content: "a" },
    { path: "fly.toml", content: "b" },
  ];
  assert.throws(() => validateWriteFilesInput({ ...VALID, files }), CustomCredentialValidationError);
});

test("rejects a malformed file entry (missing content, wrong type, non-object)", () => {
  assert.throws(() => validateWriteFilesInput({ ...VALID, files: [{ path: "a.txt" }] }), CustomCredentialValidationError);
  assert.throws(() => validateWriteFilesInput({ ...VALID, files: [{ path: "a.txt", content: 123 }] }), CustomCredentialValidationError);
  assert.throws(() => validateWriteFilesInput({ ...VALID, files: ["not-an-object"] }), CustomCredentialValidationError);
});

// ---------------------------------------------------------------------------
// isWorkflowPath — exact match, no over/under-matching
// ---------------------------------------------------------------------------

test("isWorkflowPath matches exactly the GitHub-recognized directory", () => {
  assert.equal(isWorkflowPath(".github/workflows/fly-deploy.yml"), true);
  assert.equal(isWorkflowPath("fly.toml"), false);
  assert.equal(isWorkflowPath(".github/workflow/fly-deploy.yml"), false, "singular 'workflow' is not the real directory GitHub reads");
  assert.equal(isWorkflowPath("sub/.github/workflows/fly-deploy.yml"), false, "a nested .github is not the repo-root one GitHub Actions reads");
});
