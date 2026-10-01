import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveInstallDirTarget } from "../../resolve-install-dir-target.js";

// F7.2: real links in a private fixture; no dependency on the machine's /var aliases.
test("ordinary existing and missing targets collapse dot segments without resolving ancestor links", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-target-"));
  try {
    fs.mkdirSync(path.join(root, "real"));
    fs.mkdirSync(path.join(root, "real", "existing"));
    fs.symlinkSync("real", path.join(root, "alias"), "dir");
    assert.equal(resolveInstallDirTarget(path.join(root, "alias", "existing")), path.join(root, "alias", "existing"));
    assert.equal(resolveInstallDirTarget(`${root}/alias/../missing`), path.join(root, "missing"));
    fs.writeFileSync(path.join(root, "file"), "fixture");
    assert.equal(resolveInstallDirTarget(path.join(root, "file")), path.join(root, "file"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("existing target links resolve nested links, while dangling links resolve relative and absolute destinations", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-target-links-"));
  try {
    fs.mkdirSync(path.join(root, "real"));
    fs.symlinkSync("real", path.join(root, "inner"), "dir");
    fs.symlinkSync("inner", path.join(root, "outer"), "dir");
    assert.equal(resolveInstallDirTarget(path.join(root, "outer")), fs.realpathSync(root) + "/real");
    fs.mkdirSync(path.join(root, "links"));
    fs.symlinkSync("../future", path.join(root, "links", "relative"), "dir");
    fs.symlinkSync(path.join(root, "absolute-future"), path.join(root, "links", "absolute"), "dir");
    assert.equal(resolveInstallDirTarget(path.join(root, "links", "relative")), path.join(root, "future"));
    assert.equal(resolveInstallDirTarget(path.join(root, "links", "absolute")), path.join(root, "absolute-future"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
