import assert from "node:assert/strict";
import { closeSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createLocalSiteIntentStore } from "../../local-site-intent.js";

test("intent store round-trips across instances and leaves only the renamed file", t => {
  const servingSiteDir = mkdtempSync(join(tmpdir(), "site-intent-"));
  t.after(() => rmSync(servingSiteDir, { recursive: true, force: true }));
  const store = createLocalSiteIntentStore({ servingSiteDir });
  assert.equal(store.read(), undefined);
  const intent = { session: "dev-42", sites: { example: { port: 3101 } } };
  store.write({ intent });
  assert.deepEqual(createLocalSiteIntentStore({ servingSiteDir }).read(), intent);
  assert.deepEqual(JSON.parse(readFileSync(join(servingSiteDir, "ops/local-sites-intent.json"), "utf8")), intent);
  assert.deepEqual(readdirSync(join(servingSiteDir, "ops")), ["local-sites-intent.json"]);
  const previous = openSync(join(servingSiteDir, "ops/local-sites-intent.json"), "r");
  try {
    store.write({ intent: { ...intent, sites: {} } });
    // An open reader keeps the complete old inode; an in-place write would change its snapshot.
    assert.deepEqual(JSON.parse(readFileSync(previous, "utf8")), intent);
  } finally { closeSync(previous); }
  assert.deepEqual(store.read()?.sites, {});
});

test("warm history persists evicted sites but rejects a snapshot that assigns one API port to two sites", t => {
  const servingSiteDir = mkdtempSync(join(tmpdir(), "site-intent-ports-"));
  t.after(() => rmSync(servingSiteDir, { recursive: true, force: true }));
  const store = createLocalSiteIntentStore({ servingSiteDir });
  const intent = { session: "dev-42", sites: { active: { port: 3101 } },
    ports: { active: { port: 3101 }, evicted: { port: 4100 } } };
  store.write({ intent });
  assert.deepEqual(createLocalSiteIntentStore({ servingSiteDir }).read(), intent);
  writeFileSync(join(servingSiteDir, "ops/local-sites-intent.json"), JSON.stringify({
    ...intent, ports: { ...intent.ports, evicted: { port: 3101 } },
  }));
  assert.equal(store.read(), undefined, "a corrupt history must not revive two sites at one URL");
});

test("filesystem failure reading site intent is not mistaken for an absent snapshot", t => {
  const servingSiteDir = mkdtempSync(join(tmpdir(), "site-intent-blocked-"));
  t.after(() => rmSync(servingSiteDir, { recursive: true, force: true }));
  writeFileSync(join(servingSiteDir, "ops"), "unexpected file where the ops directory belongs");
  assert.throws(() => createLocalSiteIntentStore({ servingSiteDir }).read(), { code: "ENOTDIR" });
});

for (const corrupt of ["{", "null", "[]", '{}', '{"session":1,"sites":{}}', '{"session":"x","sites":[]}',
  '{"session":"x","sites":{"../escape":{"port":3101}}}', '{"session":"x","sites":{"a":{"port":"3101"}}}',
  '{"session":"x","sites":{"a":{"port":0}}}', '{"session":"x","sites":{"a":null}}']) {
  test(`corrupt intent is empty: ${corrupt}`, t => {
    const servingSiteDir = mkdtempSync(join(tmpdir(), "site-intent-"));
    t.after(() => rmSync(servingSiteDir, { recursive: true, force: true }));
    mkdirSync(join(servingSiteDir, "ops"));
    writeFileSync(join(servingSiteDir, "ops/local-sites-intent.json"), corrupt);
    assert.equal(createLocalSiteIntentStore({ servingSiteDir }).read(), undefined);
  });
}
