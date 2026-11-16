#!/usr/bin/env python3
"""raw.tsv (tovu-facade-census.cjs) -> sheets/C3t.repoint.tsv, columns as C3.repoint.tsv (B1 ruling 2026-11-15)."""
import csv, sys, posixpath
CORE, DBK, DBM = '@jini-ai/core/contracts/storage', '@jini-ai/db/kernel', '@jini-ai/db/migrate'
W = 'apps/website/src/platform/db/'
LEGACY = W + 'migrations/legacy-sqlite.ts'
DIALECT_CORE = {'ColumnInfo', 'isUniqueViolation', 'toBool', 'toBytes'}
def target(fac, name):
    if fac == 'kernel/port.ts':
        return (DBK, 'T-SK', 'StorageKernel => KyselyKernel (type args kept; every use in the file)') if name == 'StorageKernel' else (CORE, 'T-MOVE', '')
    if fac == 'kernel/dialect.ts':
        return (CORE, 'T-MOVE', '') if name in DIALECT_CORE else (DBK, 'T-MOVE', '')
    # migrations/step.ts
    if name == 'MigrationStep':
        return (CORE, 'T-MS', 'MigrationStep => MigrationStep<KyselyKernel<unknown>> (every bare type use; add/merge import type { KyselyKernel } from "@jini-ai/db/kernel")')
    if name == 'MigrationContext': return (CORE, 'T-MOVE', '')
    if name == 'LegacyHistoryError': return ('LEGACY', 'T-LEGACY', 'class moves verbatim into migrations/legacy-sqlite.ts (C3t step 3)')
    if name == 'UnknownAppliedMigrationError':
        return (DBM, 'T-ERR', 'the Jini class (Tovu subclass deleted; runner passes appName "Tovu", so message and ids are unchanged)')
    return (DBM, 'T-MOVE', '')
def rel_legacy(f):
    r = posixpath.relpath(LEGACY, posixpath.dirname(f)).replace('.ts', '.js')
    return r if r.startswith('.') else './' + r
class _W:
    def writerow(self, r): sys.stdout.write("\t".join(r) + "\n")
w = _W()
w.writerow(['repo', 'file', 'old_spec', 'names', 'new_spec', 'rename', 'phase', 'note', 'line', 'stmt', 'action'])
for f in ['kernel/port.ts', 'kernel/dialect.ts', 'migrations/step.ts']:
    w.writerow(['tovu', W + f, '', '*', 'DELETE-FILE', '', 'wave', 'B1: facade deleted, no exception; importers below', '', 'file', 'DELETE-FILE'])
rows = list(csv.DictReader(open(sys.argv[1]), delimiter='\t'))
for r in rows:
    names = r['names'].split(',')
    facs = r['facade'].split(',')
    stmt = 'export' if r['kind'] == 'export-from' else r['kind']
    if r['kind'] == 'export-from':
        w.writerow(['tovu', r['file'], r['old_spec'], r['names'], 'DROP', '', 'wave', 'barrel shell: delete the line (its importers have their own rows)', r['line'], 'export', 'DROP'])
        continue
    groups = {}
    for n in names:
        bare = n[5:] if n.startswith('type ') else n
        base = bare.split(' as ')[0]
        fac = facs[0] if len(facs) == 1 else None
        if fac is None:  # several facades on one barrel line: pick by name
            fac = 'kernel/port.ts' if base.startswith('Storage') or base == 'UnsupportedCapabilityError' else ('migrations/step.ts' if base in ('MigrationStep','MigrationContext','MigrationChecksumError','MIGRATION_ID','LegacyHistoryError','UnknownAppliedMigrationError') else 'kernel/dialect.ts')
        spec, action, rename = target(fac, base)
        if spec == 'LEGACY': spec = rel_legacy(r['file'])
        g = groups.setdefault((spec, action), {'names': [], 'rename': rename})
        g['names'].append(n)
    for (spec, action), g in groups.items():
        note = ''
        if r['file'].endswith('jini-db-facades.integration.test.ts') and action == 'T-ERR':
            note = 'MANUAL too: line 78 `new UnknownAppliedMigrationError([content.id])` -> add second arg "Tovu"; delete the test "kernel shims expose the same shared implementations" (lines 22-25: it tests the deleted facades)'
            action = 'T-ERR+MANUAL'
        w.writerow(['tovu', r['file'], r['old_spec'], ','.join(g['names']), spec, g['rename'], 'wave', note, r['line'], stmt, action])
