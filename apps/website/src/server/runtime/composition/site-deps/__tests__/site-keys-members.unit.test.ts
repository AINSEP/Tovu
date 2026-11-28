import "../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import os from "node:os";
import { mock, test } from "node:test";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { contentKernel } from "#src/platform/db/content-kernel";
import { closeSqliteConnection } from "#src/platform/db/kernel/drivers/sqlite";
import { siteKeyEnvOnlySources, siteKeySources } from "#src/features/webhooks/site-key-read-bindings";

/**
 * @file The key sources `composeSiteKeysMembers` hands its keyrings: an in-memory database has no site folder and so
 * no per-site key candidate, and in production the newsletter keyring reads the environment key only while the
 * assistant keyring keeps the full ordered list. The keyring class is a recorder so the sources can be read back.
 */

const keyrings: { sources: unknown }[] = [];
mock.module(new URL("../../../../../features/webhooks/keyring.env.js", import.meta.url).href, { namedExports: {
  EnvOrFileKeyring: class { readonly sources: unknown; constructor({ sources }: { sources: unknown }) { this.sources = sources; keyrings.push({ sources }); } } } });
const { composeSiteKeysMembers } = await import("../site-keys-members.js");
type Required = Parameters<typeof composeSiteKeysMembers>[0];

function compose(t: test.TestContext, { dbPath, mode }: { dbPath: string; mode?: string }) {
  const previous = process.env.TOVU_RUNTIME_MODE;
  if (mode === undefined) delete process.env.TOVU_RUNTIME_MODE; else process.env.TOVU_RUNTIME_MODE = mode;
  t.after(() => { if (previous === undefined) delete process.env.TOVU_RUNTIME_MODE; else process.env.TOVU_RUNTIME_MODE = previous; });
  keyrings.length = 0;
  const db = openContentDb(":memory:");
  t.after(() => closeSqliteConnection({ source: db }));
  const composed = composeSiteKeysMembers({ dbPath, overrides: {}, kernel: contentKernel({ store: db }) } as unknown as Required);
  return { composed, newsletter: (composed.newsletterKeyring as unknown as { sources: unknown }).sources, assistant: (composed.siteAssistantSecretKeyring as unknown as { sources: unknown }).sources };
}

test("an in-memory database has no site folder for the keyring and no per-site key candidate", t => {
  const { composed, newsletter, assistant } = compose(t, { dbPath: ":memory:" });
  assert.equal(composed.siteDirForKeyring, undefined);
  assert.equal(composed.runtimeMode, "local");
  const expected = siteKeySources({ mode: "local", env: process.env, home: os.homedir(), cwd: process.cwd(), siteKeyId: undefined });
  assert.deepEqual([newsletter, assistant], [expected, expected]);
});

test("in production the newsletter keyring reads only the environment key while the assistant keyring keeps every source", t => {
  const { composed, newsletter, assistant } = compose(t, { dbPath: ":memory:", mode: "production" });
  assert.equal(composed.runtimeMode, "production");
  assert.deepEqual(newsletter, siteKeyEnvOnlySources({}));
  assert.deepEqual(assistant, siteKeySources({ mode: "production", env: process.env, home: os.homedir(), cwd: process.cwd(), siteKeyId: undefined }));
  assert.notDeepEqual(newsletter, assistant);
});

test("a file database keys its keyring to the database's own site folder", t => {
  const { composed } = compose(t, { dbPath: "/sites/gamma/content.db" });
  assert.equal(composed.siteDirForKeyring, "/sites/gamma");
});
