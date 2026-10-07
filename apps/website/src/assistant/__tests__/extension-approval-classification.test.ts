import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSkillToolRegistrations } from '../../features/skills/tool-registrations.js';
import { buildAgentPluginToolRegistrations } from '../../features/agent-plugins/tool-registrations.js';
import { buildPluginCapabilityToolRegistrations } from '../../features/plugin-runtime/capability-tool-registrations.js';
import { buildPluginMemoryRegistrations } from '../../features/agent-plugins/memory-tools.js';
import { withExtensionApprovalPolicy, toolApprovalPolicyFor } from '../../contracts/headless/assistant-tool-approval-policy.js';
import { createToolRegistry, type ToolRegistration } from '@jini-ai/core';
import { attachAssistantToolExtensions } from '../installed-extension-tools.js';

test('generated guidance and memory tools carry explicit classification from their real handler family',()=>{
 const guidance=buildSkillToolRegistrations([{id:'opaque_guidance',skillName:'example',description:'Deletes are described here, never executed.',markdown:'Guide',bundledFiles:[]}]);
 const memory=buildPluginMemoryRegistrations({sources:[{id:'opaque_plugin',pluginId:'example',archiveDigest:'a'.repeat(64)}],workspaceId:'ws',gate:{isCallable:async()=>true}});
 const agentGuidance=buildAgentPluginToolRegistrations([{id:'opaque_agent',pluginId:'example',archiveDigest:'a'.repeat(64),description:'Guide',skills:[{name:'example',summary:'Guide',markdown:'Guide'}],defaultSkillName:'example'}],{isCallable:async()=>true});
 const capability=buildPluginCapabilityToolRegistrations([{id:'opaque_result',pluginId:'example',pluginName:'Example',description:'Computes a result without saving',fields:[],runsFresh:true}],{workspaceId:'ws',authorize:async()=>({allowed:true,reason:'matched'}),postRepo:{} as never,pluginActivationRepo:{getActivation:async()=>({enabled:true})} as never});
 for(const registration of [...guidance,...agentGuidance,...capability,...memory]) assert.ok(toolApprovalPolicyFor({registration}),registration.descriptor.id);
 for(const registration of [...guidance,...agentGuidance,...capability]) assert.equal(toolApprovalPolicyFor({registration}).class,'read');
 assert.equal(toolApprovalPolicyFor({registration:memory[0]}).class,'read');
 assert.equal(toolApprovalPolicyFor({registration:memory[1]}).class,'edit');
});

test('an unclassified registration cannot enter the host policy adapter',()=>{
 assert.throws(()=>toolApprovalPolicyFor({registration:{descriptor:{id:'new_dynamic_tool'},handler:async()=>({}),policy:{authorize:()=> 'allow'}}}),/new_dynamic_tool has no approval classification/);
});

test('installed registration rejects a new unclassified family and admits explicit behavior metadata',async()=>{
 const registration:ToolRegistration={descriptor:{id:'new_dynamic_tool',inputSchema:{type:'object'}},handler:async()=>({}),policy:{authorize:()=> 'allow'}};
 for(const classified of [false,true]) {
  const registry=createToolRegistry({});
  const extensions=attachAssistantToolExtensions(registry,{
   workspaceId:'ws',authorize:async()=>({allowed:true,reason:'matched'}),postRepo:{} as never,pluginActivationRepo:{} as never,discoverPlugins:async()=>[],
   federation:{deps:{workspaceId:'ws',authorize:async()=>({allowed:true,reason:'matched'})},resolveConnections:async()=>[]},
   registerInstalled:async target=>{target.register(classified?withExtensionApprovalPolicy({registration,family:'installed-guidance'}):registration);},
  },'[approval-policy-test]');
  if(classified) await extensions.installed;
  else await assert.rejects(extensions.installed,{message:'new_dynamic_tool has no approval classification'});
  assert.equal(registry.has({toolId:'new_dynamic_tool'}),classified);
 }
});
