#!/usr/bin/env python3
"""Diff a fresh census (post or raw) against a lane TSV by (repo, file, base name). Prints rows whose key is missing."""
import sys, re
def base(n):
    n = n.strip(); n = n[5:] if n.startswith('type ') else n
    return n.split(' as ')[0].split(' [')[0].strip()
def load(p):
    L = open(p).read().rstrip('\n').split('\n'); h = L[0].split('\t'); ix = {k: i for i, k in enumerate(h)}
    out = []
    for l in L[1:]:
        f = l.split('\t') + [''] * 12
        out.append((f, {(f[ix['repo']], f[ix['file']], base(n)) for n in f[ix['names']].split(',') if n.strip()}, ix))
    return out
new, old = load(sys.argv[1]), load(sys.argv[2])
oldkeys = set().union(*[k for _, k, _ in old]) if old else set()
oldfiles = {(f[ix['repo']], f[ix['file']]) for f, _, ix in old}
newkeys = set().union(*[k for _, k, _ in new]) if new else set()
miss = [f for f, k, _ in new if not k <= oldkeys]
gone = sorted(oldkeys - newkeys)
print(f'# missing rows: {len(miss)} (new files: {len({(f[0], f[1]) for f in miss} - oldfiles)}); old keys not in census: {len(gone)}')
for f in miss: print('MISS\t' + '\t'.join(f[:8]).rstrip('\t'))
for g in gone[:int(sys.argv[3]) if len(sys.argv) > 3 else 15]: print('GONE\t' + '\t'.join(g))
