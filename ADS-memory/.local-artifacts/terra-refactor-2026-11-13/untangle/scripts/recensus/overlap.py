#!/usr/bin/env python3
"""Wave-B file-overlap check (sheets-fix3). Lane-owned edits = paths named in the sheet's 'Files touched' section(s)
+ the lane TSV's MANUAL / C-lane rows. Scripted TSV rows (applied by the serial applier after the wave) are listed
separately. Prints pairwise intersections between lanes that run in parallel."""
import re, itertools, os, sys
U = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LANES = {  # lane: (sheet, section heading regexes, tsvs)
 'C3':  ('C3.md',  [r'^#+ Files touched'], ['C3', 'C3t']),
 'C4':  ('C4.md',  [r'^## 7\. Files touched'], ['C4']),
 'C5':  ('C5.md',  [r'^### Files the C5 Sonnet touches'], ['C5']),
 'C7':  ('C7.md',  [r'^## Files touched'], ['C7']),
 'C8':  ('C8.md',  [r'^## 7\. Files touched'], ['C8']),
 'C9a': ('C9a.md', [r'^## Files touched'], ['C9a']),
 'C9-ui': ('C9-ui.md', [r'^## Files, cost'], ['C9-ui']),
 'C10': ('C10.md', [r'^## Files touched'], ['C10', 'C10-shell']),
 'C11': ('C11.md', [r'^## [123]\.'], ['C11']),
 'C2':  ('C2.md',  [r'^## Files touched'], ['C2', 'C2-addendum', 'C1-plus']),
}
PKG = r'(?:packages/)?(?P<pkg>[a-z][\w-]*)/src/(?P<rest>[\w./{},*-]+)'
def expand(s):
    m = re.search(r'\{([^{}]*)\}', s)
    if not m: return [s]
    return [y for x in m.group(1).split(',') for y in expand(s[:m.start()] + x + s[m.end():])]
def section(text, heads):
    out, on = [], False
    for l in text.split('\n'):
        if any(re.match(h, l) for h in heads): on = True; continue
        if on and re.match(r'^#{1,3} ', l): on = False
        if on: out.append(l)
    return '\n'.join(out)
def paths(text):
    got = set()
    for m in re.finditer(r'(?<![\w/])' + PKG, text):
        for e in expand(m.group('rest').rstrip('.,')):
            got.add(f"jini:packages/{m.group('pkg')}/src/{e}")
    for m in re.finditer(r'(?<![\w/])(apps/[\w./{},*-]+)', text):
        for e in expand(m.group(1).rstrip('.,')): got.add('tovu:' + e)
    return {p for p in got if not p.endswith('/')}
def tsv(name, manual):
    p = f'{U}/sheets/{name}.repoint.tsv'
    L = open(p).read().rstrip('\n').split('\n'); h = L[0].split('\t'); ix = {k: i for i, k in enumerate(h)}
    s = set()
    for l in L[1:]:
        f = l.split('\t') + [''] * 12
        own = f[ix['new_spec']] == 'MANUAL' or ('phase' in ix and f[ix['phase']] == 'C-lane')
        if own == manual: s.add(f"{f[ix['repo']]}:{f[ix['file']]}")
    return s
def match(a, b):
    def m(x, y): return x == y or ('*' in x and y.startswith(x.split('*')[0])) or ('*' in y and x.startswith(y.split('*')[0]))
    return {x for x in a for y in b if m(x, y)} | {y for x in a for y in b if m(x, y)}
own, scripted = {}, {}
for lane, (sheet, heads, tsvs) in LANES.items():
    own[lane] = paths(section(open(f'{U}/sheets/{sheet}').read(), heads)) | set().union(*[tsv(t, True) for t in tsvs])
    scripted[lane] = set().union(*[tsv(t, False) for t in tsvs])
par = sys.argv[1].split(',') if len(sys.argv) > 1 else ['C3', 'C4', 'C5', 'C7', 'C8', 'C9a', 'C9-ui', 'C11']
for a in LANES: print(f'# {a}: {len(own[a])} lane-owned paths, {len(scripted[a])} scripted-row files')
for a, b in itertools.combinations(par, 2):
    oo = match(own[a], own[b])
    if oo: print(f'OWN-OWN {a} x {b}: {sorted(oo)}')
for a, b in itertools.permutations(par, 2):
    os_ = match(own[a], scripted[b])
    if os_: print(f'OWN({a}) x ROWS({b}): {len(os_)}: {sorted(os_)[:6]}')
