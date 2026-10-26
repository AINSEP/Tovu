/** Tovu-specific admission and member-login host data for Jini's HTML plugin-export port. */
import { escapeHtml } from "@jini-ai/core/text";
import { embedMarkerSnippetFromConfig, markersOfType } from "@jini-ai/cms/widgets/markers";
import type { PluginExportsPort, PluginExportTemplate } from "@jini-ai/cms/widgets/html";
import type { LoginProvider } from "../../member-login/types.js";
import { MEMBER_OIDC_PATH } from "#src/features/member-login/public-path";
import { checkPluginExportConfig, selectPluginExport, PluginEmbedValidationError, type PluginEmbedDiagnostic, type SelectedPluginExport } from "./diagnostics.js";
import { pluginExportFileUrl, type PluginExportPackage, type PluginExportSource } from "./source.js";

export interface PluginExportRenderSession extends PluginExportsPort {
  headHtml(required: Record<string, never>, options?: Record<string, never>): string;
}
export interface PluginExportCatalogRow {
  readonly plugin: string;
  readonly component: string;
  readonly version: number;
  readonly minVersion: number;
  readonly props: SelectedPluginExport["definition"]["props"];
  readonly consent: SelectedPluginExport["definition"]["consent"];
  readonly availability: string;
  readonly snippet: string | null;
}
export interface PluginExportRuntime {
  forRender(required: { mode: "live" | "static" }, options?: Record<string, never>): PluginExportRenderSession;
  validateHtml(required: { workspaceId: string; html: string }, options?: Record<string, never>): Promise<readonly PluginEmbedDiagnostic[]>;
  catalog(required: { workspaceId: string }, options?: Record<string, never>): Promise<ReadonlyMap<string, readonly PluginExportCatalogRow[]>>;
}
interface RuntimeDeps {
  readonly workspaceId: string;
  readonly source: PluginExportSource;
  readonly listProviders: (input: { workspaceId: string }) => Promise<readonly LoginProvider[]>;
}

/** Each host link must belong to this plugin's ready provider, not merely share a provider id.
 * @complexity O(l*p) declared links and ready providers; provider admission is loaded once per session.
 */
async function publicHost(required: { selected: SelectedPluginExport; deps: RuntimeDeps; providers: Promise<readonly LoginProvider[]> }, _options = {}): Promise<Readonly<Record<string, unknown>> | undefined> {
  const { owner, component, definition } = required.selected;
  const host: Record<string, unknown> = {};
  const links = Object.entries(definition.hostLinks ?? {});
  const providers = links.length ? await required.providers : [];
  for (const [slot, capability] of links) {
    if (!capability.startsWith("member-login:")) return undefined;
    const providerId = capability.slice("member-login:".length);
    if (!providers.some(provider => provider.id === providerId && provider.pluginId === owner.plugin.pluginId)) return undefined;
    host[slot] = MEMBER_OIDC_PATH.replace(":workspaceId", encodeURIComponent(required.deps.workspaceId)).replace(":providerId", encodeURIComponent(providerId)) + "/start";
  }
  host.assets = Object.fromEntries(Object.entries(definition.assets ?? {}).map(([name, filename]) => [name,
    pluginExportFileUrl({ pluginId: owner.plugin.pluginId, component, filename })]));
  return host;
}

/** Link only declared, admitted resources. A static fallback still ships its themeable CSS/artwork.
 * @complexity O(a) assets; Map keys deduplicate across repeated occurrences without global state.
 */
function collectHead(required: { selected: SelectedPluginExport; mode: "live" | "static"; head: Map<string, string> }, _options = {}): void {
  const { owner, component, definition } = required.selected;
  const urlFor = (filename: string) => escapeHtml({ text: pluginExportFileUrl({ pluginId: owner.plugin.pluginId, component, filename }) });
  if (definition.styles) required.head.set(`${owner.id}:${definition.styles}`, `<link rel="stylesheet" href="${urlFor(definition.styles)}">`);
  if (required.mode !== "static") return;
  for (const filename of Object.values(definition.assets ?? {})) {
    const url = urlFor(filename);
    required.head.set(url, `<link rel="preload" as="image" href="${url}">`);
  }
}

/** Resolve one occurrence; CMS alone fills/validates HTML and stamps its preserved wrapper.
 * @complexity O(p + e + props) catalog selection and schema check, plus one contained template read.
 */
async function resolveExport(required: {
  config: Readonly<Record<string, unknown>>; deps: RuntimeDeps; packages: Promise<readonly PluginExportPackage[]>;
  providers: Promise<readonly LoginProvider[]>; mode: "live" | "static"; head: Map<string, string>;
}, _options = {}): Promise<PluginExportTemplate | undefined> {
  const selection = selectPluginExport({ packages: await required.packages, config: required.config });
  if (!("selected" in selection)) return undefined;
  const { selected } = selection;
  if (checkPluginExportConfig({ selected, config: required.config })) return undefined;
  collectHead({ selected, mode: required.mode, head: required.head });
  if (required.mode === "static" && selected.definition.staticExport === "fallback-only") return undefined;
  const host = await publicHost({ selected, deps: required.deps, providers: required.providers });
  if (!host) return undefined;
  return { plugin: selected.owner.id, component: selected.component, version: selected.definition.version,
    minVersion: selected.definition.minVersion, consent: selected.definition.consent,
    template: await required.deps.source.readFile({ plugin: selected.owner.plugin, filename: selected.definition.template }),
    props: (required.config.props === undefined ? {} : required.config.props) as Readonly<Record<string, unknown>>, host };
}

/** Validate known enabled contracts before the single HTML writer mutates anything. Unknown,
 * disabled and unsupported contracts remain savable with safe editor warnings. O(markers + schemas).
 */
async function validateHtml(required: { input: { workspaceId: string; html: string }; deps: RuntimeDeps }, _options = {}): Promise<readonly PluginEmbedDiagnostic[]> {
  if (required.input.workspaceId !== required.deps.workspaceId) throw new PluginEmbedValidationError({ message: "Plugin embed workspace does not match this site." });
  const markers = markersOfType({ html: required.input.html, type: "plugin" });
  if (!markers.length) return [];
  const packages = await required.deps.source.list({ workspaceId: required.input.workspaceId }).catch(() => []);
  const providers = required.deps.listProviders({ workspaceId: required.input.workspaceId }).catch(() => []);
  const warnings: PluginEmbedDiagnostic[] = [];
  for (const marker of markers) {
    const diagnostic = await editorDiagnostic({ packages, config: marker.config, deps: required.deps, providers });
    if (diagnostic?.code === "PLUGIN_EMBED_INVALID_PROPS") throw new PluginEmbedValidationError({ message: diagnostic.message });
    if (diagnostic) warnings.push(diagnostic);
  }
  return warnings;
}

/** The same safe refusal reasons drive editor warnings; provider readiness never opens secrets. */
async function editorDiagnostic(required: { packages: readonly PluginExportPackage[]; config: Readonly<Record<string, unknown>>; deps: RuntimeDeps; providers: Promise<readonly LoginProvider[]> }, _options = {}): Promise<PluginEmbedDiagnostic | undefined> {
  const selection = selectPluginExport(required);
  if ("diagnostic" in selection) return selection.diagnostic;
  const diagnostic = checkPluginExportConfig({ selected: selection.selected, config: required.config });
  if (diagnostic) return diagnostic;
  const host = await publicHost({ selected: selection.selected, deps: required.deps, providers: required.providers });
  return host ? undefined : { code: "PLUGIN_HOST_UNAVAILABLE", message: "Plugin sign-in is not configured or unavailable; visitors see your fallback." };
}

/** Catalog rows expose contracts and snippets, never templates, secrets or local file paths.
 * O(exports * providers), no extra file reads per row beyond the shared catalog load.
 */
async function catalogRows(required: { packages: readonly PluginExportPackage[]; deps: RuntimeDeps }, _options = {}): Promise<ReadonlyMap<string, readonly PluginExportCatalogRow[]>> {
  const rows = new Map<string, readonly PluginExportCatalogRow[]>();
  const providers = required.deps.listProviders({ workspaceId: required.deps.workspaceId }).catch(() => []);
  for (const owner of required.packages) {
    const exports: PluginExportCatalogRow[] = [];
    for (const [component, definition] of Object.entries(owner.exports)) {
      const config = { type: "plugin", plugin: owner.id, component, version: definition.version, props: {} };
      const selection = selectPluginExport({ packages: required.packages, config });
      const selected = { owner, component, definition };
      const availability = await catalogAvailability({ selection, selected, config, providers, deps: required.deps });
      exports.push({ plugin: owner.id, component, version: definition.version, minVersion: definition.minVersion ?? 1, props: definition.props,
        consent: definition.consent, availability, snippet: availability === "ready" ? embedMarkerSnippetFromConfig({ config }) : null });
    }
    rows.set(owner.plugin.pluginId, exports);
  }
  return rows;
}

/** Distinguish props that the author must fill from host readiness; fixed public diagnostics. */
async function catalogAvailability(required: {
  selection: ReturnType<typeof selectPluginExport>; selected: SelectedPluginExport; config: Readonly<Record<string, unknown>>;
  providers: Promise<readonly LoginProvider[]>; deps: RuntimeDeps;
}, _options = {}): Promise<string> {
  if ("diagnostic" in required.selection) return required.selection.diagnostic.code;
  if (!await publicHost(required)) return "host-unavailable";
  return checkPluginExportConfig({ selected: required.selected, config: required.config }) ? "props-required" : "ready";
}

/** Bind to one site. Request-local memoization shares catalog/readiness across occurrences; a new
 * request observes plugin toggles. Static full/link-only exports use the same script-free template.
 * @complexity O(1) construction; work is deferred to the bounded CMS occurrence pass.
 */
export function createPluginExportRuntime(required: RuntimeDeps, _options = {}): PluginExportRuntime {
  return {
    forRender: ({ mode }, _options = {}) => {
      let packages: Promise<readonly PluginExportPackage[]> | undefined;
      let providers: Promise<readonly LoginProvider[]> | undefined;
      const head = new Map<string, string>();
      return {
        resolve: async ({ config, workspaceId }, _options = {}) => {
          if (workspaceId !== required.workspaceId) return undefined;
          packages ??= required.source.list({ workspaceId });
          // Readiness failures are a public fallback, never an unhandled rejected lazy promise.
          providers ??= required.listProviders({ workspaceId }).catch(() => []);
          return resolveExport({ config, deps: required, packages, providers, mode, head });
        },
        headHtml: (_input, _options = {}) => [...head.values()].join("\n"),
      };
    },
    validateHtml: (input, _options = {}) => validateHtml({ input, deps: required }),
    catalog: async ({ workspaceId }, _options = {}) => workspaceId === required.workspaceId
      ? catalogRows({ packages: await required.source.list({ workspaceId }), deps: required }) : new Map(),
  };
}
