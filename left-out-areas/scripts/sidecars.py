#!/usr/bin/env python3
"""Sidecars for the left-out sheets. Run from the Tovu CODE worktree root.
usage: sidecars.py <left-out-areas dir>
Reads sheets/SHEETS.map (sheet<TAB>path, path relative to the repo root) and writes per sheet:
  <sheet>.files.tsv      path, lines, blob (full `git hash-object`), prod_importers, test_importers
  <sheet>.importers.tsv  file, importer, kind (prod|test), line, specifier   (resolved import sites only:
                         names reached through a feature index.ts barrel must be traced per name at execution)"""
import os, re, subprocess, sys, collections
root = sys.argv[1]
def sh(*a): return subprocess.run(a, capture_output=True, text=True).stdout
ALL = [f for f in sh('git', 'ls-files', 'apps', 'development', 'scripts', 'packages').split('\n') if re.search(r'\.(ts|tsx|mts|mjs|js)$', f)]
ALLSET = set(ALL)
IMP = re.compile(r'''(?:from\s+|import\s*\(\s*|import\s+|require\(\s*|vi\.(?:do)?[mM]ock\(\s*|importActual[^(]*\(\s*)['"]([^'"]+)['"]''')
def is_test(p): return '__tests__' in p or re.search(r'\.test\.|\.spec\.|/testing/|__fixtures__|/fixtures/', p) is not None
def resolve(src, spec):
    if spec.startswith('#src/'): base = 'apps/website/src/' + spec[5:]
    elif spec.startswith('@/') and src.startswith('apps/admin/'): base = 'apps/admin/src/' + spec[2:]
    elif spec.startswith('.'): base = os.path.normpath(os.path.join(os.path.dirname(src), spec))
    else: return None
    base = re.sub(r'\.(js|mjs|jsx)$', '', base)
    for c in (base, base + '.ts', base + '.tsx', base + '/index.ts', base + '/index.tsx'):
        if c in ALLSET: return c
    return None
sites = collections.defaultdict(list)
for f in ALL:
    try: lines = open(f, encoding='utf8', errors='replace').read().split('\n')
    except OSError: continue
    for n, l in enumerate(lines, 1):
        for m in IMP.finditer(l):
            r = resolve(f, m.group(1))
            if r: sites[r].append((f, 'test' if is_test(f) else 'prod', n, m.group(1)))
by = collections.defaultdict(list)
for line in open(os.path.join(root, 'sheets', 'SHEETS.map')):
    line = line.strip()
    if line and not line.startswith('#'):
        s, p = line.split('\t'); by[s].append(p)
for s, paths in by.items():
    with open(os.path.join(root, 'sheets', s + '.files.tsv'), 'w') as fh, open(os.path.join(root, 'sheets', s + '.importers.tsv'), 'w') as ih:
        fh.write('path\tlines\tblob\tprod_importers\ttest_importers\n'); ih.write('file\timporter\tkind\tline\tspecifier\n')
        tl = 0
        for p in paths:
            if p not in ALLSET: fh.write(f'{p}\tMISSING\t-\t-\t-\n'); continue
            n = open(p, encoding='utf8', errors='replace').read().count('\n'); tl += n
            ss = sites.get(p, [])
            fh.write(f"{p}\t{n}\t{sh('git', 'hash-object', p).strip()}\t{len({x[0] for x in ss if x[1]=='prod'})}\t{len({x[0] for x in ss if x[1]=='test'})}\n")
            for x in sorted(ss): ih.write(f'{p}\t{x[0]}\t{x[1]}\t{x[2]}\t{x[3]}\n')
    print(s, len(paths), 'files', tl, 'lines')
