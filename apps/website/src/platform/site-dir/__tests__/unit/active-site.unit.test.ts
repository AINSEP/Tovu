import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createNodeAtomicFilesystem, readEnvLine, upsertEnvLine } from "@jini-ai/platform/fs";
import { persistActiveSite, readPersistedActiveSite } from "../../active-site.js";

/**
 * @file 2026-09-04 sites-switcher decision — TDD for `active-site.ts`'s Activate persistence half.
 *
 * `persistActiveSite` deliberately never touches this process's own `process.env` (see that
 * function's own doc) — every assertion here is against the `.env` FILE it wrote, never against
 * `resolveSiteRoot()`'s live answer, which is the whole point of the "restart required" design.
 */

function mkRepoRootFixture(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-active-site-"));
}

test("upsertEnvLine: appends a new KEY=value to an empty source", () => {
  assert.equal(upsertEnvLine({ source: "", key: "TOVU_SITE", value: "my-site" }), "TOVU_SITE=my-site\n");
});

test("upsertEnvLine: appends without disturbing existing lines (order and content untouched)", () => {
  const source = "TOVU_ADMIN_PASSWORD=secret123\nTOVU_SITE_KEY=abc\n";
  const result = upsertEnvLine({ source, key: "TOVU_SITE", value: "my-site" });
  assert.equal(result, "TOVU_ADMIN_PASSWORD=secret123\nTOVU_SITE_KEY=abc\nTOVU_SITE=my-site\n");
});

test("TOVU_SITE persistence preserves prefix siblings and comments when the exact key is absent", () => {
  const source = "TOVU_SITE_DIR=/x\n# TOVU_SITE=old\n";
  assert.equal(readEnvLine({ source, key: "TOVU_SITE" }), null);
  assert.equal(upsertEnvLine({ source, key: "TOVU_SITE", value: "queued" }), `${source}TOVU_SITE=queued\n`);
  const cwd = mkRepoRootFixture();
  try {
    fs.writeFileSync(path.join(cwd, ".env"), source);
    assert.equal(readPersistedActiveSite({ cwd }), null);
    persistActiveSite({ name: "queued" }, { cwd });
    assert.equal(fs.readFileSync(path.join(cwd, ".env"), "utf8"), `${source}TOVU_SITE=queued\n`);
    assert.equal(readPersistedActiveSite({ cwd }), "queued");
    assert.equal(readEnvLine({ source: fs.readFileSync(path.join(cwd, ".env"), "utf8"), key: "TOVU_SITE_DIR" }), "/x");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("persistence defaults to the child process working directory for both writes and reads", () => {
  const cwd = mkRepoRootFixture();
  try {
    const moduleUrl = new URL("../../active-site.ts", import.meta.url).href;
    const loader = import.meta.resolve("tsx");
    // A relative TSX_TSCONFIG_PATH from the runner would resolve against the child's temp cwd.
    const env = { ...process.env };
    if (env.TSX_TSCONFIG_PATH) env.TSX_TSCONFIG_PATH = path.resolve(env.TSX_TSCONFIG_PATH);
    const result = spawnSync(process.execPath, ["--import", loader, "--input-type=module", "--eval", `
      const { persistActiveSite, readPersistedActiveSite } = await import(${JSON.stringify(moduleUrl)});
      persistActiveSite({ name: "default-cwd-site" });
      process.stdout.write(JSON.stringify(readPersistedActiveSite()));
    `], { cwd, env, encoding: "utf8", timeout: 20_000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '"default-cwd-site"');
    assert.equal(fs.readFileSync(path.join(cwd, ".env"), "utf8"), "TOVU_SITE=default-cwd-site\n");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("upsertEnvLine: replaces an existing KEY=value in place, preserving every other line verbatim", () => {
  const source = "TOVU_ADMIN_PASSWORD=secret123\nTOVU_SITE=old-site\nTOVU_SITE_KEY=abc\n";
  const result = upsertEnvLine({ source, key: "TOVU_SITE", value: "new-site" });
  assert.equal(result, "TOVU_ADMIN_PASSWORD=secret123\nTOVU_SITE=new-site\nTOVU_SITE_KEY=abc\n");
});

test("upsertEnvLine: a source with no trailing newline still gets exactly one new line appended (no blank line inserted)", () => {
  const result = upsertEnvLine({ source: "TOVU_ADMIN_PASSWORD=secret123", key: "TOVU_SITE", value: "my-site" });
  assert.equal(result, "TOVU_ADMIN_PASSWORD=secret123\nTOVU_SITE=my-site\n");
});

test("persistActiveSite: writes TOVU_SITE=<name> to a fresh repo root with no .env yet", () => {
  const cwd = mkRepoRootFixture();
  try {
    persistActiveSite({ name: "my-site" }, { cwd });
    const written = fs.readFileSync(path.join(cwd, ".env"), "utf8");
    assert.equal(written, "TOVU_SITE=my-site\n");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("persistActiveSite: upserts into an EXISTING .env without touching any other line (secrets included)", () => {
  const cwd = mkRepoRootFixture();
  try {
    fs.writeFileSync(path.join(cwd, ".env"), "TOVU_ADMIN_PASSWORD=super-secret\nTOVU_SITE=old-site\n");
    persistActiveSite({ name: "new-site" }, { cwd });
    const written = fs.readFileSync(path.join(cwd, ".env"), "utf8");
    assert.equal(written, "TOVU_ADMIN_PASSWORD=super-secret\nTOVU_SITE=new-site\n");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("persistActiveSite: a fresh .env lands at 0600 and an overwrite keeps an established 0640 mode", () => {
  const cwd = mkRepoRootFixture();
  try {
    const envPath = path.join(cwd, ".env");
    persistActiveSite({ name: "first-site" }, { cwd });
    assert.equal(fs.statSync(envPath).mode & 0o777, 0o600, "a brand-new .env may hold secrets: owner-only by default");
    fs.chmodSync(envPath, 0o640);
    persistActiveSite({ name: "second-site" }, { cwd });
    assert.equal(fs.statSync(envPath).mode & 0o777, 0o640, "activating a site must never widen or narrow .env's mode");
    assert.equal(fs.readFileSync(envPath, "utf8"), "TOVU_SITE=second-site\n");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("persistActiveSite: a directory-flush failure after the replacement surfaces instead of being swallowed", (t) => {
  if (process.platform === "win32") {
    t.skip("Windows cannot fsync directory handles; the owner skips the flush there");
    return;
  }
  const cwd = mkRepoRootFixture();
  try {
    const native = createNodeAtomicFilesystem({}, {});
    const flushFailure = Object.assign(new Error("injected directory flush failure"), { code: "EIO" });
    const directoryDescriptors = new Set<number>();
    let fileSyncs = 0;
    const filesystem = {
      ...native,
      open: (required: { path: string; flags: "wx" | "r"; mode?: number }) => {
        const descriptor = native.open(required);
        if (required.flags === "r") directoryDescriptors.add(descriptor);
        return descriptor;
      },
      sync: ({ descriptor }: { descriptor: number }) => {
        if (directoryDescriptors.has(descriptor)) throw flushFailure;
        fileSyncs += 1;
        native.sync({ descriptor });
      },
    };
    assert.throws(() => persistActiveSite({ name: "flushed-site" }, { cwd, filesystem }), (actual) => actual === flushFailure);
    assert.equal(fileSyncs, 1, "the temp file's bytes must be fsynced before the rename");
    assert.equal(directoryDescriptors.size, 1, "the containing directory must be opened for a metadata flush");
    assert.equal(fs.readFileSync(path.join(cwd, ".env"), "utf8"), "TOVU_SITE=flushed-site\n", "the rename already landed; it is reported, not undone");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("persistActiveSite: never touches this process's own process.env", () => {
  const cwd = mkRepoRootFixture();
  const before = process.env.TOVU_SITE;
  try {
    persistActiveSite({ name: "some-other-site" }, { cwd });
    assert.equal(process.env.TOVU_SITE, before, "activate must persist to disk only — the live process keeps whatever it already booted with");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("readEnvLine: returns null when the key is absent", () => {
  assert.equal(readEnvLine({ source: "TOVU_ADMIN_PASSWORD=secret123\n", key: "TOVU_SITE" }), null);
});

test("readEnvLine: returns the value for a present key, trimmed", () => {
  assert.equal(readEnvLine({ source: "TOVU_ADMIN_PASSWORD=secret123\nTOVU_SITE= my-site \n", key: "TOVU_SITE" }), "my-site");
});

test("readEnvLine: reads back exactly what upsertEnvLine wrote (round trip)", () => {
  const written = upsertEnvLine({ source: "TOVU_ADMIN_PASSWORD=secret123\n", key: "TOVU_SITE", value: "round-trip-site" });
  assert.equal(readEnvLine({ source: written, key: "TOVU_SITE" }), "round-trip-site");
});

test("readEnvLine: the FIRST matching line wins — the same one upsertEnvLine would replace", () => {
  const source = "TOVU_SITE=first\nTOVU_SITE=second\n";
  assert.equal(readEnvLine({ source, key: "TOVU_SITE" }), "first");
  assert.equal(upsertEnvLine({ source, key: "TOVU_SITE", value: "third" }), "TOVU_SITE=third\nTOVU_SITE=second\n");
});

test("persistence replaces and reads the first duplicate TOVU_SITE while preserving unrelated bytes", () => {
  const cwd = mkRepoRootFixture();
  const envPath = path.join(cwd, ".env");
  try {
    fs.writeFileSync(envPath, "# pending site\nTOVU_SITE=first\nUNRELATED=  keep these bytes  \nTOVU_SITE=second\n");

    persistActiveSite({ name: "queued" }, { cwd });

    const written = fs.readFileSync(envPath, "utf8");
    assert.equal(written, "# pending site\nTOVU_SITE=queued\nUNRELATED=  keep these bytes  \nTOVU_SITE=second\n");
    assert.equal(readPersistedActiveSite({ cwd }), "queued");
    assert.equal(readEnvLine({ source: written, key: "TOVU_SITE" }), "queued");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("readPersistedActiveSite: null when there is no .env file at all", () => {
  const cwd = mkRepoRootFixture();
  try {
    assert.equal(readPersistedActiveSite({ cwd }), null);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("readPersistedActiveSite: null for an empty TOVU_SITE= (a no-op for resolveSiteRoot, not a pending choice)", () => {
  const cwd = mkRepoRootFixture();
  try {
    fs.writeFileSync(path.join(cwd, ".env"), "TOVU_SITE=\n");
    assert.equal(readPersistedActiveSite({ cwd }), null);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("readPersistedActiveSite: reads back the name persistActiveSite just wrote", () => {
  const cwd = mkRepoRootFixture();
  try {
    fs.writeFileSync(path.join(cwd, ".env"), "TOVU_ADMIN_PASSWORD=super-secret\n");
    persistActiveSite({ name: "queued-site" }, { cwd });
    assert.equal(readPersistedActiveSite({ cwd }), "queued-site");
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

function isRoot(): boolean {
  return typeof process.getuid === "function" && process.getuid() === 0;
}

test("persistActiveSite: a non-ENOENT read error (unreadable .env) propagates and does not replace the file", (t) => {
  if (isRoot()) {
    t.skip("running as root ignores file mode bits — this test cannot force EACCES");
    return;
  }
  const cwd = mkRepoRootFixture();
  const envPath = path.join(cwd, ".env");
  try {
    fs.writeFileSync(envPath, "TOVU_ADMIN_PASSWORD=super-secret\nTOVU_SITE=old-site\n");
    fs.chmodSync(envPath, 0o000);
    assert.throws(
      () => persistActiveSite({ name: "new-site" }, { cwd }),
      "an unreadable .env must propagate, never be treated as absent"
    );
    fs.chmodSync(envPath, 0o600);
    assert.equal(
      fs.readFileSync(envPath, "utf8"),
      "TOVU_ADMIN_PASSWORD=super-secret\nTOVU_SITE=old-site\n",
      "a failed read must never fall through to an overwrite that drops every other line"
    );
  } finally {
    fs.chmodSync(envPath, 0o600);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("readPersistedActiveSite: sibling — a non-ENOENT read error propagates, never reported as null", (t) => {
  if (isRoot()) {
    t.skip("running as root ignores file mode bits — this test cannot force EACCES");
    return;
  }
  const cwd = mkRepoRootFixture();
  const envPath = path.join(cwd, ".env");
  try {
    fs.writeFileSync(envPath, "TOVU_SITE=queued-site\n");
    fs.chmodSync(envPath, 0o000);
    assert.throws(
      () => readPersistedActiveSite({ cwd }),
      "an unreadable .env must propagate, never be reported as 'no site ever activated'"
    );
  } finally {
    fs.chmodSync(envPath, 0o600);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
