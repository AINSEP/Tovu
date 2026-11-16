#!/usr/bin/env python3
"""Summarize a <lane>.repoint.tsv: rows and distinct files per repo/phase/action. Usage: repoint-summary.py <tsv>..."""
import csv, sys
from collections import Counter, defaultdict

for path in sys.argv[1:]:
    rows = list(csv.DictReader(open(path), delimiter='\t'))
    acts = Counter()
    files = defaultdict(set)
    for r in rows:
        act = 'repoint' if r['new_spec'].startswith(('@', '.')) else r['new_spec'].split(' ')[0]
        acts[(r['repo'], r['phase'], act)] += 1
        if act != 'KEEP':
            files[(r['repo'], r['phase'])].add(r['file'])
    print(f'== {path.split("/")[-1]}: {len(rows)} rows')
    for k, v in sorted(acts.items()):
        print(f'  rows {v:4d}  {k[0]:5s} {k[1]:17s} {k[2]}')
    for k, v in sorted(files.items()):
        print(f'  files {len(v):3d} {k[0]:5s} {k[1]}')
    allf = defaultdict(set)
    for r in rows:
        if not r['new_spec'].startswith('KEEP'):
            allf[r['repo']].add(r['file'])
    print('  distinct files to edit: ' + ', '.join(f'{k} {len(v)}' for k, v in sorted(allf.items())))
    odd = [r for r in rows if r['new_spec'] in ('MANUAL', 'DROP')]
    for r in odd:
        print(f"  {r['new_spec']:6s} {r['repo']} {r['file']} | {r['old_spec']} | {r['names'][:90]}")
