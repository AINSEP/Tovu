import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type { AgentToolDefinition, ToolExecutionContext } from '@jini-ai/core';
import { defineSecretCardTool } from '@jini-ai/ui/mcp-ui/secret-card';
import { askThenReport, createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import type { DeployOpsRuntime, DeployOpsRegistrationHost, LoadedDeployOps, DeployOpsStatus } from '@jini-ai/devops/deploy';
import { boundContext, runDeployOps, runDeploy, waitForDeployOps, aborted, DeployCredentialSetupRequired, MAX_RESPONSE_CHARS } from '@jini-ai/devops/deploy';
import { requireDeployPlatform } from '@jini-ai/devops/deploy';
import { runListSecrets, runSetSecret, runUnsetSecret } from '@jini-ai/devops/deploy';
import { collectTypedDeploySecret } from '@jini-ai/devops/deploy';
import { buildDeployOpsRegistrations } from '@jini-ai/devops/deploy';
import { DeployCredentialSetupRequired as HostSetupRequired } from '../run-ops.js';

const ids = { status:'library_state',logs:'library_output',wait:'library_watch',listTargets:'library_targets',deploy:'library_launch',listSecrets:'library_names',setSecret:'library_write',unsetSecret:'library_remove',credentialVerify:'library_check' };
const input = { platform:'library',target:'catalog',name:'BOOK_KEY',source:{kind:'site-key' as const} };
const execution = (value:unknown):ToolExecutionContext => ({executionId:'library-call',principal:{id:'librarian'},run:{id:'library-run'},input:value,signal:new AbortController().signal});
const observation:DeployOpsStatus = {platform:'library',target:'catalog',state:'healthy',summary:'Library available',items:[],checkedAt:'2026-11-09T00:00:00Z'};

function wire() {
  const events:string[]=[];
  const values=new Map<string,string>();
  let revision=0;
  let truncated=false;
  let body='{"ok":true}';
  const platform:LoadedDeployOps={pluginId:'library-plugin',descriptor:{id:'library',label:'Library',module:'books.mjs',hosts:['api.library.test']},module:{
    status:async ctx=>{await ctx.get('https://api.library.test/state');return observation;},
    logs:async()=>({platform:'library',target:'catalog',lines:[],truncated:false}),
    deploy:async ctx=>{await ctx.send({method:'POST',url:'https://api.library.test/start'});return {platform:'untrusted',target:'untrusted',started:true,summary:'Library accepted'};},
    secretCapabilities:{appliesOn:'next-deploy',supportsStaging:false},
    listSecrets:async()=>({secrets:[...values.keys()].map(name=>({name,digest:String(revision)}))}),
    readSecret:async(_ctx,{name})=>values.has(name)?{value:values.get(name)!}:{absent:true},
    setSecret:async(_ctx,{name,value})=>{events.push('write');values.set(name,value);revision++;return {version:revision};},
    unsetSecret:async(_ctx,{name})=>{events.push('delete');values.delete(name);revision++;return {version:revision};},
  }};
  const registry={get:(id:string)=>id==='library'?platform:undefined,list:()=>[platform],refusals:[]};
  const diagnostic={setupToolId:'library_recover',prefill:{kind:'library-key'}};
  Object.defineProperty(diagnostic,'authority',{value:{library:true},enumerable:false});
  const deps:DeployOpsRuntime={workspaceId:'library-space',clock:{nowMs:()=>0},loadDeployOps:async()=>{events.push('registry');return registry;},
    credentials:{available:true,list:async()=>{events.push('inventory');return [{label:'library-key',allowedOrigins:['https://api.library.test']}];},resolveTarget:async({label,url})=>{events.push('resolve');return {label,url:new URL(url)};},classifyError:({error})=>({category:'unknown',error}),
      request:async(required,optional)=>{events.push(`http:${required.maxResponseBytes}:${String(optional.signal !== undefined)}`);return {executed:true,status:200,headers:{},bodyText:body,bodyTruncated:truncated};}},
    siteKey:{read:()=>{events.push('site-key');return ' library private value\n';},fingerprint:({value})=>{events.push('fingerprint');return {fingerprint:createHash('sha256').update(value).digest('hex').slice(0,12),fingerprintKind:'sha256'};}},
    publishHistoryStore:{recordSuccess:async entry=>{events.push(JSON.stringify(entry));}},
    recovery:{setupRequired:()=>({message:'Library recovery required',credentialSetup:diagnostic})},toolIds:ids,
    messages:{noUsableSiteKey:'Library key unavailable',severalCredentials:()=> 'Library choose a key',noSavedCredential:()=> 'Library key absent'},
  };
  const exchanges=createSurfaceExchangeStore({clock:{nowMs:()=>0},idGenerator:{newId:()=> 'library-exchange'},defaultChannel:'mcp-ui',scheduler:{schedule:()=>()=>undefined}});
  const catalog:AgentToolDefinition[]=[ids.status,ids.listSecrets,ids.setSecret,ids.unsetSecret].map(name=>({name,description:`Library ${name}`,inputSchema:{type:'object'},sideEffects:'mutates-durable-state',authorization:{permission:'library.change'}}));
  const host:DeployOpsRegistrationHost={catalog,metadata:{},derivedRisk:new Map(catalog.map(c=>[c.name,c.sideEffects])),domain:'library-domain',catalogModule:'library/operations.ts',permissions:{write:'library.change',siteKey:'library.key'},
    permit:async({permission})=>{events.push(permission);},approvals:{confirmFor:()=>undefined},
    cards:{defineSecretCardTool:(spec,options)=>defineSecretCardTool({...spec,
      form:required=>({...spec.form(required),app:{appName:'library-secret-form',appVersion:'7'}}),
      outcome:required=>{const outcome=spec.outcome(required);return outcome?{...outcome,app:{appName:'library-secret-outcome',appVersion:'8'}}:undefined;},
    },options),askThenReport,surfaceExchanges:exchanges,uriHost:'library',defaultLocale:'library-default',noEmitter:'Library requires a human',locale:async()=> 'library-locale',text:({id,locale})=>`Library ${locale} ${id}`,
      form:({title,locale})=>({title,description:`Library ${locale}`,submitLabel:'Library save',fields:[{kind:'string',name:'value',label:'Library secret',secret:true}]})},
  };
  return {deps,platform,registry,diagnostic,events,values,host,exchanges,clip:()=>{truncated=true;body='{"clipped":true}';}};
}

test('boundContext preserves bounded signal, clipped JSON semantics and DELETE refusal with foreign ports',async()=>{
  const f=wire();f.clip();const signal=new AbortController().signal;
  const ctx=await boundContext({deps:f.deps,platform:f.platform},{signal});
  const result=await ctx.get('https://api.library.test/clip');
  assert.deepEqual(result,{status:200,text:'{"clipped":true}',truncated:true});
  assert.deepEqual(f.events,['inventory','resolve',`http:${MAX_RESPONSE_CHARS}:true`]);
  assert.throws(()=>ctx.send({method:'DELETE',url:'https://api.library.test/clip'}),/unsupported method/);
});

test('runDeployOps uses the foreign registry and request and canonical recovery retains issued identity',async()=>{
  const f=wire();assert.deepEqual(await runDeployOps({deps:f.deps,input,operation:'status'},{}),observation);
  f.deps.credentials.list=async()=>[];
  await assert.rejects(runDeployOps({deps:f.deps,input,operation:'status'},{}),error=>{
    assert.ok(error instanceof DeployCredentialSetupRequired);assert.equal(error.message,'Library recovery required');assert.equal(error.credentialSetup,f.diagnostic);assert.equal(Object.getOwnPropertyDescriptor(error.credentialSetup,'authority')?.enumerable,false);return true;
  });
});

test('runDeploy records accepted dispatch exactly once even if the foreign history port fails',async()=>{
  const f=wire();f.deps.publishHistoryStore={recordSuccess:async entry=>{f.events.push(JSON.stringify(entry));throw new Error('private library ledger failure');}};
  const warnings:unknown[][]=[];const original=console.warn;console.warn=(...args:unknown[])=>{warnings.push(args);};
  try {assert.deepEqual(await runDeploy({deps:f.deps,input},{}),{platform:'library',target:'catalog',started:true,summary:'Library accepted'});}finally{console.warn=original;}
  assert.equal(f.events.filter(e=>e.startsWith('http:')).length,1);
  assert.deepEqual(JSON.parse(f.events.find(e=>e.startsWith('{'))!),{workspaceId:'library-space',entry:{kind:'deploy',target:'library',projectName:'catalog',url:'',reachable:false,status:'started',publishedAt:'1970-01-01T00:00:00.000Z',triggeredBy:'agent_tool'}});
  assert.deepEqual(warnings,[['[deploy-ops] destination history write failed after accepted deploy']]);
});

test('runListSecrets returns metadata only with foreign adapters',async()=>{
  const f=wire();f.values.set('BOOK_KEY','private-library-existing');
  assert.deepEqual(await runListSecrets({deps:f.deps,input},{}),{platform:'library',target:'catalog',secrets:[{name:'BOOK_KEY',digest:'0'}],truncated:false,appliesOn:'next-deploy',supportsStaging:false,deployNeeded:true});
});

test('runSetSecret consumes foreign read/fingerprint and tool prose without changing plaintext bytes',async()=>{
  const f=wire();const result=await runSetSecret({deps:f.deps,input},{});
  assert.equal(f.values.get('BOOK_KEY'),' library private value\n');assert.equal(result.fingerprint,createHash('sha256').update(' library private value\n').digest('hex').slice(0,12));assert.match(result.summary!,/library_launch/);
  assert.deepEqual(f.events,['registry','site-key','inventory','fingerprint','write']);assert.equal(JSON.stringify(result).includes('private value'),false);
});

test('runUnsetSecret refuses changed snapshots and uses foreign recovery prose before a delete',async()=>{
  const f=wire();f.values.set('BOOK_KEY','private-library-existing');
  await assert.rejects(runUnsetSecret({deps:f.deps,input},{confirm:async()=>{f.values.delete('BOOK_KEY');return {confirmed:true};}}),/library_remove: target changed/);
  assert.equal(f.events.includes('delete'),false);
});

test('collectTypedDeploySecret uses foreign card URI/text and same exchange, preserves whitespace and no value in emissions',async()=>{
  const f=wire();const emissions:string[]=[];const value=' library typed secret\n';
  const result=await collectTypedDeploySecret({ctx:execution({}),deps:f.deps,cards:f.host.cards,input:{...input,source:{kind:'typed'}},permit:async()=>{f.events.push('library.change');}},{emitSurface:async emission=>{
    emissions.push(JSON.stringify(emission));
    if(emissions.length===1) assert.deepEqual(f.exchanges.deliver({exchangeId:'library-exchange',principalId:'librarian',params:{value}},{toolId:ids.setSecret,channel:'mcp-ui'}),{ok:true});
  }});
  assert.equal(f.values.get('BOOK_KEY'),value);assert.equal((result as {changed:boolean}).changed,true);assert.equal(emissions.length,2);assert.ok(emissions[0]!.includes('ui://library/'));assert.ok(emissions[0]!.includes('Library library-locale'));assert.ok(emissions[0]!.includes('library-secret-form'));assert.ok(emissions[1]!.includes('library-secret-outcome'));assert.ok(emissions[1]!.includes('Library library-locale savedTitle'));assert.equal(JSON.stringify([result,emissions]).includes(value),false);assert.equal(f.exchanges.size(),0);
});

test('buildDeployOpsRegistrations consumes foreign ids/domain/catalog/permissions and denies before protected reads',async()=>{
  const f=wire();const registrations=buildDeployOpsRegistrations({deps:f.deps,host:f.host},{});
  assert.deepEqual(registrations.map(r=>r.descriptor.id),f.host.catalog.map(c=>c.name));
  const tool=registrations.find(r=>r.descriptor.id===ids.setSecret)!;
  f.host.permit=async({permission})=>{f.events.push(permission);if(permission==='library.key')throw new Error('Library refused');};
  await assert.rejects(tool.handler(execution(input)),/Library refused/);assert.deepEqual(f.events,['library.change','library.key']);
  const badCatalog=f.host.catalog.map(tool=>{const copy={...tool};delete copy.inputSchema;return copy;});
  assert.throws(()=>buildDeployOpsRegistrations({deps:f.deps,host:{...f.host,catalog:badCatalog}},{}),/library\/operations.ts/);
});

test('waitForDeployOps and aborted preserve cancellation and bounded foreign clock timing; requireDeployPlatform keeps exact registry identity',async()=>{
  const f=wire();assert.equal(requireDeployPlatform({registry:f.registry,id:'library'},{}),f.platform);
  assert.throws(()=>requireDeployPlatform({registry:f.registry,id:'missing'},{}),/Choose: library/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(waitForDeployOps({status:async()=>observation},{until:'healthy',signal:controller.signal}),{message:aborted().message});
  let now=0;let polls=0;
  const result=await waitForDeployOps({status:async()=>{polls++;return {...observation,state:'deploying'};},clock:{now:()=>now,sleep:async ms=>{now+=ms;}}},{until:'healthy',timeoutSeconds:20});
  assert.deepEqual({polls:result.polls,waitedSeconds:result.waitedSeconds,reached:result.reached},{polls:2,waitedSeconds:20,reached:false});assert.equal(polls,2);
});


test('published deploy declarations retain second-host contract notes and types-only runtime',async()=>{
  const root=new URL('./',import.meta.resolve('@jini-ai/devops/deploy'));
  const declarations=await readFile(fileURLToPath(new URL('ops-tool-contracts.d.ts',root)),'utf8');
  const parsed=ts.createSourceFile('ops-tool-contracts.d.ts',declarations,ts.ScriptTarget.Latest,true);
  for(const name of ['DeployOpsBoundedRequest','DeployOpsRuntime','DeployOpsSecretCards','DeployOpsRegistrationHost','DeployCredentialDiagnostic','DeployOpsToolIds','SecretConfirm']) {
    const declaration=parsed.statements.find(node=>(ts.isInterfaceDeclaration(node)||ts.isTypeAliasDeclaration(node))&&node.name.text===name);
    assert.ok(declaration,name);
    if(!['DeployOpsToolIds','DeployOpsRegistrationHost'].includes(name)) assert.ok(declarations.slice(declaration.getFullStart(),declaration.getStart(parsed)).includes('@agent-note'),name);
  }
  assert.equal(HostSetupRequired,DeployCredentialSetupRequired);
  for(const obligation of ['I/O','maxResponseBytes','same actor-bound exchange','non-enumerable','rechecks write permission','exact UTF-8','truncation','Catalog names must equal toolIds']) assert.ok(declarations.includes(obligation),obligation);
  assert.equal((await readFile(fileURLToPath(new URL('ops-tool-contracts.js',root)),'utf8')).trim(),'export {};\n//# sourceMappingURL=ops-tool-contracts.js.map');
});


test('foreign site-key and credential refusal messages and status/check tool ids are required inputs',async()=>{
 const f=wire();f.deps.siteKey.read=()=>undefined;
 await assert.rejects(runSetSecret({deps:f.deps,input},{}),{message:'Library key unavailable'});
 const raw=new Error('private library transport detail');
 f.deps.credentials.resolveTarget=async()=>{throw raw;};f.deps.credentials.classifyError=({error})=>{assert.ok(error instanceof Error);return {category:'not-found',error,callerSafeMessage:'Library key absent'};};
 const ctx=await boundContext({deps:f.deps,platform:f.platform},{});
 await assert.rejects(ctx.get('https://api.library.test/state'),{message:'Library key absent'});
 f.deps.credentials.resolveTarget=async({label,url})=>({label,url:new URL(url)});
 f.deps.credentials.request=async()=>{throw raw;};f.deps.credentials.classifyError=({error})=>{assert.ok(error instanceof Error);return {category:'transport',error};};
 await assert.rejects(ctx.send({method:'POST',url:'https://api.library.test/start'}),/Check library_state before retrying/);
 f.deps.credentials.request=async()=>({executed:true,status:401,headers:{},bodyText:'private body',bodyTruncated:false});
 await assert.rejects(ctx.get('https://api.library.test/state'),/Run library_check with label/);
});

test('foreign approval binding is used for overwrite and write permission is checked again after answer',async()=>{
 const f=wire();f.values.set('BOOK_KEY','old library secret');
 f.host.approvals.confirmFor=({ctx,permit})=>async request=>{assert.equal(ctx.principal.id,'librarian');assert.equal(request.action,'overwrite');assert.equal(request.name,'BOOK_KEY');f.events.push('library-human');await permit(f.host.permissions.write);return {confirmed:true};};
 const tool=buildDeployOpsRegistrations({deps:f.deps,host:f.host},{}).find(r=>r.descriptor.id===ids.setSecret)!;
 const result=await tool.handler(execution(input));assert.equal((result as {changed:boolean}).changed,true);
 assert.equal(f.values.get('BOOK_KEY'),' library private value\n');
 assert.deepEqual(f.events,['library.change','library.key','registry','site-key','inventory','fingerprint','library-human','library.change','write']);
});


test('moved runtime declarations retain two object arguments and named host obligations',async()=>{
 const noted=new Set(['boundContext','runDeployOps','runSetSecret','runUnsetSecret']);
 const root=new URL('./',import.meta.resolve('@jini-ai/devops/deploy'));
 const roots:Record<string,string[]>={'ops-runner':['boundContext','runDeployOps','runDeploy','waitForDeployOps'],'ops-secrets':['runListSecrets','runSetSecret','runUnsetSecret'],'ops-secret-card':['collectTypedDeploySecret'],'ops-tools':['buildDeployOpsRegistrations'],'ops-registry':['requireDeployPlatform']};
 for(const [file,names] of Object.entries(roots)) {
  const text=await readFile(fileURLToPath(new URL(file+'.d.ts',root)),'utf8');const parsed=ts.createSourceFile(file+'.d.ts',text,ts.ScriptTarget.Latest,true);
  for(const name of names) {
   const declarations=parsed.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
   assert.ok(declarations.length>0,name);
   for(const declaration of declarations) {assert.ok(ts.isFunctionDeclaration(declaration));assert.equal(declaration.parameters.length,2,name);}
   if(noted.has(name)) assert.ok(declarations.some(declaration=>text.slice(declaration.getFullStart(),declaration.getStart(parsed)).includes('@agent-note')),name);
  }
 }
});
