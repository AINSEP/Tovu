// @unrun: authored 2026-10-04 by an agent, NEVER EXECUTED; expectations unverified.
import assert from "node:assert/strict";
import test from "node:test";

import { bootSite, expectJson, send, SITE_DIALECTS, type BootedSite } from "../helpers/unrun-site-boot.js";

/**
 * @file Round 5 of ADS-memory/reports/2026-10-04-integration-test-gaps.md — the settings ledger
 * (`routes/settings/{set,clear,get-effective,get-raw}.ts`) and the site profile
 * (`routes/site/profile.ts`) through the REAL site composition on both dialects.
 *
 * Every settings route test mounts the hermetic `createRouteDeps()` root. The Kysely settings repo
 * is dialect-tested alone; the seam between them — a value written through the admin route landing
 * in SQLite/Postgres and then read back by a PUBLIC render (`core.site.title` → `resolveSiteTitle`
 * → `/feed.xml`), and the per-user layer (`core.language.locale`) staying per user — runs nowhere.
 *
 * Public surface for the title: `/feed.xml` (`public-http/routes/site/feed.ts`), because the static
 * tier's home page (`renderStaticTierHomePage`) renders its own HTML and never reads `siteTitle`.
 * With no owner-set title the feed shows the site display name, i.e. `initSite`'s `config.json`
 * `name` (`site-title.ts` `resolveSiteTitle` step 3), which `bootSite` sets to `Unrun <dialect> site`.
 */

const TITLE = "Unrun Profile Title";

interface EffectiveRow {
  key: string;
  value: unknown;
  sourceLayer: string;
  defVersion: number;
}

async function effective(site: BootedSite, namespace: string, principalId?: string): Promise<EffectiveRow[]> {
  const query = `namespace=${encodeURIComponent(namespace)}${principalId ? `&principalId=${encodeURIComponent(principalId)}` : ""}`;
  return (await expectJson<{ data: EffectiveRow[] }>(await send(site, "GET", `${site.ws}/settings/effective?${query}`), 200)).data;
}

async function feed(site: BootedSite): Promise<string> {
  const res = await fetch(`${site.baseUrl}/feed.xml`);
  const body = await res.text();
  assert.equal(res.status, 200, body);
  return body;
}

async function ownerId(site: BootedSite): Promise<string> {
  return (await expectJson<{ user: { id: string } }>(await send(site, "GET", "/api/admin/v1/auth/me"), 200)).user.id;
}

for (const dialect of SITE_DIALECTS) {
  test(`[unrun] settings [${dialect}]: core.site.title written through the admin API is trimmed, persisted, and rendered by /feed.xml; clearing it falls back to the site name`, async (t) => {
    const site = await bootSite(t, dialect);
    const displayName = `Unrun ${dialect} site`;
    const before = await feed(site);
    assert.ok(before.includes(`<title>${displayName}</title>`), `no owner title yet: the feed shows config.json's name: ${before.slice(0, 400)}`);

    const written = await expectJson<{ key: string; scope: string; value: unknown; revisionSeq: unknown }>(
      await send(site, "PUT", `${site.ws}/settings/value`, { namespace: "core.site", key: "title", scope: "workspace", valueJson: `  ${TITLE}  ` }),
      200
    );
    assert.deepEqual(
      { key: written.key, scope: written.scope, value: written.value },
      { key: "core.site.title", scope: "workspace", value: TITLE },
      "REQ-08: the stored title is the trimmed form"
    );
    assert.equal(typeof written.revisionSeq, "number");

    const row = (await effective(site, "core.site")).find((entry) => entry.key === "title");
    assert.deepEqual({ value: row?.value, sourceLayer: row?.sourceLayer }, { value: TITLE, sourceLayer: "workspace" });

    const after = await feed(site);
    assert.ok(after.includes(`<title>${TITLE}</title>`), "the public feed reads the title from the ledger on the next request");
    assert.ok(after.includes(`<description>${TITLE}</description>`));

    const cleared = await expectJson<unknown>(await send(site, "DELETE", `${site.ws}/settings/value`, { namespace: "core.site", key: "title", scope: "workspace" }), 200);
    assert.deepEqual(cleared, { ...(cleared as object), key: "core.site.title", scope: "workspace", value: null });
    const back = (await effective(site, "core.site")).find((entry) => entry.key === "title");
    assert.equal(back?.sourceLayer, "default", "a cleared workspace value no longer counts as an owner title");
    const restored = await feed(site);
    assert.ok(restored.includes(`<title>${displayName}</title>`), "with the value cleared the feed is back to the site name");
    assert.ok(!restored.includes(TITLE));
  });

  test(`[unrun] settings [${dialect}]: an out-of-bounds title, a missing value, an unknown key and a foreign workspace are refused and store nothing`, async (t) => {
    const site = await bootSite(t, dialect);
    const put = (body: Record<string, unknown>) => send(site, "PUT", `${site.ws}/settings/value`, body);
    const rejection = "value for 'core.site.title' must be 1..200 characters after trimming";

    assert.deepEqual(
      await expectJson(await put({ namespace: "core.site", key: "title", scope: "workspace", valueJson: "    " }), 400),
      { error: rejection, code: "VALUE_VALIDATION_FAILED" }
    );
    assert.deepEqual(
      await expectJson(await put({ namespace: "core.site", key: "title", scope: "workspace", valueJson: "x".repeat(201) }), 400),
      { error: rejection, code: "VALUE_VALIDATION_FAILED" }
    );
    const wrongType = await expectJson<{ code: string }>(await put({ namespace: "core.site", key: "title", scope: "workspace", valueJson: 42 }), 400);
    assert.equal(wrongType.code, "VALUE_VALIDATION_FAILED", "the definition schema is a string");

    assert.deepEqual(await expectJson(await put({ namespace: "core.site", key: "title", scope: "workspace" }), 400), {
      error: "namespace, key, scope (global|workspace|user), and valueJson are required",
      code: "VALIDATION_ERROR",
    });
    const unknown = await expectJson<{ code: string }>(await put({ namespace: "core.site", key: "unrun-nope", scope: "workspace", valueJson: "x" }), 404);
    assert.equal(unknown.code, "DEFINITION_NOT_FOUND");
    const foreign = await expectJson<{ code: string }>(
      await put({ namespace: "core.site", key: "title", scope: "workspace", workspaceId: "00000000-0000-4000-8000-0000000000aa", valueJson: "Elsewhere" }),
      400
    );
    assert.equal(foreign.code, "VALIDATION_ERROR", "a body naming another workspace is rejected, never honored (shared.ts resolveTargetWorkspaceId)");

    const row = (await effective(site, "core.site")).find((entry) => entry.key === "title");
    assert.equal(row?.sourceLayer, "default", "none of the refused writes reached the ledger");
  });

  test(`[unrun] settings [${dialect}]: core.language.locale is a per-user value — the owner's choice reads back as theirs and leaves another user's layer empty`, async (t) => {
    const site = await bootSite(t, dialect);
    const owner = await ownerId(site);
    const { user } = await expectJson<{ user: { principalId: string } }>(
      await send(site, "POST", `${site.ws}/users`, { username: "unrunlocale", password: "unrunlocale-p4ssw0rd!" }),
      201
    );

    const initial = (await effective(site, "core.language")).find((entry) => entry.key === "locale");
    assert.deepEqual({ value: initial?.value, sourceLayer: initial?.sourceLayer }, { value: "en", sourceLayer: "default" });

    const written = await expectJson<unknown>(
      await send(site, "PUT", `${site.ws}/settings/value`, { namespace: "core.language", key: "locale", scope: "user", valueJson: "de" }),
      200
    );
    assert.deepEqual(written, { ...(written as object), key: "core.language.locale", scope: "user", value: "de" });

    const mine = (await effective(site, "core.language")).find((entry) => entry.key === "locale");
    assert.deepEqual(
      { value: mine?.value, sourceLayer: mine?.sourceLayer },
      { value: "de", sourceLayer: "user" },
      "a self-read with no principalId param sees its own user layer (get-effective.ts defaults to the caller)"
    );
    const theirs = (await effective(site, "core.language", user.principalId)).find((entry) => entry.key === "locale");
    assert.deepEqual({ value: theirs?.value, sourceLayer: theirs?.sourceLayer }, { value: "en", sourceLayer: "default" });

    const raw = await expectJson<unknown>(
      await send(site, "GET", `${site.ws}/settings/raw?namespace=core.language&key=locale&principalId=${owner}`),
      200
    );
    assert.deepEqual(raw, { key: "core.language.locale", global: null, workspace: null, user: "de", default: "en" });
  });

  test(`[unrun] settings [${dialect}]: GET site/profile reports every section ok for the owner, reflects a published page, and rejects a bad query with 400`, async (t) => {
    const site = await bootSite(t, dialect);
    const { post } = await expectJson<{ post: { id: string } }>(
      await send(site, "POST", `${site.ws}/pages`, { title: "Unrun Profile Page", slug: "unrun-profile-page", status: "published" }),
      201
    );

    const profile = await expectJson<{
      schemaVersion: string;
      completeness: string;
      sections: Record<string, { status: string; data?: unknown }>;
    }>(await send(site, "GET", `${site.ws}/site/profile`), 200);
    assert.equal(profile.schemaVersion, "1");
    assert.equal(profile.completeness, "complete");
    assert.deepEqual(
      Object.entries(profile.sections).map(([name, section]) => [name, section.status]).sort(),
      [["contentTypes", "ok"], ["pages", "ok"], ["plugins", "ok"], ["settings", "ok"], ["theme", "ok"]],
      "the owner passes all five per-section gates on this dialect's identity tables"
    );
    const pages = profile.sections.pages.data as { items: Array<{ id: string; slug: string; status: string }> };
    assert.deepEqual(
      pages.items.filter((item) => item.id === post.id).map((item) => ({ slug: item.slug, status: item.status })),
      [{ slug: "unrun-profile-page", status: "published" }]
    );

    const scoped = await expectJson<{ sections: Record<string, unknown> }>(await send(site, "GET", `${site.ws}/site/profile?sections=theme`), 200);
    assert.deepEqual(Object.keys(scoped.sections), ["theme"]);

    assert.deepEqual(await expectJson(await send(site, "GET", `${site.ws}/site/profile?sections=secrets`), 400), {
      error: "unknown section 'secrets' — valid sections are: pages, theme, plugins, settings, contentTypes",
      code: "VALIDATION_ERROR",
    });
    assert.deepEqual(await expectJson(await send(site, "GET", `${site.ws}/site/profile?pageLimit=0`), 400), {
      error: "pageLimit must be an integer between 1 and 200, got '0'",
      code: "VALIDATION_ERROR",
    });
  });
}
