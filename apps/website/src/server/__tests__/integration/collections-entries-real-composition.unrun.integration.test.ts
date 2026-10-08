// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import test from "node:test";

import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Gap #4 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — Collections (content types
 * → entries → publish) through the REAL site composition on both dialects.
 *
 * `entries-routes.test.ts` and `content-types-routes.test.ts` run every one of these routes, but only
 * on the hermetic `createRouteDeps()` root. The repos are dialect-tested alone
 * (`features/entries/__tests__/integration/repo.dialects.test.ts`, `features/content-types/__tests__/
 * repo.dialects.test.ts`); the route-to-repo seam is not. The interesting dialect risks live exactly
 * in that seam: `fieldsJson` round-tripping through a JSON column (TEXT on SQLite, JSONB on Postgres
 * — JSONB reorders keys and drops duplicate keys), a duplicate slug surfacing as the mapped 409
 * `ENTRY_SLUG_CONFLICT` rather than a raw driver error (SQLite and Postgres raise different
 * unique-violation errors), and compare-and-set versioning under `expectedVersion`.
 */

const TYPE = { key: "unrun_recipe", label: "Unrun Recipe", fields: [
  { name: "servings", kind: "integer", required: false, queryable: true },
  { name: "tags", kind: "json", required: false, queryable: false },
  { name: "nested", kind: "json", required: false, queryable: false },
] };

interface EntryDto {
  id: string;
  title: string;
  status: string;
  version: number;
  fieldsJson: unknown;
  publishedAt?: string | null;
}

async function registerType(site: BootedSite): Promise<void> {
  await expectJson(await send(site, "POST", "/api/admin/v1/content-types", TYPE), 201);
}

async function createEntry(site: BootedSite, slug: string, title: string): Promise<EntryDto> {
  return (await expectJson<{ entry: EntryDto }>(await send(site, "POST", "/api/admin/v1/entries", { type: TYPE.key, slug, title }), 201)).entry;
}

async function listEntries(site: BootedSite): Promise<EntryDto[]> {
  return (await expectJson<{ items: EntryDto[] }>(await send(site, "GET", `/api/admin/v1/entries?type=${TYPE.key}`), 200)).items;
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] collections [${dialect}]: register a type, create → update (nested fieldsJson) → publish an entry, and every read-back matches`, async (t) => {
    const site = await bootSite(t, dialect);
    await registerType(site);
    const created = await createEntry(site, "eggs", "Eggs");
    assert.equal(created.version, 1);
    assert.equal(created.status, "draft");

    const fieldsJson = { ext: { site: { servings: 2, tags: ["breakfast", "quick"], nested: { zeta: true, alpha: null } } } };
    const updated = await expectJson<{ entry: EntryDto }>(
      await send(site, "PUT", `/api/admin/v1/entries/${created.id}`, { title: "Scrambled Eggs", fieldsJson, expectedVersion: 1 }),
      200
    );
    assert.equal(updated.entry.title, "Scrambled Eggs");
    assert.equal(updated.entry.version, 2);

    const [listed] = await listEntries(site);
    assert.equal(listed.id, created.id);
    assert.deepEqual(listed.fieldsJson, fieldsJson, "nested JSON (numbers, arrays, booleans, null) round-trips through the store");

    const published = await expectJson<{ entry: EntryDto }>(
      await send(site, "POST", `/api/admin/v1/entries/${created.id}/lifecycle`, { op: "publish", expectedVersion: 2 }),
      200
    );
    assert.equal(published.entry.status, "published");
    assert.equal(typeof published.entry.publishedAt, "string");
    assert.equal(new Date(published.entry.publishedAt as string).toISOString(), published.entry.publishedAt, "publishedAt comes back as a canonical ISO string on both dialects");
  });

  test(`[unrun] collections [${dialect}]: a duplicate (type, slug) is the mapped 409 ENTRY_SLUG_CONFLICT, not a driver error, and leaves one entry`, async (t) => {
    const site = await bootSite(t, dialect);
    await registerType(site);
    await createEntry(site, "eggs", "Eggs");

    const conflict = await expectJson<{ code: string }>(await send(site, "POST", "/api/admin/v1/entries", { type: TYPE.key, slug: "eggs", title: "Eggs Again" }), 409);
    assert.equal(conflict.code, "ENTRY_SLUG_CONFLICT");
    assert.deepEqual((await listEntries(site)).map((entry) => entry.title), ["Eggs"]);
  });

  test(`[unrun] collections [${dialect}]: a stale expectedVersion is 409 VERSION_CONFLICT and the stored row is unchanged`, async (t) => {
    const site = await bootSite(t, dialect);
    await registerType(site);
    const created = await createEntry(site, "toast", "Toast");
    await expectJson(await send(site, "PUT", `/api/admin/v1/entries/${created.id}`, { title: "Toast v2", expectedVersion: 1 }), 200);

    const stale = await expectJson<{ code: string }>(await send(site, "PUT", `/api/admin/v1/entries/${created.id}`, { title: "Lost update", expectedVersion: 1 }), 409);
    assert.equal(stale.code, "VERSION_CONFLICT");
    const [row] = await listEntries(site);
    assert.deepEqual({ title: row.title, version: row.version }, { title: "Toast v2", version: 2 });
  });

  test(`[unrun] collections [${dialect}]: once its type is deprecated then tombstoned, an entry can no longer be published (409 CONTENT_TYPE_NOT_ACTIVE)`, async (t) => {
    const site = await bootSite(t, dialect);
    await registerType(site);
    const created = await createEntry(site, "jam", "Jam");

    await expectJson(await send(site, "POST", `/api/admin/v1/content-types/${TYPE.key}/lifecycle`, { op: "deprecate", expectedVersion: 1 }), 200);
    await expectJson(await send(site, "POST", `/api/admin/v1/content-types/${TYPE.key}/lifecycle`, { op: "tombstone", expectedVersion: 2 }), 200);

    const refused = await expectJson<{ code: string }>(
      await send(site, "POST", `/api/admin/v1/entries/${created.id}/lifecycle`, { op: "publish", expectedVersion: created.version }),
      409
    );
    assert.equal(refused.code, "CONTENT_TYPE_NOT_ACTIVE");
  });
}
