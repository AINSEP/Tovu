/** L044 characterization: preserve first-refusal order and the existing secret-scan gaps. */
import assert from "node:assert/strict";
import test from "node:test";
import { checkTreePath, checkTreeFiles, checkMcpJsonSecretPlaceholders, FILE_TREE_LIMITS, MAX_SECRET_SCAN_BYTES } from "../file-tree-policy.js";

test("L044 path checks preserve shape, segment, name and extension precedence", () => {
  const cases: readonly [string, string | null][] = [
    ["", '"" is empty'], ["/x\\y", '"/x\\y" must be relative, not start with \'/\''],
    ["x\\y", '"x\\y" contains a backslash, which is never allowed in a tree path'],
    ["x\0", '"x\0" contains a NUL byte'], ["x//.env", '"x//.env" contains an empty path segment'],
    ["./x", '"./x" contains a \'.\' segment, which is never allowed'],
    ["x/../y", '"x/../y" contains a \'..\' segment, which is never allowed'],
    ["node_modules/.env", '"node_modules/.env" contains a \'node_modules\' segment, which is never published'],
    ["id_ed25519.bak", '"id_ed25519.bak" looks like a private SSH key'],
    ["x.storage-secret.json.bak", '"x.storage-secret.json.bak" is a site\'s sealed database connection string'],
    ["a.PFX", '"a.PFX" has a \'.pfx\' extension, which is never published'],
    ["nested/config.json", null], ["ok.html", null],
  ];
  for (const [value, expected] of cases) assert.equal(checkTreePath(value), expected);
  assert.match(checkTreePath("x".repeat(513))!, /512-character/);
  assert.match(checkTreePath(Array(17).fill("x").join("/"))!, /16-level/);
});

test("L044 tree checks preserve aggregate caps, collision ordering, extension and scan boundaries", () => {
  const file = { path: "ok.html", size: 1, mode: 0o644, textSample: "ok" };
  assert.match(checkTreeFiles("theme-files", Array(FILE_TREE_LIMITS.maxTreeFiles + 1).fill(file))!, /file limit/);
  assert.match(checkTreeFiles("theme-files", [{ ...file, size: FILE_TREE_LIMITS.maxTreeBytes + 1 }])!, /byte limit/);
  assert.match(checkTreeFiles("theme-files", [{ ...file, path: ".DS_Store" }])!, /system file/);
  assert.match(checkTreeFiles("theme-files", [file, { ...file, path: "OK.html", size: FILE_TREE_LIMITS.maxFileBytes + 1 }])!, /letter case/);
  assert.match(checkTreeFiles("theme-files", [{ ...file, size: FILE_TREE_LIMITS.maxFileBytes + 1 }])!, /per-file/);
  assert.equal(checkTreeFiles("theme-files", [{ ...file, path: "clip.mp4" }]), "Can't publish: contains a video file (clip.mp4)");
  assert.equal(checkTreeFiles("theme-files", [{ ...file, path: "app.exe" }]), "Can't publish: contains a file type that isn't allowed (app.exe)");
  const secret = ["gh", "p_"].join("") + "A".repeat(36);
  assert.match(checkTreeFiles("theme-files", [{ ...file, size: MAX_SECRET_SCAN_BYTES, textSample: secret }])!, /holds a key/);
  assert.equal(checkTreeFiles("theme-files", [{ ...file, size: MAX_SECRET_SCAN_BYTES + 1, textSample: secret }]), null);
  assert.equal(checkTreeFiles("theme-files", [{ ...file, path: "x.png", textSample: secret }]), null);
  assert.equal(checkTreeFiles("agent-plugin", [{ ...file, path: "app.exe" }]), null);
  assert.equal(checkTreeFiles("theme-files", [file]), null);
});

test("L044 MCP scan ignores nested literals and malformed JSON (reported, not fixed)", () => {
  for (const value of ["{", "null", "3", '{"env":null}', '{"env":{"nested":{"key":"literal"}}}']) {
    assert.equal(checkMcpJsonSecretPlaceholders(value), null);
  }
  assert.equal(checkMcpJsonSecretPlaceholders('{"env":{"empty":"","placeholder":"${TOKEN}","number":1}}'), null);
  assert.match(checkMcpJsonSecretPlaceholders('{"env":{"first":"literal"},"headers":{"second":"literal"}}')!, /env.first/);
  assert.match(checkMcpJsonSecretPlaceholders('{"headers":{"second":"literal"}}')!, /headers.second/);
});

test("L044 SSH basenames require an exact name or a literal dot suffix", () => {
  for (const name of ["id_rsa", "id_rsa.bak", "id_ed25519", "id_ed25519.bak"]) assert.match(checkTreePath(name)!, /private SSH key/);
  for (const name of ["id_rsax", "id_ed25519x", "id_rsa\n", "id_ed25519\n"]) assert.equal(checkTreePath(name), null);
});

test("L044 absent text samples skip secret scanning (reported, not fixed)", () => {
  assert.equal(checkTreeFiles("theme-files", [{ path: "secret.txt", size: 5, mode: 0o644 }]), null);
});
