import type { FullConfig } from "@playwright/test";

/**
 * @file Turns the public site assistant ON for this suite's own hermetic server, once, before any
 * spec runs (`playwright.site-assistant.config.ts`'s `globalSetup`).
 *
 * This is not test scaffolding that could be replaced by a fixture or an env var — it is the
 * product's real switch, exercised through the product's real admin route. `site.assistant.
 * public_enabled` is an ADR-028 settings-ledger value defaulting to `false`, and
 * `render.ts#siteAssistantMarkup` emits NO mount node and NO `<script>` tag when it is off. So with
 * the setting untouched, every spec in this suite would fail identically at "the widget never
 * appeared," having proven nothing about the widget.
 *
 * Written through `PUT /api/admin/v1/workspaces/:id/assistant/settings` rather than by seeding the
 * DB directly, deliberately: that route is the only path an operator has, it carries the permission
 * gate (`admin.assistant.manage`) and the validate-then-write chokepoint
 * (`setPublicAssistantSettings`), and the route asserts the persisted truth back. If enabling ever
 * stops working through that path, this suite should fail loudly at setup rather than quietly
 * seeding around a broken switch.
 *
 * Runs AFTER `webServer` (Playwright starts the web server before `globalSetup`), so the server is
 * already listening by the time these three requests fire.
 */

const LOGIN_PATH = "/api/admin/v1/auth/login";
const WORKSPACES_PATH = "/api/admin/v1/workspaces";
/** `src/db/../seed.ts`'s `seededWorkspace.id` for the in-memory store — but resolved from the live
 *  API below rather than hardcoded, so a seed change cannot leave this suite silently enabling the
 *  setting on a workspace nothing renders from. */
const EXPECTED_SEEDED_WORKSPACE_SLUG = "local-tovu";

/** Dev-auth credentials — the same pair `e2e/a2ui-transport-contract.spec.ts` logs in with. */
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "tovu-dev";

function requireBaseUrl(config: FullConfig): string {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) throw new Error("site-assistant globalSetup: no baseURL on the first project");
  return baseURL;
}

/** Express's session cookie, carried by hand: `globalSetup` runs outside any browser context and
 *  outside Playwright's `request` fixture, so there is no cookie jar to inherit here. */
function sessionCookie(response: Response): string {
  const raw = response.headers.getSetCookie?.() ?? [];
  const cookie = raw.map((entry) => entry.split(";")[0]).join("; ");
  if (!cookie) throw new Error("site-assistant globalSetup: login returned no Set-Cookie");
  return cookie;
}

export default async function enablePublicSiteAssistant(config: FullConfig): Promise<void> {
  const baseURL = requireBaseUrl(config);

  const login = await fetch(`${baseURL}${LOGIN_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  if (!login.ok) throw new Error(`site-assistant globalSetup: login failed (${login.status})`);
  const cookie = sessionCookie(login);

  const workspacesResponse = await fetch(`${baseURL}${WORKSPACES_PATH}`, { headers: { cookie } });
  if (!workspacesResponse.ok) {
    throw new Error(`site-assistant globalSetup: workspace lookup failed (${workspacesResponse.status})`);
  }
  const { workspaces } = (await workspacesResponse.json()) as { workspaces: { id: string; slug: string }[] };
  const workspace = workspaces.find((entry) => entry.slug === EXPECTED_SEEDED_WORKSPACE_SLUG) ?? workspaces[0];
  if (!workspace) throw new Error("site-assistant globalSetup: no workspace to enable the assistant on");

  const put = await fetch(`${baseURL}/api/admin/v1/workspaces/${workspace.id}/assistant/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ publicEnabled: true }),
  });
  if (!put.ok) throw new Error(`site-assistant globalSetup: enabling the assistant failed (${put.status})`);

  // Assert the PERSISTED truth the route returns, not the value we optimistically sent — a 200 that
  // silently wrote nothing would otherwise hand every spec a page with no widget on it and no clue
  // why.
  const { data } = (await put.json()) as { data: { publicEnabled: boolean } };
  if (data.publicEnabled !== true) {
    throw new Error("site-assistant globalSetup: the switch reads back as off after a successful write");
  }
}
