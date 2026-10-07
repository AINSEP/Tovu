import assert from 'node:assert/strict';
import test from 'node:test';
import { createContributionRegistry } from '@jini-ai/core';
import { installFirstPartyToolContributors } from '../../server/runtime/composition/tool-catalog-manifest.js';
import { buildAssistantToolRegistrations } from '../tool-registrations.js';
import { TOOL_APPROVAL_POLICY } from '../../contracts/headless/assistant-tool-approval-policy.js';
import type { ToolContributor, DerivedToolContributor } from '../tool-contribution-registry.js';

function fixture() {
  const contributions={contributors:createContributionRegistry({keyOf:({contribution}:{contribution:ToolContributor})=>contribution.domain}),derivedContributors:createContributionRegistry({keyOf:({contribution}:{contribution:DerivedToolContributor})=>contribution.domain})};
  installFirstPartyToolContributors({contributions});
  // Construction inspects metadata only; no repo operation is allowed by this fake.
  const deps={workspaceId:'ws',clock:{nowMs:()=>0,nowIso:()=>new Date(0).toISOString()},authorize:async()=>({allowed:true,reason:'matched'}),idGen:{newId:()=> 'id'},magicLinkPerEmailLimiter:{},themes:[]};
  return {contributions,deps:deps as unknown as Parameters<typeof buildAssistantToolRegistrations>[0]};
}
test('every first-party registration has a reviewed action classification before read collapse',()=>{
  const f=fixture();
  const registrations=buildAssistantToolRegistrations(f.deps,undefined,{contributions:f.contributions,includeContentReadCollapse:false});
  assert.ok(registrations.length>200);
  for(const registration of registrations)assert.ok(Object.hasOwn(TOOL_APPROVAL_POLICY,registration.descriptor.id),registration.descriptor.id);
});
test('registering a new tool without classification fails construction',()=>{
  const f=fixture();
  f.contributions.contributors.register({contribution:{domain:'unclassified-test',risk:new Map([['unclassified_new_tool','none']]),build:()=>[{descriptor:{id:'unclassified_new_tool',readOnly:true,inputSchema:{type:'object'}},policy:{authorize:()=> 'allow'},handler:async()=>({})}]}});
  assert.throws(()=>buildAssistantToolRegistrations(f.deps,undefined,{contributions:f.contributions}),/unclassified_new_tool has no approval classification/);
});

test('the final registered read cards and every frontend capability have classifications',async()=>{
  const f=fixture();
  const registrations=buildAssistantToolRegistrations(f.deps,undefined,{contributions:f.contributions});
  for(const registration of registrations)assert.ok(Object.hasOwn(TOOL_APPROVAL_POLICY,registration.descriptor.id),registration.descriptor.id);
  const {FRONTEND_CONTROL_CAPABILITIES}=await import('../frontend-control-capabilities.js');
  for(const capability of FRONTEND_CONTROL_CAPABILITIES)assert.ok(Object.hasOwn(TOOL_APPROVAL_POLICY,capability.id),capability.id);
});
