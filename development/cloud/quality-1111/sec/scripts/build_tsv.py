"""Turn the raw tool outputs under ../raw into the SEC TSVs and a summary JSON (report only)."""
import collections
import glob
import json
import os
import re

SEC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(SEC, 'raw')
BASES = {'tovu': '/home/user/Tovu/', 'jini': '/home/user/Jini/'}
summary = {}


def rel(repo, p):
    return p[len(BASES[repo]):] if p.startswith(BASES[repo]) else p


def clean(s):
    return re.sub(r'\s+', ' ', str(s)).strip()


def write_tsv(name, header, rows):
    with open(os.path.join(SEC, name), 'w') as f:
        f.write('\t'.join(header) + '\n')
        for r in rows:
            f.write('\t'.join(clean(x) for x in r) + '\n')


# ---- 1. floating promises -------------------------------------------------------------------
rows, units, skipped = [], [], []
for err in sorted(glob.glob(os.path.join(RAW, 'promises-*.err.txt'))):
    stem = os.path.basename(err)[len('promises-'):-len('.err.txt')]
    repo, unit = stem.split('-', 1)
    unit = unit.replace('_', '/')
    jf = err[:-len('.err.txt')] + '.json'
    errtxt = open(err).read()
    nfiles = sum(1 for _ in open(err[:-len('.err.txt')] + '.files.txt')) if os.path.exists(err[:-len('.err.txt')] + '.files.txt') else 0
    if not os.path.exists(jf) or os.path.getsize(jf) == 0:
        skipped.append((repo, unit, 'unit', clean(errtxt)[:600]))
        units.append((repo, unit, nfiles, 'SKIPPED', 0, 0))
        continue
    data = json.load(open(jf))
    hits = fatal = 0
    for r in data:
        for m in r['messages']:
            if m.get('fatal'):
                fatal += 1
                skipped.append((repo, unit, rel(repo, r['filePath']), clean(m['message'])[:300]))
            elif m.get('ruleId'):
                hits += 1
                rows.append((repo, unit, rel(repo, r['filePath']), m['line'], m['ruleId'], m['message']))
    units.append((repo, unit, nfiles, 'OK' if not fatal else 'PARTIAL', hits, fatal))
write_tsv('floating-promises.tsv', ['repo', 'unit', 'file', 'line', 'rule', 'message'], rows)
write_tsv('floating-promises-units.tsv', ['repo', 'unit', 'files', 'status', 'hits', 'files_not_type_loaded'], units)
write_tsv('floating-promises-skipped.tsv', ['repo', 'unit', 'file', 'error'], skipped)
summary['promises'] = {
    'by_repo_rule': collections.Counter(f'{r[0]}|{r[4]}' for r in rows),
    'by_unit': collections.Counter(f'{r[0]}|{r[1]}' for r in rows),
    'by_file': collections.Counter(f'{r[0]}|{r[2]}' for r in rows),
}

# ---- 2. osv + audits --------------------------------------------------------------------------
SEV_ORDER = {'CRITICAL': 4, 'HIGH': 3, 'MODERATE': 2, 'MEDIUM': 2, 'LOW': 1}
rows = []
for repo in ('tovu', 'jini'):
    f = os.path.join(RAW, f'osv-{repo}.json')
    if not os.path.exists(f) or os.path.getsize(f) == 0:
        continue
    d = json.load(open(f))
    for res in d.get('results', []):
        lock = rel(repo, res['source']['path'])
        for p in res.get('packages', []):
            pk = p['package']
            groups = p.get('groups', [])
            for v in p.get('vulnerabilities', []):
                sev = (v.get('database_specific') or {}).get('severity') or ''
                if not sev:
                    for g in groups:
                        if v['id'] in g.get('ids', []) and g.get('max_severity'):
                            sev = 'CVSS ' + g['max_severity']
                fixed = sorted({e['fixed'] for a in v.get('affected', [])
                                if (a.get('package') or {}).get('name') == pk['name']
                                for rg in a.get('ranges', []) for e in rg.get('events', []) if 'fixed' in e})
                rows.append((repo, lock, pk['name'], pk['version'], v['id'], sev or 'UNKNOWN', ','.join(fixed) or 'none'))
rows.sort(key=lambda r: (-SEV_ORDER.get(r[5], 0), r[0], r[1], r[2]))
write_tsv('osv.tsv', ['repo', 'lockfile', 'package', 'version', 'id', 'severity', 'fixed-in'], rows)
summary['osv'] = {
    'by_repo_sev': collections.Counter(f'{r[0]}|{r[5]}' for r in rows),
    'unique_by_repo': collections.Counter(r[0] for r in {(r[0], r[2], r[3], r[4]) for r in rows}),
    'by_repo_lock': collections.Counter(f'{r[0]}|{r[1]}' for r in rows),
}
audits = {}
for repo, f in (('tovu', 'npm-audit-tovu.json'), ('jini', 'pnpm-audit-jini.json')):
    p = os.path.join(RAW, f)
    if os.path.exists(p) and os.path.getsize(p):
        d = json.load(open(p))
        audits[repo] = (d.get('metadata') or {}).get('vulnerabilities')
        if repo == 'tovu':
            audits['tovu_items'] = sorted((k, v['severity'], len(v.get('via', [])), str(v.get('fixAvailable'))[:60]) for k, v in d.get('vulnerabilities', {}).items())
        else:
            audits['jini_items'] = sorted((a['module_name'], a['severity'], a.get('github_advisory_id') or str(a.get('id')), a.get('patched_versions')) for a in d.get('advisories', {}).values())
summary['audit'] = audits

# ---- 3. semgrep --------------------------------------------------------------------------------
rows, serr = [], {}
for repo in ('tovu', 'jini'):
    f = os.path.join(RAW, f'semgrep-{repo}.json')
    if not os.path.exists(f) or os.path.getsize(f) == 0:
        continue
    d = json.load(open(f))
    for r in d.get('results', []):
        cid = r['check_id']
        cid = re.sub(r'^.*?(semgrep-rules|njsrules|rules-audit-other)\.', r'\1.', cid)
        cid = cid.replace('njsrules.njsscan__rules__semantic_grep__', 'njsscan.')
        rows.append((repo, rel(repo, r['path'] if r['path'].startswith('/') else BASES[repo] + r['path']), r['start']['line'], cid, r['extra'].get('severity', '')))
    serr[repo] = {'errors': len(d.get('errors', [])), 'scanned': len(d.get('paths', {}).get('scanned', [])),
                  'error_types': collections.Counter(e.get('type', '?') if isinstance(e.get('type'), str) else str(e.get('type'))[:40] for e in d.get('errors', []))}
rows.sort(key=lambda r: ({'ERROR': 0, 'WARNING': 1, 'INFO': 2}.get(r[4], 3), r[0], r[1], r[2]))
write_tsv('semgrep.tsv', ['repo', 'file', 'line', 'rule_id', 'severity'], rows)
summary['semgrep'] = {
    'by_repo_rule': collections.Counter(f'{r[0]}|{r[3]}|{r[4]}' for r in rows),
    'by_repo_sev': collections.Counter(f'{r[0]}|{r[4]}' for r in rows),
    'meta': serr,
}

# ---- 4. a11y -----------------------------------------------------------------------------------
rows = []
for f in sorted(glob.glob(os.path.join(RAW, 'a11y-*.json'))):
    repo = os.path.basename(f).split('-')[1]
    for r in json.load(open(f)):
        for m in r['messages']:
            if m.get('ruleId'):
                rows.append((repo, rel(repo, r['filePath']), m['line'], m['ruleId']))
write_tsv('a11y.tsv', ['repo', 'file', 'line', 'rule'], rows)
KEY = {'jsx-a11y/interactive-supports-focus', 'jsx-a11y/click-events-have-key-events', 'jsx-a11y/no-static-element-interactions'}
kb = [r for r in rows if r[3] in KEY]
summary['a11y'] = {
    'by_repo_rule': collections.Counter(f'{r[0]}|{r[3]}' for r in rows),
    'kb_hits_by_repo': collections.Counter(r[0] for r in kb),
    'kb_files_by_repo': collections.Counter(r[0] for r in {(r[0], r[1]) for r in kb}),
    'kb_elements_by_repo': collections.Counter(r[0] for r in {(r[0], r[1], r[2]) for r in kb}),
    'kb_files': collections.Counter(f'{r[0]}|{r[1]}' for r in kb),
}
json.dump(summary, open(os.path.join(SEC, 'summary.json'), 'w'), indent=1, default=list)
for k, v in summary.items():
    print('==', k)
    for kk, vv in v.items():
        print(' ', kk, dict(vv) if isinstance(vv, collections.Counter) and len(vv) < 30 else (vv if not isinstance(vv, collections.Counter) else f'{len(vv)} keys'))
