import assert from 'node:assert/strict';
import test from 'node:test';
import { createToolRegistry, type ToolRegistration, type ToolExecutionContext } from '@jini-ai/core';
import { createToolExecutor } from '@jini-ai/daemon';
import { createSurfaceExchangeStore } from "@jini-ai/daemon/surface-exchanges";
import { applyToolApprovalPolicy, approvalClassFor } from '../tool-approval-policy.js';
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


const ctx = (input: unknown = {}): ToolExecutionContext => ({executionId:'exec',principal:{id:'owner'},run:{id:'run'},input,signal:new AbortController().signal});
function fixture(id: string) {
  let calls = 0; let executed: unknown;
  const registration: ToolRegistration = {descriptor:{id,description:id,inputSchema:{type:'object'}},policy:{authorize:()=> 'allow'},handler:async context=>{calls++; executed=context.input; return {changed:true};}};
  const surfaces = {surfaceExchanges:createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" })};
  const registry = createToolRegistry({});
  registry.register(applyToolApprovalPolicy({registration,surfaces}));
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
  const { approvalClassAsks }=await import('../../contracts/headless/assistant-tool-approval-policy.js');
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
  for(const locale of ADMIN_LOCALES)for(const key of ['Confirm action?','Confirm','Cancel','Tool','Input'] as const) {
    assert.ok(approvalText({locale:locale.code,key}));
    if(locale.code!=='en')assert.notEqual(approvalText({locale:locale.code,key}),key);
  }
});
test('page verbs are classified, ordinary install controls are direct, opaque destructive clicks ask',async()=>{
  const {PAGE_CAPABILITIES}=await import('@jini-ai/agentic');
  const { TOOL_APPROVAL_POLICY }=await import('../../contracts/headless/assistant-tool-approval-policy.js');
  for(const capability of PAGE_CAPABILITIES)assert.ok(Object.hasOwn(TOOL_APPROVAL_POLICY,capability.id),capability.id);
  assert.equal(approvalClassFor({toolId:'page.click',input:{handle:'plugins-install-confirm'}}),'edit');
  assert.equal(approvalClassFor({toolId:'page.click',input:{handle:'trash-purge-confirm'}}),'delete');
  assert.equal(approvalClassFor({toolId:'page.fill',input:{handle:'title',text:'Hello'}}),'edit');
  assert.throws(()=>approvalClassFor({toolId:'toString',input:{}}),/has no approval classification/);
});

test('source-control export commits ask because they can remove stale exported paths; dry runs are direct',()=>{
  assert.equal(approvalClassFor({toolId:'source_control_execute_commit',input:{dryRun:true}}),'edit');
  assert.equal(approvalClassFor({toolId:'source_control_execute_commit',input:{}}),'publish');
});
