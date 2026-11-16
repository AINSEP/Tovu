#!/usr/bin/env python3
"""Prints the DESIGN.md section 0.1 numbers from ../VARS.tsv and the two scanner outputs (r2).
Usage: python3 counts.py reads-tovu.tsv.gz reads-jini.tsv.gz"""
import csv, gzip, sys, collections
rows = [l.split('\t') for l in open('../VARS.tsv').read().split('\n')[1:] if l]
for repo, path in (('tovu', sys.argv[1]), ('jini', sys.argv[2])):
    mine = [c for c in rows if c[1] == repo]
    prod = [c for c in mine if c[8] not in ('test-only', 'script-only') and c[6] != 'not-env']
    print(f'== {repo}: product env names {len(prod)}; with a read expression {sum(c[10] != "0" for c in prod)}; from a declared set only {sum(c[13] == "declared-set" for c in prod)}; '
          f'named only (launch/list/.env.example) {sum(c[10] == "0" and c[13] != "declared-set" for c in prod)}; secret {sum(c[4] == "yes" for c in prod)}; '
          f'script-only {sum(c[8] == "script-only" for c in mine)}; test-only {sum(c[8] == "test-only" for c in mine)}; not-env rows {sum(c[6] == "not-env" for c in mine)}')
    print('   decision', dict(collections.Counter(c[6] for c in prod)), '\n   kind', dict(collections.Counter(c[8] for c in prod)), '\n   surface', dict(collections.Counter(c[16] for c in prod)))
    if repo == 'tovu': print('   in .env.example', sum(c[12] == 'yes' for c in prod), '; read in product code but not listed', sum(c[12] == 'no' and c[10] != '0' for c in prod))
    hits = [r for r in csv.DictReader(gzip.open(path, 'rt'), delimiter='\t', quoting=csv.QUOTE_NONE) if r['scope'] == 'prod']
    k = collections.Counter(r['kind'] for r in hits)
    direct = [r for r in hits if r['kind'] in ('process.env', 'process.env[const]', 'process.env-write', 'import.meta.env', 'destructure', 'dynamic', 'whole-env') or r['kind'].startswith('whole-env:')]
    files = {r['file'] for r in direct}
    print(f'   product files touching process.env/import.meta.env directly: {len(files)} ({len(direct)} sites; in packages/: {len({f for f in files if f.startswith("packages/")})} files)')
    print(f'   named direct reads {k["process.env"] + k["process.env[const]"] + k["import.meta.env"] + k["destructure"]}; whole-object uses {sum(v for n, v in k.items() if n.startswith("whole-env"))} '
          f'(pass {k["whole-env:pass"]}, alias {k["whole-env:alias"]}, child {k["whole-env:child-env"]}, spread {k["whole-env:spread"]}); injected-map named reads {k["env-param"] + k["env-param[const]"]}; '
          f'computed keys {k["dynamic"] + k["dynamic-env-param"]} ({k["dynamic"]} on process.env); product process.env writes {k["process.env-write"]}; hits on comment lines {sum(v for n, v in k.items() if n.startswith("comment:"))}')
    for name in ('DEV', 'MODE', 'VITE_TOVU_SITE_URL'):
        if repo == 'tovu': print('   import.meta.env.' + name, sum(r['kind'] == 'import.meta.env' and r['name'] == name for r in hits))
