#!/usr/bin/env python3
"""Declaration map for every file of every <sheet>.files.tsv. Run from the Tovu CODE worktree root.
usage: decls.py <lanes dir>. Writes <sheet>.decls.tsv (top-level declarations only; tools are in <sheet>.tools.tsv): file, kind, name, exported, first_line, last_line, span.
Spans include comments and blank lines (upper bound for the 50-line function rule)."""
import glob, os, re, sys
D = re.compile(r'^(export\s+)?(?:default\s+)?(?:async\s+)?(?:declare\s+)?(const|let|function\*?|class|type|interface|enum)\s+([A-Za-z0-9_$]+)')
H = re.compile(r'^ {2,6}([a-z][a-z0-9_]+|"[a-z0-9_.-]+"|\[[A-Za-z0-9_.]+\]):\s*(?:async\s*)?(?:\(|[a-zA-Z]+\()')
for ft in sorted(glob.glob(os.path.join(sys.argv[1], '[KT]', '*.files.tsv'))):
    out = ft.replace('.files.tsv', '.decls.tsv'); rows = []; worst = []
    for line in open(ft).read().split('\n')[1:]:
        if not line: continue
        path = line.split('\t')[0]; src = open(path, encoding='utf8', errors='replace').read().split('\n')
        tops = [(i, m) for i, l in enumerate(src, 1) if (m := D.match(l))]
        for k, (i, m) in enumerate(tops):
            end = (tops[k + 1][0] - 1) if k + 1 < len(tops) else len(src)
            while end > i and (src[end - 1].strip() == '' or src[end - 1].lstrip().startswith(('//', '/*', '*', '*/'))): end -= 1
            rows.append((path, 'decl', m.group(3), 'export' if m.group(1) else '', i, end, end - i + 1))
            if m.group(2).startswith('function') or '=>' in src[i - 1] or '(' in src[i - 1]: worst.append((end - i + 1, m.group(3)))
            hs = []  # rev 2 (judge 6): handler rows were regex guesses that counted nested callbacks; real tools are in <sheet>.tools.tsv (symbols.cjs, AST)
            for q, (j, name) in enumerate(hs):
                e2 = (hs[q + 1][0] - 1) if q + 1 < len(hs) else end
                rows.append((path, 'handler', name.strip('"[]'), '', j, e2, e2 - j + 1))
    with open(out, 'w') as fh:
        fh.write('file\tkind\tname\texported\tfirst_line\tlast_line\tspan\n')
        for r in rows: fh.write('\t'.join(str(c) for c in r) + '\n')
    hmax = max([r[6] for r in rows if r[1] == 'handler'] or [0]); nh = len([r for r in rows if r[1] == 'handler'])
    over = sorted([w for w in worst if w[0] > 50], reverse=True)[:4]
    print(os.path.basename(out).replace('.decls.tsv', ''), 'decls', len([r for r in rows if r[1] == 'decl']), 'handlers', nh, 'max_handler', hmax, 'over50:', ' '.join(f'{n}={s}' for s, n in over))
