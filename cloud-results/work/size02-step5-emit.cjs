// Run AFTER gen.cjs (reads out.json + re-parses app.ts). usage: node emit.cjs [--write]
const ts=require('/home/user/Tovu/node_modules/typescript');const fs=require('fs');
const COMP='/home/user/Tovu/apps/website/src/server/runtime/composition';
const file=COMP+'/app.ts';const text=fs.readFileSync(file,'utf8');const lines=text.split('\n');
const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
const write=process.argv.includes('--write');
const {out,bySrc}=JSON.parse(fs.readFileSync('/tmp/claude-0/gen/out.json','utf8'));
const FR=JSON.parse(fs.readFileSync('/tmp/claude-0/gen/fragments.json','utf8'));
const DIR=COMP+'/memory-deps/route-deps';
// bindings
const bindings=new Map();
sf.forEachChild(n=>{if(!ts.isImportDeclaration(n))return;const c=n.importClause;if(!c)return;
 if(c.name)bindings.set(c.name.text,{imp:n,kind:'default'});
 if(c.namedBindings){if(ts.isNamespaceImport(c.namedBindings))bindings.set(c.namedBindings.name.text,{imp:n,kind:'ns'});else c.namedBindings.elements.forEach(e=>bindings.set(e.name.text,{imp:n,kind:'named',el:e}));}});
const idsIn=t=>{const s=ts.createSourceFile('x.ts',t,ts.ScriptTarget.Latest,true);const r=new Set();const v=n=>{if(ts.isImportDeclaration(n))return;if(ts.isIdentifier(n))r.add(n.text);ts.forEachChild(n,v);};v(s);return r;};
const fixSpec=s=>s.startsWith('./memory-deps/')?'../'+s.slice('./memory-deps/'.length):s.startsWith('./')?'../../'+s.slice(2):s.startsWith('../')?'../../'+s:s;
function importsFor(bodyText,{forceType=false,skip=new Set(),comments=false}={}){
  const used=idsIn(bodyText);const byImp=new Map();
  for(const id of used){if(skip.has(id))continue;const b=bindings.get(id);if(!b)continue;
    if(!byImp.has(b.imp))byImp.set(b.imp,{def:null,ns:null,named:[]});const e=byImp.get(b.imp);
    if(b.kind==='default')e.def=id;else if(b.kind==='ns')e.ns=id;else e.named.push(b.el);}
  // merge declarations that resolve to the same module and type-ness
  const merged=new Map();
  for(const [imp,e] of byImp){const spec=fixSpec(imp.moduleSpecifier.text);const tOnly=(forceType||imp.importClause.isTypeOnly);const key=spec+'|'+tOnly;
    if(!merged.has(key))merged.set(key,{imp,e:{def:null,ns:null,named:[]}});const m=merged.get(key).e;if(e.def)m.def=e.def;if(e.ns)m.ns=e.ns;m.named.push(...e.named);}
  const res=[];
  for(const [,{imp,e}] of merged){const spec=fixSpec(imp.moduleSpecifier.text);const q=imp.moduleSpecifier.getText(sf)[0];
    const tOnly=(forceType||imp.importClause.isTypeOnly)?'type ':'';
    const parts=[];if(e.def)parts.push(e.def);if(e.ns)parts.push('* as '+e.ns);if(e.named.length)parts.push('{ '+e.named.map(el=>el.getText(sf)).join(', ')+' }');
    let lead='';if(comments){const full=imp.getFullText(sf);const lead0=full.slice(0,imp.getStart(sf)-imp.getFullStart()).trim();if(lead0&&!lead0.includes('Deep-imported rather than'))lead=lead0+'\n';}
    res.push(`${lead}import ${tOnly}${parts.join(', ')} from ${q}${spec}${q};`);}
  return res;}
// ---- special: createSiteApp member
let fn=null;sf.forEachChild(n=>{if(ts.isFunctionDeclaration(n)&&n.name&&n.name.text==='createRouteDeps')fn=n;});
let litDecl=null;const find=n=>{if(ts.isVariableDeclaration(n)&&n.name.getText(sf)==='routeDeps'&&n.initializer&&ts.isObjectLiteralExpression(n.initializer))litDecl=n;ts.forEachChild(n,find);};find(fn);
const props=litDecl.initializer.properties;const litStart=sf.getLineAndCharacterOfPosition(litDecl.initializer.getStart(sf)).line;
let prev=litStart;const rng=props.map(p=>{const s=prev+1,e=sf.getLineAndCharacterOfPosition(p.getEnd()).line;prev=e;return {s,e,name:p.name?p.name.getText(sf):null};});
const csa=rng.find(r=>r.name==='createSiteApp');
const csaComment=lines.slice(csa.s,csa.e).join('\n'); // comment lines (all but the code line)
const csaCode=lines[csa.e];
// ---- fragments text
const files={};
for(const f of FR){const o=out[f.name];let body=o.body;
  if(o.keys.includes('createSiteApp')){const st=body.indexOf(csaComment);const ap=body.indexOf('=> createApp(',st);const en=body.indexOf('\n',ap);if(st<0||ap<0)throw new Error('createSiteApp block not found');body=body.slice(0,st)+"    // Built in `createRouteDeps` (app.ts): this file must not import `createApp`, which would close a cycle\n    // through `app.ts`. See the comment there for the nullary closure and its test gotcha.\n    createSiteApp,"+body.slice(en);}
  const locals=[...new Set([...o.used,...(o.keys.includes('createSiteApp')?['createSiteApp']:[])])].sort();
  const destruct=locals.length?`  const {\n${locals.map(l=>'    '+l+',').join('\n')}\n  } = required;\n`:'';
  const txt=`/** ${f.doc} */\nexport function ${f.name}(${locals.length?'required: MemoryRootContext':'_required: MemoryRootContext'}, _optional = {}) {\n${destruct}  return {\n${body}\n  } satisfies Partial<MemoryRouteDeps>;\n}\n`;
  (files[f.file]=files[f.file]||[]).push({f,txt,locals});}
// runExportSite statement (doc + const)
let rx=null;sf.forEachChild(n=>{if(ts.isVariableStatement(n)&&n.declarationList.declarations[0].name.getText(sf)==='runExportSite')rx=n;});
const rxStart=ts.getLeadingCommentRanges(text,rx.getFullStart());
const rxFrom=rxStart&&rxStart.length?rxStart[0].pos:rx.getStart(sf);
const rxText=text.slice(rxFrom,rx.getEnd());
files['publish-export'][0].txt=files['publish-export'][0].txt; // keep order; rx is placed before the fragments
const rxBlock=rxText+'\n\n';
// ---- context.ts
const sliceFns={};for(const [src,names] of Object.entries(bySrc)){if(src.startsWith('slice:'))sliceFns[src.slice(6)]=names;}
const LOCAL_TYPES={toolAttemptAuditSink:'ReturnType<typeof createInMemoryToolAttemptAuditSink>',workspaceRepo:'InMemoryWorkspaceRepo',postRepo:'InMemoryPostRepo',presentationRepo:'InMemoryPresentationSettingsRepo',settingsRepo:'InMemorySettingsRepo',clock:'MemoryClock',idGen:'MemoryIdGen',pluginActivationRepo:'ReturnType<typeof followProviderActivations>',pluginRuntime:'ReturnType<typeof composePluginRuntime>',redirectsWriteDeps:'RedirectsWriteDeps',siteTimeZone:'ReturnType<typeof createSiteTimeZonePort>',derivedPublicOrigin:'string',publishContentSeedHash:'PublishContentSeedHashFn',siteThemes:'ReturnType<typeof discoverAllBuiltInThemes>',removeTheme:'MemoryRouteDeps["removeTheme"]',publishContentApplyPort:'ReturnType<typeof memoryPublishContentApplyPort>',inMemoryChatHistory:'ReturnType<typeof createInMemoryChatHistory>',siteConsentReady:'ReturnType<typeof createSiteConsentReadiness>',pluginExports:'ReturnType<typeof createPluginExportRuntime>',agentPluginMcp:'ReturnType<typeof composeAgentPluginMcp>'};
const localNames=(bySrc.local||[]);
const ctxParts=[];
for(const [fnName,names] of Object.entries(sliceFns))ctxParts.push(`  & Pick<ReturnType<typeof ${fnName}>, ${names.slice().sort().map(n=>JSON.stringify(n)).join(' | ')}>`);
const localLines=localNames.slice().sort().map(n=>{if(!LOCAL_TYPES[n])throw new Error('no type for local '+n);return `  ${n}: ${LOCAL_TYPES[n]};`;});
const ctxBodyForImports=ctxParts.join('\n')+'\n'+Object.values(LOCAL_TYPES).join('\n')+'\nNewsletterRouteDeps ByokToolSurfaceDeps CreateRouteDepsOptions';
const ctxImports=importsFor(ctxBodyForImports,{forceType:true,skip:new Set(['MemoryClock','MemoryIdGen','CreateRouteDepsOptions'])});
const contextTs=`${ctxImports.map(l=>l.replace(/, type /g,', ').replace(/\{ type /g,'{ ')).join('\n')}\nimport type { CreateRouteDepsOptions } from "../create-route-deps-options.js";\nimport type { MemoryClock, MemoryIdGen } from "../ports.js";\n\n/** The in-memory root's route deps: the same type \`createRouteDeps\` returns. */\nexport type MemoryRouteDeps = NewsletterRouteDeps & ByokToolSurfaceDeps;\n\n/**\n * Everything the \`routeDeps\` literal reads from the statements that precede it in \`createRouteDeps\`: the slices' outputs\n * (picked by name, so a slice may grow without widening this contract) and the root's own locals.\n * \`routeDeps\` is a getter because the fragments only ever read the FINAL object from inside a closure that runs\n * after \`createRouteDeps\` has returned; \`createSiteApp\` is built by the root because a fragment must not import \`app.ts\`.\n */\nexport type MemoryRootContext = {\n  options: CreateRouteDepsOptions;\n  routeDeps: () => MemoryRouteDeps;\n  createSiteApp: MemoryRouteDeps["createSiteApp"];\n${localLines.join('\n')}\n}\n${ctxParts.join('\n')};\n`;
// ---- emit files
const emitted={};
for(const [fileName,arr] of Object.entries(files)){
  const fragText=arr.map(a=>a.txt).join('\n');
  const full=(fileName==='publish-export'?rxBlock:'')+fragText;
  const imps=importsFor(full,{skip:new Set(['MemoryRootContext','MemoryRouteDeps','createApp']),comments:true});
  const hdr=`import type { MemoryRootContext, MemoryRouteDeps } from "./context.js";\n`;
  emitted[fileName]=`${imps.join('\n')}\n${hdr}\n${fileName==='publish-export'?rxBlock:''}${fragText}`;}
// ---- assemble.ts
const asmImports=FR.reduce((m,f)=>{(m[f.file]=m[f.file]||[]).push(f.name);return m;},{});
const asmTs=`${Object.entries(asmImports).map(([fl,names])=>`import { ${names.join(', ')} } from "./${fl}.js";`).join('\n')}\nimport type { MemoryRootContext } from "./context.js";\n\n/**\n * The in-memory root's \`routeDeps\` literal as ordered, contiguous runs. Key order is the literal's own, and a later\n * spread may override an earlier key only because the runs are spread in the order they always had.\n */\nexport function assembleMemoryRouteDeps(required: MemoryRootContext, _optional = {}) {\n  return {\n${FR.map(f=>`    ...${f.name}(required),`).join('\n')}\n  };\n}\n`;
// ---- app.ts new middle
const names=[...new Set(FR.flatMap(f=>out[f.name].used))].filter(n=>!['options','routeDeps'].includes(n));
const ctxNames=names.filter(n=>n!=='createSiteApp');
const csaNote=csaComment+'\n';
const appMid=`${csaNote}  const createSiteApp: MemoryRouteDeps["createSiteApp"] = ({ themeId, consentAudit }: { themeId?: string; consentAudit?: true } = {}) => createApp(routeDeps, { ...(themeId === undefined ? {} : { themeIdOverride: themeId }), ...(consentAudit ? { consentAudit } : {}) });\n  const context: MemoryRootContext = {\n    options, routeDeps: () => routeDeps, createSiteApp,\n${ctxNames.slice().sort().reduce((acc,n,i)=>{const li=Math.floor(i/6);(acc[li]=acc[li]||[]).push(n);return acc;},[]).map(l=>'    '+l.join(', ')+',').join('\n')}\n  };\n  const routeDeps: MemoryRouteDeps = assembleMemoryRouteDeps(context);\n`;
fs.writeFileSync('/tmp/claude-0/gen/app-mid.txt',appMid);
const info={files:Object.keys(emitted),ctxNames:ctxNames.length};
console.log(JSON.stringify(info),'csaCode:',csaCode.trim().slice(0,60));
if(write){
  fs.mkdirSync(DIR,{recursive:true});
  for(const [k,v] of Object.entries(emitted))fs.writeFileSync(`${DIR}/${k}.ts`,v);
  fs.writeFileSync(`${DIR}/context.ts`,contextTs);fs.writeFileSync(`${DIR}/assemble.ts`,asmTs);
  // app.ts surgery
  const litStmt=litDecl.parent.parent;
  const sLine=sf.getLineAndCharacterOfPosition(litStmt.getStart(sf)).line, eLine=sf.getLineAndCharacterOfPosition(litStmt.getEnd()).line;
  // include comment lines directly above? none needed: the literal statement starts at 'const routeDeps'
  const rxFromLine=sf.getLineAndCharacterOfPosition(rxFrom).line, rxEndLine=sf.getLineAndCharacterOfPosition(rx.getEnd()).line;
  const L=lines.slice();
  // delete runExportSite first (later in file)
  L.splice(rxFromLine,rxEndLine-rxFromLine+2); // +blank
  L.splice(sLine,eLine-sLine+1,...appMid.replace(/\n$/,'').split('\n'));
  fs.writeFileSync(file,L.join('\n'));
  console.log('app.ts rewritten',lines.length,'->',L.length);
}
