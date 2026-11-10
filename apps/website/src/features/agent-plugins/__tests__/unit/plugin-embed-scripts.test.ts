/** Declared plugin JavaScript and external hosts: what a page loads, when, and what its policy names. */
import assert from "node:assert/strict";
import test from "node:test";
import type { AgentPluginExport } from "@jini-ai/agent-plugins/manifest";
import { resolveHtmlPageEmbeds } from "@jini-ai/cms/widgets/html";
import { embedMarkerSnippetFromConfig } from "@jini-ai/cms/widgets/markers";
import { InMemoryEntryRepo } from "#src/features/entries/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import { buildWidgetHostPorts } from "#src/features/widgets/deps";
import { renderHtmlPageBody } from "#src/server/inbound/public-http/http/site/render";
import { createPluginExportRuntime } from "../../exports/runtime.js";
import { owner, workspaceId } from "../fixtures/plugin-exports.js";

const URL_PROP = "https://book.vendor.test/me/30min";
const script = "/api/agent-plugin-exports/v1/demo/cal/components/cal.js";
const definition: AgentPluginExport = {
  template: "components/cal.html", version: 1, consent: "functional", staticExport: "full", urlProps: ["url"],
  props: { type: "object", properties: { url: { type: "string" } }, required: ["url"], additionalProperties: false },
  scripts: ["components/cal.js", "https://assets.vendor.test/loader.js"],
  externalHosts: { script: ["https://assets.vendor.test"], frame: ["https://book.vendor.test"], connect: ["https://api.vendor.test"] },
};
const template = '<div data-booking="{{props.url}}"><iframe src="{{props.url}}" title="Book"></iframe></div>';
const marker = embedMarkerSnippetFromConfig({ config: { type: "plugin", plugin: owner.id, component: "cal", version: 1, props: { url: URL_PROP } } }).replace("></div>", "><a href=\"/x\">Fallback</a></div>");

function runtimeFor(change: Partial<AgentPluginExport> = {}, options: { consentOff?: boolean } = {}) {
  const pkg = { ...owner, exports: { cal: { ...definition, ...change } } };
  return createPluginExportRuntime({ workspaceId, listProviders: async () => [], embedConsentOff: () => options.consentOff === true,
    source: { list: async () => [pkg], readFile: async () => template, readAsset: async () => "" } });
}

async function render(runtime: ReturnType<typeof runtimeFor>, mode: "live" | "static" = "live") {
  const port = runtime.forRender({ mode });
  const resolved = await resolveHtmlPageEmbeds({ deps: { host: buildWidgetHostPorts({ postRepo: new InMemoryPostRepo() }, {}), entryRepo: new InMemoryEntryRepo(), pluginExports: port }, input: { workspaceId, html: marker } });
  return { html: renderHtmlPageBody(marker, resolved), head: port.headHtml({}), hosts: port.declaredHosts({}) };
}

test("a consent-gated export holds its scripts and frame for the consent client", async () => {
  for (const mode of ["live", "static"] as const) {
    const { html, head } = await render(runtimeFor(), mode);
    assert.ok(head.includes(`<script type="text/plain" data-consent-category="functional" data-src="${script}"></script>`), head);
    assert.ok(head.includes('<script type="text/plain" data-consent-category="functional" data-src="https://assets.vendor.test/loader.js"></script>'), head);
    assert.match(html, new RegExp(`<iframe data-src="${URL_PROP}"`));
    assert.doesNotMatch(html, /<iframe[^>]* src=/);
    assert.match(html, /data-jini-consent="\[&quot;functional&quot;\]"/);
    assert.match(html, /data-booking="https:\/\/book\.vendor\.test\/me\/30min"/);
  }
});

test("with consent off, or a necessary export, scripts and frame load directly in order", async () => {
  for (const runtime of [runtimeFor({}, { consentOff: true }), runtimeFor({ consent: "necessary" })]) {
    const { html, head } = await render(runtime);
    assert.ok(head.indexOf(`<script src="${script}" defer></script>`) >= 0, head);
    assert.ok(head.indexOf(`<script src="${script}"`) < head.indexOf('src="https://assets.vendor.test/loader.js"'), head);
    assert.doesNotMatch(head, /text\/plain/);
    assert.match(html, new RegExp(`<iframe src="${URL_PROP}"`));
  }
});

test("a static copy runs scripts only for a full export", async () => {
  for (const staticExport of ["fallback-only", "link-only"] as const) {
    const { head } = await render(runtimeFor({ staticExport }), "static");
    assert.doesNotMatch(head, /script/);
  }
});

test("a page declares exactly the hosts of the exports it shows", async () => {
  const { hosts } = await render(runtimeFor());
  assert.deepEqual(hosts, { script: ["https://assets.vendor.test"], frame: ["https://book.vendor.test"], connect: ["https://api.vendor.test"] });
  const untouched = runtimeFor().forRender({ mode: "live" });
  assert.deepEqual(untouched.declaredHosts({}), { script: [], frame: [], connect: [] });
});

test("the site-wide hosts cover every enabled export, and no disabled one", async () => {
  assert.deepEqual((await runtimeFor().declaredHosts({ workspaceId })).frame, ["https://book.vendor.test"]);
  const off = createPluginExportRuntime({ workspaceId, listProviders: async () => [],
    source: { list: async () => [{ ...owner, enabled: false, exports: { cal: definition } }], readFile: async () => template, readAsset: async () => "" } });
  assert.deepEqual(await off.declaredHosts({ workspaceId }), { script: [], frame: [], connect: [] });
});

test("an invalid booking link never reaches the page", async () => {
  const runtime = runtimeFor();
  await assert.rejects(runtime.validateHtml({ workspaceId, html: marker.replace(URL_PROP, "https://evil.test/me") }), /must be an https link to a page on https:\/\/book\.vendor\.test/);
});
