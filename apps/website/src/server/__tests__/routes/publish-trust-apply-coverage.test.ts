import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

import { InMemoryChangeSetRepo } from "#src/contracts/core/commands/index";
import { computeBlobStorageKey } from "#src/features/media/index";
import { rescanThemes } from "#src/features/theme/index";
import { createRedirect } from "#src/features/redirects/redirects";
import { bindWidgetArea, mutateWidgetAreaPlacements } from "#src/features/widgets/region-area-service";
import { createWidgetInstance } from "#src/features/widgets/write-service";
import { resolveDefinitionRaw, set, type SettingDefinitionRecord } from "#src/features/settings/index";
import { applyReport, packAll, plan } from "#src/features/publish-content/__tests__/round-trip-harness";
import {
  listPublishContentContributors,
  registeredPublishTypePermissions,
  resetPublishContentContributorsForTests,
  type PackedEntity,
  type PublishContentDeps,
} from "#src/features/publish-content/type-registry";
import { createCompositePeerBlobSource } from "#src/features/publish-content/composite-blob-source";
import type { BackstopSelection } from "#src/features/publish-content/backstop-ports";
import { entityKey } from "#src/features/publish-content/planner";
import { contentKernel } from "#src/platform/db/content-kernel";
import { installFirstPartyPublishContentTypes } from "#src/server/runtime/composition/publish-content-manifest";
import { buildPublishBackstopPorts } from "#src/server/runtime/composition/publish-backstop-ports";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { toPublishContentDeps } from "#src/server/inbound/admin-http/routes/publish-content/deps";
import { withPublishTrustContentAuthorize } from "#src/server/inbound/admin-http/publish-trust-auth";

/**
 * @file Every registered publish type, applied through a publishing grant.
 *
 * A publishing grant answers a type's writes from `registeredPublishTypePermissions` (the type's
 * `permission` plus `alsoAuthorizes`), keyed by the registry's `publishType` stamp. A type whose
 * writes ask for any other permission is refused on live and nowhere else, because every other test
 * authorizes with RBAC or allow-all. So this file creates one entity of EVERY registered type on a
 * source, applies them all to a destination whose `authorize` is the real publish-trust attenuation
 * (RBAC behind it denies everything, as it does for `pub:<installation>`), and fails on any denial.
 *
 * A new publish type fails here until it has a fixture in {@link FIXTURES}.
 */

type Site = ReturnType<typeof createRouteDeps> & {
  rawDb: Database.Database;
  rawFilesDir: string;
  backstopSelection: BackstopSelection;
};

const at = "2026-09-26T00:00:00.000Z";
const THEMES = join(import.meta.dirname, "../../../../../../content/themes");

/** A themes dir holding only the small `storefront` theme; `extra` adds a copy under another id. */
async function themesDir(extra?: string): Promise<string> {
  // `realpath`: macOS's tmpdir is behind a symlink, which `theme-files` refuses to write through.
  const dir = await realpath(await mkdtemp(join(tmpdir(), "publish-trust-coverage-")));
  await cp(join(THEMES, "templated/storefront"), join(dir, "templated/storefront"), { recursive: true });
  if (extra) {
    const copy = join(dir, "templated", extra);
    await cp(join(THEMES, "templated/storefront"), copy, { recursive: true });
    const manifest = JSON.parse(await readFile(join(copy, "theme.json"), "utf8")) as Record<string, unknown>;
    await writeFile(join(copy, "theme.json"), JSON.stringify({ ...manifest, id: extra }, null, 2));
  }
  return dir;
}

async function site(t: test.TestContext, extraTheme?: string): Promise<Site> {
  process.env.TOVU_STOCK_THEMES_DIR = await themesDir(extraTheme);
  try {
    const deps = createRouteDeps();
    // The END of the boot settings chain, not `settingsReady`: each link opens its own transaction on the
    // non-reentrant in-memory `settingsRepo`, so the `site-setting` fixture's write would overlap one.
    await deps.siteTitleReady;
    // Raw types need real storage, which the ordinary in-memory route fixture does not provide.
    const rawFilesDir = await realpath(await mkdtemp(join(tmpdir(), "publish-trust-raw-")));
    t.after(() => rm(rawFilesDir, { recursive: true, force: true }));
    const rawDb = new Database(":memory:");
    t.after(() => rawDb.close());
    rawDb.exec("CREATE TABLE p_coverage (id TEXT PRIMARY KEY, title TEXT, count INTEGER)");
    return { ...deps, rawDb, rawFilesDir, backstopSelection: {} };
  } finally {
    delete process.env.TOVU_STOCK_THEMES_DIR;
  }
}

const allow = async () => ({ allowed: true, reason: "test" });

/** One entity of each registered type on `s`, the source. Keyed by publish type. */
const FIXTURES: Record<string, (s: Site) => Promise<void>> = {
  post: async (s) => {
    const [seed] = await s.postRepo.list({ workspaceId: s.workspaceId });
    await s.postRepo.save({ ...seed!, id: "cov-post", slug: "cov-post", kind: "post", createdAt: at, updatedAt: at });
    // A tagged post also syncs its term assignments on apply.
    await s.entryTermRepo.upsert({ contentType: "post", contentId: "cov-post", termId: "cov-term", addedAt: at });
  },
  page: async (s) => {
    const [seed] = await s.postRepo.list({ workspaceId: s.workspaceId });
    await s.postRepo.save({ ...seed!, id: "cov-page", slug: "cov-page", kind: "page", createdAt: at, updatedAt: at });
  },
  media: async (s) => {
    const bytes = new TextEncoder().encode("coverage");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    await s.blobStore.putIfAbsent({ workspaceId: s.workspaceId, sha256, bytes });
    await s.mediaRepo.save({
      id: "cov-media", workspaceId: s.workspaceId, title: "Photo", slug: "cov-media", alt: "", caption: "", credit: "",
      source: { sha256 }, status: "active", createdAt: at, updatedAt: at, version: 1, width: 1, height: 1, cssClass: null, htmlAttributes: null,
    } as never);
  },
  redirect: async (s) => {
    await createRedirect({
      deps: s.redirectsWriteDeps,
      input: { workspaceId: s.workspaceId, matchType: "exact", fromPattern: "/cov-old", toTarget: "/cov-new", statusCode: 301, actorId: "owner" },
    });
  },
  menu: async (s) => {
    await s.menuRepo.save({
      id: "cov-menu", workspaceId: s.workspaceId, slug: "cov-menu", title: "Coverage", status: "published",
      doc: { type: "menu", version: 1, items: [] }, locations: [], updatedAt: at, version: 1,
    } as never);
  },
  "theme-files": async () => {
    // `site("cov-theme")` already put a theme folder only the source has.
  },
  form: async (s) => {
    await s.formDefinitionRepo.create({
      id: "cov-form", workspaceId: s.workspaceId, name: "Contact", slug: "cov-form",
      fields: [{ id: "email", label: "Email", type: "email", required: true }],
      notify: { enabled: false, recipients: [] }, status: "active", createdAt: at, updatedAt: at, version: 1,
    });
  },
  "content-type": async (s) => {
    await s.contentTypeRepo.save({
      workspaceId: s.workspaceId, key: "cov_recipe", label: "Recipes",
      fields: [{ name: "servings", kind: "integer", required: false, queryable: false }], status: "active", version: 1, tombstonedAt: null,
    });
  },
  taxonomy: async (s) => {
    await s.taxonomyRepo.insert({ id: "cov-tags", name: "Coverage tags", hierarchical: false, status: "active", updatedAt: at, version: 1 });
  },
  term: async (s) => {
    await s.termRepo.insert({ id: "cov-term", taxonomyId: "cov-tags", parentId: null, name: "Covered", status: "active", updatedAt: at, version: 1 });
  },
  "collection-entry": async (s) => {
    await s.entryRepo.save({
      id: "cov-entry", workspaceId: s.workspaceId, type: "cov_recipe", slug: "cov-soup", status: "published", title: "Soup",
      bodyJson: { type: "doc", content: [] }, fieldsJson: { ext: { site: { servings: 2 } } }, publishedAt: at, createdAt: at, updatedAt: at, version: 1,
    } as never);
    await s.entryTermRepo.upsert({ contentType: "cov_recipe", contentId: "cov-entry", termId: "cov-term", addedAt: at });
  },
  widget: async (s) => {
    await createWidgetInstance({
      deps: widgetService(s),
      input: { workspaceId: s.workspaceId, actor: { principalId: "owner" }, widgetType: "text", title: "About", config: { body: "Hi" }, slug: "cov-widget" },
    });
  },
  "widget-area": async (s) => {
    const widget = await s.entryRepo.findBySlug?.({ workspaceId: s.workspaceId, type: "widget", slug: "cov-widget" } as never);
    const { areaEntry } = await bindWidgetArea({ deps: widgetService(s), input: { workspaceId: s.workspaceId, regionKey: "sidebar" } });
    await mutateWidgetAreaPlacements({
      deps: widgetService(s),
      input: {
        workspaceId: s.workspaceId, actor: { principalId: "owner" }, areaEntryId: areaEntry.id, baseVersion: areaEntry.version,
        placements: widget ? [{ placementId: "p-1", widgetEntryId: (widget as { id: string }).id, enabled: true }] : [],
      },
    });
  },
  "site-setting": async (s) => {
    const settingId = "core.site.title";
    if (!(await s.settingsRepo.findDefinition?.({ settingId } as never))) await s.settingsRepo.saveDefinition(titleDefinition());
    await set({
      deps: { repo: s.settingsRepo, clock: s.clock, ids: s.idGen, authorize: allow, principals: {} as never },
      input: { namespace: "core.site", key: "title", scope: "workspace", value: "Coverage", workspaceId: s.workspaceId, callerPrincipalId: "owner", authWorkspaceId: s.workspaceId },
    } as never);
  },
  "active-theme": async (s) => {
    const current = await s.presentationRepo.findByWorkspaceId({ workspaceId: s.workspaceId });
    await s.presentationRepo.save({ ...current!, activeThemeId: "cov-theme", updatedAt: at });
  },
  "raw-row": async (s) => {
    s.rawDb.prepare("INSERT INTO p_coverage (id, title, count) VALUES (?, ?, ?)").run("cov-row", "Raw coverage", 7);
    // Raw types only pack explicit selections, never an ordinary whole-site export.
    s.backstopSelection = { ...s.backstopSelection, rows: [{ table: "p_coverage", pk: { id: "cov-row" } }] };
  },
  "raw-file": async (s) => {
    await mkdir(join(s.rawFilesDir, "snippets"));
    const path = join(s.rawFilesDir, "snippets/coverage.html");
    await writeFile(path, "<footer>Raw coverage</footer>\n");
    await chmod(path, 0o755);
    s.backstopSelection = { ...s.backstopSelection, files: ["snippets/coverage.html"] };
  },
};

/** Use the production backstop adapters and coverage policy, plus the source's explicit selection. */
function publishDeps(s: Site): PublishContentDeps {
  return {
    ...toPublishContentDeps(s),
    backstop: {
      ...buildPublishBackstopPorts({
        contentKernel: contentKernel(s.rawDb), siteBinding: { dir: s.rawFilesDir },
        blobStore: s.blobStore, fileBlobIndex: s.fileBlobIndex,
      }),
      selection: s.backstopSelection,
    },
  };
}

function widgetService(s: Site) {
  return {
    entryRepo: s.entryRepo, contentTypeRepo: s.contentTypeRepo, entryRefsRepo: s.entryRefsRepo, bindingRepo: s.widgetBindingRepo,
    clock: s.clock, ids: s.idGen, authorize: allow, outbox: s.outbox,
  } as never;
}

function titleDefinition(): SettingDefinitionRecord {
  return {
    settingId: "core.site.title", version: 1, workspaceId: null, namespace: "core.site", key: "title", ownerKind: "core", ownerId: null,
    schema: { type: "string", nullable: true }, defaultValue: null, scopes: 2, secret: false, status: "active",
    aliasOfNamespace: null, aliasOfKey: null, coercionTag: null, createdAt: at, updatedAt: at,
  };
}

/** Types whose create writes through its own revision chokepoint and asks `authorize` nothing
 *  (`createRedirect`/`updateRedirect`, `importMenuEntity`); the import route's `publish_content.apply` check is
 *  their only gate. Menu's `repointReferences` does ask, under its declared `admin.menus.update`. */
const WRITES_WITHOUT_AUTHORIZE = ["redirect", "menu"];

interface Call {
  readonly publishType: string | undefined;
  readonly permission: string;
  readonly allowed: boolean;
  readonly reason: string;
}

/** `s`'s apply bag, authorizing as a publishing credential whose grant names `grantTypes`. */
function asPublisher(s: Site, grantTypes: readonly string[], calls: Call[]): PublishContentDeps {
  const base = publishDeps(s);
  const res = {
    locals: {
      // Like the deploy grant, raw types also require the explicit backstop capability.
      publishTrust: { sourceInstallationId: "source", capabilities: ["publish_content.read", "publish_content.apply", "publish_content.backstop"], entityTypes: grantTypes, generation: 1 },
    },
  };
  // RBAC knows no `pub:` principal, so anything the attenuation does not answer is refused.
  const rbac = { authorize: async () => ({ allowed: false, reason: "principal_disabled" }) };
  const trusted = withPublishTrustContentAuthorize(res as never, rbac, registeredPublishTypePermissions(base)).authorize!;
  const authorize = (async (params: { permission: string; publishType?: string }) => {
    const out = await trusted(params as never);
    calls.push({ publishType: params.publishType, permission: params.permission, ...out });
    return out;
  }) as PublishContentDeps["authorize"];
  // `forgetRemoved` is apply-only (the route bag never carries it); nothing here is trashed.
  const ports = {
    ...base.ports,
    post: { ...base.ports.post!, forgetRemoved: async () => {} },
    "theme-files": {
      ...base.ports["theme-files"]!,
      // Like the production apply bag, refresh the shared array before active-theme applies.
      onReplaced: () => { rescanThemes({ themes: s.themes, dir: s.themesDir }); },
    },
  };
  return { ...base, ports, changeSets: new InMemoryChangeSetRepo([], [], s.outbox as never), authorize };
}

/** What the bundle upload does before a plan: the destination receives every blob an entity needs. */
async function stageBlobs(entities: readonly PackedEntity[], from: Site, to: Site): Promise<void> {
  // The same source the peer push reads: the blob store, then files a `theme-files` pack indexed.
  const blobs = createCompositePeerBlobSource({ blobStore: from.blobStore, fileBlobIndex: from.fileBlobIndex });
  for (const sha256 of new Set(entities.flatMap((e) => e.requiredBlobs))) {
    const storageKey = computeBlobStorageKey({ workspaceId: from.workspaceId, sha256 });
    await to.blobStore.putIfAbsent({ workspaceId: to.workspaceId, sha256, bytes: await blobs.get({ sha256, storageKey }) });
  }
}

async function sourceWithEveryType(t: test.TestContext): Promise<Site> {
  const source = await site(t, "cov-theme");
  // Order matters only where one fixture reads another's row (term -> taxonomy, entry -> type).
  for (const type of new Set(["taxonomy", "term", "content-type", ...Object.keys(FIXTURES)])) await FIXTURES[type]!(source);
  return source;
}

test("every registered publish type has an apply-path fixture here, and the deploy grant names only registered types", async () => {
  resetPublishContentContributorsForTests();
  installFirstPartyPublishContentTypes();
  const registered = listPublishContentContributors().map((c) => c.entityType).sort();
  assert.deepEqual(Object.keys(FIXTURES).sort(), registered, "add a FIXTURES entry for each new publish type");

  const grants = JSON.parse(await readFile(join(THEMES, "../../deploy/publish-trust.json"), "utf8")) as { entityTypes: string[] }[];
  for (const grant of grants) assert.deepEqual([...grant.entityTypes].sort(), registered);
});

test("a publishing grant naming every type applies one entity of each, with no permission refused", async (t) => {
  resetPublishContentContributorsForTests();
  installFirstPartyPublishContentTypes();
  const registered = listPublishContentContributors().map((c) => c.entityType);
  const source = await sourceWithEveryType(t);
  const destination = await site(t);
  const sourceDeps = { ...publishDeps(source), authorize: allow };
  const calls: Call[] = [];
  const destinationDeps = asPublisher(destination, registered, calls);

  const entities = await packAll(sourceDeps);
  await stageBlobs(entities, source, destination);
  // No sync baseline on a fresh pair, so a row both sides hold (the active theme) is a conflict until forced.
  const report = await plan(entities, destinationDeps, entities.map((e) => entityKey(e.entityType, e.id)));
  const writing = new Set(report.rows.filter((r) => r.writes).map((r) => r.entityType));
  assert.deepEqual(
    registered.filter((type) => !writing.has(type)),
    [],
    `every type must reach apply: ${JSON.stringify(report.rows.filter((r) => !r.writes).map((r) => [r.entityType, r.entityId, r.outcome, r.reason]))}`
  );

  // F4.5: neither raw write is already present on the destination.
  assert.equal(destination.rawDb.prepare("SELECT * FROM p_coverage WHERE id = ?").get("cov-row"), undefined);
  await assert.rejects(readFile(join(destination.rawFilesDir, "snippets/coverage.html")), { code: "ENOENT" });

  await applyReport(report, entities, destinationDeps);

  // F6.3: successful authorization must also leave the fixture's content in the destination.
  const ws = destination.workspaceId;
  for (const [id, kind] of [["cov-post", "post"], ["cov-page", "page"]] as const) {
    const landed = await destination.postRepo.findById({ workspaceId: ws, id });
    const original = await source.postRepo.findById({ workspaceId: source.workspaceId, id });
    assert.ok(landed);
    assert.equal(landed.kind, kind);
    assert.equal(landed.slug, id);
    assert.equal(landed.title, original!.title);
    assert.deepEqual(landed.bodyJson, original!.bodyJson);
  }
  assert.equal((await destination.mediaRepo.findById({ workspaceId: ws, id: "cov-media" }))?.title, "Photo");
  // Redirect row ids are local to each installation; publishing identifies rules by natural key.
  const redirects = (await destination.redirectRepo.list({ workspaceId: ws, matchType: "exact" }))
    .filter((redirect) => redirect.fromPattern === "/cov-old");
  assert.equal(redirects.length, 1);
  const redirect = redirects[0]!;
  assert.deepEqual({
    matchType: redirect.matchType, fromPattern: redirect.fromPattern, toTarget: redirect.toTarget,
    statusCode: redirect.statusCode, status: redirect.status, override: redirect.override, priority: redirect.priority,
  }, {
    matchType: "exact", fromPattern: "/cov-old", toTarget: "/cov-new",
    statusCode: 301, status: "active", override: false, priority: 0,
  });
  assert.equal((await destination.menuRepo.findById({ workspaceId: ws, id: "cov-menu" }))?.title, "Coverage");
  // Forms also mint a destination-local id and travel by slug.
  const form = await destination.formDefinitionRepo.findBySlug({ workspaceId: ws, slug: "cov-form" });
  assert.ok(form);
  assert.equal(form.name, "Contact");
  assert.deepEqual(form.fields, [{ id: "email", label: "Email", type: "email", required: true }]);
  assert.deepEqual((await destination.contentTypeRepo.findByKey({ workspaceId: ws, key: "cov_recipe" }))?.fields, [{ name: "servings", kind: "integer", required: false, queryable: false }]);
  const taxonomy = await destination.taxonomyRepo.findByIdFull({ id: "cov-tags" });
  assert.ok(taxonomy);
  assert.equal(taxonomy.name, "Coverage tags");
  assert.equal(taxonomy.hierarchical, false);
  const term = await destination.termRepo.findByIdFull({ id: "cov-term" });
  assert.ok(term);
  assert.equal(term.name, "Covered");
  assert.equal(term.taxonomyId, "cov-tags");
  const entry = await destination.entryRepo.findById({ workspaceId: ws, id: "cov-entry" });
  assert.ok(entry);
  assert.equal(entry.title, "Soup");
  assert.deepEqual(entry.fieldsJson, { ext: { site: { servings: 2 } } });
  const widget = await destination.entryRepo.findBySlug({ workspaceId: ws, type: "widget", slug: "cov-widget" });
  assert.ok(widget);
  assert.deepEqual(JSON.parse((widget.fieldsJson as { ext: { widget: { payload: string } } }).ext.widget.payload).config, { body: "Hi" });
  const binding = await destination.widgetBindingRepo.findByRegion({ workspaceId: ws, regionKey: "sidebar" });
  assert.ok(binding);
  const area = await destination.entryRepo.findById({ workspaceId: ws, id: binding.areaEntryId });
  assert.ok(area);
  assert.deepEqual(JSON.parse((area.fieldsJson as { ext: { widgets: { payload: string } } }).ext.widgets.payload), {
    regionKey: "sidebar", doc: { schemaVersion: 1, placements: [{ placementId: "p-1", widgetEntryId: widget.id, enabled: true }] },
  });
  // Setting ids are local to each installation (the destination's boot seed mints its own), and
  // publishing identifies a setting by namespace:key, so read through the destination's definition.
  const titleDef = await resolveDefinitionRaw({ repo: destination.settingsRepo }, { namespace: "core.site", key: "title", workspaceId: ws });
  assert.ok(titleDef);
  assert.equal((await destination.settingsRepo.getWorkspaceValue({ workspaceId: ws, settingId: titleDef.settingId }))?.valueJson, "Coverage");
  assert.equal((await destination.presentationRepo.findByWorkspaceId({ workspaceId: ws }))?.activeThemeId, "cov-theme");
  const landedTheme = destination.themes.find((theme) => theme.manifest.id === "cov-theme");
  const originalTheme = source.themes.find((theme) => theme.manifest.id === "cov-theme");
  assert.ok(landedTheme);
  assert.ok(originalTheme);
  assert.equal(await readFile(join(landedTheme.dir, "theme.json"), "utf8"), await readFile(join(originalTheme.dir, "theme.json"), "utf8"));
  assert.deepEqual(destination.rawDb.prepare("SELECT * FROM p_coverage WHERE id = ?").get("cov-row"), {
    id: "cov-row", title: "Raw coverage", count: 7,
  });
  const landedRawFile = join(destination.rawFilesDir, "snippets/coverage.html");
  assert.deepEqual(await readFile(landedRawFile), Buffer.from("<footer>Raw coverage</footer>\n"));
  assert.equal((await stat(landedRawFile)).mode & 0o777, 0o755);

  assert.deepEqual(calls.filter((c) => !c.allowed), []);
  assert.ok(calls.every((c) => c.publishType !== undefined), "every apply-path authorize call carries its publish type");
  // Proves each fixture reached its type's authorized write, not just its plan row.
  const asked = new Set(calls.map((c) => c.publishType));
  assert.deepEqual(registered.filter((type) => !asked.has(type) && !WRITES_WITHOUT_AUTHORIZE.includes(type)), []);
});

test("a grant that does not name `form` refuses the form's write, naming the type", async (t) => {
  resetPublishContentContributorsForTests();
  installFirstPartyPublishContentTypes();
  const source = await site(t);
  await FIXTURES.form!(source);
  const destination = await site(t);
  const calls: Call[] = [];
  const destinationDeps = asPublisher(destination, ["post"], calls);
  const entities = (await packAll({ ...publishDeps(source), authorize: allow })).filter((e) => e.entityType === "form");
  const report = await plan(entities, destinationDeps);

  await assert.rejects(applyReport(report, entities, destinationDeps), /this publishing grant does not cover 'form'/);
  assert.deepEqual(calls.map((c) => [c.publishType, c.permission, c.allowed]), [["form", "admin.forms.manage", false]]);
});
