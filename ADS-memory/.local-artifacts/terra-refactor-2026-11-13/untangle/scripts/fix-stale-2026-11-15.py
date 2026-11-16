#!/usr/bin/env python3
"""One-off staleness fix (sheets-fix2, 2026-11-15). Rewrites C10, C3 and C3t repoint rows into the
applier's row grammar (apply-repoint.mjs). Writes TSVs with '\t'.join (never csv.writer)."""
import sys
U = sys.argv[1]

def load(p):
    lines = open(p).read().rstrip('\n').split('\n')
    hdr = lines[0].split('\t')
    return hdr, [l.split('\t') + [''] * (len(hdr) - len(l.split('\t'))) for l in lines[1:]]

def save(p, hdr, rows):
    open(p, 'w').write('\n'.join('\t'.join(r) for r in [hdr] + rows) + '\n')

# ---- C10: DynamicValueSchema -> parseDynamicValue is a call-shape change, not a rename: split MOVE + MANUAL
p = f'{U}/sheets/C10.repoint.tsv'; hdr, rows = load(p); out = []
for r in rows:
    if 'parseDynamicValue' in r[3].split(','):
        rest = [n for n in r[3].split(',') if n != 'parseDynamicValue']
        out.append(r[:3] + [','.join(rest), r[4], '', r[6], 'B3: other names move; DynamicValueSchema has its own MANUAL row'])
        out.append(r[:3] + ['DynamicValueSchema', 'MANUAL', '', r[6], r[7] + '; import parseDynamicValue from @jini-ai/protocol/a2ui (merge into the moved statement)'])
    else:
        out.append(r)
save(p, hdr, out)

# ---- C3 / C3t: action-specific rewrites -> applier grammar
C = {h: i for i, h in enumerate(['repo','file','old_spec','names','new_spec','rename','phase','note','line','stmt','action'])}
SK_INPLACE = ('SK-HOST', 'SK-DEBT', 'SK-TEST', 'SK-DB', 'RB+SK-DB')
def fix_c3(rows, tsvname):
    out = []
    for r in rows:
        a, stmt = r[C['action']], r[C['stmt']]
        old = r[C['old_spec']]
        if stmt == 'export' and not old.startswith('export'):
            r[C['old_spec']] = f'export-from {old}'
        if stmt == 'inline' and not old.startswith('import('):
            r[C['old_spec']] = f"import('{old}')"
        if a == 'DROP-NAMES' or (stmt == 'export' and a == 'MOVE'):
            r[C['new_spec']] = 'DROP'
            r[C['note']] = 'no-shells: delete these names from the re-export (importers have their own rows)'
        if a == 'DELETE-FILE':
            r[C['new_spec']] = 'MANUAL'; r[C['names']] = '(file)'
            r[C['note']] = 'delete the whole file (C3t step 1)'
        if a == 'T-SK':
            r[C['rename']] = 'StorageKernel->KyselyKernel'
        if a.startswith(SK_INPLACE) or a == 'SK-HOST-INLINE':
            names = r[C['names']].split(',')
            others = [n for n in names if n.strip() not in ('StorageKernel', 'type StorageKernel', 'RawBuilder', 'type RawBuilder')]
            sk = [n for n in names if n.strip() in ('StorageKernel', 'type StorageKernel')]
            rb = [n for n in names if n.strip() in ('RawBuilder', 'type RawBuilder')]
            if others:
                o = list(r); o[C['names']] = ','.join(others); o[C['rename']] = ''; o[C['action']] = 'MOVE'
                o[C['note']] = f'split from {a}: the other names go to core'
                out.append(o)
            if rb:
                o = list(r); o[C['names']] = ','.join(rb); o[C['new_spec']] = 'kysely'; o[C['rename']] = ''; o[C['action']] = 'RB'
                o[C['note']] = 'RawBuilder comes from kysely (db internal)'
                out.append(o)
            if sk:
                o = list(r); o[C['names']] = ','.join(sk); o[C['new_spec']] = old if stmt != 'inline' else old
                o[C['rename']] = 'StorageKernel->KyselyKernel'; o[C['phase']] = 'c3-rewrite'
                o[C['note']] = 'IN-PLACE rename on the same spec (applier v2 P-APPLY2; v1 skips same-spec rows)'
                o[C['action']] = a.replace('RB+', '').replace('+MOVE', '')
                out.append(o)
            continue
        if a.startswith(('SK-CORE', 'MS-', 'T-MS')):
            r[C['phase']] = 'c3-rewrite'
            r[C['note']] = (r[C['note']] + '; ' if r[C['note']] else '') + 'type-arg rewrite per `rename` text (applier v2 P-APPLY2)'
        out.append(r)
    return out

for name in ('C3', 'C3t'):
    p = f'{U}/sheets/{name}.repoint.tsv'; hdr, rows = load(p)
    assert hdr == list(C), (name, hdr)
    save(p, hdr, fix_c3(rows, name))
