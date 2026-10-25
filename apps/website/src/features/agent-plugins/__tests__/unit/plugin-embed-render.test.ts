/** OPUS-REVIEW T1: actual host admission -> CMS HTML port -> Tovu structured substitution. */
import assert from "node:assert/strict";
import test from "node:test";
import { resolveHtmlPageEmbeds } from "@jini-ai/cms/widgets/html";
import { embedMarkerSnippetFromConfig, markersOfType } from "@jini-ai/cms/widgets/markers";
import { InMemoryEntryRepo } from "#src/features/entries/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import { buildWidgetHostPorts } from "#src/features/widgets/deps";
import { renderHtmlPageBody } from "#src/server/inbound/public-http/http/site/render";
import { config, definition, harness, owner, workspaceId } from "../fixtures/plugin-exports.js";

async function render(html: string, runtime = harness().runtime) {
  const port = runtime.forRender({ mode: "live" });
  const resolved = await resolveHtmlPageEmbeds({ deps: { host: buildWidgetHostPorts({ postRepo: new InMemoryPostRepo() }, {}), entryRepo: new InMemoryEntryRepo(), pluginExports: port }, input: { workspaceId, html } });
  return { html: renderHtmlPageBody(html, resolved), head: port.headHtml({}) };
}
function marker(overrides: Record<string, unknown> = {}) {
  return embedMarkerSnippetFromConfig({ config: { ...config, ...overrides } }).replace('></div>', '><p>Authored fallback</p></div>');
}

test("T1: two occurrences preserve classes/attributes and canonical host stamps, escaping props once", async () => {
  const first = marker({ props: { label: "O'Brien </div> {{host.secret}}" }, future: "ignored" })
    .replace("<div ", '<div id="author" class="site-button" style="--plugin-signin-bg: pink" aria-label="login" data-plugin="forged" data-component="forged" data-embed-v="99" data-consent-category="marketing" ');
  const result = await render(first + marker({ props: { label: "Second" } }));
  assert.match(result.html, /id="author"/);
  assert.match(result.html, /class="site-button"/);
  assert.match(result.html, /style="--plugin-signin-bg: pink"/);
  assert.match(result.html, /aria-label="login"/);
  assert.match(result.html, /data-plugin="tovu\/demo"/);
  assert.match(result.html, /data-component="button"/);
  assert.match(result.html, /data-embed-v="1"/);
  assert.match(result.html, /data-consent-category="functional"/);
  assert.doesNotMatch(result.html, /forged|data-embed-config|Authored fallback/);
  assert.match(result.html, /O'Brien &lt;\/div&gt; {{host.secret}}/);
  assert.match(result.html, />Second<\/span>/);
  assert.equal((result.head.match(/rel="stylesheet"/g) ?? []).length, 1);
  assert.deepEqual(markersOfType({ html: first, type: "plugin" })[0]?.config.props, { label: "O'Brien </div> {{host.secret}}" });
});

test("T1: declared plugin/component renames and default version work; undeclared names fall back", async () => {
  assert.match((await render(marker({ plugin: "tovu/old-demo", component: "old-button", version: undefined }))).html, /data-plugin="tovu\/demo"/);
  for (const override of [{ plugin: "tovu/guessed" }, { component: "guessed" }, { version: 4 }, { version: 0 }, { version: null }, { props: null }, { props: { label: false } }]) {
    const result = await render(marker(override));
    assert.match(result.html, /<p>Authored fallback<\/p>/);
    assert.doesNotMatch(result.html, /data-embed-config|plugin-demo-button/);
  }
});

test("T1: disabled, unavailable, retired and ambiguous contracts retain authored wrapper and fallback", async () => {
  const variants = [harness({ packages: [{ ...owner, enabled: false }] }), harness({ ready: false }),
    harness({ packages: [{ ...owner, exports: { button: { ...definition, minVersion: 2 } } }] }),
    harness({ packages: [owner, { ...owner, id: "tovu/other", renamedFrom: ["tovu/old-demo"] }] })];
  for (const variant of variants) {
    const result = await render(marker({ plugin: "tovu/old-demo" }).replace("<div ", '<div class="fallback-wrapper" '), variant.runtime);
    assert.match(result.html, /class="fallback-wrapper"/);
    assert.match(result.html, /<p>Authored fallback<\/p>/);
    assert.doesNotMatch(result.html, /data-embed-config|plugin-demo-button/);
  }
});

test("T1: host refusal, static template hrefs and template scripts cannot break a page", async () => {
  for (const html of ['<a href="/static">bad</a>', '<script>alert(1)</script>']) {
    const result = await render(marker(), harness({ template: html }).runtime);
    assert.match(result.html, /Authored fallback/);
    assert.doesNotMatch(result.html, /data-embed-config|<script/);
  }
});

test("T1: legacy widget/media/content HTML is byte-identical with the optional plugin port", async () => {
  const html = '<div data-embed-config=\'{"type":"widget","id":"missing"}\'></div><div data-embed-config=\'{"type":"media","id":"missing"}\'></div><div data-embed-config=\'{"type":"content","id":"missing"}\'></div>';
  const deps = { host: buildWidgetHostPorts({ postRepo: new InMemoryPostRepo() }, {}), entryRepo: new InMemoryEntryRepo() };
  const baseline = await resolveHtmlPageEmbeds({ deps, input: { workspaceId, html } });
  assert.equal((await render(html)).html, renderHtmlPageBody(html, baseline));
});

test("T1: host links require the same plugin's ready provider and workspace", async () => {
  const { createPluginExportRuntime } = await import("../../exports/runtime.js");
  const { source } = harness();
  const runtime = createPluginExportRuntime({ workspaceId, source,
    listProviders: async () => [{ id: "demo", pluginId: "other-plugin" } as import("#src/features/member-login/types").LoginProvider] });
  assert.match((await render(marker(), runtime)).html, /Authored fallback/);
  assert.equal(await runtime.forRender({ mode: "live" }).resolve({ workspaceId: "other-workspace", config }), undefined);
});

test("T1: export discovery projects contracts and ready snippets without host paths", async () => {
  const packages = [{ ...owner, exports: { button: { ...definition, props: { type: "object" as const, properties: {}, additionalProperties: false as const } } } }];
  const { runtime } = harness({ packages });
  const rows = await runtime.catalog({ workspaceId });
  const row = rows.get("demo")![0]!;
  assert.equal(row.availability, "ready");
  assert.equal(row.consent, "functional");
  assert.equal(row.version, 3);
  assert.deepEqual(markersOfType({ html: row.snippet!, type: "plugin" })[0]?.config,
    { type: "plugin", plugin: "tovu/demo", component: "button", version: 3, props: {} });
  assert.doesNotMatch(JSON.stringify([...rows]), /not-exposed|packageRoot|button.html/);
});

test("T1: canonical consent stamp reaches the existing consent gate around the complete embed", async () => {
  const { gateConsentHtml } = await import("@jini-ai/cms/consent/html");
  const rendered = await render(marker());
  const html = gateConsentHtml({ html: `<!doctype html><html><head></head><body>${rendered.html}</body></html>`,
    config: { enabled: true, regionMode: "auto", policyVersion: "1", privacyPolicyUrl: "/privacy", title: "Cookies", message: "Choose", acceptLabel: "Accept", rejectLabel: "Reject", preferencesLabel: "Preferences" },
    record: null, regionMode: "opt-in", gpc: false, endpoint: "/api/site-consent" });
  assert.match(html, /<template data-jini-consent-resource data-category="functional"><div[^>]*data-plugin="tovu\/demo"/);
});
