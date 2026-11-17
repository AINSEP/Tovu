#!/usr/bin/env python3
"""Inventory for lanes K/T. Run from the Tovu code worktree root.
usage: inv.py <out.tsv> <feature-dir> [<feature-dir> ...]
Writes one row per tracked .ts/.tsx file (tests summarised per file too)."""
import os, re, subprocess, sys, json, collections

ROOT = os.getcwd()
out = sys.argv[1]
dirs = sys.argv[2:]

def sh(*a):
    return subprocess.run(a, capture_output=True, text=True).stdout

ALL = [f for f in sh('git', 'ls-files', 'apps', 'development', 'scripts', 'packages').split('\n')
       if re.search(r'\.(ts|tsx|mts|mjs|js)$', f) and 'node_modules' not in f]
ALLSET = set(ALL)
IMP = re.compile(r'''(?:from\s+|import\s*\(\s*|import\s+|require\(\s*|vi\.mock\(\s*|importActual[^(]*\(\s*)['"]([^'"]+)['"]''')

def is_test(p):
    return '__tests__' in p or re.search(r'\.test\.|\.spec\.|/testing/|__fixtures__', p) is not None

def resolve(src, spec):
    if spec.startswith('#src/'):
        base = 'apps/website/src/' + spec[5:]
    elif spec.startswith('@/') and src.startswith('apps/admin/'):
        base = 'apps/admin/src/' + spec[2:]
    elif spec.startswith('.'):
        base = os.path.normpath(os.path.join(os.path.dirname(src), spec))
    else:
        return None
    base = re.sub(r'\.(js|mjs|jsx)$', '', base)
    for c in (base, base + '.ts', base + '.tsx', base + '/index.ts', base + '/index.tsx', base + '.mjs', base + '.js'):
        if c in ALLSET:
            return c
    return base + '?'

imports = {}      # file -> list[(spec, resolved)]
importers = collections.defaultdict(set)
for f in ALL:
    try:
        txt = open(f, encoding='utf8', errors='replace').read()
    except OSError:
        continue
    lst = []
    for m in IMP.finditer(txt):
        spec = m.group(1)
        r = resolve(f, spec)
        lst.append((spec, r))
        if r:
            importers[r].add(f)
    imports[f] = lst

def feat(p):
    m = re.match(r'apps/website/src/features/([^/]+)/', p)
    if m: return 'f:' + m.group(1)
    m = re.match(r'apps/website/src/([^/]+)/([^/]+)', p)
    if m: return m.group(1) + '/' + re.sub(r'\.tsx?$', '', m.group(2))
    m = re.match(r'apps/admin/src/features/([^/]+)/', p)
    if m: return 'admin:' + m.group(1)
    m = re.match(r'apps/([^/]+)/', p)
    if m: return m.group(1) + ':other'
    return p.split('/')[0]

EXPORT = re.compile(r'^export\s+(?:async\s+)?(?:declare\s+)?(?:const|let|function\*?|class|type|interface|enum)\s+([A-Za-z0-9_$]+)', re.M)
REEXP = re.compile(r'^export\s+(?:type\s+)?(\*|\{)', re.M)

def longest_fn(txt):
    # rough: longest top-level block starting at column 0 "export (async )?function|const x = (" until line "}" or "};" at col 0
    best = 0; start = None
    for i, line in enumerate(txt.split('\n')):
        if start is None and re.match(r'(export\s+)?(async\s+)?function\b|(export\s+)?const\s+\w+\s*(:[^=]+)?=\s*(async\s*)?(\(|<|function)', line):
            start = i
        elif start is not None and re.match(r'^\}[;)]*\s*$', line):
            best = max(best, i - start + 1); start = None
    return best

rows = []
for d in dirs:
    files = [f for f in ALL if f.startswith(d.rstrip('/') + '/') and re.search(r'\.(ts|tsx)$', f)]
    for f in sorted(files):
        txt = open(f, encoding='utf8', errors='replace').read()
        loc = txt.count('\n')
        blob = sh('git', 'hash-object', f).strip()
        t = is_test(f)
        own = feat(f)
        tovu_deps = collections.Counter(); jini = collections.Counter(); node = set(); npm = set()
        for spec, r in imports[f]:
            if r:
                fr = feat(r.rstrip('?'))
                if fr != own: tovu_deps[fr] += 1
            elif spec.startswith('@jini-ai/'):
                jini[spec] += 1
            elif spec.startswith('node:'):
                node.add(spec)
            else:
                npm.add(spec.split('/')[0] if not spec.startswith('@') else '/'.join(spec.split('/')[:2]))
        imps = importers.get(f, set())
        prod_in = sorted(i for i in imps if not is_test(i) and feat(i) == own)
        prod_out = sorted(i for i in imps if not is_test(i) and feat(i) != own)
        test_imp = sorted(i for i in imps if is_test(i))
        exports = EXPORT.findall(txt)
        rows.append(dict(
            path=f, test='T' if t else '', loc=loc, blob=blob,
            exports=len(exports), reexports=len(REEXP.findall(txt)),
            longest_fn=longest_fn(txt),
            env=len(re.findall(r'process\.env', txt)), console=len(re.findall(r'console\.\w+\(', txt)),
            express=len(re.findall(r'''from ['"]express['"]|\bRequest\b.*\bResponse\b|\(req,\s*res''', txt)),
            sql=len(re.findall(r'\bsql`|\.selectFrom\(|\.insertInto\(|\.updateTable\(|\.deleteFrom\(|\bprepare\(', txt)),
            tovu_text=len(re.findall(r'(?i)tovu', txt)),
            jini=';'.join(sorted(jini)), node=';'.join(sorted(node)), npm=';'.join(sorted(npm)),
            tovu_deps=';'.join(f'{k}({v})' for k, v in sorted(tovu_deps.items())),
            n_prod_in=len(prod_in), n_prod_out=len(prod_out), n_test_imp=len(test_imp),
            prod_out=';'.join(prod_out), export_names=','.join(exports),
        ))
cols = list(rows[0].keys())
with open(out, 'w') as fh:
    fh.write('\t'.join(cols) + '\n')
    for r in rows:
        fh.write('\t'.join(str(r[c]) for c in cols) + '\n')
print(len(rows), 'rows ->', out)
