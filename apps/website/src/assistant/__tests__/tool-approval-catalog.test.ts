import assert from 'node:assert/strict';
import test from 'node:test';
import { createContributionRegistry } from '@jini-ai/core';
import { installFirstPartyToolContributors } from '../../server/runtime/composition/tool-catalog-manifest.js';
import { buildAssistantToolRegistrations } from '../tool-registrations.js';
import { TOOL_APPROVAL_POLICY } from '../../contracts/headless/index.js';
import type { ToolContributor, DerivedToolContributor } from '../tool-registrations.js';
import { nativeToolMetadata } from '../../contracts/core/tool-metadata/index.js';

function fixture() {
  const contributions={contributors:createContributionRegistry({keyOf:({contribution}:{contribution:ToolContributor})=>contribution.domain}),derivedContributors:createContributionRegistry({keyOf:({contribution}:{contribution:DerivedToolContributor})=>contribution.domain})};
  installFirstPartyToolContributors({contributions});
  // Construction inspects metadata only; no repo operation is allowed by this fake.
  const deps={workspaceId:'ws',clock:{nowMs:()=>0,nowIso:()=>new Date(0).toISOString()},authorize:async()=>({allowed:true,reason:'matched'}),idGen:{newId:()=> 'id'},magicLinkPerEmailLimiter:{},themes:[],seoDeps:{dispatch:async()=>{throw new Error('SEO is outside this fixture');}}};
  return {contributions,deps:deps as unknown as Parameters<typeof buildAssistantToolRegistrations>[0]};
}
test('every approval-gated native tool declares a friendly title and summary on its actual registration', () => {
  const f = fixture();
  const registrations = buildAssistantToolRegistrations(f.deps, undefined, { contributions: f.contributions, includeContentReadCollapse: false });
  const gatedIds = Object.entries(nativeToolMetadata.byId).filter(([, metadata]) => {
    const policy = metadata.approval;
    return policy && (policy.confirmation === 'plan' || policy.rule || !['read', 'edit', 'trash'].includes(policy.class));
  }).map(([id]) => id);
  assert.ok(gatedIds.length > 0, 'the contract must inspect real gated tools');
  for (const id of gatedIds) {
    const metadata = nativeToolMetadata.byId[id]!;
    assert.ok(metadata.title?.trim(), `${id}: missing friendly title`);
    assert.ok(metadata.summary?.trim(), `${id}: missing friendly summary`);
    assert.doesNotMatch(metadata.title!, /[_{}]/, `${id}: title exposes internals`);
    assert.match(metadata.summary!, /[.!?]$/, `${id}: summary must be a sentence`);
  }
  // Also inspect actual registrations: checking declarations alone misses a dropped binding.
  const gatedRegistrations = registrations.filter(registration => gatedIds.includes(registration.descriptor.id));
  assert.ok(gatedRegistrations.length > 0, 'the contract must inspect callable gated tools');
  for (const { descriptor } of gatedRegistrations) {
    assert.equal(descriptor.metadata?.title, nativeToolMetadata.byId[descriptor.id]!.title, descriptor.id);
    assert.equal(descriptor.metadata?.summary, nativeToolMetadata.byId[descriptor.id]!.summary, descriptor.id);
  }
});
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
