import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSiteProfile,
  INVENTORY_SAFE_SETTINGS,
  MAX_PAGE_ITEMS,
  SITE_PROFILE_SECTION_NAMES,
  SITE_PROFILE_SECTION_PERMISSIONS,
  type SiteProfileDeps,
  type SiteProfileSectionName,
} from "../site-profile.js";
import { NO_THEME_ID } from "../../theme/index.js";

/**
 * @file `buildSiteProfile()`'s two load-bearing properties, tested directly against fake ports:
 *
 * 1. **Per-section authorization.** Each section is gated by its OWN domain permission, a denial
 *    marks only that section `forbidden`, and a denied section performs no read at all.
 * 2. **Secret safety by construction.** Canary values planted in every field the DTOs deliberately
 *    drop (a post's body, a theme's dir/css, a plugin's manifest, a content type's field defs) must
 *    never survive `JSON.stringify()` of the profile.
 *
 * The credential-store half of the honeytoken requirement lives in
 * `server/__tests__/routes/site-profile-route.test.ts`, which seeds real sealed-credential stores on
 * a real composition root and scans the real HTTP response body — a claim a fake port cannot make.
 */

const WORKSPACE_ID = "ws-site-profile";
const PRINCIPAL_ID = "principal-under-test";

/** Every canary below is planted on a field the DTO is supposed to drop. If one shows up in the
 *  serialized profile, something spread a raw domain record instead of naming fields. */
const CANARY = {
  postBody: "CANARY_POST_BODY_9f2a",
  postHtml: "CANARY_POST_HTML_1c4d",
  themeDir: "CANARY_THEME_DIR_7b3e",
  themeCss: "CANARY_THEME_CSS_5a8f",
  themeErrorText: "CANARY_THEME_ERROR_2d6b",
  pluginManifest: "CANARY_PLUGIN_MANIFEST_4e9c",
  contentTypeField: "CANARY_CONTENT_TYPE_FIELD_8a1b",
  trashedPageTitle: "CANARY_TRASHED_PAGE_3f7d",
} as const;

/** Records every `authorize()` call so a test can prove WHICH permission a section asked for. */
interface AuthorizeLog {
  calls: { permission: string; principalId: string; workspaceId: string; entityId?: string | undefined }[];
}

/** Records which section reads actually ran, so "denied sections perform no read" is checkable. */
interface ReadLog {
  reads: string[];
}

function makeDeps(overrides: {
  allow?: (permission: string) => boolean;
  authorizeLog?: AuthorizeLog;
  readLog?: ReadLog;
  posts?: unknown[];
  failing?: Partial<Record<SiteProfileSectionName, Error>>;
  settingValue?: unknown;
  activeThemeId?: string;
} = {}): SiteProfileDeps {
  const allow = overrides.allow ?? (() => true);
  const authorizeLog = overrides.authorizeLog;
  const readLog = overrides.readLog;
  const failing = overrides.failing ?? {};

  const note = (section: string): void => {
    readLog?.reads.push(section);
  };
  const failIfAsked = (section: SiteProfileSectionName): void => {
    const error = failing[section];
    if (error) throw error;
  };

  const posts = overrides.posts ?? [
    {
      id: "p1",
      title: "Home",
      slug: "home",
      kind: "page",
      status: "published",
      bodyFormat: "json",
      updatedAt: "2026-01-01T00:00:00.000Z",
      // Deliberately present on the ROW and deliberately absent from the DTO.
      bodyJson: { text: CANARY.postBody },
      bodyHtml: `<p>${CANARY.postHtml}</p>`,
    },
    {
      id: "p2",
      title: "First post",
      slug: "first-post",
      kind: "post",
      status: "draft",
      bodyFormat: "json",
      updatedAt: "2026-01-02T00:00:00.000Z",
      bodyJson: {},
    },
    {
      id: "p3",
      title: CANARY.trashedPageTitle,
      slug: "gone",
      kind: "page",
      status: "published",
      bodyFormat: "json",
      updatedAt: "2026-01-03T00:00:00.000Z",
      deletedAt: "2026-01-04T00:00:00.000Z",
    },
  ];

  return {
    workspaceId: WORKSPACE_ID,
    authorize: async ({ permission, principalId, workspaceId, entityId }) => {
      authorizeLog?.calls.push({ permission, principalId, workspaceId, entityId });
      return allow(permission) ? { allowed: true, reason: "granted" } : { allowed: false, reason: "no-grant" };
    },
    clock: { nowIso: () => "2026-08-26T00:00:00.000Z" },
    listPosts: async () => {
      note("pages");
      failIfAsked("pages");
      return posts as never;
    },
    listThemes: async () => {
      note("theme");
      failIfAsked("theme");
      return [
        {
          manifest: { id: "basic", name: "Basic", version: "1.0.0", tier: "static" },
          dir: CANARY.themeDir,
          css: CANARY.themeCss,
          source: "built-in",
          status: "valid",
          errors: [],
        },
        {
          manifest: { id: "broken", name: "Broken", version: "0.1.0", tier: "declarative" },
          dir: CANARY.themeDir,
          source: "site",
          status: "invalid",
          errors: [CANARY.themeErrorText],
        },
      ] as never;
    },
    readActiveThemeId: async () => {
      note("theme:active");
      return overrides.activeThemeId ?? "basic";
    },
    listPlugins: async () => {
      note("plugins");
      failIfAsked("plugins");
      return [
        { id: "word-count", name: "Word Count", version: "1.2.0", source: "built-in", tier: "tier-1", status: "valid", manifest: { secretish: CANARY.pluginManifest } },
        { id: "off", name: "Off", version: "0.0.1", source: "site", status: "valid" },
      ] as never;
    },
    listPluginActivations: async () => [
      { pluginId: "word-count", workspaceId: WORKSPACE_ID, enabled: true },
      // Another workspace's row for the same plugin — must never leak into this profile.
      { pluginId: "off", workspaceId: "some-other-workspace", enabled: true },
    ],
    readSetting: async ({ namespace, key }) => {
      note(`settings:${namespace}.${key}`);
      failIfAsked("settings");
      if (overrides.settingValue !== undefined) return overrides.settingValue as never;
      return key === "activeThemeId" ? "basic" : null;
    },
    listContentTypes: async () => {
      note("contentTypes");
      failIfAsked("contentTypes");
      return [
        { key: "recipe", label: "Recipe", status: "active", version: 3, fields: [{ name: CANARY.contentTypeField }] },
        { key: "gone", label: "Gone", status: "active", version: 1, fields: [], tombstonedAt: "2026-01-01T00:00:00.000Z" },
      ] as never;
    },
  };
}

test("site profile: every section is authorized against its OWN domain permission, never one blanket check", async () => {
  const authorizeLog: AuthorizeLog = { calls: [] };
  await buildSiteProfile(makeDeps({ authorizeLog }), { principalId: PRINCIPAL_ID });

  const asked = authorizeLog.calls.map((call) => call.permission).sort();
  assert.deepEqual(asked, Object.values(SITE_PROFILE_SECTION_PERMISSIONS).slice().sort());
  // Exactly one decision per section — not a single check reused, and not a check repeated.
  assert.equal(authorizeLog.calls.length, SITE_PROFILE_SECTION_NAMES.length);
  for (const call of authorizeLog.calls) {
    assert.equal(call.principalId, PRINCIPAL_ID);
    assert.equal(call.workspaceId, WORKSPACE_ID);
  }
  // The permissions really are the pre-existing per-domain ones, spelled out here so a silent
  // rename to a new aggregate permission fails this test rather than passing quietly.
  assert.deepEqual(SITE_PROFILE_SECTION_PERMISSIONS, {
    pages: "content.read",
    theme: "theme.set",
    plugins: "admin.plugins.read",
    settings: "settings.read",
    contentTypes: "admin.collections.read",
  });
});

test("site profile: a denied section is 'forbidden' with a reason, and the other sections still return data", async () => {
  const profile = await buildSiteProfile(
    makeDeps({ allow: (permission) => permission === "theme.set" }),
    { principalId: PRINCIPAL_ID },
  );

  assert.equal(profile.sections.theme?.status, "ok");
  assert.equal(profile.sections.theme?.data?.activeThemeId, "basic");

  for (const name of ["pages", "plugins", "settings", "contentTypes"] as const) {
    const section = profile.sections[name];
    assert.equal(section?.status, "forbidden", `${name} should be forbidden`);
    assert.equal(section?.reason, "no-grant");
    // Denied means "not assessed" — never an empty payload a consumer could read as "nothing there".
    assert.equal(section?.data, undefined);
  }
  assert.equal(profile.completeness, "partial");
});

test("site profile: a denied section performs no read at all — authorization runs before collection", async () => {
  const readLog: ReadLog = { reads: [] };
  await buildSiteProfile(
    makeDeps({ allow: (permission) => permission === "theme.set", readLog }),
    { principalId: PRINCIPAL_ID },
  );

  assert.ok(readLog.reads.includes("theme"), "the permitted section should have read");
  for (const denied of ["pages", "plugins", "contentTypes"]) {
    assert.ok(!readLog.reads.includes(denied), `denied section '${denied}' must not have read anything`);
  }
  assert.ok(!readLog.reads.some((entry) => entry.startsWith("settings:")), "denied settings must not have been read");
});

test("site profile: a principal with no grants gets a well-formed response in which every section is forbidden", async () => {
  const profile = await buildSiteProfile(makeDeps({ allow: () => false }), { principalId: PRINCIPAL_ID });

  assert.equal(profile.schemaVersion, "1");
  assert.equal(profile.completeness, "partial");
  for (const name of SITE_PROFILE_SECTION_NAMES) {
    assert.equal(profile.sections[name]?.status, "forbidden");
  }
});

test("site profile: 'sections' scopes the response, and only the requested sections are authorized", async () => {
  const authorizeLog: AuthorizeLog = { calls: [] };
  const profile = await buildSiteProfile(
    makeDeps({ authorizeLog }),
    { principalId: PRINCIPAL_ID },
    { sections: ["settings", "theme"] },
  );

  assert.deepEqual(Object.keys(profile.sections), ["theme", "settings"], "key order follows the closed vocabulary");
  assert.equal(profile.sections.pages, undefined);
  assert.deepEqual(
    authorizeLog.calls.map((call) => call.permission).sort(),
    ["settings.read", "theme.set"],
    "an unrequested section must not be authorized either",
  );
  assert.equal(profile.completeness, "complete");
});

test("site profile: an empty 'sections' array means all sections, not none", async () => {
  const profile = await buildSiteProfile(makeDeps(), { principalId: PRINCIPAL_ID }, { sections: [] });
  assert.deepEqual(Object.keys(profile.sections).sort(), [...SITE_PROFILE_SECTION_NAMES].sort());
});

test("site profile: a section whose read throws is 'unavailable' with the error CLASS, never its message", async () => {
  const leaky = new Error("connection string is postgres://user:CANARY_DB_PASSWORD_1234@host/db");
  leaky.name = "RepoUnavailableError";

  const profile = await buildSiteProfile(
    makeDeps({ failing: { plugins: leaky } }),
    { principalId: PRINCIPAL_ID },
  );

  assert.equal(profile.sections.plugins?.status, "unavailable");
  assert.equal(profile.sections.plugins?.reason, "RepoUnavailableError");
  assert.ok(
    !JSON.stringify(profile).includes("CANARY_DB_PASSWORD_1234"),
    "an error message must never be echoed into the profile",
  );
  // One broken section does not take the others down.
  assert.equal(profile.sections.theme?.status, "ok");
  assert.equal(profile.completeness, "partial");
});

test("site profile: a section that hangs past its timeout is 'unavailable' with reason 'timed-out'", async () => {
  const deps = makeDeps();
  const hanging: SiteProfileDeps = {
    ...deps,
    listContentTypes: () => new Promise(() => {
      // Never settles — the timeout is the whole point of this test.
    }),
  };

  const profile = await buildSiteProfile(hanging, { principalId: PRINCIPAL_ID }, { sectionTimeoutMs: 20 });
  assert.equal(profile.sections.contentTypes?.status, "unavailable");
  assert.equal(profile.sections.contentTypes?.reason, "timed-out");
  assert.equal(profile.sections.pages?.status, "ok");
});

test("site profile: pages reports totals over EVERY live row while capping the listed items", async () => {
  const many = Array.from({ length: 120 }, (_, index) => ({
    id: `p${index}`,
    title: `Page ${index}`,
    slug: `page-${index}`,
    kind: index % 2 === 0 ? "page" : "post",
    status: index < 10 ? "draft" : "published",
    bodyFormat: "json",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));

  const profile = await buildSiteProfile(makeDeps({ posts: many }), { principalId: PRINCIPAL_ID }, { pageLimit: 5 });
  const pages = profile.sections.pages;

  assert.equal(pages?.status, "ok");
  assert.equal(pages?.data?.items.length, 5);
  assert.equal(pages?.data?.total, 120, "total counts every live row, not the capped sample");
  assert.deepEqual(pages?.data?.countsByKind, { page: 60, post: 60 });
  assert.deepEqual(pages?.data?.countsByStatus, { draft: 10, published: 110 });
  assert.equal(pages?.truncated, true);
});

test("site profile: pageLimit is clamped to the hard maximum and defaulted for nonsense values", async () => {
  const many = Array.from({ length: 300 }, (_, index) => ({
    id: `p${index}`,
    title: `Page ${index}`,
    slug: `page-${index}`,
    kind: "page",
    status: "published",
    bodyFormat: "json",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));

  const capped = await buildSiteProfile(makeDeps({ posts: many }), { principalId: PRINCIPAL_ID }, { pageLimit: 10_000 });
  assert.equal(capped.sections.pages?.data?.items.length, MAX_PAGE_ITEMS);

  const nonsense = await buildSiteProfile(makeDeps({ posts: many }), { principalId: PRINCIPAL_ID }, { pageLimit: -3 });
  assert.equal(nonsense.sections.pages?.data?.items.length, 50, "a negative limit falls back to the default");
});

test("site profile: trashed rows are excluded from both the listing and the counts", async () => {
  const profile = await buildSiteProfile(makeDeps(), { principalId: PRINCIPAL_ID }, { sections: ["pages"] });
  assert.equal(profile.sections.pages?.data?.total, 2);
  assert.ok(!JSON.stringify(profile).includes(CANARY.trashedPageTitle));
});

test("site profile: plugin activation is scoped to THIS workspace, never another tenant's row", async () => {
  const profile = await buildSiteProfile(makeDeps(), { principalId: PRINCIPAL_ID }, { sections: ["plugins"] });
  const plugins = profile.sections.plugins?.data ?? [];

  assert.deepEqual(
    plugins.map((plugin) => [plugin.id, plugin.enabled]),
    [
      ["word-count", true],
      // Enabled in a DIFFERENT workspace — this workspace must report the real default.
      ["off", false],
    ],
  );
});

test("site profile: theme reports the configured id even when it names nothing discovered", async () => {
  const deps = makeDeps();
  const drifted: SiteProfileDeps = { ...deps, readActiveThemeId: async () => "deleted-theme" };

  const profile = await buildSiteProfile(drifted, { principalId: PRINCIPAL_ID }, { sections: ["theme"] });
  assert.equal(profile.sections.theme?.data?.activeThemeId, "deleted-theme");
  assert.equal(profile.sections.theme?.data?.active, null, "a missing active theme is reported, not silently substituted");
  assert.equal(profile.sections.theme?.data?.installed.length, 2);
});

test("site profile: settings reports exactly the inventory-safe allowlist, in allowlist order", async () => {
  const profile = await buildSiteProfile(makeDeps(), { principalId: PRINCIPAL_ID }, { sections: ["settings"] });
  const rows = profile.sections.settings?.data ?? [];

  assert.deepEqual(
    rows.map((row) => `${row.namespace}.${row.key}`),
    INVENTORY_SAFE_SETTINGS.map((entry) => `${entry.namespace}.${entry.key}`),
  );
  assert.deepEqual(rows[0], { namespace: "core.presentation", key: "activeThemeId", configured: true, value: "basic" });
  // An unresolved definition is reported as unconfigured rather than omitted.
  assert.equal(rows[1]?.configured, false);
  assert.equal(rows[1]?.value, null);
});

test("site profile: an oversized setting value is dropped and flagged, never inlined", async () => {
  const profile = await buildSiteProfile(
    makeDeps({ settingValue: "x".repeat(5_000) }),
    { principalId: PRINCIPAL_ID },
    { sections: ["settings"] },
  );

  const rows = profile.sections.settings?.data ?? [];
  assert.ok(rows.every((row) => row.truncated === true));
  assert.ok(rows.every((row) => row.value === null));
  assert.equal(profile.sections.settings?.truncated, true);
  assert.ok(JSON.stringify(profile).length < 5_000, "the oversized value must not be in the payload");
});

test("site profile: no canary planted on a dropped domain field survives serialization", async () => {
  const profile = await buildSiteProfile(makeDeps(), { principalId: PRINCIPAL_ID });
  const serialized = JSON.stringify(profile);

  for (const [field, canary] of Object.entries(CANARY)) {
    assert.ok(!serialized.includes(canary), `'${field}' leaked into the profile — a DTO spread a raw domain record`);
  }
});

test("site profile: the DTOs expose exactly the declared fields, so a new upstream field cannot appear silently", async () => {
  const profile = await buildSiteProfile(makeDeps(), { principalId: PRINCIPAL_ID });

  assert.deepEqual(Object.keys(profile).sort(), ["capturedAt", "completeness", "schemaVersion", "sections"]);
  assert.deepEqual(Object.keys(profile.sections.pages?.data?.items[0] ?? {}).sort(), [
    "bodyFormat",
    "id",
    "kind",
    "slug",
    "status",
    "title",
    "updatedAt",
  ]);
  assert.deepEqual(Object.keys(profile.sections.theme?.data?.installed[0] ?? {}).sort(), [
    "errorCount",
    "id",
    "name",
    "source",
    "status",
    "tier",
    "version",
  ]);
  assert.deepEqual(Object.keys(profile.sections.plugins?.data?.[0] ?? {}).sort(), [
    "enabled",
    "id",
    "name",
    "source",
    "status",
    "tier",
    "version",
  ]);
  assert.deepEqual(Object.keys(profile.sections.contentTypes?.data?.[0] ?? {}).sort(), [
    "fieldCount",
    "key",
    "label",
    "status",
    "version",
  ]);
});

test("site profile: capturedAt comes from the injected clock, never from wall time", async () => {
  const profile = await buildSiteProfile(makeDeps(), { principalId: PRINCIPAL_ID }, { sections: ["theme"] });
  assert.equal(profile.capturedAt, "2026-08-26T00:00:00.000Z");
});

test("site profile: a DELIBERATELY themeless site is not reported as theme drift", async () => {
  // `active: null` is this section's "the configured theme names nothing discovered" signal — real
  // drift, worth an operator's attention. The no-theme sentinel produces the same `active: null`,
  // so without a discriminator a profile reader (human or agent) sees a site whose operator turned
  // the theme off and reports a misconfiguration that does not exist. Two causes, one field, and
  // the reader cannot tell them apart: the profile cries wolf.
  const disabled = await buildSiteProfile(makeDeps({ activeThemeId: NO_THEME_ID }), {});
  const stranded = await buildSiteProfile(makeDeps({ activeThemeId: "deleted-theme" }), {});

  assert.equal(disabled.sections.theme?.data?.active, null, "control: both states share `active: null`");
  assert.equal(stranded.sections.theme?.data?.active, null, "control: both states share `active: null`");

  assert.equal(disabled.sections.theme?.data?.themeDisabled, true, "the deliberate case must be identifiable");
  assert.equal(stranded.sections.theme?.data?.themeDisabled, false, "real drift must NOT claim to be deliberate");
});

test("site profile: an ordinary, healthy site is not reported as themeless either", async () => {
  const profile = await buildSiteProfile(makeDeps(), {});
  assert.equal(profile.sections.theme?.data?.themeDisabled, false);
  assert.equal(profile.sections.theme?.data?.active?.id, "basic");
});
