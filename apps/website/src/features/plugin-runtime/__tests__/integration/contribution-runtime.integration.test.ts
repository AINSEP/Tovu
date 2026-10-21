/** plugwire owner dispatch 2026-10-09: real discovery/seal/install/enable, HTTP, and ToolExecutor.
 * Uses DI auth ports for route policy matrix; the companion auth test uses real session owners. */
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express, { type RequestHandler } from 'express';
import { createToolRegistry } from '@jini-ai/core';
import { createToolExecutor } from '@jini-ai/daemon';
import { createPluginSourcePolicy, InMemoryPluginActivationRepo, pluginCapabilitySet, setPluginEnabled, type ExtensionClaim } from '@jini-ai/plugins/host';
import { composePluginRuntime } from '../../../../server/runtime/composition/plugin-runtime.js';
import { registerPluginContributionRoutes } from '../../../../server/inbound/public-http/routes/plugin-contributions.js';
import { parsePublicJsonBody } from '../../../../server/inbound/shared/json-body-parsers.js';
import { startTestServer } from '../../../../server/__tests__/helpers/http-test-server.js';
import { attachAssistantToolExtensions } from '../../../../assistant/installed-extension-tools.js';
import { registerInstalledExtensionTools } from '../../../../server/runtime/composition/installed-extension-tools.js';
import { TOVU_CORE_EXTENSION_CLAIMS } from '../../../../server/runtime/composition/core-extension-claims.js';
import { createTempSiteLayoutFixture } from '../../../../__tests__/fixtures/site-layout-context.js';
import { renderPluginWidgetPartials } from '../../widget-partials.js';
import { buildToolCatalogQuery } from '../../../../assistant/tool-catalog-query.js';
const workspaceId = 'site';
const clock = { nowMs: () => Date.parse('2026-10-09T00:00:00Z') };
const pluginId = 'site-sample';
const entry = (version: string) => `export default { definition: { setup(sdk) {
  for (const access of ['public','member','admin']) sdk.routes.add({ method:'POST', path:'/'+access, access,
    handler: async ({body,auth,sdk}) => ({body:{version:'${version}',body,auth,hasSdk:!!sdk.routes}}) });
  sdk.tools.add({ name:'echo', description:'Echo the sample site payload', inputSchema:{type:'object',properties:{message:{type:'string'}}}, handler:async ({input,auth})=>({version:'${version}',input,auth}) });
  sdk.addContribution({kind:'widget',value:{name:'site-sample-banner',render:()=>'<strong>${version}</strong>'}});
} } };`;
async function harness(t: TestContext, options: { coreClaims?: readonly ExtensionClaim[] } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'plugwire-')); t.after(() => rm(root, { recursive: true, force: true }));
  const activationRepo = new InMemoryPluginActivationRepo();
  const runtime = composePluginRuntime({ workspaceId, clock, activationRepo, sources: [], coreClaims: options.coreClaims ?? TOVU_CORE_EXTENSION_CLAIMS, installDir: path.join(root, 'plugins'), pluginSourcePolicy: createPluginSourcePolicy({ hosted: false, localInstallOptIn: false }) });
  const source = runtime.pluginSource; assert.ok(source);
  const registry = createToolRegistry({});
  const layouts = createTempSiteLayoutFixture({}); t.after(layouts.cleanup);
  const authorize = async () => ({ allowed: true, reason: 'matched' as const });
  const extensions = attachAssistantToolExtensions(registry, { ...layouts.deps, workspaceId, authorize,
    postRepo: {} as never, pluginActivationRepo: activationRepo, pluginContributions: runtime.pluginContributions,
    discoverPlugins: runtime.discoverPlugins, registerInstalled: registerInstalledExtensionTools,
    federation: { deps: { workspaceId, authorize }, resolveConnections: async () => [] },
  }, '[plugfix]');
  await extensions.installed;
  const catalog = buildToolCatalogQuery(registry);
  const deps = { workspaceId, pluginActivationRepo: activationRepo, pluginContributions: runtime.pluginContributions };
  const app = express(); app.use(parsePublicJsonBody);
  const guard = (access: 'member'|'admin'): RequestHandler => (req, res, next) => {
    if (req.get('x-test-access') !== access) { res.status(401).json({code:'UNAUTHENTICATED'}); return; }
    if (access === 'admin') res.locals.principal = {id:'operator'};
    else res.locals.pluginMemberId = 'member';
    next();
  };
  const routeErrors: Array<{ pluginId: string; error: unknown }> = [];
  registerPluginContributionRoutes({ app, deps, auth: { member: guard('member'), admin: guard('admin') } }, { onError: failure => { routeErrors.push(failure); } });
  const baseUrl = await startTestServer(app, t);
  // Models the owner's approval (admin toggle or confirmed card), which re-seals are compared against.
  const setEnabled = async (id = pluginId, enabled = true) => {
    const manifest = (await runtime.discoverPlugins()).find(record => record.id === id)?.manifest;
    if (enabled && manifest) await source.recordApproval({ id, capabilities: pluginCapabilitySet({ manifest }) });
    return setPluginEnabledNow(id, enabled);
  };
  const setPluginEnabledNow = async (id: string, enabled: boolean) => setPluginEnabled({ deps: { clock, repo: activationRepo, discovery: await runtime.discoverPlugins(), onEnabled: runtime.onPluginEnabled, onDisabled: runtime.onPluginDisabled }, input: { workspaceId, pluginId: id, enabled } });
  const author = async (id = pluginId, code = entry('first'), routeClaims = ['POST /public','POST /member','POST /admin']) => {
    await source.create({id,name:'Sample',description:'Site local sample'});
    const manifest = JSON.parse((await source.read({id,path:'jini.plugin.json'})).content);
    await source.write({id,path:'jini.plugin.json',content:JSON.stringify({...manifest,capabilities:['http.route.register','tools.register','render.contribute'],contributes:{routes:routeClaims,tools:['echo'],widgets:[`${id}-banner`]}})});
    await source.write({id,path:'server/index.mjs',content:code.replaceAll('site-sample-banner', `${id}-banner`)});
    return source.seal({id});
  };
  const request = (access: string, authenticated?: string, body = JSON.stringify({message:'hello'}), type = 'application/json') => fetch(`${baseUrl}/api/p/${pluginId}/${access}`, { method:'POST', headers:{'content-type':type,...(authenticated ? {'x-test-access':authenticated}: {})},body });
  const executor = createToolExecutor({registry},{delegate:{onConfirm:()=> assert.fail('Plugin tools must execute directly')}});
  const tool = () => executor.execute({principal:{id:'owner'},run:{id:'run'},toolId:'p_site_sample__echo',input:{message:'hello'}});
  return {root,runtime,source,registry,catalog,request,author,setEnabled,tool,baseUrl,activationRepo,routeErrors};
}
test('site-local source is discovered only after seal/install; enable publishes a namespaced route and assistant tool', async t => {
  const h = await harness(t);
  assert.equal((await h.runtime.discoverPlugins()).length,0);
  assert.equal((await h.request('public')).status,404);
  await h.author();
  assert.equal((await h.runtime.discoverPlugins())[0]?.id,pluginId);
  assert.equal(h.registry.has({toolId:'p_site_sample__echo'}),false);
  await h.setEnabled();
  const response = await h.request('public'); assert.equal(response.status,200);
  const value = await response.json(); assert.equal(value.version,'first'); assert.deepEqual(value.body,{message:'hello'}); assert.equal(value.hasSdk,true);
  assert.equal((await fetch(`${h.baseUrl}/public`,{method:'POST'})).status,404);
  assert.ok(h.catalog.describe({id:'p_site_sample__echo'}));
  const result = await h.tool(); assert.equal(result.status,'completed'); assert.equal((result.output as {version:string}).version,'first');
});
test('host enforces public/member/admin independently and caps JSON, text and form bodies', async t => {
  const h = await harness(t); await h.author(); await h.setEnabled();
  assert.equal((await h.request('public')).status,200);
  for (const access of ['member','admin']) {
    assert.equal((await h.request(access)).status,401);
    assert.equal((await h.request(access,access === 'member'?'admin':'member')).status,401);
    const response = await h.request(access,access); assert.equal(response.status,200);
    assert.equal((await response.json()).auth.access,access);
  }
  for (const [body,type] of [[JSON.stringify({large:'x'.repeat(140000)}),'application/json'],['x'.repeat(140000),'text/plain'],['large='+ 'x'.repeat(140000),'application/x-www-form-urlencoded'],['x'.repeat(140000),'application/octet-stream']]) {
    const response = await h.request('public',undefined,body,type); assert.equal(response.status,413);
    assert.equal((await response.json()).code,'PAYLOAD_TOO_LARGE');
  }
  assert.equal((await h.request('admin','admin',JSON.stringify({large:'x'.repeat(140000)}))).status,413);
  assert.equal((await h.request('public',undefined,'{')).status,400);
});
test('reload replaces route/tool/widget generations; disable removes catalog and handlers without a restart', async t => {
  const h = await harness(t); await h.author(); await h.setEnabled();
  const markup = '<div data-embed-config=\'{"type":"partial","id":"site-sample-banner"}\'></div>';
  const render = () => renderPluginWidgetPartials({html:markup,workspaceId,contributions:h.runtime.pluginContributions,activationRepo:h.activationRepo});
  assert.match(await render(),/<strong>first<\/strong>/);
  await h.source.write({id:pluginId,path:'server/index.mjs',content:entry('second')});
  const sealed = await h.source.seal({id:pluginId}); assert.equal(sealed.reloaded,true);
  assert.equal((await (await h.request('public')).json()).version,'second');
  assert.equal(((await h.tool()).output as {version:string}).version,'second');
  assert.match(await render(),/<strong>second<\/strong>/);
  await h.setEnabled(pluginId,false);
  assert.equal((await h.request('public')).status,404);
  assert.equal(h.registry.has({toolId:'p_site_sample__echo'}),false);
  assert.equal(h.catalog.describe({id:'p_site_sample__echo'}),null);
  assert.doesNotMatch(await render(),/<strong>/);
  await h.setEnabled(); assert.ok(h.catalog.describe({id:'p_site_sample__echo'}));
});
test('a partial marker that names no partial id is left untouched, even with a partial-contributing plugin enabled', async t => {
  const h = await harness(t); await h.author(); await h.setEnabled();
  const markup = '<div data-embed-config=\'{"type":"partial"}\'></div>';
  assert.equal(await renderPluginWidgetPartials({ html: markup, workspaceId, contributions: h.runtime.pluginContributions, activationRepo: h.activationRepo }), markup);
});
test('claim collision refuses activation before publishing any candidate handler', async t => {
  const h = await harness(t, { coreClaims: [{ kind: 'route', key: 'POST /api/p/site-other/public', mode: 'exclusive' }] }); await h.author(); await h.setEnabled();
  await h.author('site-other');
  await assert.rejects(()=>h.setEnabled('site-other'), error => {
    assert.match((error as Error).message, /route 'POST \/api\/p\/site-other\/public'/);
    assert.doesNotMatch((error as Error).message, /tool '|widget '/);
    return true;
  });
  assert.equal(h.runtime.pluginContributions.list({}).length,1);
  assert.equal((await (await h.request('public')).json()).version,'first');
});

test('two plugins can declare the same local route and tool names and both reach the assistant catalog', async t => {
  const h = await harness(t); await h.author(); await h.setEnabled();
  await h.author('site-other', entry('other')); await h.setEnabled('site-other');
  assert.ok(h.catalog.describe({ id: 'p_site_sample__echo' }));
  assert.ok(h.catalog.describe({ id: 'p_site_other__echo' }));
  assert.equal((await (await fetch(`${h.baseUrl}/api/p/site-other/public`, { method: 'POST' })).json()).version, 'other');
  assert.equal((await (await h.request('public')).json()).version, 'first');
});

test('failed replacement restores working routes, tools and widgets without disabling the plugin', async t => {
  const h = await harness(t); await h.author(); await h.setEnabled();
  await h.source.write({ id: pluginId, path: 'server/index.mjs', content: 'export default {};' });
  const result = await h.source.seal({ id: pluginId });
  assert.equal(result.installed, true); assert.equal(result.reloaded, false); assert.match(result.reloadError ?? '', /PLUGIN_EXPORT_INVALID/);
  assert.equal((await h.activationRepo.getActivation({ workspaceId, pluginId }))?.enabled, true);
  assert.equal(h.runtime.pluginLoadedVersion({ id: pluginId }), '0.1.0');
  assert.equal((await (await h.request('public')).json()).version, 'first');
  assert.equal(((await h.tool()).output as { version: string }).version, 'first');
  const html = await renderPluginWidgetPartials({ html: '<div data-embed-config=\'{"type":"partial","id":"site-sample-banner"}\'></div>', workspaceId, contributions: h.runtime.pluginContributions, activationRepo: h.activationRepo });
  assert.match(html, /<strong>first<\/strong>/);
});

test('undefined route results are 204; failures are logged with plugin id and redacted publicly', async t => {
  const h = await harness(t);
  const code = entry('first').replace("handler: async ({body,auth,sdk}) => ({body:{version:'first',body,auth,hasSdk:!!sdk.routes}})", "handler: async ({body}) => { if (body?.fail) throw new Error('private server detail'); }");
  await h.author(pluginId, code); await h.setEnabled();
  const empty = await h.request('public'); assert.equal(empty.status, 204); assert.equal(await empty.text(), '');
  const failed = await h.request('public', undefined, JSON.stringify({ fail: true }));
  assert.equal(failed.status, 500); assert.deepEqual(await failed.json(), { code: 'PLUGIN_ROUTE_FAILED' });
  assert.equal(h.routeErrors.length, 1); assert.equal(h.routeErrors[0]?.pluginId, pluginId);
  assert.match(String(h.routeErrors[0]?.error), /private server detail/);
});

test('setup failure cannot publish a partial route or tool generation', async t => {
  const h = await harness(t);
  await h.author(pluginId,entry('failed').replace("sdk.addContribution", "throw new Error('setup failed'); sdk.addContribution"));
  await assert.rejects(()=>h.setEnabled(),/failed to load/);
  assert.equal(h.runtime.pluginContributions.list({}).length,0);
  assert.equal((await h.request('public')).status,404);
  assert.equal(h.catalog.describe({id:'p_site_sample__echo'}),null);
});
