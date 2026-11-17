import json,os,re,subprocess,csv,collections,sys
ROOT=os.environ.get('LANE_ROOT','/home/user/code'); SP=os.path.dirname(os.path.abspath(__file__)); PLAN=os.path.dirname(SP); GRAPH=os.environ.get('LANE_GRAPH','/tmp/lane-su-graph.json'); W='apps/website/src/'
OUT=sys.argv[1] if len(sys.argv)>1 else PLAN
# LANE_REF / LANE_SHA name the Tovu commit the tree came from (needed when LANE_ROOT is an exported tree, not a clone).
REF=os.environ.get('LANE_REF','integ/merge-final-2026-11-16')
SHA=os.environ.get('LANE_SHA') or subprocess.check_output(['git','-C',ROOT,'rev-parse','--short=9','HEAD'],text=True).strip()
g=json.load(open(GRAPH))
def istest(f): return bool(re.search(r'__tests__|__specs__|\.test\.|\.spec\.|/e2e/|/tests?/',f))
def blob(p): return subprocess.check_output(['git','-C',ROOT,'hash-object',p],text=True).strip()
def read(p): return open(os.path.join(ROOT,p),encoding='utf8').read()
rows=list(csv.DictReader(open(os.path.join(PLAN,'inventory.tsv')),delimiter='\t'))
cov={r['path']:r for r in csv.DictReader(open(os.path.join(PLAN,'coverage.tsv')),delimiter='\t')}
SHEETS={
 'S/S1w-workspace-sql':lambda r:r['group']=='S1' and 'workspace' in r['path'],
 'S/S1-taxonomy-navigation-presentation-sql':lambda r:r['group']=='S1' and 'workspace' not in r['path'],
 'S/S2-entries-content-types-sql':lambda r:r['group']=='S2',
 'S/S3-identity-sql':lambda r:r['group']=='S3',
 'S/S4-trash-sql':lambda r:r['group']=='S4',
 'S/S5-settings-token-origin-sql':lambda r:r['group']=='S5',
 'S/S6-changeset-outbox-webhook-formdelivery-sql':lambda r:r['group']=='S6',
 'S/S7-media-sql':lambda r:r['group']=='S7',
 'S/S8-memory-bus-expand-partials':lambda r:r['group']=='S8',
 'U/U1-members-sql':lambda r:r['group']=='U12' and re.search(r'repo\.(ts|rows\.ts|sqlite\.ts)$',r['path']),
 'U/U2-members-auth-domain':lambda r:r['group']=='U12' and not re.search(r'repo\.(ts|rows\.ts|sqlite\.ts)$',r['path']),
 'U/U3-api-keys':lambda r:r['group']=='U3',
}
BASE=['development/scripts/write-path-inventory.baseline.json','development/scripts/hardwiring-debt.json','development/scripts/check-architecture.baseline.json','development/scripts/size-debt.json','.dependency-cruiser.cjs','apps/website/.dependency-cruiser.cjs','knip.json','eslint.config.mjs']
BASE=[b for b in BASE if os.path.exists(os.path.join(ROOT,b))]
TBL=re.compile(r'''\.(selectFrom|insertInto|updateTable|deleteFrom|innerJoin|leftJoin|replaceInto|mergeInto|withTables)\(\s*["'`]([A-Za-z0-9_]+)''')
for sid,pred in SHEETS.items():
    fl=[r for r in rows if pred(r)]
    L=[f'# {sid.split("/")[1]} — machine-verified facts (generated; do not hand-edit)','',f'Source: Tovu tree at `LANE_ROOT` (ref `{REF}`) @ `{SHA}`. Regenerate: `LANE_ROOT=<tovu clone> python3 scripts/inv.py && LANE_ROOT=<tovu clone> python3 scripts/rep.py && LANE_ROOT=<tovu clone> python3 scripts/facts.py [<out dir>]`. Blobs are `git hash-object` of that tree; a sheet executor re-checks every blob (COMMON STOP-on-mismatch).','']
    tot=sum(int(r['lines']) for r in fl)
    L+=[f'Files: {len(fl)}, {tot} lines (tests not counted).','', '## Files','| path (under apps/website/src) | lines | blob | CLASSIFY label | audit row | existing sheet/design mention | prod importers | test importers |','|---|---|---|---|---|---|---|---|']
    alltests=collections.OrderedDict(); allprod=collections.OrderedDict()
    for r in fl:
        p=W+r['path']; c=cov[r['path']]
        L.append(f"| {r['path']} | {r['lines']} | {blob(p)} | {c['classify_label']} | {c['audit_row']} | {c['sheets_or_designs']} | {r['prod_importers']} | {r['test_importers']} |")
    L+=['','## Per file: exports, tables, lock keys, imports that leave the folder, importers']
    for r in fl:
        p=W+r['path']; t=read(p)
        ex=re.findall(r'^export (?:default )?(?:abstract )?(?:async )?(?:class|function|const|interface|type|enum) ([A-Za-z0-9_]+)',t,re.M)
        rex=re.findall(r'^export (?:type )?\{([^}]*)\} from ["\']([^"\']+)',t,re.M)
        star=re.findall(r'^export \* from ["\']([^"\']+)',t,re.M)
        tables=sorted(set(m[1] for m in TBL.findall(t)))
        locks=[f'{i+1}: {ln.strip()[:150]}' for i,ln in enumerate(t.split('\n')) if 'lockKey(' in ln]
        flags=[k for k,pat in [('console',r'console\.(log|warn|error|info|debug)\('),('process.env',r'process\.env'),('node:',r'from ["\']node:'),('await import',r'await import\('),('sql``',r'\bsql`'),('tovu-text',r'(?i)tovu')] if re.search(pat,t)]
        imps=g['importers'].get(p,[]); pi=[i for i in imps if not istest(i)]; ti=[i for i in imps if istest(i)]
        d=os.path.dirname(p)
        cross=[i.replace(W,'') for i in g['imports'].get(p,[]) if not i.startswith(d+'/')]
        own=[i.replace(W,'') for i in g['imports'].get(p,[]) if i.startswith(d+'/')]
        L+=['',f"### {r['path']} ({r['lines']} lines)",f"- exports ({len(ex)}): {', '.join(ex) or '-'}"]
        if rex or star: L.append('- re-exports: '+'; '.join([f'{{{a.strip()}}} from {b}' for a,b in rex]+[f'* from {s}' for s in star]))
        L+=[f"- tables touched: {', '.join(tables) or '-'}",f"- lock keys: {' | '.join(locks) or '-'}",f"- flags: {', '.join(flags) or '-'}",f"- npm/@jini-ai imports: {', '.join(g['ext'].get(p,[])) or '-'}",f"- same-folder imports: {', '.join(own) or '-'}",f"- imports leaving the folder: {', '.join(cross) or '-'}",f"- prod importers ({len(pi)}): {', '.join(i.replace(W,'') for i in pi) or '-'}",f"- test importers ({len(ti)}): {', '.join(i.replace(W,'') for i in ti) or '-'}"]
        for i in ti: alltests[i]=1
        for i in pi: allprod[i]=1
    L+=['','## Test files that import a file of this sheet (blob-guard each before editing)','| test | lines | blob |','|---|---|---|']
    for i in alltests:
        L.append(f"| {i.replace(W,'')} | {len(read(i).splitlines())} | {blob(i)} |")
    # mocks
    L+=['','## vi.mock / vi.doMock / importActual sites that name a file of this sheet (lesson 2: mock factories are consumers)']
    names=[os.path.basename(r['path']).replace('.ts','') for r in fl]
    hits=[]
    for f in list(alltests):
        for i,ln in enumerate(read(f).split('\n')):
            if re.search(r'vi\.(mock|doMock|importActual|importMock)',ln) and any(n in ln for n in names): hits.append(f"- {f.replace(W,'')}:{i+1}: {ln.strip()[:140]}")
    L+=hits or ['- none found by pattern (re-check with the census at execution)']
    L+=['','## Path-keyed baselines / configs that name a file of this sheet (lesson 10: debt does not follow moved code silently)']
    bh=[]
    for b in BASE:
        bt=read(b).split('\n')
        for r in fl:
            frag='src/'+r['path']
            ls=[str(i+1) for i,ln in enumerate(bt) if frag in ln]
            if ls: bh.append(f"- {b}: `{frag}` at lines {', '.join(ls[:25])}{' …' if len(ls)>25 else ''} ({len(ls)} hits)")
    L+=bh or ['- none in: '+', '.join(BASE)]
    L+=['','## Census command (run from the Tovu clone root; every hit must be listed above)','```',"rg -n --no-heading -e '"+'|'.join(sorted(set(re.escape(os.path.splitext(r['path'])[0].split('/',1)[1] if False else os.path.splitext(os.path.basename(r['path']))[0]) for r in fl)))+"' apps development scripts --glob '!**/node_modules/**' -g '*.ts' -g '*.tsx' -g '*.json' -g '*.mjs' -g '*.cjs' | rg '"+'|'.join(sorted(set(os.path.dirname(r['path']).split('/')[-1] for r in fl)))+"'",'```','']
    os.makedirs(os.path.dirname(os.path.join(OUT,sid)),exist_ok=True)
    open(os.path.join(OUT,sid+'.facts.md'),'w').write('\n'.join(L))
    print(sid,len(fl),tot,'tests',len(alltests),'prodImporters',len(allprod),'baselineHits',len(bh))
