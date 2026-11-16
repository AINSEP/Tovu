const ts=require('/Users/la/Programming/jini-terra-base/node_modules/typescript');
const fs=require('fs'),path=require('path'),cp=require('child_process');
const J='/Users/la/Programming/jini-terra-base';
const files=cp.execSync(`rg -l "@jini-ai/(ui|ui-kit)" packages/admin/src -g '*.ts' -g '*.tsx'`,{cwd:J}).toString().trim().split('\n');
const CORE_TEXT=new Set(['interpolate','formatTimestamp','Translate']);
const CORE_FETCH=new Set(['QueryKey']);
const C1P={extensionForMimeType:'@jini-ai/core/text',hasAttributeOnAnyNodeShape:'@jini-ai/core/primitives'};
const rows=[];
const HARN=new Set(['FetchQueryProvider','KitProvider','createKit','ConfirmViewProps']);
const THEME=new Set(['applyAdminTheme','resolveColorScheme','defaultAdminTheme']);
const RULES=new Set(['sortProvidersByConfigured','isEntryPresent','isMarkerOnlyEntry','maskedKeyLabel','isProviderBaseUrlInvalid','invalidBaseUrlProviderIds']);
for(const f of files){
 const src=fs.readFileSync(path.join(J,f),'utf8');
 const sf=ts.createSourceFile(f,src,ts.ScriptTarget.Latest,true,f.endsWith('x')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 const kit=()=>{let rel=path.relative(path.dirname(f),'packages/admin/src/react/kit');if(!rel.startsWith('.'))rel='./'+rel;return rel+'.js';};
 const emit=(spec,names,note)=>{
  const groups={};
  for(const n of names){const b=n.replace(/^type /,'').split(' as ')[0];
   let t,rn='',tn='';
   if(HARN.has(b)){t='MANUAL';tn='test harness: no kit slot. Render through renderWithAdminKit (fake-admin-kit.tsx) for kit-only tests; a test that needs real ui-kit/ui moves to packages/integration-tests';}
   else if(THEME.has(b)){t='MANUAL';tn=/__tests__/.test(f)?'test: read the theme from the fake kit (useAdminThemeKit().defaultAdminTheme) or keep a local fixture':'hand edit R1 (C9a section R, hand edits 1 and 2): useAdminThemeKit() in the component/hook';}
   else if(RULES.has(b)){t='MANUAL';tn='hand edit R1 (section R, hand edit 3): call as useMediaProviderRules().<name>';}
   else if(CORE_TEXT.has(b))t='@jini-ai/core/text';else if(CORE_FETCH.has(b))t='@jini-ai/core/fetch';
   else if(C1P[b])t='C1+ (see C1-plus.repoint.tsv)';
   else if(spec.endsWith('/html-editor')&&b==='InteractiveHtmlEditor'){t=kit();}
   else if(spec.endsWith('/html-editor')&&b==='InteractiveHtmlEditorProps'){t=kit();}
   else if(spec.endsWith('/admin-widgets')&&b==='Select'){t=kit();rn='Select->WidgetSelect (import { WidgetSelect as Select })';}
   else t=kit();
   (groups[t+'|'+rn+'|'+tn]??=[]).push(n);}
  for(const[k,v]of Object.entries(groups)){const[t,rn,tn]=k.split('|');
   let nm=v.join(', ');let nt=tn||note||'';
   if(t===kit()&&v.some(x=>/InteractiveHtmlEditor/.test(x))){nt='kit names are HtmlEditor / HtmlEditorProps: import { HtmlEditor, type HtmlEditorProps } (importer renames uses, or keep alias HtmlEditor)';}
   rows.push(['jini',f,spec,nm,t,rn,'wave',nt]);}
 };
 const visit=n=>{
  if(ts.isImportDeclaration(n)&&ts.isStringLiteral(n.moduleSpecifier)&&/^@jini-ai\/(ui|ui-kit)(\/|$)/.test(n.moduleSpecifier.text)){
   const spec=n.moduleSpecifier.text,ic=n.importClause;const names=[];
   const tAll=ic?.isTypeOnly;
   if(ic?.name)names.push('default '+ic.name.text);
   if(ic?.namedBindings){ if(ts.isNamespaceImport(ic.namedBindings)){rows.push(['jini',f,spec,'*ns:'+ic.namedBindings.name.text,'MANUAL','','wave','namespace import']);return;}
    for(const e of ic.namedBindings.elements){const base=(e.propertyName?e.propertyName.text:e.name.text);const t=(tAll||e.isTypeOnly)?'type ':'';names.push(t+base+(e.propertyName?' as '+e.name.text:''));}}
   if(!ic)rows.push(['jini',f,spec,'(side-effect)','MANUAL','','wave','side-effect import']);else emit(spec,names);
  } else if(ts.isExportDeclaration(n)&&n.moduleSpecifier&&/@jini-ai\/(ui|ui-kit)/.test(n.moduleSpecifier.text)){rows.push(['jini',f,n.moduleSpecifier.text,'re-export','MANUAL','','wave','re-export from ui']);}
  else if(ts.isCallExpression(n)&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])&&/^@jini-ai\/(ui|ui-kit)(\/|$)/.test(n.arguments[0].text)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||/mock|doMock/.test(n.expression.getText()))){rows.push(['jini',f,n.expression.getText()+"('"+n.arguments[0].text+"')",'dynamic/mock','MANUAL','','wave','test mock/dynamic: person edits']);}
  else if(ts.isImportTypeNode(n)&&ts.isLiteralTypeNode(n.argument)&&/@jini-ai\/(ui|ui-kit)/.test(n.argument.literal.text||'')){rows.push(['jini',f,"import('"+n.argument.literal.text+"')",n.qualifier?.getText()||'','MANUAL','','wave','import() type']);}
  ts.forEachChild(n,visit);};
 visit(sf);
}
console.log(['repo','file','old_spec','names','new_spec','rename','phase','note'].join('\t'));
for(const r of rows)console.log(r.join('\t'));
