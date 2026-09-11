import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  FsFilePathError,
  isDeniedFsFileName,
  isDeniedFsPathSegment,
  listFsFiles,
  MAX_FS_FILE_BYTES,
  readFsFile,
  resolveFsFilePath,
} from "../fs-files.js";

/**
 * @file Certifies the path containment `fs_list_files`/`fs_read_file`'s whole safety argument rests
 * on: an allowlisted "read/list anything under ONE named root" capability is only sound while
 * "under that root" is actually enforced. Mirrors `features/theme/__tests__/theme-files.test.ts`'s
 * own structure (same escape attempts, same fix) — see `fs-files.ts`'s own header for why the two
 * modules share this shape.
 */

function makeAllowedRoot(): { root: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-fsfiles-root-"));
  fs.mkdirSync(path.join(root, "references"), { recursive: true });
  fs.writeFileSync(path.join(root, "manifest.json"), "{}", "utf8");
  fs.writeFileSync(path.join(root, "references", "checklist.template.md"), "# Checklist", "utf8");
  return { root };
}

// ---------------------------------------------------------------------------
// 1. Traversal.
// ---------------------------------------------------------------------------

test("an ordinary relative path inside the root resolves", () => {
  const { root } = makeAllowedRoot();
  const resolved = resolveFsFilePath({ rootPath: root, relativePath: "references/checklist.template.md" });
  assert.equal(resolved, path.join(fs.realpathSync(root), "references", "checklist.template.md"));
});

test("a ../ traversal out of the root is refused", () => {
  const { root } = makeAllowedRoot();
  for (const attempt of ["../evil.txt", "../../etc/passwd", "references/../../escaped.txt", "./../../x"]) {
    assert.throws(
      () => resolveFsFilePath({ rootPath: root, relativePath: attempt }),
      FsFilePathError,
      `expected '${attempt}' to be refused`
    );
  }
});

test("a SIBLING folder whose name merely extends the root's is refused (the classic startsWith defect)", () => {
  const { root } = makeAllowedRoot();
  // `<root>-evil` starts with `<root>` as a string, but is not inside it.
  const evilSibling = `${root}-evil`;
  fs.mkdirSync(evilSibling, { recursive: true });
  fs.writeFileSync(path.join(evilSibling, "x.txt"), "nope", "utf8");
  assert.throws(
    () => resolveFsFilePath({ rootPath: root, relativePath: `../${path.basename(evilSibling)}/x.txt` }),
    /resolves outside the allowed root/
  );
});

test("an absolute path is refused even when it points inside the root", () => {
  const { root } = makeAllowedRoot();
  assert.throws(
    () => resolveFsFilePath({ rootPath: root, relativePath: path.join(root, "manifest.json") }),
    /must be relative to the root/
  );
});

test("an empty path and a NUL byte are both refused", () => {
  const { root } = makeAllowedRoot();
  assert.throws(() => resolveFsFilePath({ rootPath: root, relativePath: "" }), /path is required/);
  assert.throws(() => resolveFsFilePath({ rootPath: root, relativePath: "a\0b" }), /NUL byte/);
});

// ---------------------------------------------------------------------------
// 2. Symlink escape — actually created on disk, not merely asserted in theory.
// ---------------------------------------------------------------------------

test("a symlinked DIRECTORY inside the root cannot be read through", () => {
  const { root } = makeAllowedRoot();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-fsfiles-outside-"));
  fs.writeFileSync(path.join(outside, "secret.txt"), "TOP SECRET", "utf8");
  fs.symlinkSync(outside, path.join(root, "escape"));

  // `escape/secret.txt` is lexically inside the root — every prefix/relative check passes — but
  // realpath lands in `outside`.
  assert.throws(
    () => resolveFsFilePath({ rootPath: root, relativePath: "escape/secret.txt" }),
    /through a symbolic link/
  );
  assert.throws(() => readFsFile({ rootPath: root, relativePath: "escape/secret.txt" }), /through a symbolic link/);
});

test("a symlinked FILE inside the root cannot be read through", () => {
  const { root } = makeAllowedRoot();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-fsfiles-outside-"));
  fs.writeFileSync(path.join(outside, "secret.txt"), "TOP SECRET", "utf8");
  fs.symlinkSync(path.join(outside, "secret.txt"), path.join(root, "innocent.txt"));

  assert.throws(() => readFsFile({ rootPath: root, relativePath: "innocent.txt" }), /through a symbolic link/);
});

test("listFsFiles does not follow or report symlinks out of the root", () => {
  const { root } = makeAllowedRoot();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-fsfiles-outside-"));
  fs.writeFileSync(path.join(outside, "secret.txt"), "TOP SECRET", "utf8");
  fs.symlinkSync(outside, path.join(root, "escape"));

  const files = listFsFiles({ rootPath: root });
  assert.equal(files.some((f) => f.startsWith("escape")), false, "a symlinked directory must be neither descended nor reported");
});

test("listFsFiles returns cleanly (never throws ELOOP) when the root contains a CIRCULAR symlink (a -> b -> a)", () => {
  const { root } = makeAllowedRoot();
  const a = path.join(root, "a");
  const b = path.join(root, "b");
  fs.symlinkSync(b, a);
  fs.symlinkSync(a, b);

  const files = listFsFiles({ rootPath: root });
  assert.equal(files.some((f) => f === "a" || f === "b"), false, "a circular symlink must be neither descended nor reported as a file");
});

// ---------------------------------------------------------------------------
// 3. Pattern deny — defense in depth WITHIN an allowed root.
// ---------------------------------------------------------------------------

test("isDeniedFsFileName matches every documented pattern", () => {
  for (const name of ["content.db", "chat.db-wal", "content.db-shm", ".env", ".env.local", "server.pem", "id_rsa.key", "cert.p12"]) {
    assert.equal(isDeniedFsFileName(name), true, `expected '${name}' to be denied`);
  }
  for (const name of ["manifest.json", "checklist.template.md", "styles.css", "readme.md"]) {
    assert.equal(isDeniedFsFileName(name), false, `expected '${name}' to be allowed`);
  }
});

test("isDeniedFsFileName matches every .env variant, not just the literal '.env'", () => {
  // `.env.bak-before-forbid-bash` is a real file in this repo today — the pattern must match the
  // FAMILY, not one hardcoded name.
  for (const name of [".env", ".env.local", ".env.example", ".env.bak-before-forbid-bash", ".env.production"]) {
    assert.equal(isDeniedFsFileName(name), true, `expected '${name}' to be denied`);
  }
  assert.equal(isDeniedFsFileName("environment.ts"), false, "a name merely containing 'env' must not match");
});

test("reading a denied-pattern filename is refused even though it lives inside an allowed root", () => {
  const { root } = makeAllowedRoot();
  fs.writeFileSync(path.join(root, ".env"), "SECRET=1", "utf8");
  assert.throws(() => readFsFile({ rootPath: root, relativePath: ".env" }), /denied filename pattern/);
});

test("a denied-pattern file is silently excluded from listFsFiles, not merely refused on read", () => {
  const { root } = makeAllowedRoot();
  fs.writeFileSync(path.join(root, "content.db"), "binary-ish", "utf8");
  const files = listFsFiles({ rootPath: root });
  assert.equal(files.includes("content.db"), false);
});

// ---------------------------------------------------------------------------
// 3b. Denied path SEGMENTS — the new default-allow model's primary gate.
// ---------------------------------------------------------------------------

test("isDeniedFsPathSegment matches 'secrets' case-insensitively and nothing else", () => {
  for (const name of ["secrets", "Secrets", "SECRETS"]) {
    assert.equal(isDeniedFsPathSegment(name), true, `expected '${name}' to be denied`);
  }
  for (const name of ["not-secrets-actually", "secret", "secrets-archive", "keys"]) {
    assert.equal(isDeniedFsPathSegment(name), false, `expected '${name}' to be allowed`);
  }
});

test("a 'secrets/' segment is refused at any depth, not just at the root", () => {
  const { root } = makeAllowedRoot();
  for (const attempt of ["secrets/token.txt", "a/b/secrets/token.txt", "SECRETS/token.txt"]) {
    assert.throws(() => resolveFsFilePath({ rootPath: root, relativePath: attempt }), /denied path segment/, `expected '${attempt}' to be refused`);
  }
});

test("a 'secrets' directory is never descended into or reported by listFsFiles", () => {
  const { root } = makeAllowedRoot();
  fs.mkdirSync(path.join(root, "secrets"), { recursive: true });
  fs.writeFileSync(path.join(root, "secrets", "token.txt"), "shh", "utf8");
  const files = listFsFiles({ rootPath: root });
  assert.equal(
    files.some((f) => f.startsWith("secrets")),
    false,
    "a 'secrets' directory's contents must never be enumerated",
  );
});

// ---------------------------------------------------------------------------
// 4. Size cap and binary sniff.
// ---------------------------------------------------------------------------

test("a file over MAX_FS_FILE_BYTES is refused", () => {
  const { root } = makeAllowedRoot();
  fs.writeFileSync(path.join(root, "big.txt"), "x".repeat(MAX_FS_FILE_BYTES + 1), "utf8");
  assert.throws(() => readFsFile({ rootPath: root, relativePath: "big.txt" }), /exceeds the .*-byte readable limit/);
});

test("a file at exactly MAX_FS_FILE_BYTES is allowed", () => {
  const { root } = makeAllowedRoot();
  const content = "x".repeat(MAX_FS_FILE_BYTES);
  fs.writeFileSync(path.join(root, "exact.txt"), content, "utf8");
  const result = readFsFile({ rootPath: root, relativePath: "exact.txt" });
  assert.equal(result.bytes, MAX_FS_FILE_BYTES);
});

test("a file containing a NUL byte sniffs as binary and is refused", () => {
  const { root } = makeAllowedRoot();
  fs.writeFileSync(path.join(root, "binary.dat"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a]));
  assert.throws(() => readFsFile({ rootPath: root, relativePath: "binary.dat" }), /looks like a binary file/);
});

test("an ordinary text file with no NUL byte reads cleanly", () => {
  const { root } = makeAllowedRoot();
  const result = readFsFile({ rootPath: root, relativePath: "references/checklist.template.md" });
  assert.equal(result.content, "# Checklist");
  assert.equal(result.bytes, Buffer.byteLength("# Checklist", "utf8"));
});

// ---------------------------------------------------------------------------
// 5. Directory listing basics.
// ---------------------------------------------------------------------------

test("listFsFiles lists recursively, relative to the root, sorted", () => {
  const { root } = makeAllowedRoot();
  const files = listFsFiles({ rootPath: root });
  assert.deepEqual(files, ["manifest.json", "references/checklist.template.md"]);
});

test("listFsFiles scoped to a subdirectory returns paths relative to THAT subdirectory", () => {
  const { root } = makeAllowedRoot();
  const files = listFsFiles({ rootPath: root, relativePath: "references" });
  assert.deepEqual(files, ["checklist.template.md"]);
});

test("listFsFiles on a root that does not exist yet returns an empty list, not an error", () => {
  const missingRoot = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "tovu-fsfiles-missing-")), "not-created-yet");
  assert.deepEqual(listFsFiles({ rootPath: missingRoot }), []);
});

test("listFsFiles refuses a relativePath that resolves to a file, not a directory", () => {
  const { root } = makeAllowedRoot();
  assert.throws(() => listFsFiles({ rootPath: root, relativePath: "manifest.json" }), /is not a directory/);
});

// ---------------------------------------------------------------------------
// 6. Default-allow: a normal source file reads cleanly, noise directories are excluded from
//    listings only (never from reads) — the shape this domain now needs under the broad `repo`/
//    `site` roots (`layout.ts`), which it never needed under the old five-member allowlist.
// ---------------------------------------------------------------------------

test("an ordinary source file with no special extension reads cleanly under the new default-allow model", () => {
  const { root } = makeAllowedRoot();
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "app.ts"), "export const x = 1;\n", "utf8");
  const result = readFsFile({ rootPath: root, relativePath: "src/app.ts" });
  assert.equal(result.content, "export const x = 1;\n");
});

test("node_modules, .git, and dist are excluded from listFsFiles but not from fs_read_file itself", () => {
  const { root } = makeAllowedRoot();
  for (const dir of ["node_modules", ".git", "dist"]) {
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, "noise.txt"), "noise", "utf8");
  }

  const files = listFsFiles({ rootPath: root });
  for (const dir of ["node_modules", ".git", "dist"]) {
    assert.equal(
      files.some((f) => f.startsWith(`${dir}/`)),
      false,
      `expected '${dir}' to be excluded from the listing`,
    );
  }

  // Ergonomics only, not security: a caller who already knows the path can still read it directly.
  const result = readFsFile({ rootPath: root, relativePath: "node_modules/noise.txt" });
  assert.equal(result.content, "noise");
});
