import assert from 'node:assert/strict';
import test from 'node:test';
import { createToolRegistry, type ToolRegistration, type ToolExecutionContext } from '@jini-ai/core';
import { createToolExecutor } from '@jini-ai/daemon';
import { createSurfaceExchangeStore } from '../../contracts/core/tool-surface-exchanges.js';
import { applyToolApprovalPolicy, approvalClassFor } from '../tool-approval-policy.js';

const ctx = (input: unknown = {}): ToolExecutionContext => ({executionId:'exec',principal:{id:'owner'},run:{id:'run'},input,signal:new AbortController().signal});
function fixture(id: string) {
  let calls = 0; let executed: unknown;
  const registration: ToolRegistration = {descriptor:{id,description:id,inputSchema:{type:'object'}},policy:{authorize:()=> 'allow'},handler:async context=>{calls++; executed=context.input; return {changed:true};}};
  const surfaces = {surfaceExchanges:createSurfaceExchangeStore()};
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
test('publishing through status is classified from inputs, and ordinary patches stay direct',()=>{
  assert.equal(approvalClassFor({toolId:'content_post_update',input:{title:'New title'}}),'edit');
  assert.equal(approvalClassFor({toolId:'content_post_update',input:{status:'draft'}}),'publish');
  assert.equal(approvalClassFor({toolId:'content_post_create',input:{status:'published'}}),'publish');
  assert.equal(approvalClassFor({toolId:'content_post_update',input:{publishAt:'2027-01-01T00:00:00Z'}}),'publish');
});
test('trash and publish refuse without a human confirmation channel',async()=>{
  for (const id of ['content_post_delete','trash_item','theme_set_page_published','publish_content_publish','deployment_execute_static_publish']) {
    const f=fixture(id); const result=await f.executor.execute({toolId:id,principal:{id:'owner'},run:{id:'run'},input:{}});
    assert.equal(result.status,'failed'); assert.equal(f.calls(),0);
  }
});
test('one principal-bound confirmation approves one frozen call; cancel changes nothing',async()=>{
  for (const decision of ['confirm','cancel']) {
    const f=fixture('content_post_delete');
    const input={id:'post-1'};
    let emittedResolve!:()=>void;
    const emitted=new Promise<void>(resolve=>{emittedResolve=resolve;});
    let exchangeId='';
    const pending=f.executor.execute({toolId:'content_post_delete',principal:{id:'owner'},run:{id:'run'},input}, {emitSurface:async emission=> {
      assert.equal(emission.channel,'mcp-ui');
      // Inspect the actual open exchange rather than parsing its HTML.
      const html=(emission.payload as {resource:{resource:{text:string}}}).resource.resource.text;
      exchangeId=html.match(/__exchangeId"\s*:\s*"([^"]+)"/)![1]; emittedResolve();
    }});
    await emitted; assert.equal(f.calls(),0); input.id='changed-after-proposal';
    assert.equal(f.surfaces.surfaceExchanges.deliver({exchangeId,toolId:'content_post_delete',principalId:'intruder',params:{decision}}).ok,false);
    f.surfaces.surfaceExchanges.deliver({exchangeId,toolId:'content_post_delete',principalId:'owner',params:{decision}});
    const result=await pending; assert.equal(result.status,'completed');
    assert.equal(f.calls(),decision==='confirm'?1:0);
    if(decision==='confirm') assert.deepEqual(f.executed(),{id:'post-1'});
    assert.equal(f.surfaces.surfaceExchanges.deliver({exchangeId,toolId:'content_post_delete',principalId:'owner',params:{decision}}).ok,false);
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
  assert.equal(approvalClassFor({toolId:'page.click',input:{handle:'trash-purge-confirm'}}),'safety');
  assert.equal(approvalClassFor({toolId:'page.fill',input:{handle:'title',text:'Hello'}}),'edit');
  assert.throws(()=>approvalClassFor({toolId:'toString',input:{}}),/has no approval classification/);
});

test('source-control export commits ask because they can remove stale exported paths; dry runs are direct',()=>{
  assert.equal(approvalClassFor({toolId:'source_control_execute_commit',input:{dryRun:true}}),'edit');
  assert.equal(approvalClassFor({toolId:'source_control_execute_commit',input:{}}),'publish');
});
