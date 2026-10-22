import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";

import { githubValidateTarget } from "../../source-control/__tests__/fixtures/github-from-source.js";
import { CustomCredentialValidationError } from "../store.js";
import { normalizeWriteFilePath, validateRepositoryTarget, validateWriteFilesInput, WRITE_FILES_LIMITS } from "../write-files-validation.js";

/**
 * @file `write-files-validation.ts` — every refusal here must fire BEFORE `custom_credential_write_files`
 * ever resolves a credential or makes a network call (this file's own header; owner/repo run once the
 * host is known, before any decrypt). Covers: owner/repo (the host's rules, then the generic one),
 * branch/commitMessage shape, path safety (absolute, `..`, NUL, oversized, reserved `.git`), the
 * per-file/aggregate size caps, the file-count cap, and duplicate-path detection. The workflow-path
 * check moved to the github plugin's declared `workflowPaths` (`provider-registry.unit.test.ts`).
 */

const VALID = { branch: "main", commitMessage: "deploy", files: [{ path: "example-host.toml", content: "app = 'demo'" }] };
const github = await githubValidateTarget();

test("a well-formed call validates and normalizes cleanly", () => {
  const result = validateWriteFilesInput(VALID);
  assert.deepEqual(result, { branch: "main", commitMessage: "deploy", files: [{ path: "example-host.toml", content: "app = 'demo'" }] });
  assert.deepEqual(validateRepositoryTarget({ owner: "octo", repo: "demo" }, github), { owner: "octo", repo: "demo" });
});

// ---------------------------------------------------------------------------
// owner / repo / branch / commitMessage shape
// ---------------------------------------------------------------------------

test("rejects an invalid owner with the host's own text first", () => {
  assert.throws(() => validateRepositoryTarget({ owner: "-bad-owner", repo: "demo" }, github), new CustomCredentialValidationError("invalid GitHub owner '-bad-owner'"));
  assert.throws(() => validateRepositoryTarget({ owner: "", repo: "demo" }, github), new CustomCredentialValidationError("invalid GitHub owner ''"));
  assert.throws(() => validateRepositoryTarget({ owner: 42, repo: "demo" }, github), new CustomCredentialValidationError("invalid owner '42'"));
});

test("rejects an invalid repo with the host's own text first", () => {
  assert.throws(() => validateRepositoryTarget({ owner: "octo", repo: ".." }, github), new CustomCredentialValidationError("invalid GitHub repo '..'"));
  assert.throws(() => validateRepositoryTarget({ owner: "octo", repo: "has spaces" }, github), new CustomCredentialValidationError("invalid GitHub repo 'has spaces'"));
});

// Pins write-files-validation.ts:97 — repo must be a string before host validation.
test("rejects a numeric repo with a typed validation error", () => {
  assert.throws(() => validateRepositoryTarget({ owner: "octo", repo: 42 }, github), new CustomCredentialValidationError("invalid repo '42'"));
});

// Pins write-files-validation.ts:97 — arrays must not bypass repo validation through coercion.
test("rejects an array repo even when its string form is a valid name", () => {
  assert.throws(() => validateRepositoryTarget({ owner: "octo", repo: ["demo"] }, github), new CustomCredentialValidationError("invalid repo 'demo'"));
});

// Pins write-files-validation.ts:97 — an absent repo must fail the string guard.
test("rejects a missing repo with a typed validation error", () => {
  const target = { owner: "octo" } as Parameters<typeof validateRepositoryTarget>[0];
  assert.throws(() => validateRepositoryTarget(target, github), new CustomCredentialValidationError("invalid repo 'undefined'"));
});

// Pins write-files-validation.ts:97 — repo must be a string even without a host validator.
test("rejects a numeric repo without a host validator", () => {
  assert.throws(() => validateRepositoryTarget({ owner: "octo", repo: 42 }), new CustomCredentialValidationError("invalid repo '42'"));
});

test("a host with no rules of its own still gets the generic one-path-segment rule", () => {
  assert.throws(() => validateRepositoryTarget({ owner: "a/b", repo: "demo" }), new CustomCredentialValidationError("invalid owner 'a/b'"));
  assert.throws(() => validateRepositoryTarget({ owner: "octo", repo: ".." }), new CustomCredentialValidationError("invalid repo '..'"));
  assert.deepEqual(validateRepositoryTarget({ owner: "Group.Name", repo: "site" }), { owner: "Group.Name", repo: "site" });
});

test("rejects an invalid branch", () => {
  assert.throws(() => validateWriteFilesInput({ ...VALID, branch: "has spaces" }), new CustomCredentialValidationError("invalid branch name 'has spaces'"));
  assert.throws(() => validateWriteFilesInput({ ...VALID, branch: "" }), new CustomCredentialValidationError("invalid branch name ''"));
  for (const branch of ["../tags/release", "main//child", "/main", "main/"]) {
    assert.throws(() => validateWriteFilesInput({ ...VALID, branch }), new CustomCredentialValidationError(`invalid branch name '${branch}' — must not contain an empty or '..' path segment`));
  }
});

test("accepts a branch name containing slashes", () => {
  const result = validateWriteFilesInput({ ...VALID, branch: "feature/deploy-example-host" });
  assert.equal(result.branch, "feature/deploy-example-host");
});

test("rejects an empty or oversized commitMessage", () => {
  assert.throws(() => validateWriteFilesInput({ ...VALID, commitMessage: "" }), new CustomCredentialValidationError("commitMessage must be 1-500 characters"));
  assert.throws(() => validateWriteFilesInput({ ...VALID, commitMessage: "  " }), new CustomCredentialValidationError("commitMessage must be 1-500 characters"));
  assert.throws(() => validateWriteFilesInput({ ...VALID, commitMessage: "x".repeat(501) }), new CustomCredentialValidationError("commitMessage must be 1-500 characters"));
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
  assert.throws(() => normalizeWriteFilePath("example-host.toml\0.png"), CustomCredentialValidationError);
});

test("rejects a path over the length cap", () => {
  assert.throws(() => normalizeWriteFilePath("a".repeat(1025)), new CustomCredentialValidationError(`file path exceeds the 1024-character cap: '${"a".repeat(80)}...'`));
  assert.equal(normalizeWriteFilePath("a".repeat(1024)), "a".repeat(1024));
});

test("rejects an empty path, and a path that normalizes to nothing", () => {
  assert.throws(() => normalizeWriteFilePath(""), CustomCredentialValidationError);
  assert.throws(() => normalizeWriteFilePath("."), CustomCredentialValidationError);
  assert.throws(() => normalizeWriteFilePath("./"), CustomCredentialValidationError);
});

test("rejects a path naming or nesting under the reserved '.git' directory, case-insensitively", () => {
  assert.throws(() => normalizeWriteFilePath(".git"), new CustomCredentialValidationError("file path names or nests under the reserved '.git' directory: '.git'"));
  assert.throws(() => normalizeWriteFilePath(".git/config"), new CustomCredentialValidationError("file path names or nests under the reserved '.git' directory: '.git/config'"));
  assert.throws(() => normalizeWriteFilePath(".GIT/hooks/pre-commit"), new CustomCredentialValidationError("file path names or nests under the reserved '.git' directory: '.GIT/hooks/pre-commit'"));
  assert.throws(() => normalizeWriteFilePath(".Git/HEAD"), new CustomCredentialValidationError("file path names or nests under the reserved '.git' directory: '.Git/HEAD'"));
});

test("normalizes backslashes and a leading './' the same way package-paths.ts's lexical rules do", () => {
  assert.equal(normalizeWriteFilePath("./example-host.toml"), "example-host.toml");
  assert.equal(normalizeWriteFilePath("sub\\dir\\file.txt"), "sub/dir/file.txt");
});

test("a normal nested path is accepted unchanged", () => {
  assert.equal(normalizeWriteFilePath(".github/workflows/example-host-deploy.yml"), ".github/workflows/example-host-deploy.yml");
});

// ---------------------------------------------------------------------------
// counts and size caps
// ---------------------------------------------------------------------------

test("rejects an empty files array", () => {
  assert.throws(() => validateWriteFilesInput({ ...VALID, files: [] }), CustomCredentialValidationError);
});

test("rejects more files than the count cap", () => {
  const files = Array.from({ length: 26 }, (_, i) => ({ path: `file-${i}.txt`, content: "x" }));
  assert.throws(() => validateWriteFilesInput({ ...VALID, files }), new CustomCredentialValidationError("'files' has 26 entries, over the 25-file cap"));
});

test("accepts exactly the count cap", () => {
  const files = Array.from({ length: 25 }, (_, i) => ({ path: `file-${i}.txt`, content: "x" }));
  const result = validateWriteFilesInput({ ...VALID, files });
  assert.equal(result.files.length, 25);
});

test("rejects a single file over the per-file byte cap", () => {
  const files = [{ path: "big.txt", content: "x".repeat(1_048_577) }];
  assert.throws(() => validateWriteFilesInput({ ...VALID, files }), new CustomCredentialValidationError("file 'big.txt' is 1048577 bytes, over the 1048576-byte per-file cap"));
});

test("rejects files that individually pass the per-file cap but exceed the aggregate cap together", () => {
  const files = Array.from({ length: 4 }, (_, i) => ({ path: `f${i}.txt`, content: "x".repeat(1_048_576) }));
  files.push({ path: "overflow.txt", content: "x" });
  assert.throws(() => validateWriteFilesInput({ ...VALID, files }), new CustomCredentialValidationError("'files' totals over the 4194304-byte aggregate cap"));
});

test("rejects a duplicate path within the same call, even when spelled differently before normalization", () => {
  const files = [
    { path: "./example-host.toml", content: "a" },
    { path: "example-host.toml", content: "b" },
  ];
  assert.throws(() => validateWriteFilesInput({ ...VALID, files }), CustomCredentialValidationError);
});

test("rejects a malformed file entry (missing content, wrong type, non-object)", () => {
  assert.throws(() => validateWriteFilesInput({ ...VALID, files: [{ path: "a.txt" }] }), CustomCredentialValidationError);
  assert.throws(() => validateWriteFilesInput({ ...VALID, files: [{ path: "a.txt", content: 123 }] }), CustomCredentialValidationError);
  assert.throws(() => validateWriteFilesInput({ ...VALID, files: ["not-an-object"] }), CustomCredentialValidationError);
});

test("resource limits are pinned independently and accept their inclusive byte boundaries", () => {
  assert.deepEqual(WRITE_FILES_LIMITS, { maxFiles: 25, maxPathLength: 1024, maxFileBytes: 1_048_576, maxTotalBytes: 4_194_304 });
  for (const bytes of [1_048_575, 1_048_576]) {
    const files = [{ path: "boundary.txt", content: "x".repeat(bytes) }];
    assert.deepEqual(validateWriteFilesInput({ ...VALID, files }).files, files);
  }
  for (const totalBytes of [4_194_303, 4_194_304]) {
    const files = Array.from({ length: 4 }, (_, i) => ({ path: `f${i}.txt`, content: "x".repeat(i === 3 ? totalBytes - 3 * 1_048_576 : 1_048_576) }));
    assert.deepEqual(validateWriteFilesInput({ ...VALID, files }).files, files);
  }
});

test("every .git path segment is reserved, including nested Windows spellings", () => {
  for (const path of ["vendor/.git/config", "a/b/.GIT", "a\\b\\.GiT\\hooks/x", "a//./.git/config"]) {
    assert.throws(() => normalizeWriteFilePath(path), CustomCredentialValidationError);
  }
  assert.equal(normalizeWriteFilePath("a/.github/config"), "a/.github/config");
  assert.equal(normalizeWriteFilePath("a/.gitignore"), "a/.gitignore");
});

for (const branch of [null, undefined, 42, false, ["main"], { name: "main" }]) {
  test(`rejects a non-string branch ${JSON.stringify(branch)} before validating files`, () => {
    assert.throws(() => validateWriteFilesInput({ ...VALID, branch }),
      new CustomCredentialValidationError(`invalid branch name '${String(branch)}'`));
  });
}

for (const commitMessage of [null, undefined, 42, ["deploy"]]) {
  test(`rejects a non-string commit message ${JSON.stringify(commitMessage)}`, () => {
    assert.throws(() => validateWriteFilesInput({ ...VALID, commitMessage }),
      new CustomCredentialValidationError("commitMessage must be 1-500 characters"));
  });
}

test("accepts a maximum-length branch and commit message without trimming their content", () => {
  const branch = "b".repeat(250), commitMessage = ` ${"m".repeat(498)} `;
  assert.deepEqual(validateWriteFilesInput({ ...VALID, branch, commitMessage }), { ...VALID, branch, commitMessage });
  assert.throws(() => validateWriteFilesInput({ ...VALID, branch: "b".repeat(251) }),
    new CustomCredentialValidationError(`invalid branch name '${"b".repeat(60)}'`));
});

for (const files of [null, undefined, {}, "file.txt"]) {
  test(`rejects non-array files ${JSON.stringify(files)}`, () => {
    assert.throws(() => validateWriteFilesInput({ ...VALID, files }),
      new CustomCredentialValidationError("'files' must be a non-empty array of {path, content} objects"));
  });
}

for (const file of [null, undefined, [], {}, { path: 42, content: "text" }, { content: "text" }]) {
  test(`rejects an entry without a string path ${JSON.stringify(file)}`, () => {
    assert.throws(() => validateWriteFilesInput({ ...VALID, files: [file] }),
      new CustomCredentialValidationError("each entry in 'files' must be an object with a string 'path' and a string 'content'"));
  });
}

test("counts UTF-8 bytes rather than code units at the per-file boundary", () => {
  const content = "é".repeat(524_288);
  assert.deepEqual(validateWriteFilesInput({ ...VALID, files: [{ path: "unicode.txt", content }] }).files,
    [{ path: "unicode.txt", content }]);
  assert.throws(() => validateWriteFilesInput({ ...VALID, files: [{ path: "unicode.txt", content: `${content}é` }] }),
    new CustomCredentialValidationError("file 'unicode.txt' is 1048578 bytes, over the 1048576-byte per-file cap"));
});
