import '../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createToolRegistry, type ToolRegistration, type ToolExecutionContext } from '@jini-ai/core';
import { createToolExecutor } from '@jini-ai/daemon';
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { applyToolApprovalPolicy, approvalClassFor } from '../tool-approval-policy.js';
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";
import { directPageAction } from '../assistant-tool-approval-policy.js';


const ctx = (input: unknown = {}): ToolExecutionContext => ({executionId:'exec',principal:{id:'owner'},run:{id:'run'},input,signal:new AbortController().signal});
function fixture(id: string, options: Parameters<typeof applyToolApprovalPolicy>[1] = {}, descriptor: Partial<ToolRegistration['descriptor']> = {}) {
  let calls = 0; let executed: unknown;
  const registration: ToolRegistration = {descriptor:{id,description:id,inputSchema:{type:'object'},...descriptor},policy:{authorize:()=> 'allow'},handler:async context=>{calls++; executed=context.input; return {changed:true};}};
  const surfaces = {surfaceExchanges:createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" })};
  const registry = createToolRegistry({});
  registry.register(applyToolApprovalPolicy({registration,surfaces},options));
  return {surfaces,executor:createToolExecutor({registry}),calls:()=>calls,executed:()=>executed};
}
test('unclassified registration fails closed, regardless of readOnly hint', () => {
  assert.throws(()=>fixture('new_unclassified_tool'), /has no approval classification/);
});
test('ordinary edits and draft creation run without an approval channel', async()=> {
  for (const id of ['media_update_metadata','theme_write_file','content_post_create']) {
    const f=fixture(id);
    const result=await f.executor.execute({toolId:id,principal:{id:'owner'},run:{id:'run'},input:{title:'Draft'}});
    assert.equal(result.status,'completed'); assert.equal(f.calls(),1);
  }
});
// Owner rule 2026-10-08: a site import asked once per page ("Confirm action?" for every
// content_post_create with status published). Publishing on this site, trashing and moderation are
// reversible, so they run; only permanent deletes and actions that leave this site still ask.
test('publishing on this site through status is an ordinary reversible edit',()=>{
  assert.equal(approvalClassFor({toolId:'content_post_update',input:{title:'New title'}}),'edit');
  assert.equal(approvalClassFor({toolId:'content_post_update',input:{status:'draft'}}),'edit');
  assert.equal(approvalClassFor({toolId:'content_post_create',input:{status:'published'}}),'edit');
  assert.equal(approvalClassFor({toolId:'content_post_update',input:{publishAt:'2027-01-01T00:00:00Z'}}),'edit');
  assert.equal(approvalClassFor({toolId:'content_duplicate',input:{overrides:{status:'published'}}}),'edit');
});
test('reversible writes (publish on this site, trash, moderation) run without an approval channel',async()=>{
  const calls:[string,unknown][]=[
    ['content_post_create',{kind:'page',title:'Services',slug:'services',status:'published'}],
    ['content_post_update',{id:'p1',status:'published'}],
    ['content_duplicate',{id:'p1',overrides:{status:'published'}}],
    ['content_post_delete',{id:'p1'}], ['trash_item',{entityType:'form',entityId:'f1'}], ['media_trash_asset',{id:'m1'}],
    ['theme_set_page_published',{themeId:'t',page:'about',published:true}],
    ['collections_entry_publish',{id:'e1'}], ['comments_approve_comment',{id:'c1'}],
  ];
  for (const [id,input] of calls) {
    const f=fixture(id); const result=await f.executor.execute({toolId:id,principal:{id:'owner'},run:{id:'run'},input});
    assert.equal(result.status,'completed',id); assert.equal(f.calls(),1,id); assert.equal(f.surfaces.surfaceExchanges.size(),0,id);
  }
});
test('only read, edit and trash run directly; every other class, including an unknown one, asks',async()=>{
  const { approvalClassAsks }=await import('../assistant-tool-approval-policy.js');
  for (const cls of ['read','edit','trash']) assert.equal(approvalClassAsks({class:cls}),false,cls);
  for (const cls of ['delete','restore-over-existing','publish','replace-secret','escalation','not-a-known-class']) assert.equal(approvalClassAsks({class:cls}),true,cls);
});
test('permanent deletes and actions that leave this site refuse without a human confirmation channel',async()=>{
  const calls:[string,unknown][]=[
    ['page.click',{handle:'trash-purge-confirm'}], ['change_sets_revert',{}], ['theme_reset_file',{}],
    ['publish_content_publish',{}], ['deployment_execute_static_publish',{}], ['deployment_ops_deploy',{}], ['source_control_execute_commit',{}],
  ];
  for (const [id,input] of calls) {
    const f=fixture(id); const result=await f.executor.execute({toolId:id,principal:{id:'owner'},run:{id:'run'},input});
    assert.equal(result.status,'failed',id); assert.equal(f.calls(),0,id);
  }
});
test('one principal-bound confirmation approves one frozen call; cancel changes nothing',async()=>{
  for (const decision of ['confirm','cancel']) {
    const f=fixture('publish_content_publish');
    const input={id:'post-1'};
    let emittedResolve!:()=>void;
    const emitted=new Promise<void>(resolve=>{emittedResolve=resolve;});
    let exchangeId='';
    const pending=f.executor.execute({toolId:'publish_content_publish',principal:{id:'owner'},run:{id:'run'},input}, {emitSurface:async emission=> {
      assert.equal(emission.channel,'mcp-ui');
      // Inspect the actual open exchange rather than parsing its HTML.
      const html=(emission.payload as {resource:{resource:{text:string}}}).resource.resource.text;
      exchangeId=html.match(/__exchangeId"\s*:\s*"([^"]+)"/)![1]; emittedResolve();
    }});
    await emitted; assert.equal(f.calls(),0); input.id='changed-after-proposal';
    assert.equal(f.surfaces.surfaceExchanges.deliver({ exchangeId, principalId:'intruder', params:{decision} }, { toolId:'publish_content_publish' }).ok,false);
    f.surfaces.surfaceExchanges.deliver({ exchangeId, principalId:'owner', params:{decision} }, { toolId:'publish_content_publish' });
    const result=await pending; assert.equal(result.status,'completed');
    assert.equal(f.calls(),decision==='confirm'?1:0);
    if(decision==='confirm') assert.deepEqual(f.executed(),{id:'post-1'});
    assert.equal(f.surfaces.surfaceExchanges.deliver({ exchangeId, principalId:'owner', params:{decision} }, { toolId:'publish_content_publish' }).ok,false);
  }
});

test('every supported locale translates the exact approval text and choices', async()=>{
  const { APPROVAL_COPY, approvalText }=await import('../../contracts/core/approval-i18n.js');
  const { ADMIN_LOCALES }=await import('../../contracts/core/admin-locales.js');
  assert.deepEqual(Object.keys(APPROVAL_COPY).sort(),ADMIN_LOCALES.map(locale=>locale.code).sort());
  for(const locale of ADMIN_LOCALES)for(const key of ['Confirm action?','Confirm','Cancel','Tool','Input','Technical name','Publish static site','Publish'] as const) {
    assert.ok(approvalText({locale:locale.code,key}));
    if(locale.code!=='en')assert.notEqual(approvalText({locale:locale.code,key}),key);
  }
});
test('unsupported approval locales fall back to English for every label', async()=>{
  const { approvalText }=await import('../../contracts/core/approval-i18n.js');
  for(const locale of ['unsupported-locale',''])for(const key of ['Confirm action?','Confirm','Cancel','Tool','Input','Technical name','{action}?','Publish static site','Publish','Unknown catalog title'] as const) {
    assert.equal(approvalText({locale,key}),key);
  }
});

test('page verbs are classified, ordinary install controls are direct, opaque destructive clicks ask',async()=>{
  const {PAGE_CAPABILITIES}=await import('@jini-ai/agentic');
  const { TOOL_APPROVAL_POLICY }=await import('../assistant-tool-approval-policy.js');
  for(const capability of PAGE_CAPABILITIES)assert.ok(Object.hasOwn(TOOL_APPROVAL_POLICY,capability.id),capability.id);
  assert.equal(approvalClassFor({toolId:'page.click',input:{handle:'plugins-install-confirm'}}),'edit');
  assert.equal(approvalClassFor({toolId:'page.click',input:{handle:'trash-purge-confirm'}}),'delete');
  assert.equal(approvalClassFor({toolId:'page.fill',input:{handle:'title',text:'Hello'}}),'edit');
  assert.throws(()=>approvalClassFor({toolId:'toString',input:{}}),/has no approval classification/);
});

test('direct page actions reject unclassified capability ids',()=>{
  for (const capabilityId of ['new_unclassified_tool','toString']) {
    assert.throws(()=>directPageAction({capabilityId,input:{handle:'plugins-install-confirm'}}),
      {message:`${capabilityId} has no approval classification`});
  }
});

test('page fill runs directly without a reviewed click handle',()=>{
  assert.equal(directPageAction({capabilityId:'page.fill',input:{handle:'title',text:'Hello'}}),true);
});

test('source-control export commits ask because they can remove stale exported paths; dry runs are direct',()=>{
  assert.equal(approvalClassFor({toolId:'source_control_execute_commit',input:{dryRun:true}}),'edit');
  assert.equal(approvalClassFor({toolId:'source_control_execute_commit',input:{}}),'publish');
});

/** Starts a confirming call and resolves with the card's HTML once shown (or '' when the call settles first). */
async function cardFor(f: ReturnType<typeof fixture>, toolId: string, input: unknown) {
  let html = '';
  let shown!: () => void;
  const visible = new Promise<void>((resolve) => { shown = resolve; });
  const pending = f.executor.execute({ toolId, principal: { id: 'owner' }, run: { id: 'run' }, input }, {
    emitSurface: async (emission) => { html = (emission.payload as { resource: { resource: { text: string } } }).resource.resource.text; shown(); },
  });
  await Promise.race([visible, pending]);
  return { html, pending, exchangeId: html.match(/__exchangeId"\s*:\s*"([^"]+)"/)?.[1] ?? '' };
}

test('disclosed rows follow Input, computed from the frozen call before asking', async () => {
  const seen: unknown[] = [];
  const f = fixture('publish_content_publish', { disclose: async ({ ctx: call }) => { seen.push(call.input); return [{ label: 'Account', value: 'alice@acme.test' }]; } });
  const card = await cardFor(f, 'publish_content_publish', { id: 'post-1' });
  const rows = [...card.html.matchAll(/<dt>([^<]+)<\/dt>/g)].map((match) => match[1]);
  assert.deepEqual(rows, ['ID', 'Account']);
  assert.match(card.html, /<dt>Input<span class="mcpui-hint">Technical name: publish_content_publish<\/span><\/dt>/);
  assert.match(card.html, /<dd>alice@acme\.test<\/dd>/);
  assert.deepEqual(seen, [{ id: 'post-1' }]);
  f.surfaces.surfaceExchanges.deliver({ exchangeId: card.exchangeId, principalId: 'owner', params: { decision: 'cancel' } }, { toolId: 'publish_content_publish' });
  assert.equal((await card.pending).status, 'completed');
  assert.equal(f.calls(), 0);
});

test('generic approval input uses the shared structured renderer and escapes untrusted values', async () => {
  const f = fixture('publish_content_publish');
  const card = await cardFor(f, 'publish_content_publish', { enabled: false, privacyPolicyUrl: '/privacy', template: '<img src=x onerror="alert(1)">' });
  try {
    assert.match(card.html, /<dt>Enabled<\/dt><dd>Off<\/dd>/);
    assert.match(card.html, /<dt>Privacy policy URL<\/dt>/);
    assert.match(card.html, /HTML · 1 line/);
    assert.match(card.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
    assert.doesNotMatch(card.html, /<img src=x/);
  } finally {
    f.surfaces.surfaceExchanges.deliver({ exchangeId: card.exchangeId, principalId: 'owner', params: { decision: 'cancel' } }, { toolId: 'publish_content_publish' });
    await card.pending;
  }
  assert.equal(f.calls(), 0);
});

test('deployment approval uses catalog action copy and puts its technical name in muted context', async () => {
  const { toolMetadata } = await import('../../contracts/core/tool-metadata/deployments.js');
  const toolId = 'deployment_execute_static_publish';
  const f = fixture(toolId, {}, { metadata: toolMetadata[toolId] });
  const card = await cardFor(f, toolId, { target: 'vercel', projectName: 'zoran-new' });
  try {
    assert.match(card.html, /<h1[^>]*>Publish static site\?<\/h1>/);
    assert.match(card.html, /<button[^>]*data-mcpui-action="confirm"[^>]*>Publish<\/button>/);
    assert.match(card.html, /class="mcpui-hint">Technical name: deployment_execute_static_publish<\/span>/);
    assert.match(card.html, /<dt>Project name<\/dt><dd>zoran-new<\/dd>/);
    assert.doesNotMatch(card.html, /Confirm action\?|<dt>Tool<\/dt>/);
  } finally {
    f.surfaces.surfaceExchanges.deliver({ exchangeId: card.exchangeId, principalId: 'owner', params: { decision: 'cancel' } }, { toolId });
    await card.pending;
  }
  assert.equal(f.calls(), 0);
});

test('approval without metadata has a readable title and localized fallback choices', async () => {
  const toolId = 'publish_content_publish';
  const f = fixture(toolId, { localeFor: async () => 'es' });
  const card = await cardFor(f, toolId, {});
  try {
    assert.match(card.html, /<h1[^>]*>¿Publish content publish\?<\/h1>/);
    assert.match(card.html, /<button[^>]*data-mcpui-action="confirm"[^>]*>Confirmar<\/button>/);
    assert.match(card.html, /Nombre técnico: publish_content_publish/);
    assert.match(card.html, />Cancelar<\/button>/);
  } finally {
    f.surfaces.surfaceExchanges.deliver({ exchangeId: card.exchangeId, principalId: 'owner', params: { decision: 'cancel' } }, { toolId });
    await card.pending;
  }
});

test('approval uses input-schema titles and descriptions through the shared field renderer', async () => {
  const toolId = 'publish_content_publish';
  const f = fixture(toolId, {}, { inputSchema: { type: 'object', properties: {
    projectName: { title: 'Site name', description: 'Ignored when a title exists' },
    target: { description: 'Hosting provider' },
  } } });
  const card = await cardFor(f, toolId, { projectName: 'zoran-new', target: 'vercel', dryRun: false });
  try {
    assert.match(card.html, /<dt>Site name<\/dt><dd>zoran-new<\/dd>/);
    assert.match(card.html, /<dt>Hosting provider<\/dt><dd>vercel<\/dd>/);
    assert.match(card.html, /<dt>Dry run<\/dt><dd>Off<\/dd>/);
    assert.match(card.html, /View raw/);
  } finally {
    f.surfaces.surfaceExchanges.deliver({ exchangeId: card.exchangeId, principalId: 'owner', params: { decision: 'cancel' } }, { toolId });
    await card.pending;
  }
});

test('a disclose failure refuses the call before any card or effect', async () => {
  const f = fixture('publish_content_publish', { disclose: async () => { throw new Error('account lookup failed'); } });
  const card = await cardFor(f, 'publish_content_publish', { id: 'post-1' });
  try {
    assert.equal(card.html, '', 'no card is shown');
  } finally {
    // A broken refusal parks on the card: cancel it so the failure is immediate, not an exchange timeout.
    if (card.html !== '') f.surfaces.surfaceExchanges.deliver({ exchangeId: card.exchangeId, principalId: 'owner', params: { decision: 'cancel' } }, { toolId: 'publish_content_publish' });
  }
  const result = await card.pending;
  assert.equal(result.status, 'failed');
  assert.match(String(result.error), /account lookup failed/);
  assert.equal(f.calls(), 0);
});

test('a failing locale lookup still asks, in English, and never bypasses the gate', async () => {
  const f = fixture('publish_content_publish', { localeFor: async () => { throw new Error('profile read failed'); } });
  const card = await cardFor(f, 'publish_content_publish', { id: 'post-1' });
  assert.notEqual(card.html, '', 'the confirmation card is still shown');
  assert.match(card.html, /Publish content publish\?/);
  assert.equal(f.calls(), 0);
  f.surfaces.surfaceExchanges.deliver({ exchangeId: card.exchangeId, principalId: 'owner', params: { decision: 'cancel' } }, { toolId: 'publish_content_publish' });
  assert.equal((await card.pending).status, 'completed');
  assert.equal(f.calls(), 0);
});
