import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { contentKernel } from "#src/platform/db/content-kernel";
import { openContentDb } from "#src/platform/db/sqlite/content-db";

/**
 * @file `wireFormsAndSearch`'s boot-time widget adoption log (one line per adopted legacy widget,
 * or one error line when adoption fails, never a rejected boot tail) and the late ports it hands
 * to forms and site search: form destination registries load with the lifecycle's contributions,
 * credentials resolve by label from the composed repo/sealer, and member context resolves over the
 * route deps' member repos. Every collaborator factory is a recorder; the unit's own closures are real.
 */

const handed: Record<string, Record<string, unknown>> = {};
let adoption: () => Promise<{ adopted: Array<{ id: string; title: string }> }> = async () => ({ adopted: [] });
const registryLoads: unknown[][] = [];
const credentialLookups: unknown[][] = [];
const resolvers: Array<{ deps: unknown; inputs: unknown[] }> = [];
const record = (name: string, result: unknown = {}) => (required: Record<string, unknown>) => { handed[name] = required; return result; };

const widgets = await import("@jini-ai/cms/widgets");
mock.module("@jini-ai/cms/widgets", { namedExports: { ...widgets, adoptLegacyTrashedWidgets: () => adoption() } });
mock.module("#src/features/widgets/deps", { namedExports: { buildWidgetsDeps: () => ({ widgets: "deps" }) } });
mock.module("#src/server/runtime/composition/form-submissions", { namedExports: { composeFormSubmissions: record("formSubmissions", { destination: "d", pull: "p", autoPull: "a" }) } });
mock.module("#src/server/runtime/composition/form-delivery-deliverer", { namedExports: { composeFormDeliveryDeliverer: record("deliverer") } });
mock.module("#src/server/runtime/composition/form-delivery", { namedExports: { composeFormDelivery: record("formDelivery") } });
const siteSearch = await import("../../modules/site-search.js");
mock.module(new URL("../../modules/site-search.js", import.meta.url).href, { namedExports: { ...siteSearch,
  bindSiteSearchPorts: (ports: Record<string, unknown>) => { handed.searchPorts = ports; return ports; }, createSiteSearchRuntime: () => ({ search: "runtime" }) } });
const registry = await import("#src/features/form-destinations/registry");
mock.module("#src/features/form-destinations/registry", { namedExports: { ...registry,
  loadFormDestinationRegistry: (...args: unknown[]) => { registryLoads.push(args); return Promise.resolve({ registry: registryLoads.length }); } } });
const credentials = await import("#src/features/custom-credentials/index");
mock.module("#src/features/custom-credentials/index", { namedExports: { ...credentials,
  resolveCustomCredentialByLabel: (...args: unknown[]) => { credentialLookups.push(args); return Promise.resolve({ secret: "cred-a" }); } } });
const access = await import("@jini-ai/user-management/members/access-resolver");
mock.module("@jini-ai/user-management/members/access-resolver", { namedExports: { ...access,
  DefaultMemberAccessResolver: class { private readonly entry: (typeof resolvers)[number]; constructor(deps: unknown) { this.entry = { deps, inputs: [] }; resolvers.push(this.entry); }
    resolveContext(input: unknown) { this.entry.inputs.push(input); return Promise.resolve({ member: "ctx" }); } } } });
const { wireFormsAndSearch } = await import("../after-assembly-forms-search.js");

const lifecycle = { loadPluginContributions: async () => [], resolveAgentPluginActivation: async () => ({ verdict: "active" }) };
const customCredentialSetRepo = { repo: "credentials" };
const siteAssistantSecretSealer = { sealer: "site" };

function wire() {
  const logs: Array<{ level: string; message: string }> = [];
  const routeDeps: Record<string, unknown> = { formDefinitionRepo: {}, formSubmissionRepo: {}, memberSessionRepo: { s: 1 }, memberSubscriptionRepo: { s: 2 }, memberTierRepo: { s: 3 } };
  const result = wireFormsAndSearch({
    siteTitleReady: Promise.resolve(), menuBindingsReady: Promise.reject(new Error("menus")), mediaTransformReady: Promise.resolve(),
    routeDeps, workspaceId: "site-7", kernel: contentKernel({ store: openContentDb(":memory:") }), outbox: {}, bus: {}, clock: { nowMs: () => 7 }, idGen: {},
    customCredentialSetRepo, siteAssistantSecretSealer, siteAssistantSecretKeyring: {}, agentPluginLifecycle: lifecycle, settingsRepo: {},
    observability: undefined, formDeliveryRepo: {}, agentPluginConnections: { apiConnections: {} }, identity: { authorize: async () => ({ allowed: true }) },
    settingsPrincipals: {}, agentPluginLayout: { forWorkspace: () => ({ root: "/roots/site-7" }) },
    consoleLogger: { info: ({ message }: { message: string }) => logs.push({ level: "info", message }), error: ({ message }: { message: string }) => logs.push({ level: "error", message }) },
  } as unknown as Parameters<typeof wireFormsAndSearch>[0]);
  return { result, logs, routeDeps };
}

test("each adopted legacy widget is logged once, after every boot writer settled (even a failed one)", async () => {
  adoption = async () => ({ adopted: [{ id: "w-1", title: "Old menu" }, { id: "w-2", title: "Old text" }] });
  const { result, logs, routeDeps } = wire();
  assert.equal(routeDeps.legacyPublishCredentialsReady, result.widgetAdoptionReady);
  await result.widgetAdoptionReady;
  assert.deepEqual(logs, [
    { level: "info", message: `[trash] moved legacy deleted widget 'w-1' ("Old menu") to the Trash` },
    { level: "info", message: `[trash] moved legacy deleted widget 'w-2' ("Old text") to the Trash` },
  ]);
});

test("a widget adoption failure is logged as one error and the boot tail still settles", async () => {
  adoption = async () => { throw new Error("widgets table locked"); };
  const { result, logs } = wire();
  assert.equal(await result.widgetAdoptionReady, undefined);
  assert.deepEqual(logs, [{ level: "error", message: "adoptLegacyTrashedWidgets failed at boot: widgets table locked" }]);
});

test("form destination registries load for the asking workspace with the lifecycle's plugin contributions", async () => {
  adoption = async () => ({ adopted: [] });
  wire();
  registryLoads.length = 0;
  const loadFormDestinations = handed.formSubmissions?.loadFormDestinations as (required: { workspaceId: string }) => Promise<unknown>;
  const loadRegistry = handed.deliverer?.loadRegistry as (required: { workspaceId: string }) => Promise<unknown>;
  assert.deepEqual(await loadFormDestinations({ workspaceId: "site-8" }), { registry: 1 });
  assert.deepEqual(await loadRegistry({ workspaceId: "site-9" }), { registry: 2 });
  assert.deepEqual(registryLoads, [
    [{ workspaceId: "site-8" }, { loadContributions: lifecycle.loadPluginContributions }],
    [{ workspaceId: "site-9" }, { loadContributions: lifecycle.loadPluginContributions }],
  ]);
});

test("site search resolves credentials by label from the composed repo and member context over the route deps' member repos", async () => {
  const { routeDeps } = wire();
  credentialLookups.length = 0;
  resolvers.length = 0;
  const ports = handed.searchPorts as { resolveCredentialByLabel: (input: unknown) => Promise<unknown>; resolveMemberContext: (input: unknown) => Promise<unknown> };
  assert.deepEqual(await ports.resolveCredentialByLabel({ label: "Search — Algolia" }), { secret: "cred-a" });
  assert.deepEqual(credentialLookups, [[{ repo: customCredentialSetRepo, sealer: siteAssistantSecretSealer }, { label: "Search — Algolia" }]]);
  routeDeps.memberSessionRepo = { s: "late" };
  assert.deepEqual(await ports.resolveMemberContext({ sessionToken: "tok-a" }), { member: "ctx" });
  assert.deepEqual(resolvers, [{ deps: { sessions: { s: "late" }, subscriptions: { s: 2 }, tiers: { s: 3 } }, inputs: [{ sessionToken: "tok-a" }] }]);
});
