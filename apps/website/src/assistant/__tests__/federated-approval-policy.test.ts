import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFederatedMcpRegistrations } from '../mcp-federation/registrations.js';
import type { RemoteToolDescriptor, FederatedMcpConnectionConfig } from '../mcp-federation/ports.js';
import { createToolRegistry, type ToolExecutionContext } from '@jini-ai/core';
import { createToolExecutor } from '@jini-ai/daemon';
import { createFederationRuntime } from '../external-mcp-federation-runtime.js';
import { buildFederatedCallConfirmSpec } from '../external-mcp-call-confirmation.js';
const config: FederatedMcpConnectionConfig={connectionId:'test',label:'Test',allowedToolNames:['action'],writeAllowedToolNames:['action'],connectTimeoutMs:1000,callTimeoutMs:1000,maxResultBytes:4096,maxTools:5};
const ctx=(input:Record<string,unknown>={}):ToolExecutionContext=>({executionId:'exec',principal:{id:'owner'},run:{id:'run'},input,signal:new AbortController().signal});
function fixture(tool: Partial<RemoteToolDescriptor>, confirmed=false) {
  let calls=0; const approvals:unknown[]=[];
  const built=buildFederatedMcpRegistrations({tools:[{name:'action',inputSchema:{type:'object'},...tool}],config,nativeToolIds:new Set(),session:{listTools:async()=>[],close:async()=>{},callTool:async()=>{calls++;return {content:[]};}},deps:{workspaceId:'ws',authorize:async()=>({allowed:true,reason:'matched'}),confirmCall:async(_ctx,request)=>{approvals.push(request);return confirmed?{confirmed:true}:{confirmed:false,result:{cancelled:true}};}}});
  return {handler:built.registrations[0].handler,calls:()=>calls,approvals};
}
test('declared trash, publish, unpublish and deploy are gated even with an opaque tool name',async()=>{
  for(const description of ['Moves an item to the Trash.','Publishes a site.','Unpublishes a page.','Deploys the app.','Restores a backup over existing data.']) {
    const f=fixture({description,annotations:{readOnlyHint:false}});
    await f.handler(ctx()); assert.equal(f.approvals.length,1,description);assert.equal(f.calls(),0);
  }
});
test('a selected destructive or publish action needs approval, ordinary edits do not',async()=>{
  for(const action of ['trash','delete','publish','unpublish','deploy']) {
    const f=fixture({description:'Operates on an item.'});await f.handler(ctx({action}));assert.equal(f.approvals.length,1,action);assert.equal(f.calls(),0);
  }
  const f=fixture({description:'Updates a post.'});await f.handler(ctx({action:'update',query:'ordinary editorial text'}));assert.equal(f.approvals.length,0);assert.equal(f.calls(),1);
  const replacement=fixture({description:'Restores a file.'});await replacement.handler(ctx({action:'restore',overwrite:true}));assert.equal(replacement.approvals.length,1);assert.equal(replacement.calls(),0);
  const restore=fixture({description:'Restores a file.'});await restore.handler(ctx({action:'restore',overwrite:false}));assert.equal(restore.approvals.length,0);assert.equal(restore.calls(),1);
});
test('destructive declarations cannot skip approval with read-shaped SQL and ask only once',async()=>{
  const f=fixture({description:'Runs SQL.',annotations:{destructiveHint:true}},true);
  await f.handler(ctx({query:'SELECT 1'}));assert.equal(f.approvals.length,1);assert.equal(f.calls(),1);
});
test('protected federation remains fail closed without a confirmer',async()=>{
  const built=buildFederatedMcpRegistrations({tools:[{name:'action',description:'Publishes a site.',inputSchema:{type:'object'}}],config,nativeToolIds:new Set(),session:{listTools:async()=>[],close:async()=>{},callTool:async()=>{throw new Error('must not send');}},deps:{workspaceId:'ws',authorize:async()=>({allowed:true,reason:'matched'})}});
  await assert.rejects(built.registrations[0].handler(ctx()),{message:'EXTERNAL_MCP_NO_CONFIRMATION_CHANNEL: mcp__test__action: this action requires human approval. Nothing was sent.'});
});

test('publication declarations veto reviewed read-only metadata',()=>{
 const built=buildFederatedMcpRegistrations({tools:[{name:'action',description:'Publishes a site.',inputSchema:{type:'object'}}],config:{...config,readOnlyRemoteNames:new Set(['action'])},nativeToolIds:new Set(),session:{listTools:async()=>[],close:async()=>{},callTool:async()=>({content:[]})},deps:{workspaceId:'ws',authorize:async()=>({allowed:true,reason:'matched'})}});
 assert.notEqual(built.registrations[0].descriptor.readOnly,true);
});

test('mandatory publication and trash cards retain their actual action wording and offer no remembered scopes',()=>{
  const base={toolId:'mcp__test__action',remoteName:'action',connectionId:'test',connectionLabel:'Test',arguments:{},destructive:true,
    declaredAnnotations:undefined,origin:undefined,description:'',inputSchema:{type:'object'},writeShapedInputs:[],
  };
  const publish=buildFederatedCallConfirmSpec({...base,approvalClass:'publish'},{offerChat:true,offerAlways:true});
  assert.equal(publish.danger,false);
  assert.equal(publish.warning,'This action publishes, unpublishes or deploys content in Test. Approval applies to this call only.');
  assert.deepEqual(publish.alternatives??[],[]);
  const trash=buildFederatedCallConfirmSpec({...base,approvalClass:'trash'},{offerChat:true,offerAlways:true});
  assert.equal(trash.warning,'This action moves data to Trash in Test. Approval applies to this call only.');
  assert.deepEqual(trash.alternatives??[],[]);
});

test('boot and reload register policy-gated tools from one enumeration per connection', async()=>{
  for (const phase of ['boot', 'reload']) {
    const registry = createToolRegistry({});
    let roster: {config: FederatedMcpConnectionConfig; launch: {url: string; headers: Record<string,string>}}[] = [];
    let enumerations = 0;
    let calls = 0;
    const approvals: string[] = [];
    const connection = {config, launch: {url:'https://example.invalid/mcp',headers:{}}};
    if (phase === 'boot') roster = [connection];
    const runtime = createFederationRuntime({registry,log:'[approval-policy-test]',resolveConnections:async()=>roster,
      deps:{workspaceId:'ws',authorize:async()=>({allowed:true,reason:'matched'}),confirmCall:async(_ctx,request)=>{
        approvals.push(request.remoteName);return {confirmed:false,result:{cancelled:true}};
      }},
      connect:async()=>({listTools:async()=>{enumerations++;return [{name:'action',description:'Publishes a site.',inputSchema:{type:'object'}}];},
        callTool:async()=>{calls++;return {content:[]};},close:async()=>{},
      }),
    });
    await runtime.start();
    if (phase === 'reload') { roster = [connection]; await runtime.reload(); }
    assert.equal(enumerations,1,phase);
    assert.equal(registry.has({toolId:'mcp__test__action'}),true,phase);
    const result = await createToolExecutor({registry}).execute({toolId:'mcp__test__action',principal:{id:'owner'},run:{id:'run'},input:{}});
    assert.equal(result.status,'completed',phase);
    assert.deepEqual(approvals,['action'],phase);
    assert.equal(calls,0,phase);
  }
});

test('policy approval checks the same connection permission before asking and after the answer',async()=>{
  const checks: string[] = [];
  let calls = 0;
  let approvals = 0;
  let allowed = true;
  const built = buildFederatedMcpRegistrations({tools:[{name:'action',description:'Publishes a site.',inputSchema:{type:'object'}}],config,nativeToolIds:new Set(),
    session:{listTools:async()=>[],close:async()=>{},callTool:async()=>{calls++;return {content:[]};}},
    deps:{workspaceId:'ws',authorize:async request=>{
      checks.push(`${request.permission}:${request.entityType}:${request.entityId}`);
      return {allowed:allowed && request.entityType === 'federated-mcp-connection',reason:allowed?'matched':'denied'};
    },confirmCall:async()=>{approvals++;allowed=false;return {confirmed:true};}},
  });
  await assert.rejects(built.registrations[0].handler(ctx()),{message:"principal 'owner' is not authorized for 'admin.integrations.manage' (denied)"});
  assert.deepEqual(checks,Array(2).fill('admin.integrations.manage:federated-mcp-connection:test'));
  assert.equal(approvals,1);
  assert.equal(calls,0);
  await assert.rejects(built.registrations[0].handler(ctx()),{message:"principal 'owner' is not authorized for 'admin.integrations.manage' (denied)"});
  assert.equal(approvals,1,'a denied principal never opens a card');
});
