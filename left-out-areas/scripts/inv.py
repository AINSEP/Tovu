#!/usr/bin/env python3
"""Inventory for the left-out areas. Run from the Tovu CODE worktree root (the tree being measured).
usage: inv.py <out.tsv> <classify.tsv|-> <dir-or-file> [...]
One row per tracked .ts/.tsx file under the given paths (tests included, kind column says which).
Counts are `wc -l` style line counts (comments and blanks included)."""
import os, re, subprocess, sys, collections

out, classify, targets = sys.argv[1], sys.argv[2], sys.argv[3:]

def sh(*a):
    return subprocess.run(a, capture_output=True, text=True).stdout

ALL = [f for f in sh('git', 'ls-files', 'apps', 'development', 'scripts', 'packages').split('\n')
       if re.search(r'\.(ts|tsx|mts|mjs|js)$', f) and 'node_modules' not in f]
ALLSET = set(ALL)
IMP = re.compile(r'''(?:from\s+|import\s*\(\s*|import\s+|require\(\s*|vi\.(?:do)?[mM]ock\(\s*|importActual[^(]*\(\s*)['"]([^'"]+)['"]''')

def is_test(p):
    return '__tests__' in p or re.search(r'\.test\.|\.spec\.|/testing/|__fixtures__|/fixtures/', p) is not None

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

imports, importers, text = {}, collections.defaultdict(set), {}
for f in ALL:
    try:
        txt = open(f, encoding='utf8', errors='replace').read()
    except OSError:
        continue
    text[f] = txt
    lst = []
    for m in IMP.finditer(txt):
        if re.search(r'\s', m.group(1)):
            continue  # a quote inside a comment, not an import specifier
        r = resolve(f, m.group(1))
        lst.append((m.group(1), r))
        if r:
            importers[r].add(f)
    imports[f] = lst

labels = {}
if classify != '-':
    for i, line in enumerate(open(classify, encoding='utf8')):
        c = line.rstrip('\n').split('\t')
        if i and len(c) > 4:
            labels[c[0]] = (c[2], (c[3] + c[4]))

def count(rx, txt):
    return len(re.findall(rx, txt))

rows = []
for f in ALL:
    if not any(f == t or f.startswith(t.rstrip('/') + '/') for t in targets):
        continue
    if not re.search(r'\.tsx?$', f):
        continue
    txt = text.get(f, '')
    imps = importers.get(f, set())
    prod = sorted(i for i in imps if not is_test(i))
    tests = sorted(i for i in imps if is_test(i))
    jini = sorted({s.split('/')[1] if s.startswith('@jini-ai/') else s for s, _ in imports[f] if s.startswith('@jini-ai/')})
    npm = sorted({s for s, r in imports[f] if r is None and not s.startswith(('@jini-ai/', 'node:', '@tovu/'))})
    node = sorted({s for s, r in imports[f] if s.startswith('node:')})
    lab = labels.get(f, ('', ''))
    rows.append([
        f, 'test' if is_test(f) else 'src', str(txt.count('\n')),
        sh('git', 'hash-object', f).strip()[:12],
        str(len(prod)), str(len(tests)),
        str(count(r'^export\s', txt) if True else 0) if False else str(len(re.findall(r'(?m)^export\s', txt))),
        str(count(r'process\.env', txt)), str(count(r'\bfetch\(|httpClient|HttpClientPort|egress', txt)),
        str(count(r'(?i)github|gitlab|bitbucket|netlify|vercel|cloudflare|\bs3\b|resend|mailgun|postmark|sendgrid', txt)),
        str(count(r'(?i)\bsql`|\.prepare\(|kysely|drizzle|CREATE TABLE|ALTER TABLE', txt)),
        str(count(r'(?i)secret|credential|token|password|vault', txt)),
        ','.join(n.replace('node:', '') for n in node), ','.join(jini), ','.join(npm),
        lab[0], lab[1],
        ','.join(sorted({re.sub(r'^apps/(website/src|admin/src)/', '', os.path.dirname(p)) for p in prod if not any(p.startswith(t.rstrip('/') + '/') for t in targets if os.path.dirname(f).startswith(t.rstrip('/')))}))[:400],
    ])
hdr = ['path', 'kind', 'lines', 'blob12', 'prod_importers', 'test_importers', 'export_stmts', 'env_reads', 'outbound_hits',
       'vendor_word_hits', 'sql_hits', 'secret_word_hits', 'node_builtins', 'jini_pkgs', 'npm', 'classify_label', 'classify_target', 'outside_prod_importer_dirs']
with open(out, 'w', encoding='utf8') as fh:
    fh.write('\t'.join(hdr) + '\n')
    for r in rows:
        fh.write('\t'.join(r) + '\n')
print(len(rows), 'rows ->', out)
