import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, expect, request as playwrightRequest, type APIRequestContext, type FullConfig } from "@playwright/test";

import type { IsolatedJourneySite } from "../support/isolated-journey-site.js";
import journeysGlobalSetup from "./journeys.globalSetup.js";
import { API, TINY_PNG, WS_API, expectStatus } from "./_fixtures.js";

/**
 * Global setup for `playwright.mobile-visual.config.ts`: the journeys login, then ONE set of fixed
 * rows for both phone projects (seeding per project would leave the first project's deleted rows
 * in the second one's Trash screen). The returned teardown moves them to the Trash, purges them
 * and proves none is left; the cleanup reporter then deletes the whole isolated site.
 */
export const TYPE_KEY = "mobile_baseline";
export const ENTRY_SLUG = "mobile-baseline-entry";
const FORM_SLUG = "mobile-baseline-form";
const MENU_SLUG = "mobile-baseline-menu";
const USERNAME = "mobile-baseline-user";
const MEDIA_TITLE = "mobile-baseline-image";

export interface Seeded {
  formId: string;
  menuId: string;
  widgetId: string;
  principalId: string;
  mediaId: string;
  postId: string;
  pageSlug: string;
}

const seedFile = (site: IsolatedJourneySite) => path.join(site.runtimeDir, "mobile-visual-seed.json");

export function readSeeded(site: IsolatedJourneySite): Seeded {
  return JSON.parse(readFileSync(seedFile(site), "utf8")) as Seeded;
}

async function body<T>(response: { json(): Promise<unknown> }): Promise<T> {
  return (await response.json()) as T;
}

async function created<T>(response: Parameters<typeof expectStatus>[0] & { json(): Promise<unknown> }, what: string): Promise<T> {
  await expectStatus(response, 201, what);
  return body<T>(response);
}

/** Media goes through the UI upload: the only path that runs the core image transforms. */
async function uploadMedia(site: IsolatedJourneySite): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ storageState: site.storageState, baseURL: site.adminURL });
    await page.goto("/admin/media");
    await page.getByLabel("File to upload").setInputFiles({ name: `${MEDIA_TITLE}.png`, mimeType: "image/png", buffer: TINY_PNG });
    await page.getByRole("button", { name: "Upload", exact: true }).click();
    await expect(page.getByRole("button", { name: `Edit "${MEDIA_TITLE}"` })).toBeVisible({ timeout: 30_000 });
  } finally {
    await browser.close();
  }
}

async function seed(request: APIRequestContext, site: IsolatedJourneySite): Promise<Seeded> {
  const form = await created<{ data: { id: string } }>(await request.post(`${WS_API}/forms`, {
    data: {
      name: "Mobile baseline form",
      slug: FORM_SLUG,
      fields: [
        { id: "email", label: "Email", type: "email", required: true },
        { id: "message", label: "Message", type: "textarea", required: true, maxLength: 500 },
      ],
    },
  }), "form create");
  await created(await request.post(`${API}/content-types`, {
    data: {
      key: TYPE_KEY,
      label: "Mobile baseline recipes",
      fields: [
        { name: "summary", kind: "text", required: true, queryable: false },
        { name: "servings", kind: "integer", required: false, queryable: true },
      ],
    },
  }), "content type create");
  await created(await request.post(`${API}/entries`, {
    data: { type: TYPE_KEY, slug: ENTRY_SLUG, title: "Mobile baseline entry", fieldsJson: { ext: { site: { summary: "A fixed summary" } } } },
  }), "entry create");
  const menu = await created<{ menu: { id: string } }>(await request.post(`${WS_API}/menus`, {
    data: {
      title: "Mobile baseline menu",
      slug: MENU_SLUG,
      items: ["Home", "About"].map((label, i) => ({ id: `i${i}`, label, target: { kind: "url", href: `https://example.test/${i}` } })),
    },
  }), "menu create");
  const widget = await created<{ widget: { id: string } }>(await request.post(`${WS_API}/widgets`, {
    data: { widgetType: "text", title: "Mobile baseline widget", config: { body: "A fixed widget body" } },
  }), "widget create");
  const user = await created<{ user: { principalId: string } }>(
    await request.post(`${WS_API}/users`, { data: { username: USERNAME, password: "mobile-baseline-pass-1" } }), "user create");

  await uploadMedia(site);
  const media = await body<Record<string, unknown>>(await request.get(`${WS_API}/media`));
  const mediaRows = (Object.values(media).find(Array.isArray) ?? []) as Array<{ id: string; title?: string }>;
  const asset = mediaRows.find((m) => m.title === MEDIA_TITLE);
  if (!asset) throw new Error(`uploaded baseline media not listed: ${JSON.stringify(media).slice(0, 300)}`);

  const posts = await body<{ posts: Array<{ post: { id: string; slug: string } }> }>(await request.get(`${WS_API}/posts`));
  const welcome = posts.posts.find((p) => p.post.slug === "welcome");
  if (!welcome) throw new Error("first-boot seed post /welcome missing");
  const pages = await body<Record<string, unknown>>(await request.get(`${WS_API}/pages`));
  const pageRows = (Object.values(pages).find(Array.isArray) ?? []) as Array<{ post?: { slug: string }; slug?: string }>;
  const pageSlugs = pageRows.map((p) => p.post?.slug ?? p.slug ?? "");
  const pageSlug = pageSlugs.find((slug) => slug === "blog") ?? pageSlugs.find(Boolean);
  if (!pageSlug) throw new Error("first-boot seed has no page");

  return {
    formId: form.data.id,
    menuId: menu.menu.id,
    widgetId: widget.widget.id,
    principalId: user.user.principalId,
    mediaId: asset.id,
    postId: welcome.post.id,
    pageSlug,
  };
}

async function unseed(request: APIRequestContext, s: Seeded): Promise<void> {
  const trashed: Array<[string, string]> = [["form", s.formId], ["menu", s.menuId], ["widget", s.widgetId]];
  for (const [type, id] of trashed) {
    await expectStatus(await request.post(`${WS_API}/trash/items`, { data: { type, id } }), 200, `trash ${type}`);
  }
  // Media is not a generic Trash kind: its own route trashes it, and its DELETE then purges it.
  await expectStatus(await request.post(`${WS_API}/media/${s.mediaId}/trash`), 200, "trash media");
  const mediaGone = await request.delete(`${WS_API}/media/${s.mediaId}`);
  expect([200, 204], `media purge: ${await mediaGone.text()}`).toContain(mediaGone.status());
  const userGone = await request.delete(`${WS_API}/users/${s.principalId}`);
  expect([200, 204], `user delete: ${await userGone.text()}`).toContain(userGone.status());
  // Content types are retired, not trashed: deprecate, then tombstone, each at its current version.
  for (const op of ["deprecate", "tombstone"]) {
    const types = await body<Record<string, unknown>>(await request.get(`${API}/content-types`));
    const rows = (Object.values(types).find(Array.isArray) ?? []) as Array<{ key: string; version: number }>;
    const current = rows.find((row) => row.key === TYPE_KEY);
    if (!current) throw new Error(`content type ${TYPE_KEY} not listed before ${op}`);
    await expectStatus(await request.post(`${API}/content-types/${TYPE_KEY}/lifecycle`, { data: { op, expectedVersion: current.version } }), 200, `type ${op}`);
  }

  const ids = new Set([...trashed.map(([, id]) => id), s.mediaId, s.principalId]);
  const listTrash = async () => (await body<{ items: Array<{ id: string; entityId: string }> }>(await request.get(`${WS_API}/trash?limit=500`))).items;
  const mine = (await listTrash()).filter((item) => ids.has(item.entityId));
  if (mine.length) await expectStatus(await request.post(`${WS_API}/trash/purge`, { data: { ids: mine.map((i) => i.id) } }), 200, "trash purge");
  expect((await listTrash()).filter((item) => ids.has(item.entityId)), "seeded rows left in the Trash").toEqual([]);
  for (const [list, needle] of [["forms", FORM_SLUG], ["menus", MENU_SLUG], ["users", USERNAME], ["media", MEDIA_TITLE]] as const) {
    const text = await (await request.get(`${WS_API}/${list}`)).text();
    expect(text.includes(needle), `${list} still lists ${needle}`).toBe(false);
  }
}

export default async function mobileVisualGlobalSetup(config: FullConfig): Promise<() => Promise<void>> {
  await journeysGlobalSetup(config);
  const site = config.metadata.isolatedJourneySite as IsolatedJourneySite;
  const request = await playwrightRequest.newContext({ baseURL: site.adminURL, storageState: site.storageState });
  try {
    writeFileSync(seedFile(site), JSON.stringify(await seed(request, site)));
  } finally {
    await request.dispose();
  }
  return async () => {
    const teardown = await playwrightRequest.newContext({ baseURL: site.adminURL, storageState: site.storageState });
    try {
      await unseed(teardown, readSeeded(site));
      console.log("[mobile-visual] Deleted every seeded row and proved none is left");
    } finally {
      await teardown.dispose();
    }
  };
}
