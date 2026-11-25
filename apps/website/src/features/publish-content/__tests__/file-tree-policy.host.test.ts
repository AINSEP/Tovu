/**
 * @file Host-value pins for the file-tree policy that now lives in `@jini-ai/cms`: the real secret
 * scanner Tovu injects, the manifest/contributor wiring, and the real local theme fixture.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { scanTextForSecrets } from "@jini-ai/diagnostics/redaction/secrets-only";
import {
  checkTreeFiles,
  isIgnoredTreeFileName,
  THEME_FILE_TREE_ALLOWED_EXTENSIONS,
  type FileTreeFileInput,
} from "@jini-ai/cms/publish/content/file-tree-policy";

// (d) The REAL scanner Tovu injects: a planted credential in theme.css blocks the tree with the exact reason.
test("checkTreeFiles with the real scanner blocks a planted Anthropic key, exact reason", () => {
  const planted = "sk-ant-" + "a".repeat(95);
  const files: FileTreeFileInput[] = [
    { path: "theme.json", size: 10, mode: 0o644, textSample: '{"id":"basic"}' },
    { path: "css/theme.css", size: 200, mode: 0o644, textSample: `body{}\n/* ${planted} */` },
  ];
  assert.equal(checkTreeFiles({ kind: "theme-files", files, scanTextForSecrets }), `"css/theme.css" looks like it holds a key (Anthropic API key (sk-ant-))`);
});

// (e) Every file-backed publish-content contributor uses this module (grep-style source check).
test("every file-backed publish-content contributor imports file-tree-policy", () => {
  const registeredTypes = new Set(["theme-files", "agent-skill", "agent-plugin", "site-plugin"]);
  const manifestPath = path.resolve(
    import.meta.dirname,
    "../../../server/runtime/composition/publish-content-manifest.ts"
  );
  const manifestSrc = readFileSync(manifestPath, "utf8");
  const registeredHere = [...registeredTypes].filter((type) => manifestSrc.includes(type));

  const featuresDir = path.resolve(import.meta.dirname, "../../../features");
  for (const dir of readdirSync(featuresDir)) {
    const contributorFile = path.join(featuresDir, dir, "publish-content.ts");
    let src: string;
    try {
      src = readFileSync(contributorFile, "utf8");
    } catch {
      continue;
    }
    const isFileBacked = registeredHere.some((type) => src.includes(`entityType = "${type}"`) || src.includes(`entityType: "${type}"`));
    if (!isFileBacked) continue;
    assert.match(
      src,
      /file-tree-policy/,
      `${contributorFile} contributes a file-backed type and must import file-tree-policy`
    );
  }
});

test("THEME_FILE_TREE_ALLOWED_EXTENSIONS covers every extension used by the real static/tovu-theme theme", (t) => {
  const themeDir = path.resolve(import.meta.dirname, "../../../../../../sites/tovu-dev/themes/static/tovu-theme");
  let files: string[];
  try {
    files = listFilesRecursive(themeDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    t.skip("local static/tovu-theme fixture is unavailable");
    return;
  }
  assert.ok(files.length > 0, "the local theme must contain files to check");
  for (const file of files) {
    const ext = file.includes(".") ? file.slice(file.lastIndexOf(".") + 1).toLowerCase() : "";
    assert.ok(
      THEME_FILE_TREE_ALLOWED_EXTENSIONS.includes(ext),
      `real theme file "${file}" has extension "${ext}", missing from the allow-list`
    );
  }
});

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    // Mirrors `walkThemeTree`: Finder recreates `.DS_Store` in a real theme folder on its own.
    if (isIgnoredTreeFileName({ name })) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFilesRecursive(full));
    else out.push(full);
  }
  return out;
}
