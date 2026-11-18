#!/usr/bin/env python3
"""Feature-level strongly connected components from cross-feature-imports.mjs output. Plan tooling.
usage: feature-scc.py <imports.tsv>   prints the type-inclusive and the runtime-only SCCs (size > 1)."""
import csv, sys
from collections import defaultdict
sys.setrecursionlimit(10000)
rows = list(csv.reader(open(sys.argv[1]), delimiter="\t"))
def sccs(edges):
    g = defaultdict(set)
    for a, b in edges: g[a].add(b); g[b]
    index, low, stack, on, out, n = {}, {}, [], set(), [], [0]
    def visit(v):
        index[v] = low[v] = n[0]; n[0] += 1; stack.append(v); on.add(v)
        for w in g[v]:
            if w not in index: visit(w); low[v] = min(low[v], low[w])
            elif w in on: low[v] = min(low[v], index[w])
        if low[v] == index[v]:
            comp = []
            while True:
                w = stack.pop(); on.discard(w); comp.append(w)
                if w == v: break
            out.append(sorted(comp))
    for v in list(g):
        if v not in index: visit(v)
    return [c for c in out if len(c) > 1]
print("type-inclusive:", sccs({(r[2], r[3]) for r in rows}))
print("runtime-only:", sccs({(r[2], r[3]) for r in rows if r[4].startswith("value")}))
