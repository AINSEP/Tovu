import { cp, mkdir, readFile, writeFile, access, rm } from "node:fs/promises";
import path from "node:path";
import type { APIRequestContext } from "@playwright/test";
import { test as base, expect } from "./bug-pin-fixtures.js";
import type { IsolatedJourneySite } from "./isolated-journey-site.js";
import { WS_API, uniqSlug } from "../journeys/_fixtures.js";
import { journeyJson, putExecutionSetting, type AssistantJourneyApi } from "./assistant-journey-state.js";
import type { FakeModelServer } from "../harness/fake-model-server.js";
import { solidPng } from "./site-import-fixture-server.js";

export { expect, WS_API };
export function requestApi({ request }: { request: APIRequestContext }, _options = {}): AssistantJourneyApi {
  return async ({ url, method = "GET", data }) => {
    const response = await request.fetch(url, { method, ...(data === undefined ? {} : { data }) });
    return { status: response.status(), body: await response.text() };
  };
}

type Row = { id: string; slug?: string; locations?: string[] };
type Resource = "page" | "post" | "menu" | "redirect" | "term" | "taxonomy" | "media" | "theme" | "chat";
async function inventory(api: AssistantJourneyApi): Promise<Record<Resource, Row[]>> {
  const get = <T>(url: string) => journeyJson<T>({ api, url });
  const pages = await get<{ posts: { post: Row }[] }>(`${WS_API}/pages`);
  const posts = await get<{ posts: { post: Row }[] }>(`${WS_API}/posts`);
  const menus = await get<{ menus: Row[] }>(`${WS_API}/menus`);
  const redirects = await get<{ data: Row[] }>(`${WS_API}/redirects`);
  const taxonomy = await get<{ items: { taxonomy: Row; terms: Row[] }[] }>("/api/admin/v1/taxonomy");
  const media = await get<{ media: Row[] }>(`${WS_API}/media`);
  const themes = await get<{ availableThemeIds: string[] }>(`${WS_API}/presentation`);
  const chats = await get<{ conversations: Row[] }>("/api/assistant/chats");
  return { page: pages.posts.map(({ post }) => post), post: posts.posts.map(({ post }) => post), menu: menus.menus,
    redirect: redirects.data, taxonomy: taxonomy.items.map((item) => item.taxonomy), term: taxonomy.items.flatMap((item) => item.terms),
    media: media.media, theme: themes.availableThemeIds.map((id) => ({ id })), chat: chats.conversations };
}

/** Delete through the owning admin lifecycle, including hidden Trash rows and theme originals.
 * The pin fixture separately stops its daemon tree and proves the entire site directory is gone. */
export const test = base.extend<{ releaseCleanup: void }>({
  pinAdminPassword: "tovu-dev",
  pinThemeCaptures: async ({}, use, testInfo) => { await use(testInfo.tags.includes("@theme-captures")); },
  releaseCleanup: [async ({ page, request, journeySite }, use) => {
    const api = requestApi({ request });
    const before = await inventory(api);
    const presentation = await journeyJson<{ settings: { activeThemeId: string } }>({ api, url: `${WS_API}/presentation` });
    const oldTrash = await journeyJson<{ items: Row[] }>({ api, url: `${WS_API}/trash?limit=1000` });
    const priorTrash = new Set(oldTrash.items.map((row) => row.id));
    try { await use(); }
    finally {
      // Unmount before deletion: a late debounced chat save must not recreate a deleted chat.
      if (!page.isClosed()) await page.goto("/api/assistant/chats");
      const chats = await journeyJson<{ conversations: Row[] }>({ api, url: "/api/assistant/chats" });
      // Delete chats first so their real run lifecycle cancels writers before we inventory content.
      for (const row of chats.conversations.filter((chat) => !before.chat.some((prior) => prior.id === chat.id))) {
        await journeyJson({ api, url: `/api/assistant/chats/${row.id}`, method: "DELETE", status: 204 });
      }
      const after = await inventory(api);
      const created = (type: Resource) => after[type].filter((row) => !before[type].some((prior) => prior.id === row.id));
      await journeyJson({ api, url: `${WS_API}/presentation`, method: "PATCH", data: { activeThemeId: presentation.settings.activeThemeId } });
      // Move menus back before deleting imported menus; never leave a slot pointing at Trash.
      for (const menu of before.menu) for (const locationKey of menu.locations ?? []) {
        await journeyJson({ api, url: `${WS_API}/menus/${menu.id}/locations`, method: "POST", data: { locationKey } });
      }
      // Posts, pages and redirects are bespoke Trash kinds: the generic /trash/items rejects them
      // (TRASH_UNKNOWN_TYPE), so each goes through its own soft-delete route, which records the Trash row.
      for (const row of created("page")) await journeyJson({ api, url: `${WS_API}/pages/${row.id}`, method: "DELETE" });
      for (const row of created("post")) await journeyJson({ api, url: `${WS_API}/posts/${row.id}`, method: "DELETE" });
      for (const row of created("redirect")) await journeyJson({ api, url: `${WS_API}/redirects/${row.id}`, method: "DELETE" });
      for (const type of ["menu", "term", "taxonomy", "theme"] as const) {
        for (const row of created(type)) await journeyJson({ api, url: `${WS_API}/trash/items`, method: "POST", data: { type, id: row.id } });
      }
      // The import moves the seeded homepage to preserve it. Once the imported root is hidden,
      // return that page to its original address through the version-checked admin lifecycle.
      for (const row of before.page) {
        if (after.page.find((current) => current.id === row.id)?.slug === row.slug) continue;
        const { post } = await journeyJson<{ post: { title: string; bodyJson: unknown; status: string; version: number } }>({ api, url: `${WS_API}/pages/${row.id}` });
        await journeyJson({ api, url: `${WS_API}/pages/${row.id}`, method: "PUT", data: {
          title: post.title, slug: row.slug, bodyJson: post.bodyJson, status: post.status, expectedVersion: post.version,
        } });
      }
      // Restoring a published slug can itself create a redirect. Include those rows in this purge.
      // Only active rows: the list also returns redirects already tombstoned (status "disabled") above.
      const redirects = await journeyJson<{ data: Row[] }>({ api, url: `${WS_API}/redirects?status=active` });
      for (const row of redirects.data.filter((current) => !before.redirect.some((prior) => prior.id === current.id))) {
        await journeyJson({ api, url: `${WS_API}/redirects/${row.id}`, method: "DELETE" });
      }
      const trash = await journeyJson<{ items: Row[] }>({ api, url: `${WS_API}/trash?limit=1000` });
      const ids = trash.items.filter((row) => !priorTrash.has(row.id)).map((row) => row.id);
      if (ids.length) {
        const purged = await journeyJson<{ results: { id: string; outcome: string }[] }>({ api, url: `${WS_API}/trash/purge`, method: "POST", data: { ids } });
        // A parent's purge removes its children first (a taxonomy's terms), so their own rows report
        // "already-gone". Any other outcome left something behind; the inventory checks below confirm.
        expect(purged.results.map((row) => row.id).sort(), "every created Trash row got a purge outcome").toEqual([...ids].sort());
        expect(purged.results.filter((row) => row.outcome !== "purged" && row.outcome !== "already-gone"), "all created entities were permanently purged").toEqual([]);
      }
      for (const row of created("media")) {
        // Media's hard purge (DELETE) 409s until the asset is in the Trash; it then drops that Trash row too.
        await journeyJson({ api, url: `${WS_API}/media/${row.id}/trash`, method: "POST" });
        const deleted = await journeyJson<{ purged: boolean }>({ api, url: `${WS_API}/media/${row.id}`, method: "DELETE" });
        expect(deleted.purged).toBe(true);
      }
      const cleaned = await inventory(api);
      for (const type of Object.keys(before) as Resource[]) {
        expect(cleaned[type].map((row) => row.id).sort(), `${type}: no created rows remain and pre-existing rows survive`).toEqual(before[type].map((row) => row.id).sort());
      }
      for (const row of before.page) expect(cleaned.page.find((current) => current.id === row.id)?.slug, "pre-existing page address is restored").toBe(row.slug);
      const cleanTrash = await journeyJson<{ items: Row[] }>({ api, url: `${WS_API}/trash?limit=1000` });
      expect(cleanTrash.items.filter((row) => !priorTrash.has(row.id)), "no created entities remain in Trash").toEqual([]);
      for (const row of created("theme")) {
        expect((await api({ url: `${WS_API}/themes/${row.id}` })).status).toBe(404);
        await expectMissing({ file: path.join(journeySite.siteDir, "themes", row.id) });
        await expectMissing({ file: path.join(journeySite.siteDir, "themes", "static", row.id) });
        await expectMissing({ file: path.join(journeySite.siteDir, "themes", "__original-themes__", "static", row.id) });
        for (const extension of ["jpg", "json"]) {
          const capture = path.join(journeySite.runtimeDir, "sites", ".tovu", "theme-previews", "journey-site", `${row.id}.${extension}`);
          await rm(capture, { force: true });
          await expectMissing({ file: capture });
        }
      }
    }
  }, { auto: true, timeout: 120_000 }],
});

async function expectMissing({ file }: { file: string }, _options = {}) {
  await expect(access(file).then(() => true, (error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return false;
  }), `deleted ${file}`).resolves.toBe(false);
}

/** Uses the existing ledger and encrypted credential route; the key is a public fixture marker. */
export async function configureScriptedByok({ api, fake }: { api: AssistantJourneyApi; fake: FakeModelServer }, _options = {}): Promise<() => Promise<void>> {
  const values = { "byok.protocol": "anthropic", "byok.providerId": "anthropic", "byok.baseUrl": fake.baseUrl, "byok.model": "claude-journey-fake", mode: "byok" };
  const prior = new Map<string, unknown>();
  for (const [key, valueJson] of Object.entries(values)) {
    const raw = await journeyJson<{ workspace: unknown }>({ api, url: `${WS_API}/settings/raw?namespace=core.execution&key=${encodeURIComponent(key)}` });
    prior.set(key, raw.workspace);
    await putExecutionSetting({ api, key, valueJson });
  }
  const url = `${WS_API}/assistant/execution-credential`;
  await journeyJson({ api, url, method: "PUT", data: { apiKey: "journey-fixture-not-a-secret", protocol: "anthropic", providerId: "anthropic", baseUrl: fake.baseUrl, model: "claude-journey-fake" } });
  return async () => {
    await journeyJson({ api, url, method: "DELETE" });
    expect((await journeyJson<{ data: { isSet: boolean } }>({ api, url })).data.isSet).toBe(false);
    for (const [key, valueJson] of prior) {
      if (valueJson === null) await journeyJson({ api, url: `${WS_API}/settings/value`, method: "DELETE", data: { namespace: "core.execution", key, scope: "workspace" } });
      else await putExecutionSetting({ api, key, valueJson });
    }
  };
}

/** A hand-authored installed theme has no stored original. It is real disk input to the loader,
 * not a fabricated theme-detail response; Save as original and Reset both use the real services. */
export async function installFixtureTheme(
  { api, site, color }: { api: AssistantJourneyApi; site: IsolatedJourneySite; color: string }, { screenshotColor = color }: { screenshotColor?: string } = {},
): Promise<{ id: string; dir: string }> {
  const id = uniqSlug("release-theme");
  // Use the installed static-tier root that public assets and the capture browser actually serve.
  const dir = path.join(site.siteDir, "themes", "static", id);
  await cp(path.resolve(import.meta.dirname, "../../../content/themes/static/tovu-starter"), dir, { recursive: true });
  const manifest = JSON.parse(await readFile(path.join(dir, "theme.json"), "utf8"));
  await writeFile(path.join(dir, "theme.json"), JSON.stringify({ ...manifest, id, name: id }));
  await writeFile(path.join(dir, "css/theme.css"), `body { background: ${color}; } h1 { font-family: Georgia, serif; }\n`);
  await mkdir(path.join(dir, "screenshots"), { recursive: true });
  await writeFile(path.join(dir, "screenshots/index.png"), solidPng({ hex: screenshotColor }));
  await journeyJson({ api, url: `${WS_API}/themes/rescan`, method: "POST" });
  const detail = await journeyJson<{ hasOriginal: boolean; status: string }>({ api, url: `${WS_API}/themes/${id}` });
  expect(detail.status).toBe("valid");
  expect(detail.hasOriginal).toBe(false);
  return { id, dir };
}
