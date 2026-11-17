#!/usr/bin/env python3
"""Declaration map. Run from the Tovu CODE worktree root.
usage: decls.py <inventory.tsv> <out.decls.tsv>   (reads the `src` rows of an inv.py inventory)
Rows: file, name, kind, exported, first_line, last_line, span. Spans include comments and blank lines
(an upper bound for the 50-line function rule); handler rows are object-literal members inside a
`*Registrations*`/`*Tools*` declaration (tool handlers)."""
import re, sys
D = re.compile(r'^(export\s+)?(?:default\s+)?(?:async\s+)?(?:declare\s+)?(const|let|function\*?|class|type|interface|enum)\s+([A-Za-z0-9_$]+)')
H = re.compile(r'^ {2,6}([a-z][a-z0-9_]+|"[a-z0-9_.-]+"|\[[A-Za-z0-9_.]+\]):\s*(?:async\s*)?(?:\(|[a-zA-Z]+\()')
rows = []
for line in open(sys.argv[1]).read().split('\n')[1:]:
    c = line.split('\t')
    if len(c) < 3 or c[1] != 'src':
        continue
    path = c[0]
    src = open(path, encoding='utf8', errors='replace').read().split('\n')
    tops = [(i, m) for i, l in enumerate(src, 1) if (m := D.match(l))]
    for k, (i, m) in enumerate(tops):
        end = (tops[k + 1][0] - 1) if k + 1 < len(tops) else len(src)
        while end > i and (src[end - 1].strip() == '' or src[end - 1].lstrip().startswith(('//', '/*', '*', '*/'))):
            end -= 1
        rows.append((path, m.group(3), m.group(2), 'export' if m.group(1) else '', i, end, end - i + 1))
        if re.search(r'Registrations|Tools', m.group(3)):
            hs = [(j, h.group(1)) for j in range(i + 1, end + 1) if (h := H.match(src[j - 1]))]
            for q, (j, name) in enumerate(hs):
                e2 = (hs[q + 1][0] - 1) if q + 1 < len(hs) else end
                rows.append((path, name.strip('"[]'), 'handler', '', j, e2, e2 - j + 1))
with open(sys.argv[2], 'w') as fh:
    fh.write('file\tname\tkind\texported\tfirst_line\tlast_line\tspan\n')
    for r in rows:
        fh.write('\t'.join(str(x) for x in r) + '\n')
fn = [r for r in rows if r[2] in ('function', 'function*', 'const', 'handler')]
print(len(rows), 'declarations;', len([r for r in fn if r[6] > 50]), 'function-like spans over 50 ->', sys.argv[2])
