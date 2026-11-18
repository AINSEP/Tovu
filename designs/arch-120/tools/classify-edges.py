#!/usr/bin/env python3
"""Join the NEW-edge list with import facts and the rank table. Plan tooling, read-only.
usage: classify-edges.py <new-edges.txt> <head.tsv> <at-baseline-commit.tsv> <feature-ranks.json> [OldName=NewName ...]
An alias maps a symbol renamed since the baseline commit (old name in the baseline tree = new name now).
Prints TSV: edge-id, pair, kind, rank-direction, provenance, names, source, target
provenance: OLD = the same file edge exists in the tree of the baseline commit 9240cbe1;
            MOVED = new file edge, but every imported name was already imported across the same
                    feature pair at 9240cbe1; RENAMED = the same after applying the aliases;
            NEW = anything else."""
import csv, json, sys
new_path, head_path, base_path, ranks_path = sys.argv[1:5]
alias = dict(a.split("=", 1) for a in sys.argv[5:])
ranks = json.load(open(ranks_path))
new = [l.strip() for l in open(new_path) if l.strip()]
def rows(p): return list(csv.reader(open(p), delimiter="\t"))
head, base = rows(head_path), rows(base_path)
base_edges = {f"{r[0]} -> {r[1]}" for r in base}
pair_names, raw_names = {}, {}
for s, t, a, b, k, n in base: raw_names.setdefault((a, b), set()).update(n.split(","))
for s, t, a, b, k, n in base: pair_names.setdefault((a, b), set()).update(alias.get(x, x) for x in n.split(","))
facts = {}
for s, t, a, b, k, n in head:
    e = f"{s} -> {t}"
    f = facts.setdefault(e, {"a": a, "b": b, "kinds": set(), "names": set()})
    f["kinds"].add(k); f["names"].update(n.split(","))
short = lambda p: p.split("/features/", 1)[1]
for i, e in enumerate(new, 1):
    f = facts[e]
    kind = "value" if any(k.startswith("value") for k in f["kinds"]) else "type"
    ra, rb = ranks[f["a"]], ranks[f["b"]]
    direction = "down" if rb < ra else ("same" if rb == ra else "UP")
    if e in base_edges: prov = "OLD"
    elif f["names"] <= raw_names.get((f["a"], f["b"]), set()): prov = "MOVED"
    elif f["names"] <= pair_names.get((f["a"], f["b"]), set()): prov = "RENAMED"
    else: prov = "NEW"
    s, t = e.split(" -> ")
    print("\t".join([f"E{i:03d}", f"{f['a']}->{f['b']}", kind, f"{direction}({ra}->{rb})", prov,
                     ",".join(sorted(f["names"])), short(s), short(t)]))
