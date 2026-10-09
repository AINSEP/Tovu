// Todo 11: original bug pins consolidated by area. Browser execution is pending.
import { test } from "../support/bug-pin-fixtures.js";
import { PUBLIC_URL as PIN_PUBLIC_URL } from "../support/bug-pin-fixtures.js";
import { JOURNEY_ADMIN_PASSWORD as PIN_PASSWORD } from "../support/bug-pin-fixtures.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { test as base } from "../support/bug-pin-fixtures.js";
import { expect } from "../support/bug-pin-fixtures.js";
import { type BrowserContext } from "../support/bug-pin-fixtures.js";
import { type Page } from "../support/bug-pin-fixtures.js";
import { loginAsAdmin, pinSessionHeaders } from "../support/bug-pin-auth.js";

// Migrated from admin-visual-regression.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: admin-visual-regression", () => {
/**
 * Admin + assistant visual regression README
 * Check: npm run test:visual:regression
 * Intentionally create/update approved baselines: npm run test:visual:regression -- --update-snapshots=all
 * Review and commit the PNGs in development/e2e/admin-visual-regression.spec.ts-snapshots/.
 * Use the same OS, Playwright Chromium version, and fonts for update/check (OS is in each filename).
 * Failed comparisons write *-actual.png, *-expected.png and *-diff.png under
 * development/test-results/visual-regression/; the HTML report is
 * development/playwright-report/visual-regression/index.html.
 *
 * The three viewport projects live in playwright.visual-regression.config.ts. Capture each
 * ADMIN_PANELS index route (including nav-less aliases and soon pages) once per viewport,
 * plus every enabled page tab and representative seeded entity editors/subroutes.
 *
 * TAB INVENTORY, derived from the literal declarations below (ids, not remembered labels):
 * Sites -> all, new; AI Assistant -> visitor, admin, roadmap.
 * Pages -> mine, theme (URL: ?tab=themes); Media -> all, images, videos, external-providers.
 * Roles -> roles, policies; SEO -> defaults, sitemap, entries.
 * Themes AND Appearance alias -> declarative, static, templated, code.
 * Plugins AND Agent Plugins -> installed, downloaded, marketplace.
 * Skills -> skills, add (URL: ?tab=skills, ?tab=add).
 * Providers -> external-mcp, always-allow, mcp-server, webhooks.
 * Database -> timeline, migrate-forward; Recovery -> restore-points, restore.
 * Deployment -> overview, static-site, full-site, dockerfile, history.
 * Deployment / Static Site / Publish target -> github-pages, netlify, vercel,
 *   cloudflare-pages, s3-compatible (shipped deploy-target JSON registry).
 * Source Control -> providers; Security (/access-tokens) -> access-tokens, site-key.
 * Security / Access Tokens / category -> all, source-control, hosting, media, ai, ops, general.
 * Settings -> execution, instructions, notifications, privacy, appearance, language,
 *   memory, workspace, about.
 * Settings / Execution AND AI Assistant / Admin / Execution -> local-cli, byok.
 * Those two BYOK pickers AND AI Assistant / Visitor provider -> anthropic, openai,
 *   azure-openai, google-gemini, openrouter, ollama (installed UI package's presets).
 * Authentication -> home, google, facebook, linkedin; Observability -> overview, providers.
 * Page editor -> html, interactive, preview; Post editor -> edit, preview.
 * Form detail -> fields, submissions (URL: /:formId, /:formId/submissions).
 * Theme Explore -> preview, html (file selected by ?theme=tovu-theme&file=theme.json;
 *   a shipped text asset keeps the preview independent of remote fonts/images/scripts).
 * Settings / Memory -> memories, how: the host wraps these controls in `inert`;
 *   capture the real default Memories view, skip How it works rather than bypassing inert.
 * No other page tab/hash declaration was found in the current admin source. Payments and
 * the soon placeholders have no tab bar. Dialogs/popovers are not entity page routes.
 * Representative entities: page, post, form, menu, collection + entry, widget + region,
 * also the users/change-password route and widgets/regions index. Webhook deliveries are
 * skipped: creating a subscription requires a registered, approved egress target, which
 * this isolated fixture does not have.
 * Real API seeds are idempotent and named; never pick whichever random row happens to be first.
 * Planned screenshot count at this source state: 504 = 3 viewports x (47 indices +
 *   1 legacy Skills Add shot + 65 page tabs + 34 nested tabs + 9 entity/editor tabs +
 *   7 other routes + 5 chat states).
 * Default tabs intentionally have named baselines in addition to the original index shots.
 * Nested execution captures pause UI timers AFTER initial load, before any click: this shows
 * actual editable form state without firing the shared ledger's debounced autosave. No keys,
 * connection tests, exports, publish operations, or agent runs are submitted.
 * Read the manifest with the TS parser instead of importing its browser-only React module graph.
 * A new panel automatically becomes a new test and fails until its baseline is approved.
 */






const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const API = "/api/admin/v1";
const WORKSPACE_API = `${API}/workspaces/workspace-local`;
const SKILL_NAME = "visual-regression-review";
const SKILL_MARKDOWN = `---
name: ${SKILL_NAME}
description: Review layout, spacing and responsive behavior before a release.
---
# Visual review
Inspect the requested screen and explain any layout changes.
`;
const FIXED_DATE = new Date("2026-09-01T12:00:00.000Z");
const STILL_CSS = `
  *, *::before, *::after {
    animation: none !important;
    transition: none !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
  }
`;

interface PanelCapture { id: string; label: string; soon: boolean }

function property(object: ts.ObjectLiteralExpression, name: string): ts.Expression | undefined {
  const member = object.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText() === name);
  return member && ts.isPropertyAssignment(member) ? member.initializer : undefined;
}

function readPanelCaptures(): PanelCapture[] {
  const filename = path.join(REPO_ROOT, "apps/admin/src/panels.tsx");
  const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration: ts.VariableDeclaration | undefined;
  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "ADMIN_PANELS") declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!declaration?.initializer || !ts.isArrayLiteralExpression(declaration.initializer)) {
    throw new Error("ADMIN_PANELS must be a literal array; update the visual manifest reader if its declaration changes.");
  }
  const captures = declaration.initializer.elements.map(element => {
    if (!ts.isObjectLiteralExpression(element)) throw new Error("Unrecognized panel declaration; refusing to silently lose coverage.");
    const id = property(element, "id");
    if (!id || !ts.isStringLiteral(id)) throw new Error("Panel id must be a string literal.");
    const nav = property(element, "nav");
    const label = nav && ts.isObjectLiteralExpression(nav) ? property(nav, "label") : undefined;
    const soon = nav && ts.isObjectLiteralExpression(nav) ? property(nav, "soon") : undefined;
    return { id: id.text, label: label && ts.isStringLiteral(label) ? label.text : id.text, soon: soon?.kind === ts.SyntaxKind.TrueKeyword };
  });
  if (captures.length === 0 || new Set(captures.map(p => p.id)).size !== captures.length) {
    throw new Error("Empty/duplicate admin capture manifest.");
  }
  return captures;
}

const panels = readPanelCaptures();

/** Parse tab declarations without importing React or browser-only feature dependencies.
 * Fail closed on unsupported syntax so source changes cannot silently remove captures. */
function readLiteralArray(filename: string, name: string): ts.Expression[] {
  const source = ts.createSourceFile(filename, readFileSync(filename, "utf8"), ts.ScriptTarget.Latest, true);
  let initializer: ts.Expression | undefined;
  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) initializer = node.initializer;
    if (name === "jsx:tabs" && ts.isJsxAttribute(node) && node.name.getText(source) === "tabs" && node.initializer && ts.isJsxExpression(node.initializer)) initializer = node.initializer.expression;
    ts.forEachChild(node, visit);
  }
  visit(source);
  while (initializer && (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer) || ts.isParenthesizedExpression(initializer))) initializer = initializer.expression;
  if (!initializer || !ts.isArrayLiteralExpression(initializer)) throw new Error(`Expected literal tab array ${name} in ${filename}`);
  return Array.from(initializer.elements);
}

function tabValues(file: string, name: string, field?: string): string[] {
  // Screens that moved into @jini-ai/admin keep their tab ids in the package's built rules files.
  const jini = "@jini-ai/admin/";
  const filename = file.startsWith(jini)
    ? path.join(REPO_ROOT, "apps/admin/node_modules/@jini-ai/admin/dist", file.slice(jini.length))
    : path.join(REPO_ROOT, "apps/admin/src/features", file);
  const values = readLiteralArray(filename, name).map(element => {
    const value = field && ts.isObjectLiteralExpression(element) ? property(element, field) : element;
    if (!value || !ts.isStringLiteral(value)) throw new Error(`Nonliteral ${name}.${field ?? "id"} in ${file}`);
    return value.text;
  });
  if (!values.length || new Set(values).size !== values.length) throw new Error(`Empty/duplicate tabs: ${file}:${name}`);
  return values;
}

interface TabPage { route: string; ids: string[]; shell?: boolean; clickOnly?: boolean }
const themeTabIds = tabValues("themes/rules.ts", "THEME_TAB_GROUPS");
const tabPages: TabPage[] = [
  { route: "sites", ids: tabValues("sites/Sites.hooks.tsx", "SITES_TAB_IDS") },
  { route: "ai-assistant", ids: tabValues("ai-assistant/hooks/use-ai-assistant.hooks.ts", "AI_ASSISTANT_TAB_IDS"), shell: true },
  { route: "pages", ids: tabValues("pages/Pages.tsx", "jsx:tabs", "id") },
  { route: "media", ids: tabValues("media/hooks/use-media-tabs.hooks.ts", "MEDIA_TABS", "id") },
  { route: "roles", ids: tabValues("roles/Roles.hooks.tsx", "ROLES_TAB_IDS") },
  { route: "seo", ids: tabValues("@jini-ai/admin/seo/rules.js", "SEO_TAB_IDS") },
  { route: "themes", ids: themeTabIds },
  { route: "appearance", ids: themeTabIds },
  { route: "plugins", ids: tabValues("plugins/Plugins.tsx", "PLUGINS_TAB_IDS") },
  { route: "agent-plugins", ids: tabValues("plugins/AgentPlugins.tsx", "tabs", "id"), shell: true, clickOnly: true },
  { route: "skills", ids: tabValues("skills/Skills.tsx", "tabs", "id"), shell: true },
  { route: "providers", ids: tabValues("providers/Providers.tsx", "PROVIDERS_TAB_IDS") },
  { route: "database", ids: tabValues("database/Database.tsx", "DATABASE_TAB_IDS") },
  // ea4f8967a moved Recovery's tabs into an inline SettingsDialogShell `tabs` array.
  { route: "recovery", ids: tabValues("recovery/Recovery.tsx", "tabs", "id"), shell: true },
  { route: "deployment", ids: tabValues("deployment/Deployment.tsx", "DEPLOYMENT_TAB_IDS") },
  { route: "source-control", ids: tabValues("source-control/SourceControl.tsx", "SOURCE_CONTROL_TAB_IDS") },
  { route: "access-tokens", ids: tabValues("security/Security.tsx", "SECURITY_TAB_IDS") },
  { route: "settings", ids: tabValues("settings/SettingsUi.tsx", "tabs", "id"), shell: true },
  { route: "authentication", ids: ["home", ...tabValues("authentication/model/provider-schemas.ts", "AUTHENTICATION_PROVIDER_SCHEMAS", "id")], shell: true, clickOnly: true },
  { route: "observability", ids: tabValues("observability/Observability.tsx", "tabs", "id"), shell: true, clickOnly: true },
];
const categories = tabValues("security/rules.ts", "ACCESS_TOKEN_CATEGORIES", "id");
const publishTargets = (JSON.parse(readFileSync(path.join(REPO_ROOT, "content/agent-plugins/deploy/tovu-deploy-targets.json"), "utf8")) as { targets: Array<{ id: string; label: string }> }).targets;
const uiExecutionSource = path.join(REPO_ROOT, "apps/admin/node_modules/@jini-ai/ui/src/features/execution/constants.ts");
const providerPresets = readLiteralArray(uiExecutionSource, "DEFAULT_PROVIDER_PRESETS").map(element => {
  if (!ts.isObjectLiteralExpression(element)) throw new Error("Nonliteral provider preset");
  const id = property(element, "id");
  const title = property(element, "title");
  if (!id || !title || !ts.isStringLiteral(id) || !ts.isStringLiteral(title)) throw new Error("Nonliteral provider id/title");
  return { id: id.text, title: title.text };
});

type AdminStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;
interface SeedEntities { page: string; post: string; menu: string; form: string; entry: string; widget: string }
interface AdminSeed { storageState: AdminStorageState; entities: SeedEntities }

async function installDeterministicTransport(context: BrowserContext): Promise<void> {
  // These are transport fixtures, not screenshot masks. HTTP 204 makes native EventSource
  // stop reconnecting, so networkidle is reachable without timers or blanket request aborts.
  // No assistant run is sent in this suite; neither background feed affects the captured states.
  await context.route(url => url.pathname.endsWith("/settings/events") || url.pathname === "/api/frontend-sessions/stream", route => route.fulfill({ status: 204 }));
  // Sites is a developer-only screen. Capture that deployment's UI even though the isolated
  // pin boot defaults the switcher flag off; keep the real list, binding and write restrictions.
  // No Create/Activate is submitted here, and a failed real read must still fail the capture.
  await context.route(url => url.pathname === `${WORKSPACE_API}/system/sites`, async route => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    await expect(response).toBeOK();
    await route.fulfill({ response, json: { ...await response.json(), switchingEnabled: true } });
  });
  // CLI discovery depends on the runner's installed/authenticated executables. Pin only that
  // machine inventory; page content, installed skills, guidance and seed writes use the real API.
  await context.route(url => url.pathname === "/api/agents", route => route.fulfill({
    // The controlled picker initially selects "claude"; keep that runtime usable before
    // ledger settings settle, alongside Codex. No executable is actually invoked.
    json: { agents: [
      { id: "claude", name: "Claude Code", available: true, authStatus: "ok", supportsTools: true, supportsCustomModel: true, models: [{ id: "default", label: "Default" }] },
      { id: "codex", name: "Codex", available: true, authStatus: "ok", supportsTools: true, supportsCustomModel: true, models: [{ id: "default", label: "Default" }] },
    ] },
  }));
  // Ollama's keyless discovery would probe the runner's localhost. Pin that optional machine
  // service to an explicit unavailable response; authenticated providers still use the real API.
  await context.route(url => url.pathname === `${WORKSPACE_API}/assistant/execution/models`, async route => {
    const body = route.request().postDataJSON() as { baseUrl?: string };
    if (body.baseUrl === "http://localhost:11434/v1") {
      await route.fulfill({ json: { ok: false, models: [], message: "Ollama is not running in the visual regression fixture." } });
    } else await route.continue();
  });
}

async function seedContent(page: Page): Promise<SeedEntities> {
  // The API client omits Secure cookies on HTTP loopback; reuse the real browser session.
  const headers = await pinSessionHeaders({ request: page.request });
  // Like admin-visual-parity, populate flat + hierarchical taxonomies through their real UI.
  // Workers/projects/retries share this one server: read first so fixture writes are idempotent.
  const taxonomies = await page.request.get(`${API}/taxonomy`, { headers });
  await expect(taxonomies).toBeOK();
  const { items } = await taxonomies.json() as { items: Array<{ taxonomy: { name: string } }> };
  if (!items.some(item => item.taxonomy.name === "Category")) {
    await page.goto("/admin/taxonomy");
    await page.getByRole("button", { name: "New taxonomy", exact: true }).click();
    await page.getByLabel("New taxonomy", { exact: true }).fill("Category");
    await page.getByRole("button", { name: "Create taxonomy", exact: true }).click();
    const group = page.locator(".settings-namespace-group", { hasText: "Category" });
    for (const term of ["News", "Guides"]) {
      await group.getByRole("button", { name: "+ Add term", exact: true }).click();
      await group.getByPlaceholder("Term name").fill(term);
      await group.getByRole("button", { name: "Add term", exact: true }).click();
      await expect(group.getByText(term, { exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: "New taxonomy", exact: true }).click();
    await page.getByLabel("New taxonomy", { exact: true }).fill("Topic");
    await page.getByRole("checkbox", { name: "Hierarchical", exact: true }).check();
    await page.getByRole("button", { name: "Create taxonomy", exact: true }).click();
    const topic = page.locator(".settings-namespace-group", { hasText: "Topic" });
    for (const term of ["Engineering", "Backend"]) {
      await topic.getByRole("button", { name: "+ Add term", exact: true }).click();
      await topic.getByPlaceholder("Term name").fill(term);
      if (term === "Backend") await topic.locator('select[aria-label="Parent term"]').selectOption({ label: "Engineering" });
      await topic.getByRole("button", { name: "Add term", exact: true }).click();
      await expect(topic.getByText(term, { exact: true })).toBeVisible();
    }
  }

  // The current memory composition seeds posts/pages, but media and menus start empty.
  // Use a real shipped PNG upload and real menu write rather than replacing list responses.
  const mediaResponse = await page.request.get(`${WORKSPACE_API}/media`, { headers });
  await expect(mediaResponse).toBeOK();
  const media = await mediaResponse.json() as { media: unknown[] };
  if (media.media.length === 0) {
    const uploaded = await page.request.post(`${WORKSPACE_API}/media`, { headers, data: {
      filename: "visual-logo.png", contentType: "image/png", alt: "Tovu visual test logo",
      dataBase64: readFileSync(path.join(REPO_ROOT, "content/brand/icons/pwa/icon-512.png")).toString("base64"),
    } });
    await expect(uploaded).toBeOK();
  }
  const menuResponse = await page.request.get(`${WORKSPACE_API}/menus`, { headers });
  await expect(menuResponse).toBeOK();
  const menus = await menuResponse.json() as { menus: unknown[] };
  if (menus.menus.length === 0) {
    const created = await page.request.post(`${WORKSPACE_API}/menus`, { headers, data: {
      title: "Main navigation", slug: "visual-main", items: [],
    } });
    await expect(created).toBeOK();
  }
  const installed = await page.request.get(`${WORKSPACE_API}/skills`, { headers });
  await expect(installed).toBeOK();
  const { skills } = await installed.json() as { skills: Array<{ name: string }> };
  if (!skills.some(skill => skill.name === SKILL_NAME)) {
    const added = await page.request.post(`${WORKSPACE_API}/skills`, { headers, data: {
      confirmed: true,
      files: [{ path: "SKILL.md", contentBase64: Buffer.from(SKILL_MARKDOWN).toString("base64") }],
    } });
    await expect(added).toBeOK();
  }

  // Explicit slugs/titles make entity selection stable across projects and retries. All writes
  // go to this suite's isolated runtime through production API contracts, never list mocks.
  async function get<T>(url: string): Promise<T> {
    const response = await page.request.get(url, { headers });
    await expect(response).toBeOK();
    return await response.json() as T;
  }
  async function post<T>(url: string, data: unknown): Promise<T> {
    const response = await page.request.post(url, { headers, data });
    await expect(response).toBeOK();
    return await response.json() as T;
  }
  type Content = { id: string; slug: string };
  const posts = await get<{ posts: Array<{ post: Content }> }>(`${WORKSPACE_API}/posts`);
  const seededPost = posts.posts.find(item => item.post.slug === "visual-post")?.post
    ?? (await post<{ post: Content }>(`${WORKSPACE_API}/posts`, {
      title: "Visual regression post", slug: "visual-post", status: "draft",
      bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A stable post for editor and preview captures." }] }] },
    })).post;
  const pages = await get<{ posts: Array<{ post: Content }> }>(`${WORKSPACE_API}/pages`);
  let seededPage = pages.posts.find(item => item.post.slug === "visual-page")?.post;
  if (!seededPage) {
    seededPage = (await post<{ post: Content }>(`${WORKSPACE_API}/pages`, { title: "Visual regression page", slug: "visual-page" })).post;
    const html = await page.request.put(`${WORKSPACE_API}/pages/${seededPage.id}/html`, { headers, data: {
      html: '<main><h1>Visual regression page</h1><p>A stable page for HTML, Interactive and Preview captures.</p></main>',
    } });
    await expect(html).toBeOK();
  }
  const namedMenus = await get<{ menus: Array<{ id: string; slug: string }> }>(`${WORKSPACE_API}/menus`);
  const menu = namedMenus.menus.find(item => item.slug === "visual-main")
    ?? (await post<{ menu: { id: string } }>(`${WORKSPACE_API}/menus`, { title: "Main navigation", slug: "visual-main", items: [] })).menu;
  const forms = await get<{ data: Array<{ id: string; slug: string }> }>(`${WORKSPACE_API}/forms`);
  const form = forms.data.find(item => item.slug === "visual-contact")
    ?? (await post<{ data: { id: string } }>(`${WORKSPACE_API}/forms`, {
      name: "Visual contact", slug: "visual-contact", fields: [
        { id: "name", label: "Name", type: "text", required: true, maxLength: 120 },
        { id: "email", label: "Email", type: "email", required: true },
        { id: "message", label: "Message", type: "textarea", required: false, maxLength: 1000 },
      ], notify: { enabled: false, recipients: [] },
    })).data;
  const types = await get<{ items: Array<{ key: string }> }>(`${API}/content-types`);
  if (!types.items.some(item => item.key === "visual_notes")) {
    await post(`${API}/content-types`, { key: "visual_notes", label: "Visual notes", fields: [
      { name: "summary", kind: "text", required: false, queryable: false },
    ] });
  }
  const entries = await get<{ items: Array<{ id: string; slug: string }> }>(`${API}/entries?type=visual_notes`);
  const entry = entries.items.find(item => item.slug === "visual-note")
    ?? (await post<{ entry: { id: string } }>(`${API}/entries`, {
      type: "visual_notes", slug: "visual-note", title: "Visual note",
      fieldsJson: { ext: { site: { summary: "Deterministic collection entry" } } },
      bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "A stable collection entry for editor captures." }] }] },
    })).entry;
  const widgets = await get<{ widgets: Array<{ id: string; slug: string }> }>(`${WORKSPACE_API}/widgets`);
  const widget = widgets.widgets.find(item => item.slug === "visual-widget")
    ?? (await post<{ widget: { id: string } }>(`${WORKSPACE_API}/widgets`, {
      widgetType: "text", title: "Visual welcome", slug: "visual-widget", config: { body: "Welcome to the visual regression site." },
    })).widget;
  const regions = await get<{ regions: Array<{ regionKey: string }> }>(`${WORKSPACE_API}/widgets/regions`);
  if (!regions.regions.some(item => item.regionKey === "visual-sidebar")) await post(`${WORKSPACE_API}/widgets/regions`, { regionKey: "visual-sidebar" });
  return { page: seededPage.slug, post: seededPost.id, menu: menu.id, form: form.id, entry: entry.id, widget: widget.id };
}

const test = base.extend<{ adminSeed: AdminSeed }>({
  adminSeed: [async ({ browser, baseURL, journeySite }, use) => {
    // A separate setup context keeps its taxonomy URL, focused controls and localStorage out
    // of captures. Reuse only session cookies; every test gets a fresh context/page and draft.
    const context = await browser.newContext({ baseURL: baseURL, viewport: { width: 1440, height: 900 }, locale: "en-US", timezoneId: "UTC", storageState: journeySite.storageState });
    try {
      await installDeterministicTransport(context);
      const page = await context.newPage();
      await page.clock.setFixedTime(FIXED_DATE); // Freeze Date only; UI timers and RAF still run.
      await loginAsAdmin(page);
      const entities = await seedContent(page);
      const state = await context.storageState();
      await use({ storageState: { cookies: state.cookies, origins: [] }, entities });
    } finally {
      await context.close();
    }
  }, { timeout: 120_000 }],
  storageState: async ({ adminSeed }, use) => { await use(adminSeed.storageState); },
  page: async ({ page, context }, use, testInfo) => {
    await installDeterministicTransport(context);
    // Clock.install must precede all other clock APIs. Only nested execution cases need fake
    // timers; ordinary captures retain the original Date-only freeze and running UI timers.
    if (testInfo.title.includes(": execution ")) await page.clock.install({ time: FIXED_DATE });
    await page.clock.setFixedTime(FIXED_DATE);
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    // Install before app mount, then reinforce after navigation before each screenshot.
    await page.addInitScript(css => {
      document.addEventListener("DOMContentLoaded", () => {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.append(style);
      }, { once: true });
    }, STILL_CSS);
    await use(page);
  },
});

// Resolve the seed once in beforeAll so a broken setup fails this file's project once instead
// of rebooting its site for every capture. Keep per-test seeding because pins reset between tests.
test.beforeAll("admin seed preflight", async ({ adminSeed }) => { void adminSeed; });

async function settle(page: Page): Promise<void> {
  await expect(page.locator(".admin-layout")).toBeVisible();
  await page.waitForLoadState("networkidle");
  for (const frame of page.frames()) {
    await frame.evaluate(async css => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).filter(img => img.getAttribute("src")).map(img => img.decode().catch(() => undefined)));
      const style = document.createElement("style");
      style.textContent = css;
      document.head.append(style);
    }, STILL_CSS);
  }
  await page.addStyleTag({ content: STILL_CSS });
  // Do not approve a loading skeleton/failed content request as an index-page baseline.
  await expect(page.locator("#main-content")).not.toContainText(/Loading(?:\s|…|\.\.\.)|Checking current status…/);
  // Memory-only capability warnings (for example the database drift banner) remain visible:
  // they are part of this boot's actual UI. The index tests separately require a rendered page.
}

async function capture(page: Page, filename: string): Promise<void> {
  await settle(page);
  // MASK INVENTORY (nothing else is masked):
  // - table body timestamp cells under Updated / Created / Timestamp / Time / Removed headers;
  //   mark by semantic column header, since shared DataTable exposes no column-key DOM attribute.
  // - .dash-activity-time: server write timestamps in recent activity.
  // - .workspace-identity-grid Created value: server timestamp on the legacy Workspace tab.
  // - .deployment-facts code: absolute filesystem paths vary with the isolated runtime directory.
  // - .site-key-fingerprint: per-runtime generated key fingerprint (never reveal the key).
  // - .site-key-status-note code: absolute per-runtime key-file path.
  // No random entity IDs or avatars are displayed by the representative states.
  // Stable titles, slugs, nav icons, media thumbnails, menu rows, skill chips and popup are visible.
  await page.evaluate(() => {
    for (const table of document.querySelectorAll("#main-content table")) {
      const headings = Array.from(table.querySelectorAll("thead th"));
      headings.forEach((heading, index) => {
        const label = (heading.textContent ?? "").replace(/[⇅▲▼]/g, "").trim();
        if (!/^(Updated|Created|Timestamp|Time|Removed)$/.test(label)) return;
        for (const row of table.querySelectorAll("tbody tr")) row.children[index]?.setAttribute("data-visual-timestamp", "");
      });
    }
  });
  const masks = [
    page.locator("[data-visual-timestamp]"),
    page.locator(".dash-activity-time"),
    page.locator(".workspace-identity-grid .settings-layer-cell").filter({ hasText: "Created" }).locator("span").last(),
    page.locator(".deployment-facts code"),
    page.locator(".site-key-fingerprint"),
    page.locator(".site-key-status-note code"),
  ];
  // Viewport-sized shots reflect the actual responsive shell and fixed-position chat dock;
  // fullPage could expand the image to an overflowing off-canvas mobile sidebar's width.
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot(filename, { animations: "disabled", caret: "hide", mask: masks });
}

test.describe("admin index pages", () => {
  for (const panel of panels) {
    // Soon pages have a real declaration and are captured once in each project, including
    // previewable Comments/Authentication/Observability. No disabled nav link needs clicking.
    test(`${panel.id}: ${panel.label}${panel.soon ? " (soon)" : ""}`, async ({ page }) => {
      await page.goto(`/admin/${panel.id}`, { waitUntil: "domcontentloaded" });
      if (panel.id === "workspace") await expect(page).toHaveURL(/\/admin\/settings\?tab=workspace$/);
      if (panel.id === "integrations") await expect(page).toHaveURL(/\/admin\/providers\?tab=webhooks$/);
      await settle(page);
      await expect(page.locator("#main-content .page, #main-content .jini-page, #main-content .settings-ui-section").first()).toBeVisible();
      if (panel.id === "seo") await expect(page.getByRole("heading", { name: "SEO", exact: true })).toBeVisible();
      if (panel.id === "sites") await expect(page.getByRole("heading", { name: "Sites", exact: true })).toBeVisible();
      if (panel.id === "taxonomy") await expect(page.getByText("Backend", { exact: true })).toBeVisible();
      if (panel.id === "skills") await expect(page.getByRole("list", { name: "Installed skills" })).toContainText(SKILL_NAME);
      await expect(page.locator("button.chat-fab")).toBeVisible();
      await expect(page.locator(".admin-chat-dock")).toBeHidden();
      await capture(page, `admin-${panel.id}.png`);
      if (panel.id === "skills") {
        await page.goto("/admin/skills?tab=add");
        await expect(page).toHaveURL(/\/admin\/skills\?tab=add$/);
        await expect(page.getByRole("textbox", { name: "GitHub URL" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Upload files", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Upload folder", exact: true })).toBeVisible();
        await expect(page.getByRole("list", { name: "Installed skills" })).toHaveCount(0);
        await capture(page, "admin-skills-add.png");
      }
    });
  }
});

async function selectShellTab(page: Page, id: string): Promise<void> {
  const tab = page.getByTestId(`settings-dialog-nav-${id}`);
  // Inline dialog sidebars can be collapsed at narrow widths; expand through their real control.
  if (!await tab.isVisible()) await page.getByRole("button", { name: "Expand settings sidebar", exact: true }).click();
  await tab.click();
  await expect(tab).toHaveAttribute("aria-pressed", "true");
}

test.describe("every admin page tab", () => {
  for (const tabPage of tabPages) {
    for (const [index, id] of tabPage.ids.entries()) {
      test(`${tabPage.route}: tab ${id}`, async ({ page }) => {
        const queryId = tabPage.route === "pages" && id === "theme" ? "themes" : id;
        await page.goto(`/admin/${tabPage.route}${tabPage.clickOnly ? "" : `?tab=${queryId}`}`);
        await settle(page);
        if (tabPage.clickOnly) await selectShellTab(page, id);
        else if (tabPage.shell) await expect(page.getByTestId(`settings-dialog-nav-${id}`)).toHaveAttribute("aria-pressed", "true");
        else if (tabPage.route === "sites") await expect(page.locator(`[data-agent-element="sites-tab-${id}"]`)).toHaveAttribute("aria-selected", "true", { timeout: 5_000 });
        else {
          const tab = page.locator("#main-content .tab-bar").first().getByRole("tab").nth(index);
          await expect(tab).toHaveAttribute("aria-selected", "true");
        }
        await capture(page, `admin-${tabPage.route}-tab-${id}.png`);
      });
    }
  }
});

test.describe("nested page tabs", () => {
  for (const [index, id] of categories.entries()) {
    test(`access-tokens: category ${id}`, async ({ page }) => {
      await page.goto("/admin/access-tokens?tab=access-tokens");
      await settle(page);
      const tab = page.getByRole("tablist", { name: "Filter by category", exact: true }).getByRole("tab").nth(index);
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      await capture(page, `admin-access-tokens-category-${id}.png`);
    });
  }
  for (const target of publishTargets) {
    test(`deployment static-site: target ${target.id}`, async ({ page }) => {
      await page.goto("/admin/deployment?tab=static-site");
      await settle(page);
      const tab = page.getByRole("tablist", { name: "Publish target", exact: true }).getByRole("tab", { name: target.label, exact: true });
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true");
      // The target form is below the export card: keep that tab and its actual body in frame.
      await tab.evaluate(element => element.closest('[role="tablist"]')?.scrollIntoView({ block: "start", behavior: "instant" }));
      await capture(page, `admin-deployment-static-site-target-${target.id}.png`);
    });
  }

  for (const mount of ["settings", "ai-assistant"] as const) {
    // A fresh test/context per mode/provider keeps unsaved form selections independent.
    for (const state of [{ id: "local-cli", title: "Local CLI" }, { id: "byok", title: "BYOK" }, ...providerPresets]) {
      test(`${mount}: execution ${state.id}`, async ({ page }) => {
        await page.goto(`/admin/${mount}?tab=${mount === "settings" ? "execution" : "admin"}`);
        await settle(page);
        // Pause only after requests/detection have rendered. Prevent the execution slice's
        // 600ms debounce from persisting a mode/provider choice into later page captures.
        await page.clock.pauseAt(FIXED_DATE);
        const ledgerWrites: string[] = [];
        page.on("request", request => {
          if (request.method() === "PUT" && new URL(request.url()).pathname === `${WORKSPACE_API}/settings/value`) ledgerWrites.push(request.url());
        });
        const mode = state.id === "local-cli" ? "Local CLI" : "BYOK";
        // Settings calls this control "AI agent"; select the exact mode title inside the shared
        // execution component so host labels and the tab's descriptive subtitle cannot hide it.
        const modeTab = page.locator(".jini-settings-execution").getByRole("tab").filter({ has: page.getByText(mode, { exact: true }) });
        await expect(modeTab, `${mount}: execution mode ${mode} must be present`).toBeVisible({ timeout: 5_000 });
        await modeTab.click({ timeout: 5_000 });
        await expect(modeTab).toHaveAttribute("aria-selected", "true");
        if (state.id !== "local-cli" && state.id !== "byok") {
          const provider = page.locator(".jini-provider-chip-row").getByRole("tab", { name: state.title, exact: true });
          await expect(provider, `${mount}: provider ${state.id} must be present`).toBeVisible({ timeout: 5_000 });
          await provider.click({ timeout: 5_000 });
          await expect(provider).toHaveAttribute("aria-selected", "true");
        }
        // Keep the mode row, provider chips and form together, including at 390px where the
        // AI Assistant header/switch would otherwise push the actual provider form below frame.
        await modeTab.evaluate(element => element.closest('[role="tablist"]')?.scrollIntoView({ block: "start", behavior: "instant" }));
        await capture(page, `admin-${mount}-execution-${state.id}.png`);
        expect(ledgerWrites, "Paused execution captures must not change shared settings").toEqual([]);
      });
    }
  }
  for (const preset of providerPresets) {
    test(`ai-assistant visitor: provider ${preset.id}`, async ({ page }) => {
      await page.goto("/admin/ai-assistant?tab=visitor");
      await settle(page);
      const provider = page.locator(".jini-provider-chip-row").getByRole("tab", { name: preset.title, exact: true });
      await provider.click();
      await expect(provider).toHaveAttribute("aria-selected", "true");
      await provider.evaluate(element => element.closest('[role="tablist"]')?.scrollIntoView({ block: "start", behavior: "instant" }));
      await capture(page, `admin-ai-assistant-visitor-provider-${preset.id}.png`);
    });
  }
});

test.describe("seeded entity pages and editor tabs", () => {
  const editors = [
    { entity: "page", route: "pages", ids: tabValues("pages/PageEditor.tsx", "VIEWS", "key"), labels: tabValues("pages/PageEditor.tsx", "VIEWS", "label") },
    { entity: "post", route: "posts", ids: tabValues("posts/PostEditor.tsx", "VIEWS", "key"), labels: tabValues("posts/PostEditor.tsx", "VIEWS", "label") },
    { entity: "theme", route: "themes", ids: tabValues("themes/ThemeExplore.tsx", "VIEWS", "key"), labels: tabValues("themes/ThemeExplore.tsx", "VIEWS", "label") },
  ] as const;
  for (const editor of editors) {
    for (const [index, id] of editor.ids.entries()) {
      test(`${editor.entity} editor: ${id}`, async ({ page, adminSeed }) => {
        // basic-2 was an owner-site clone, absent on a cold boot. Use the shipped catalog theme
        // renamed by 85e29beac; these tests only preview/read its files.
        const url = editor.entity === "theme" ? "/admin/themes/explore?theme=tovu-theme&file=theme.json"
          : `/admin/${editor.route}/${encodeURIComponent(adminSeed.entities[editor.entity])}`;
        await page.goto(url);
        await settle(page);
        const tab = page.getByRole("tablist", { name: "Editor view", exact: true }).getByRole("tab", { name: editor.labels[index], exact: true });
        await tab.click();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        if (editor.entity === "page" && id === "html") await expect(page.getByRole("textbox", { name: "Page HTML", exact: true })).not.toHaveValue("");
        if (editor.entity === "theme" && id === "html") await expect(page.getByRole("textbox", { name: "Theme file source", exact: true })).not.toHaveValue("");
        await capture(page, `admin-${editor.entity}-editor-tab-${id}.png`);
      });
    }
  }
  for (const [index, id] of tabValues("@jini-ai/admin/forms/rules.js", "FORM_TABS", "id").entries()) {
    test(`form detail: ${id}`, async ({ page, adminSeed }) => {
      await page.goto(`/admin/forms/${adminSeed.entities.form}${id === "submissions" ? "/submissions" : ""}`);
      await settle(page);
      await expect(page.getByRole("tablist", { name: "Form sections", exact: true }).getByRole("tab").nth(index)).toHaveAttribute("aria-selected", "true");
      await capture(page, `admin-form-detail-tab-${id}.png`);
    });
  }
  const details: Array<{ id: string; url: (entities: SeedEntities) => string; heading: string }> = [
    { id: "menu-editor", url: e => `/admin/menus/${e.menu}`, heading: "Edit menu" },
    { id: "collection-entries", url: () => "/admin/collections/visual_notes", heading: "Visual notes" },
    { id: "collection-entry-editor", url: e => `/admin/collections/visual_notes/${e.entry}`, heading: "Edit Visual notes entry" },
    { id: "widget-editor", url: e => `/admin/widgets/${e.widget}`, heading: "Edit widget" },
    { id: "widget-regions", url: () => "/admin/widgets/regions", heading: "Widget Regions" },
    { id: "widget-region-editor", url: () => "/admin/widgets/regions/visual-sidebar", heading: "Region: visual-sidebar" },
    { id: "change-password", url: () => "/admin/users/change-password", heading: "Users" },
  ];
  for (const detail of details) {
    test(detail.id, async ({ page, adminSeed }) => {
      await page.goto(detail.url(adminSeed.entities));
      if (detail.id === "change-password") {
        // showModal makes the underlying Users page inert and removes its heading from
        // role queries. Assert the actual routed dialog instead of racing its open effect.
        await expect(page.getByRole("dialog", { name: "Reset password?", exact: true })).toBeVisible();
      } else {
        await expect(page.getByRole("heading", { name: detail.heading, exact: true })).toBeVisible();
      }
      await capture(page, `admin-${detail.id}.png`);
    });
  }
});

test.describe("assistant chat + Skills confirmation", () => {
  test("closed dock: FAB", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await expect(page.locator("button.chat-fab")).toBeVisible();
    await expect(page.locator(".admin-chat-dock")).toBeHidden();
    await capture(page, "assistant-closed-fab.png");
  });

  test("open empty dock", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await page.locator("button.chat-fab").click();
    await expect(page.locator(".admin-chat-dock")).toBeVisible();
    await expect(page.locator("textarea.jini-composer-input")).toHaveValue("");
    // Measure the rendered pane: a matching class/selector alone cannot prove flex sizing.
    await expect.poll(() => page.locator(".admin-chat-dock").evaluate(dock => {
      const pane = dock.querySelector(".admin-chat-dock-drop > .jini-chat-pane");
      if (!pane) return Number.POSITIVE_INFINITY;
      const bounds = pane.getBoundingClientRect();
      return Math.max(Math.abs(dock.clientWidth - bounds.width), Math.abs(dock.clientHeight - bounds.height));
    })).toBeLessThanOrEqual(1);
    await capture(page, "assistant-open-empty.png");
  });

  test("slash popup /sk and a selected skill", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await page.locator("button.chat-fab").click();
    const input = page.locator("textarea.jini-composer-input");
    await input.pressSequentially("/sk");
    const popup = page.locator("#jini-composer-slash-menu");
    await expect(popup).toBeVisible();
    const skill = popup.getByRole("option", { name: SKILL_NAME });
    await expect(skill).toBeVisible();
    await capture(page, "assistant-slash-sk.png");
    await skill.click();
    await expect(popup).toBeHidden();
    await expect(page.locator(".jini-attachment-chip", { hasText: `${SKILL_NAME} · Skill` })).toBeVisible();
    await expect(input).toHaveValue("");
    await capture(page, "assistant-skill-picked.png");
  });

  test("Skills install-confirm dialog", async ({ page }) => {
    await page.goto("/admin/skills");
    await expect(page.getByRole("list", { name: "Installed skills" })).toContainText(SKILL_NAME);
    await page.goto("/admin/skills?tab=add");
    await expect(page.getByRole("button", { name: "Upload files", exact: true })).toBeVisible();
    // Real local-file proposal opens the dialog, without fetching GitHub or installing again.
    await page.getByLabel("Choose skill files", { exact: true }).setInputFiles({
      name: "SKILL.md", mimeType: "text/markdown", buffer: Buffer.from(SKILL_MARKDOWN),
    });
    const dialog = page.getByRole("dialog", { name: "Install skill", exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Confirm install", exact: true })).toBeEnabled();
    await capture(page, "skills-install-confirm.png");
  });
});
});
