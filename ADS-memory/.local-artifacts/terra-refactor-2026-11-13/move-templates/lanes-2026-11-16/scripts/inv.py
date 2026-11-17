import os,re,sys,subprocess,json,collections
ROOT='/home/user/code'
os.chdir(ROOT)
files=subprocess.check_output(['git','ls-files','apps','scripts','development','packages'],text=True).split('\n')
src=[f for f in files if re.search(r'\.(ts|tsx|mts|cts|js|mjs)$',f) and 'node_modules' not in f]
fset=set(files)
IMP=re.compile(r'''(?:from\s+|import\s*\(\s*|import\s+|vi\.(?:mock|doMock|importActual|importMock)\s*(?:<[^>]*>)?\(\s*|require\(\s*)["']([^"']+)["']''')
def resolve(f,spec):
    if spec.startswith('#src/'):
        m=re.match(r'(apps/[^/]+/src)/',f)
        if not m: return None
        base=os.path.normpath(os.path.join(m.group(1),spec[5:]))
    elif not spec.startswith('.'): return None
    else: base=os.path.normpath(os.path.join(os.path.dirname(f),spec))
    cands=[base]
    if base.endswith('.js'): cands+= [base[:-3]+'.ts',base[:-3]+'.tsx']
    if base.endswith('.mjs'): cands+=[base[:-4]+'.mts']
    cands+=[base+'.ts',base+'.tsx',base+'/index.ts',base+'/index.tsx']
    for c in cands:
        if c in fset: return c
    return None
imports=collections.defaultdict(set); ext=collections.defaultdict(set); importers=collections.defaultdict(set)
tov=collections.defaultdict(set)
for f in src:
    try: t=open(f,encoding='utf8').read()
    except: continue
    for m in IMP.finditer(t):
        s=m.group(1); r=resolve(f,s)
        if r: imports[f].add(r); importers[r].add(f)
        elif not s.startswith('.') and not s.startswith('#src/'): ext[f].add(s)
def istest(f): return bool(re.search(r'__tests__|__specs__|\.test\.|\.spec\.|/e2e/|/tests?/',f))
json.dump({'imports':{k:sorted(v) for k,v in imports.items()},'ext':{k:sorted(v) for k,v in ext.items()},'importers':{k:sorted(v) for k,v in importers.items()}},open('/tmp/claude-0/-home-user/ac9f4aa2-2de4-5d94-b62a-c3e90073299d/scratchpad/graph.json','w'))
print(len(src),'files',sum(len(v) for v in imports.values()),'edges')
