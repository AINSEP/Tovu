import type { FullConfig } from "@playwright/test";

import enablePublicSiteAssistant from "./site-assistant.globalSetup.js";

/**
 * @file `playwright.site-chat-fab.config.ts`'s `globalSetup`: the site assistant ON (the shared
 * `site-assistant.globalSetup.ts` switch) AND `tovu-theme` active — the theme `sites/tovu-dev` ships.
 *
 * The theme write is the point. The hermetic in-memory store boots on `tovu-starter`, so the
 * site-assistant suite never renders tovu-theme's static templates — which is exactly where the FAB
 * vanished on 2026-09-29 (a `<head>` comment naming `</body>` swallowed the chat mount). Written
 * through the same `PATCH .../presentation` route the admin Themes screen uses, with the persisted
 * value asserted back, so a broken switch fails here instead of silently testing the wrong theme.
 */

const SHIPPED_THEME_ID = "tovu-theme";

export default async function enableAssistantOnShippedTheme(config: FullConfig): Promise<void> {
  await enablePublicSiteAssistant(config);

  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) throw new Error("site-chat-fab globalSetup: no baseURL on the first project");

  const login = await fetch(`${baseURL}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  if (!login.ok) throw new Error(`site-chat-fab globalSetup: login failed (${login.status})`);
  const cookie = (login.headers.getSetCookie?.() ?? []).map((entry) => entry.split(";")[0]).join("; ");

  const workspaces = await fetch(`${baseURL}/api/admin/v1/workspaces`, { headers: { cookie } });
  const { workspaces: list } = (await workspaces.json()) as { workspaces: { id: string; slug: string }[] };
  const workspace = list.find((entry) => entry.slug === "local-tovu") ?? list[0];
  if (!workspace) throw new Error("site-chat-fab globalSetup: no workspace to set the theme on");

  const patch = await fetch(`${baseURL}/api/admin/v1/workspaces/${workspace.id}/presentation`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ activeThemeId: SHIPPED_THEME_ID }),
  });
  if (!patch.ok) throw new Error(`site-chat-fab globalSetup: activating ${SHIPPED_THEME_ID} failed (${patch.status}: ${await patch.text()})`);
  const body = JSON.stringify(await patch.json());
  if (!body.includes(`"activeThemeId":"${SHIPPED_THEME_ID}"`)) {
    throw new Error(`site-chat-fab globalSetup: ${SHIPPED_THEME_ID} does not read back as active: ${body.slice(0, 300)}`);
  }
}
