"""Render RESULTS.md from the TSVs + summary.json + scripts/notes-*.md (report only)."""
import collections
import csv
import json
import os

SEC = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = json.load(open(os.path.join(SEC, 'summary.json')))


def tsv(name):
    p = os.path.join(SEC, name)
    if not os.path.exists(p):
        return []
    return list(csv.DictReader(open(p), delimiter='\t', quoting=csv.QUOTE_NONE))


def note(name):
    p = os.path.join(SEC, 'scripts', name)
    return open(p).read().strip() + '\n' if os.path.exists(p) else ''


def table(header, rows):
    out = ['| ' + ' | '.join(header) + ' |', '|' + '---|' * len(header)]
    out += ['| ' + ' | '.join(str(c).replace('|', '\\|') for c in r) + ' |' for r in rows]
    return '\n'.join(out) + '\n'


def by_repo(counter_key, rows, repo):
    return sum(1 for r in rows if r['repo'] == repo)


prom, osv, sem, a11y = tsv('floating-promises.tsv'), tsv('osv.tsv'), tsv('semgrep.tsv'), tsv('a11y.tsv')
units = tsv('floating-promises-units.tsv')
skipped = tsv('floating-promises-skipped.tsv')
out = [note('notes-head.md')]

# ---- totals ----
def cnt(rows, repo, pred=lambda r: True):
    return sum(1 for r in rows if r['repo'] == repo and pred(r))

aud = S['audit']
def audfmt(a):
    if not a:
        return 'n/a'
    return f"{sum(v for k, v in a.items() if k != 'total')} (C {a.get('critical', 0)} / H {a.get('high', 0)} / M {a.get('moderate', 0)} / L {a.get('low', 0)})"

def sevfmt(rows, repo):
    c = collections.Counter(r['severity'] for r in rows if r['repo'] == repo)
    return ' / '.join(f'{k} {v}' for k, v in c.most_common())

out.append('## Totals (check × repo)\n')
rows = []
for label, data, extra in [
    ('Floating promises: `no-floating-promises`', prom, lambda r: r['rule'].endswith('no-floating-promises')),
    ('Floating promises: `no-misused-promises`', prom, lambda r: r['rule'].endswith('no-misused-promises')),
    ('Floating promises: units SKIPPED / partial', None, None),
    ('osv-scanner rows (package@version × advisory × lockfile)', osv, lambda r: True),
    ('osv-scanner unique package@version × advisory', None, None),
    ('npm audit (Tovu root) / pnpm audit (Jini), by severity', None, None),
    ('Semgrep findings, security rules', sem, lambda r: r['class'] == 'security'),
    ('Semgrep findings, other (non-security) rules from the JS/TS rule dirs', None, None),
    ('Semgrep files only partially analysed / timeouts / fatal', None, None),
    ('jsx-a11y findings', a11y, lambda r: True),
    ('a11y keyboard-handling hits (3 rules) / distinct elements / files', None, None),
]:
    if label.startswith('Floating promises: units'):
        t = [f"{sum(1 for u in units if u['repo'] == rp and u['status'] == 'SKIPPED')} / {sum(1 for u in units if u['repo'] == rp and u['status'] == 'PARTIAL')} of {sum(1 for u in units if u['repo'] == rp)}" for rp in ('tovu', 'jini')]
    elif label.startswith('osv-scanner unique'):
        t = [len({(r['package'], r['version'], r['id']) for r in osv if r['repo'] == rp}) for rp in ('tovu', 'jini')]
    elif label.startswith('npm audit'):
        t = [audfmt(aud.get('tovu')), audfmt(aud.get('jini'))]
    elif label.startswith('Semgrep findings, other'):
        t = [cnt(sem, rp, lambda r: r['class'] == 'other') for rp in ('tovu', 'jini')]
    elif label.startswith('Semgrep files'):
        m = S['semgrep']['meta']
        t = [' / '.join(str(m.get(rp, {}).get('error_types', {}).get(k, 0)) for k in ('PartialParsing', 'Timeout', 'Fatal error')) + f" (of {m.get(rp, {}).get('scanned', 0)} scanned)" for rp in ('tovu', 'jini')]
    elif label.startswith('a11y keyboard'):
        a = S['a11y']
        t = [f"{a['kb_hits_by_repo'].get(rp, 0)} / {a['kb_elements_by_repo'].get(rp, 0)} / {a['kb_files_by_repo'].get(rp, 0)}" for rp in ('tovu', 'jini')]
    else:
        t = [cnt(data, rp, extra) for rp in ('tovu', 'jini')]
        if data is osv:
            t = [f'{t[i]} ({sevfmt(data, rp)})' if t[i] else '0' for i, rp in enumerate(('tovu', 'jini'))]
        if data is sem:
            t = [f'{t[i]} ({sevfmt([r for r in sem if r["class"] == "security"], rp)})' if t[i] else '0' for i, rp in enumerate(('tovu', 'jini'))]
    rows.append([label] + t)
out.append(table(['check', 'Tovu', 'Jini'], rows))

# ---- 1. promises ----
out.append('\n## 1. Floating / misused promises (typed lint)\n')
out.append(note('notes-promises.md'))
out.append('\nPer unit (every unit run; `files_not_type_loaded` = files the project service could not place in a tsconfig):\n\n')
out.append(table(['repo', 'unit', 'files', 'status', 'hits', 'files_not_type_loaded'],
                 [[u['repo'], u['unit'], u['files'], u['status'], u['hits'], u['files_not_type_loaded']] for u in units]))
c = collections.Counter((r['repo'], r['rule']) for r in prom)
out.append('\nBy rule:\n\n' + table(['repo', 'rule', 'hits'], [[a, b, n] for (a, b), n in c.most_common()]))
c = collections.Counter((r['repo'], r['file']) for r in prom)
out.append('\nTop files:\n\n' + table(['repo', 'file', 'hits'], [[a, b, n] for (a, b), n in c.most_common(25)]))
out.append(f'\nTop 50 of {len(prom)} (full list: `floating-promises.tsv`):\n\n')
out.append(table(['repo', 'file:line', 'rule'], [[r['repo'], f"{r['file']}:{r['line']}", r['rule'].split('/')[-1]] for r in prom[:50]]))

# ---- 2. deps ----
out.append('\n## 2. Dependency vulnerabilities\n')
out.append(note('notes-osv.md'))
c = collections.Counter((r['repo'], r['lockfile']) for r in osv)
out.append('\nosv rows per lockfile:\n\n' + table(['repo', 'lockfile', 'rows'], [[a, b, n] for (a, b), n in sorted(c.items())]))
c = collections.Counter((r['repo'], r['package']) for r in osv)
out.append('\nMost-affected packages (osv rows):\n\n' + table(['repo', 'package', 'rows'], [[a, b, n] for (a, b), n in c.most_common(25)]))
out.append(f'\nTop 50 of {len(osv)} osv rows, most severe first (full list: `osv.tsv`):\n\n')
out.append(table(['repo', 'lockfile', 'package', 'version', 'id', 'severity', 'fixed-in'],
                 [[r['repo'], r['lockfile'], r['package'], r['version'], r['id'], r['severity'], r['fixed-in']] for r in osv[:50]]))
out.append('\nnpm audit (Tovu root) by severity: `' + json.dumps(aud.get('tovu')) + '`\n\n')
out.append('pnpm audit (Jini) by severity: `' + json.dumps(aud.get('jini')) + '`\n\n')
out.append(f"npm audit (Tovu root), every flagged package ({len(aud.get('tovu_items', []))}):\n\n")
out.append(table(['package', 'severity', 'via entries', 'fixAvailable'], aud.get('tovu_items', [])))
out.append(f"\npnpm audit (Jini), every advisory ({len(aud.get('jini_items', []))}):\n\n")
out.append(table(['package', 'severity', 'advisory', 'patched'], aud.get('jini_items', [])))

# ---- 3. semgrep ----
out.append('\n## 3. Semgrep security scan\n')
out.append(note('notes-semgrep.md'))
c = collections.Counter((r['class'], r['repo'], r['rule_id'], r['severity']) for r in sem)
out.append('\nCounts per rule (every rule that fired; security class first):\n\n' + table(['class', 'repo', 'rule id', 'severity', 'hits'], [[k, a, b, s, n] for (k, a, b, s), n in sorted(c.items(), key=lambda kv: (kv[0][0] != 'security', -kv[1]))]))
c = collections.Counter((r['repo'], r['file']) for r in sem if r['class'] == 'security')
out.append('\nFiles with the most security-class hits:\n\n' + table(['repo', 'file', 'hits'], [[a, b, n] for (a, b), n in c.most_common(25)]))
nsec = sum(1 for r in sem if r['class'] == 'security')
out.append(f'\nTop 50 of {nsec} security-class findings (ERROR first; full list incl. the {len(sem) - nsec} other-class rows: `semgrep.tsv`):\n\n')
out.append(table(['repo', 'file:line', 'rule id', 'severity'], [[r['repo'], f"{r['file']}:{r['line']}", r['rule_id'], r['severity']] for r in [x for x in sem if x['class'] == 'security'][:50]]))

# ---- 4. a11y ----
out.append('\n## 4. Accessibility (eslint-plugin-jsx-a11y recommended)\n')
out.append(note('notes-a11y.md'))
c = collections.Counter((r['repo'], r['rule']) for r in a11y)
out.append('\nCounts per rule:\n\n' + table(['repo', 'rule', 'hits'], [[a, b, n] for (a, b), n in c.most_common()]))
kb = S['a11y']['kb_files']
out.append('\nKeyboard-handling gaps (menus/popovers/click targets): files with `interactive-supports-focus` / `click-events-have-key-events` / `no-static-element-interactions` hits, every file:\n\n')
out.append(table(['repo', 'file', 'hits'], [[k.split('|')[0], k.split('|')[1], n] for k, n in sorted(kb.items(), key=lambda kv: -kv[1])]))
out.append(f'\nTop 50 of {len(a11y)} (full list: `a11y.tsv`):\n\n')
out.append(table(['repo', 'file:line', 'rule'], [[r['repo'], f"{r['file']}:{r['line']}", r['rule']] for r in a11y[:50]]))

# ---- tail ----
out.append('\n' + note('notes-tail.md'))
if skipped:
    out.append(f'\nFloating-promises skips (every entry, from `floating-promises-skipped.tsv`, {len(skipped)}):\n\n')
    out.append(table(['repo', 'unit', 'file', 'error'], [[s['repo'], s['unit'], s['file'], s['error'][:300]] for s in skipped]))
open(os.path.join(SEC, 'RESULTS.md'), 'w').write(''.join(out))
print('RESULTS.md written', sum(len(x) for x in out), 'chars')
