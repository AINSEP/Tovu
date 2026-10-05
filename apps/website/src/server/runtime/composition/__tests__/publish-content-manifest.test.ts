/**
 * @file Task 2 of the publish-content (Publish Content) feature — proves
 * `installFirstPartyPublishContentTypes()` (`../publish-content-manifest.ts`) actually registers the
 * contributors it claims, and that it is idempotent (mirrors `tool-contribution-registry.test.ts`'s
 * identical "calling it twice leaves the registry in the same state as calling it once" check for
 * `installFirstPartyToolContributors`).
 *
 * `media` joined `post`/`page` here only once its `apply()` was a real write path. Registering a
 * type whose `apply()` throws would turn a correct refusal into a live bug — so the last test below
 * is not a spelling check on the registry list: it BUILDS the registered media contributor and
 * applies a real entity through it, which is the property that actually makes the registration safe.
 *
 * G5 (`plan-publish-all-types-2026-09-25.md` §5): the live site's own publish grant
 * (`deploy/publish-trust.json`) hand-lists which types it accepts and refuses `'*'` (`grant.ts`'s
 * `parseEntityTypes`) — a type registered here but missing from that file exports and plans locally
 * but is refused as "not supported by live" the moment it reaches a real destination. The last test
 * below fails, naming the missing type, whenever a registered contributor's `entityType` is absent
 * from every grant's `entityTypes` in the committed file — so adding a type and forgetting the grant
 * entry fails CI instead of shipping a type that plans but can never actually publish.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { InMemoryOutbox } from "#src/contracts/core/events/index";
import { SqliteFormDefinitionRepo } from "#src/features/forms/repo.sqlite";
import { SqliteEntryRefsRepo } from "#src/platform/db/sqlite/entry-refs-repo.sqlite";
import { SqliteWidgetRegionBindingRepo } from "#src/features/widgets/repo.sqlite";
import type { DiscoveredTheme } from "#src/features/theme/theme";
import { makeSite, sqliteContentSite, WORKSPACE_ID } from "#src/features/publish-content/__tests__/round-trip-harness";
import { createFileBlobIndex } from "#src/features/publish-content/file-blob-index";
import { contentKernel } from "#src/platform/db/content-kernel";
import { createRawRowSqlitePort } from "#src/platform/db/sqlite/publish-backstop-row.sqlite";
import { createRawFileSitePort } from "#src/platform/site-dir/publish-backstop-file";
import { InMemoryAssetBlobRepo, InMemoryBlobStore, InMemoryMediaContentTypeStore, InMemoryVersionedMediaRepo, type MediaRecord } from "#src/features/media/index";
import { InMemoryMenuRepo, InMemoryNavLocationBindingRepo, type NavMenuEntry } from "#src/features/navigation/index";
import { createVerifiedOrigin, InMemoryOriginSettingRepo, OriginRegistry } from "#src/features/origin/index";
import { contentHash, CONTENT_HASH_VERSION } from "#src/features/publish-content/content-hash";
import { packThemeFilesEntities } from "#src/features/theme/publish-content";
import { createRedirect, InMemoryRedirectRepo, redirectMatcher, type RedirectsWriteDeps } from "#src/features/redirects/index";
import {
  buildPublishContentCatalog,
  listPublishContentContributors,
  resetPublishContentContributorsForTests,
  type PublishContentDeps,
} from "#src/features/publish-content/type-registry";

import { installFirstPartyPublishContentTypes } from "../publish-content-manifest.js";
import { createFakeClock } from "#src/__tests__/support/fake-clock";

test.beforeEach(() => {
  resetPublishContentContributorsForTests();
});

test("installFirstPartyPublishContentTypes registers exactly the publishable types, in order", () => {
  installFirstPartyPublishContentTypes();
  assert.deepEqual(
    listPublishContentContributors().map((c) => c.entityType),
    ["post", "page", "media", "redirect", "menu", "theme-files", "form", "content-type", "taxonomy", "term", "collection-entry", "widget", "widget-area", "site-setting", "active-theme", "raw-row", "raw-file"]
  );
});

// `buildPublishContentCatalog` throws on a `dependsOn` cycle, so a widened `dependsOn` (e.g. menu →
// term/collection-entry, which a widget → menu reference would close) fails here, not at boot.
test("the real registry's dependsOn graph has no cycle and orders each type after what it depends on", () => {
  installFirstPartyPublishContentTypes();
  // Order is computed before any handler is built; a bare deps bag is enough for `build()`.
  const { applyOrder } = buildPublishContentCatalog({ ports: {} } as unknown as PublishContentDeps);
  const at = (entityType: string): number => applyOrder.indexOf(entityType);

  assert.equal(applyOrder.length, listPublishContentContributors().length);
  for (const contributor of listPublishContentContributors()) {
    for (const dependency of contributor.dependsOn) {
      assert.ok(at(dependency) < at(contributor.entityType), `${dependency} before ${contributor.entityType}`);
    }
  }
  assert.ok(at("post") < at("menu") && at("page") < at("menu"), "menus after the posts/pages they link to");
});

test("installFirstPartyPublishContentTypes is idempotent — calling it twice leaves the registry in the same state as calling it once", () => {
  installFirstPartyPublishContentTypes();
  const once = listPublishContentContributors().map((c) => c.entityType);
  installFirstPartyPublishContentTypes();
  const twice = listPublishContentContributors().map((c) => c.entityType);
  assert.deepEqual(twice, once);
});

// F2.4/F6.3: apply through the installed registry, then read through its real export path.
// A registered stub or no-op must fail even when the domain factory's own tests still pass.
const APPLY_FIXTURES: Array<{ entityType: string; id: string; state: Record<string, unknown> }> = [
  ...["post", "page"].map(kind => ({ entityType: kind, id: `registry-${kind}`, state: {
    kind, title: `Published ${kind}`, slug: `published-${kind}`, status: "published", bodyFormat: "html",
    bodyJson: { type: "doc", content: [] }, bodyHtml: `<p>Registry ${kind} body</p>`,
  } })),
  { entityType: "form", id: "registry-contact", state: { name: "Registry contact", slug: "registry-contact", status: "active", fields: [{ id: "message", type: "textarea", label: "Message", required: true }], notify: { enabled: false, recipients: [] } } },
  { entityType: "content-type", id: "registry_recipe", state: { key: "registry_recipe", label: "Registry recipes", fields: [], status: "active" } },
  { entityType: "taxonomy", id: "registry-taxonomy", state: { name: "Registry categories", hierarchical: true } },
  { entityType: "term", id: "registry-term", state: { taxonomyId: "fixture-taxonomy", parentId: null, name: "Registry term" } },
  { entityType: "collection-entry", id: "registry-entry", state: { type: "fixture_recipe", slug: "registry-entry", title: "Registry recipe", status: "published", fieldsJson: { ext: { site: {} } }, bodyJson: null } },
  { entityType: "widget", id: "registry-widget", state: { slug: "registry-widget", title: "Registry introduction", widgetType: "text", config: { body: "Registry widget content" } } },
  { entityType: "widget-area", id: "sidebar", state: { regionKey: "sidebar", placements: [], schemaVersion: 1 } },
  { entityType: "site-setting", id: "core.site:title", state: { value: "Registry site title" } },
  { entityType: "active-theme", id: "site", state: { themeId: "registry-theme" } },
];

for (const fixture of APPLY_FIXTURES) {
  test(`the registered ${fixture.entityType} contributor applies an entity that reads back from real ports`, async () => {
    installFirstPartyPublishContentTypes();
    const site = sqliteContentSite();
    try {
      const at = "2026-09-01T00:00:00.000Z";
      site.db.$client.prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)").run(WORKSPACE_ID, "Registry fixture", "registry-fixture", at);
      await site.contentTypes.save({ workspaceId: WORKSPACE_ID, key: "fixture_recipe", label: "Fixture recipes", fields: [], status: "active", version: 1, tombstonedAt: null });
      await site.taxonomies.insert({ id: "fixture-taxonomy", name: "Fixture categories", hierarchical: true, status: "active", version: 1, updatedAt: at });
      await site.settings.saveDefinition({ settingId: "core.site.title", version: 1, workspaceId: null,
        namespace: "core.site", key: "title", ownerKind: "core", ownerId: null, schema: { type: "string", nullable: true },
        defaultValue: null, scopes: 2, secret: false, status: "active", aliasOfNamespace: null, aliasOfKey: null, coercionTag: null,
        createdAt: at, updatedAt: at,
      });
      await site.presentation.save({ workspaceId: WORKSPACE_ID, activeThemeId: "paper", updatedAt: at });
      site.themes.push({ status: "valid", manifest: { id: "registry-theme", tier: "static" }, dir: "/themes/static/registry-theme" } as DiscoveredTheme);
      const forms = new SqliteFormDefinitionRepo(site.db);
      const widget = { entries: site.entries, contentTypes: site.contentTypes, forms,
        entryRefs: new SqliteEntryRefsRepo(site.db), bindings: new SqliteWidgetRegionBindingRepo(site.db) };
      const deps = makeSite({ ...site.ports, form: { repo: forms }, widget, "widget-area": widget }, "registry");
      const handler = buildPublishContentCatalog(deps).handlerByType.get(fixture.entityType);
      assert.ok(handler, `${fixture.entityType} must be installed`);
      const before = [];
      for await (const entity of handler.pack()) before.push(entity);
      const prior = before.find(entity => entity.id === fixture.id);
      if (fixture.entityType === "active-theme") assert.equal(prior?.state.themeId, "paper");
      else assert.equal(prior, undefined, "the target must not already exist");

      await handler.apply({ entity: { entityType: fixture.entityType, id: fixture.id, state: fixture.state,
        schemaVersion: handler.schemaVersion, contentHash: contentHash(fixture.entityType, fixture.state), hashVersion: CONTENT_HASH_VERSION, requiredBlobs: [],
      }, expectedVersion: (await handler.inspect(fixture.id))?.version, principalId: "registry-operator", idempotencyKey: `registry-${fixture.entityType}` });

      const after = [];
      for await (const entity of handler.pack()) after.push(entity);
      const landed = after.find(entity => entity.id === fixture.id);
      assert.ok(landed, `${fixture.entityType}:${fixture.id} must be exportable after apply`);
      assert.deepEqual(Object.fromEntries(Object.keys(fixture.state).map(key => [key, landed.state[key]])), fixture.state);
      // Direct SQLite read-back independently pins the widget-area binding, whose packed
      // placements are intentionally empty in this smallest registration fixture.
      if (fixture.entityType === "widget-area") {
        assert.equal((site.db.$client.prepare("SELECT count(*) AS n FROM widget_region_bindings WHERE workspace_id = ? AND region_key = ?").get(WORKSPACE_ID, "sidebar") as { n: number }).n, 1);
      }
    } finally {
      site.db.$client.close();
    }
  });
}

test("the registered raw-row contributor creates a row readable through an independent SQLite query", async () => {
  installFirstPartyPublishContentTypes();
  const site = sqliteContentSite();
  try {
    site.db.$client.exec("CREATE TABLE p_registry_article (id TEXT PRIMARY KEY, title TEXT)");
    const deps: PublishContentDeps = { ...makeSite({}, "raw-row-registry"),
      backstop: { rows: createRawRowSqlitePort({ kernel: contentKernel(site.db) }), coveredTables: [], coveredRoots: [] } };
    const handler = buildPublishContentCatalog(deps).handlerByType.get("raw-row");
    assert.ok(handler);
    const id = 'p_registry_article:{"id":"article-1"}';
    const state = { table: "p_registry_article", pk: { id: "article-1" },
      columns: [{ name: "id", type: "TEXT", pk: 1, notnull: 0 }, { name: "title", type: "TEXT", pk: 0, notnull: 0 }],
      values: { id: "article-1", title: "Registry raw article" } };
    assert.equal((site.db.$client.prepare("SELECT count(*) AS n FROM p_registry_article").get() as { n: number }).n, 0);
    await handler.apply({ entity: { entityType: "raw-row", id, state, schemaVersion: 1,
      hashVersion: CONTENT_HASH_VERSION, contentHash: contentHash("raw-row", state), requiredBlobs: [],
    }, principalId: "registry-operator", expectedVersion: undefined, idempotencyKey: "registry-raw-row" });
    assert.deepEqual(site.db.$client.prepare("SELECT id, title FROM p_registry_article").all(), [{ id: "article-1", title: "Registry raw article" }]);
  } finally {
    site.db.$client.close();
  }
});

test("the registered raw-file contributor creates the exact bytes on disk", async () => {
  installFirstPartyPublishContentTypes();
  const root = await mkdtemp(path.join(tmpdir(), "registry-raw-file-"));
  try {
    const bytes = Buffer.from("<p>Registry raw footer</p>");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const blobs = new InMemoryBlobStore();
    await blobs.putIfAbsent({ workspaceId: WORKSPACE_ID, sha256, bytes });
    const deps: PublishContentDeps = { ...makeSite({}, "raw-file-registry"),
      backstop: { files: createRawFileSitePort({ siteDir: root }), blobs, fileBlobIndex: createFileBlobIndex(),
        fileRollbacks: [], coveredTables: [], coveredRoots: [] } };
    const handler = buildPublishContentCatalog(deps).handlerByType.get("raw-file");
    assert.ok(handler);
    const id = "snippets/footer.html";
    const state = { path: id, size: bytes.byteLength, sha256, mode: 0o644 };
    await assert.rejects(readFile(path.join(root, id)), { code: "ENOENT" });
    await handler.apply({ entity: { entityType: "raw-file", id, state, schemaVersion: 1,
      hashVersion: CONTENT_HASH_VERSION, contentHash: contentHash("raw-file", state), requiredBlobs: [sha256],
    }, principalId: "registry-operator", expectedVersion: undefined, idempotencyKey: "registry-raw-file" });
    assert.deepEqual(await readFile(path.join(root, id)), bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the registered media contributor's apply() is a real write path, not a throwing stub", async () => {
  installFirstPartyPublishContentTypes();
  const contributor = listPublishContentContributors().find((c) => c.entityType === "media");
  assert.ok(contributor, "media must be registered");

  const workspaceId = "11111111-1111-1111-1111-111111111111";
  const bytes = new TextEncoder().encode("a real imported photo's bytes");
  const sha256 = "86d9075d85c1cce55da0605a557dceaea6c27f18df8702ce86accccce8a41aa9";
  const record: MediaRecord = {
    id: "source-system-asset-42",
    workspaceId,
    title: "Team Photo",
    slug: "team-photo",
    alt: "",
    caption: "",
    credit: "",
    source: { sha256 },
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
    width: 800,
    height: 600,
    cssClass: null,
    htmlAttributes: null,
  };

  const mediaRepo = new InMemoryVersionedMediaRepo();
  const blobStore = new InMemoryBlobStore();
  await blobStore.putIfAbsent({ workspaceId, sha256, bytes });
  const outbox = new InMemoryOutbox();
  let n = 0;
  const deps: PublishContentDeps = {
    workspaceId,
    clock: createFakeClock({ startIso: "2026-09-18T12:00:00.000Z" }),
    idGen: { newId: () => `generated-id-${++n}` },
    outbox,
    changeSets: new InMemoryChangeSetRepo([], [], outbox),
    authorize: async () => ({ allowed: true, reason: "test-always-allow" }),
    ports: { media: { repo: mediaRepo, assetBlobRepo: new InMemoryAssetBlobRepo({}), blobStore, contentTypeStore: new InMemoryMediaContentTypeStore() } },
  };

  const { changeSetId } = await contributor.build(deps).apply({
    entity: {
      entityType: "media",
      id: record.id,
      schemaVersion: 1,
      contentHash: contentHash("media", { ...record }),
      hashVersion: CONTENT_HASH_VERSION,
      requiredBlobs: [sha256],
      state: { ...record } as unknown as Record<string, unknown>,
    },
    expectedVersion: undefined,
    principalId: "operator-principal-1",
  });

  assert.ok(changeSetId);
  const landed = await mediaRepo.findById({ workspaceId, id: "source-system-asset-42" });
  assert.equal(landed?.id, "source-system-asset-42", "the registered contributor must write the row under the SOURCE id");
});

test("the registered redirect contributor's apply() is a real write path, not a throwing stub", async () => {
  installFirstPartyPublishContentTypes();
  const contributor = listPublishContentContributors().find((c) => c.entityType === "redirect");
  assert.ok(contributor, "redirect must be registered");

  const workspaceId = "workspace-1";
  const originRepo = new InMemoryOriginSettingRepo([
    {
      workspaceId,
      origin: createVerifiedOrigin({
        scheme: "https",
        host: "trusted.example",
        verifiedAt: "2026-07-13T00:00:00.000Z",
        source: "workspace-setting",
      }),
      redirectAllowlist: [],
    },
  ]);
  // `InMemoryRedirectRepo` satisfies both `RedirectRepoPort` (`repo`) and `RedirectDbHandle` (`db`) —
  // ONE instance for both, mirroring every real `RedirectsWriteDeps` composition (that class's own
  // header) — never two independent stores, which would silently split the write.
  const redirectRepo = new InMemoryRedirectRepo();
  const redirectsWriteDeps: RedirectsWriteDeps = {
    repo: redirectRepo,
    remove: async () => ({ ok: false, reason: "not-found" }),
    isInTrash: async () => false,
    restore: async () => "not-found",
    db: redirectRepo,
    transaction: async (fn) => fn(),
    matcher: redirectMatcher,
    originRegistry: new OriginRegistry({ repo: originRepo }),
    clock: createFakeClock({ startIso: "2026-09-24T00:00:00.000Z" }),
    idGen: { newId: () => "generated-redirect-id-1" },
    outbox: new InMemoryOutbox(),
  };

  const deps: PublishContentDeps = {
    workspaceId,
    clock: createFakeClock({ startIso: "2026-09-24T00:00:00.000Z" }),
    idGen: { newId: () => "unused" },
    ports: { redirect: redirectsWriteDeps },
  };

  const { changeSetId } = await contributor.build(deps).apply({
    entity: {
      entityType: "redirect",
      id: "exact:/folded-stub",
      schemaVersion: 1,
      contentHash: "unused-in-this-test",
      hashVersion: CONTENT_HASH_VERSION,
      requiredBlobs: [],
      state: {
        matchType: "exact",
        fromPattern: "/folded-stub",
        toTarget: "/new-home",
        statusCode: 301,
        status: "active",
        override: true,
        priority: 0,
      },
    },
    expectedVersion: undefined,
    principalId: "operator-principal-1",
    idempotencyKey: "idem-redirect-1",
  });

  assert.ok(changeSetId);
  const landed = await redirectsWriteDeps.repo.findById({ workspaceId, id: changeSetId });
  assert.equal(landed?.fromPattern, "/folded-stub", "the registered contributor must actually write the row");
  assert.equal(landed?.override, true, "override must land so the redirect wins over an existing live page (D3)");
});

test("the registered menu contributor's apply() is a real write path, not a throwing stub", async () => {
  installFirstPartyPublishContentTypes();
  const contributor = listPublishContentContributors().find((c) => c.entityType === "menu");
  assert.ok(contributor, "menu must be registered");

  const workspaceId = "11111111-1111-1111-1111-111111111111";
  const menuRepo = new InMemoryMenuRepo({});
  const navLocationBindingRepo = new InMemoryNavLocationBindingRepo({});
  const outbox = new InMemoryOutbox();
  const deps: PublishContentDeps = {
    workspaceId,
    clock: createFakeClock({ startIso: "2026-09-24T12:00:00.000Z" }),
    idGen: { newId: () => "generated-menu-event-1" },
    outbox,
    ports: { menu: { repo: menuRepo, bindingRepo: navLocationBindingRepo } },
  };

  const record = {
    slug: "header-nav",
    title: "Header Nav",
    status: "published",
    doc: { type: "menu", version: 1, items: [] },
    locations: [],
  };

  const { changeSetId } = await contributor.build(deps).apply({
    entity: {
      entityType: "menu",
      id: "menu-header-nav",
      schemaVersion: 1,
      contentHash: contentHash("menu", record),
      hashVersion: CONTENT_HASH_VERSION,
      requiredBlobs: [],
      state: record as unknown as Record<string, unknown>,
    },
    expectedVersion: undefined,
    principalId: "operator-principal-1",
    idempotencyKey: "idem-menu-1",
  });

  assert.equal(changeSetId, "menu-header-nav", "the registered contributor must write the row under the SOURCE id");
  const landed = await menuRepo.findById({ workspaceId, id: "menu-header-nav" });
  assert.equal((landed as NavMenuEntry | null)?.slug, "header-nav");
});

test("the registered theme-files contributor's apply() is a real write path, not a throwing stub", async () => {
  installFirstPartyPublishContentTypes();
  const contributor = listPublishContentContributors().find((c) => c.entityType === "theme-files");
  assert.ok(contributor, "theme-files must be registered");

  const root = await realpath(await mkdtemp(path.join(tmpdir(), "manifest-theme-files-")));
  try {
    const sourceThemes = path.join(root, "source");
    const destThemes = path.join(root, "dest");
    await mkdir(path.join(sourceThemes, "static/basic"), { recursive: true });
    await mkdir(destThemes, { recursive: true });
    await writeFile(path.join(sourceThemes, "static/basic/theme.json"), '{"id":"basic"}');

    const workspaceId = "11111111-1111-1111-1111-111111111111";
    const blobStore = new InMemoryBlobStore();
    const { entities } = await packThemeFilesEntities({ themesDir: sourceThemes });
    const [entity] = entities;
    assert.ok(entity);
    const bytes = await readFile(path.join(sourceThemes, "static/basic/theme.json"));
    await blobStore.putIfAbsent({ workspaceId, sha256: entity.requiredBlobs[0], bytes });

    const outbox = new InMemoryOutbox();
    let n = 0;
    const deps: PublishContentDeps = {
      workspaceId,
      clock: createFakeClock({ startIso: "2026-09-24T12:00:00.000Z" }),
      idGen: { newId: () => `generated-id-${++n}` },
      outbox,
      changeSets: new InMemoryChangeSetRepo([], [], outbox),
      authorize: async () => ({ allowed: true, reason: "test-always-allow" }),
      ports: {
        media: { repo: undefined as never, assetBlobRepo: undefined as never, blobStore, contentTypeStore: undefined as never },
        "theme-files": { themesDir: destThemes },
      },
    };

    const { changeSetId } = await contributor.build(deps).apply({
      entity,
      expectedVersion: undefined,
      principalId: "operator-principal-1",
      idempotencyKey: "manifest-theme-files",
    });

    assert.ok(changeSetId);
    assert.equal(await readFile(path.join(destThemes, "static/basic/theme.json"), "utf8"), '{"id":"basic"}');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("every registered publish-content type is listed in the committed live grant (deploy/publish-trust.json)", async () => {
  installFirstPartyPublishContentTypes();
  const registeredTypes = listPublishContentContributors().map((c) => c.entityType);

  const grantPath = path.resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../../../../../../deploy/publish-trust.json"
  );
  const grants = JSON.parse(await readFile(grantPath, "utf8")) as ReadonlyArray<{
    readonly entityTypes: readonly string[];
  }>;
  // Union across every grant, not just the first: any grant accepting a type is enough for that
  // type to be usable from at least one source, and this test only cares whether the type is
  // reachable at all, not by which grant.
  const grantedTypes = new Set(grants.flatMap((grant) => grant.entityTypes));

  const missing = registeredTypes.filter((entityType) => !grantedTypes.has(entityType));
  assert.deepEqual(
    missing,
    [],
    `type(s) registered with installFirstPartyPublishContentTypes() but missing from every grant's ` +
      `'entityTypes' in deploy/publish-trust.json: ${missing.join(", ")}. The live site will refuse ` +
      `these as "not supported" until the grant is updated and redeployed.`
  );
});
