#!/usr/bin/env python3
"""Read-only: find re-export barrels (export * / export {names} from '<pkg spec>') of names a lane TSV moves away
from a package spec, which no TSV row covers, plus the files importing moved names through those barrels.
Regex approximation (multi-line import/export statements supported). Usage: barrel-sweep.py <U> <jiniRoot> <tovuRoot>"""
import os, re, sys, glob
U, ROOTS = sys.argv[1], {'jini': sys.argv[2], 'tovu': sys.argv[3]}
moved = {}   # pkg spec -> {name: lane}
covered = set()  # (repo, file)
for t in glob.glob(f'{U}/sheets/*.repoint.tsv'):
    lane = os.path.basename(t).split('.')[0]
    L = open(t).read().rstrip('\n').split('\n'); h = L[0].split('\t'); ix = {k: i for i, k in enumerate(h)}
    for l in L[1:]:
        f = l.split('\t') + [''] * 12
        covered.add((f[ix['repo']], f[ix['file']]))
        spec = re.sub(r'^(export-from|export \* from)\s+', '', f[ix['old_spec']])
        if not spec.startswith('@jini-ai/') or f[ix['new_spec']] in ('KEEP', 'MANUAL', '', DROP := 'DROP_'):
            continue
        for n in f[ix['names']].split(','):
            n = re.sub(r'^type\s+', '', n.strip()).split(' as ')[0].strip()
            if re.fullmatch(r'\w+', n): moved.setdefault(spec, {})[n] = lane
STMT = re.compile(r'(?:^|\n)\s*(import|export)\s+(type\s+)?(\*|\{[^}]*\}|[\w$]+(?:\s*,\s*\{[^}]*\})?)\s*(?:as\s+\w+\s*)?from\s*[\'"]([^\'"]+)[\'"]', re.S)
def names_of(b):
    return {re.sub(r'^type\s+', '', x.strip()).split(' as ')[-1].strip() for x in b.strip('{} \n').split(',') if x.strip()}
def files(root):
    for d, ds, fs in os.walk(root):
        ds[:] = [x for x in ds if x not in ('node_modules', 'dist', '.git') and not x.startswith('.') and not x.endswith('.nosync')]
        for x in fs:
            if re.search(r'\.(ts|tsx|mts|cts)$', x) and not x.endswith('.d.ts'): yield os.path.join(d, x)
def resolve(src, spec, root):
    if spec.startswith('#src/'): base = os.path.join(root, 'apps/website/src', spec[5:])
    elif spec.startswith('.'): base = os.path.normpath(os.path.join(os.path.dirname(src), spec))
    else: return None
    base = re.sub(r'\.(m?js|tsx?)$', '', base)
    for c in (base + '.ts', base + '.tsx', base + '/index.ts', base + '/index.tsx'):
        if os.path.exists(c): return c
    return None
for repo, root in ROOTS.items():
    texts = {f: open(f, errors='ignore').read() for f in files(os.path.join(root, 'apps' if repo == 'tovu' else 'packages'))}
    if repo == 'jini': texts.update({f: open(f, errors='ignore').read() for f in files(os.path.join(root, 'examples'))})
    barrels = {}  # file -> set(names) re-exported that moved
    for f, t in texts.items():
        for m in STMT.finditer(t):
            if m.group(1) != 'export' or m.group(4) not in moved: continue
            mv = moved[m.group(4)]
            got = set(mv) if m.group(3) == '*' else (names_of(m.group(3)) & set(mv))
            if got: barrels.setdefault(f, {}).update({n: (m.group(4), mv[n]) for n in got})
    for b, ns in sorted(barrels.items()):
        rel = os.path.relpath(b, root); cov = (repo, rel) in covered
        users = []
        for f, t in texts.items():
            for m in STMT.finditer(t):
                if m.group(4).startswith(('.', '#src/')) and resolve(f, m.group(4), root) == b:
                    hit = names_of(m.group(3)) & set(ns) if m.group(3).startswith('{') else set()
                    if hit and (repo, os.path.relpath(f, root)) not in covered: users.append((os.path.relpath(f, root), sorted(hit)))
        if not cov or users:
            print(f'{repo}\tBARREL\t{rel}\tcovered={cov}\t{len(ns)} moved names ({",".join(sorted({v[1] for v in ns.values()}))})')
            for u, h in users: print(f'{repo}\t  USER\t{u}\t{",".join(h)}')
