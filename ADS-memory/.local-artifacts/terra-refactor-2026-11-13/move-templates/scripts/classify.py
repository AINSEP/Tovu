#!/usr/bin/env python3
"""Assign move kinds, blockers, order and cost per feature from CLASSIFY-files.tsv + features.json (read-only)."""
import csv, json, re, sys, math, collections

SP = sys.argv[1]
OUT = sys.argv[2]
files = list(csv.DictReader(open(f"{SP}/CLASSIFY-files.tsv"), delimiter="\t"))
feats = json.load(open(f"{SP}/features.json"))
churn = {}
for line in open(f"{SP}/drift-num.tsv"):
    n, p = line.rstrip("\n").split("\t")
    churn[p] = int(n) if n.isdigit() else 0

UI_PKGS_DIRECT = {"ui", "ui-kit"}  # React here may use @jini-ai/ui itself; elsewhere the kit is injected
OWNER_FEATURES = {  # feature -> owner gate already known
    "website/features/external-mcp": "owner:hosted-MCP",
    "admin/features/security": "decided:retire-Tovu-security(11-10)",
}

def file_kind(f):
    lab, ui, srv = f["label"], f["ui"] == "True", f["server"] == "True"
    if lab == "SHIM": return "REPOINT"
    if lab == "DELETE": return "DELETE"
    if lab in ("DEDUPE", "DEDUPE-UNVERIFIED"): return "DEDUPE"
    if lab in ("DEDUPE-AFTER-HARDENING", "DELETE-AFTER-PARITY"): return "HARDEN"
    if srv: return "SERVER"
    if ui: return "UI"
    return "MOVE" if lab in ("MOVE", "MOVE-AFTER") else "SPLIT"

def slice_tier(kind, fs):
    loc = sum(int(f["loc"]) for f in fs)
    stay = sum(int(f["stay_imports"]) for f in fs)
    fold = any(re.search(r"\b(fold|inline|merge into|repoint)\b", f["note"], re.I) for f in fs)
    unverified = any(f["label"] == "DEDUPE-UNVERIFIED" for f in fs)
    if kind == "REPOINT": return "script"
    if kind == "DELETE": return "Sonnet" if fold or stay or any(int(f["prod_importers"] or 0) for f in fs) else "script"
    if kind in ("SERVER",): return "Opus"
    mapped = all(re.search(r"(→|->|[Hh]ost (contract|port|supplies)|STAY-PRODUCT)", f["note"]) for f in fs)
    if kind == "SPLIT":
        if len(fs) <= 2 and loc <= 600 and stay <= 3: return "Sonnet"
        return "Sonnet+review" if mapped and loc <= 1200 else "Opus"
    if kind in ("UI", "MOVE", "HARDEN", "DEDUPE") and mapped and loc <= 1200 and stay <= 8:
        base = {"UI": loc <= 900 and stay <= 4, "MOVE": stay <= 3, "HARDEN": loc <= 600, "DEDUPE": True}[kind]
        if not base: return "Sonnet+review"
    if kind == "UI": return "Sonnet" if loc <= 900 and stay <= 4 else "Opus"
    if kind == "HARDEN": return "Sonnet" if loc <= 600 else "Opus"
    if kind == "DEDUPE": return "Sonnet" if not (unverified and loc > 400) else "Opus"
    return "Sonnet" if stay <= 3 else "Opus"  # MOVE

def chunks(fs, max_files, max_loc):
    out, cur, loc = [], [], 0
    for f in sorted(fs, key=lambda f: f["path"]):
        l = int(f["loc"])
        if cur and (len(cur) >= max_files or loc + l > max_loc):
            out.append(cur); cur, loc = [], 0
        cur.append(f); loc += l
    if cur: out.append(cur)
    return out

LIMITS = {"REPOINT": (40, 10**9), "DELETE": (15, 3000), "MOVE": (6, 1200), "DEDUPE": (6, 1200),
          "HARDEN": (4, 900), "UI": (6, 1200), "SPLIT": (3, 1200), "SERVER": (4, 1200)}
COST = {"script": (2_000, 0), "Sonnet": (0, 25_000), "Opus": (55_000, 0)}  # (Opus, Sonnet) sheet tokens
EXEC = {"script": 15_000, "Sonnet": 60_000, "Opus": 70_000}  # Sonnet execution tokens per slice

by_feat = collections.defaultdict(list)
for f in files:
    f["kind"] = file_kind(f)
    by_feat[f["feature"]].append(f)

# value deps among backlog features -> SCCs -> leaf-first levels
graph = {k: set(d for d in v["deps"] if d in feats) for k, v in feats.items()}
idx, low, on, stack, comp, n = {}, {}, set(), [], {}, [0]
sys.setrecursionlimit(10000)
def strong(v):
    idx[v] = low[v] = n[0]; n[0] += 1; stack.append(v); on.add(v)
    for w in graph[v]:
        if w not in idx: strong(w); low[v] = min(low[v], low[w])
        elif w in on: low[v] = min(low[v], idx[w])
    if low[v] == idx[v]:
        c = []
        while True:
            w = stack.pop(); on.discard(w); c.append(w)
            if w == v: break
        for w in c: comp[w] = tuple(sorted(c))
for v in graph:
    if v not in idx: strong(v)
comps = set(comp.values())
cgraph = {c: set(comp[w] for v in c for w in graph[v]) - {c} for c in comps}
level = {}
def lev(c):
    if c not in level:
        level[c] = 0
        level[c] = 1 + max((lev(d) for d in cgraph[c]), default=-1)
    return level[c]
for c in comps: lev(c)
big_sccs = sorted((c for c in comps if len(c) > 1), key=lambda c: (-len(c), c[0]))
scc_id = {c: f"S{i+1}" for i, c in enumerate(big_sccs)}

rows, totals = [], collections.Counter()
for name, x in feats.items():
    fs = by_feat[name]
    kind_loc = collections.Counter()
    for f in fs: kind_loc[f["kind"]] += int(f["loc"])
    primary = kind_loc.most_common(1)[0][0]
    share = kind_loc[primary] / max(1, sum(kind_loc.values()))
    slices = []
    for k in kind_loc:
        lim = LIMITS[k]
        for ch in chunks([f for f in fs if f["kind"] == k], *lim):
            slices.append((k, slice_tier(k, ch), ch))
    tiers = collections.Counter(t for _, t, _ in slices)
    cost = "needs Opus" if tiers["Opus"] else ("Sonnet-sheet+Opus-review" if tiers["Sonnet+review"] else ("Sonnet-sheet" if tiers["Sonnet"] else "script"))
    def sl(ch): return sum(int(f["loc"]) for f in ch)
    opus_tok = sum({"script": 2_000, "Opus": 15_000 + 20 * sl(ch), "Sonnet+review": 8_000 + 4 * sl(ch)}.get(t, 0) for _, t, ch in slices)
    son_tok = sum(12_000 + 12 * sl(ch) for _, t, ch in slices if t in ("Sonnet", "Sonnet+review"))
    exec_tok = sum((10_000 if t == "script" else 30_000 + 25 * sl(ch)) for _, t, ch in slices)
    totals["slice_" + cost] += 0
    for _, t, ch in slices: totals["slices_" + t] += 1; totals["loc_" + t] += sl(ch)
    blockers = []
    if x["scc24"]: blockers.append("cycle-cuts")
    c = comp[name]
    if c in scc_id: blockers.append(f"feature-SCC {scc_id[c]}({len(c)})")
    if x["d2"]: blockers.append(f"D2:{x['d2']}f")
    after = x["labels"].get("MOVE-AFTER", 0)
    if after: blockers.append(f"precondition:{after}f")
    if any(f["kind"] == "SERVER" for f in fs): blockers.append("server-port")
    if x["new_deps"]: blockers.append("new-dep:" + "+".join(x["new_deps"][:4]) + ("+" if len(x["new_deps"]) > 4 else ""))
    if any(f["kind"] == "UI" and f["pkg"] and f["pkg"] not in UI_PKGS_DIRECT for f in fs): blockers.append("kit-inject")
    if any(f["kind"] == "HARDEN" for f in fs): blockers.append("jini-hardening-first")
    if name.startswith("desktop/"): blockers.append("packaged-desktop-proof")
    if name in OWNER_FEATURES: blockers.append(OWNER_FEATURES[name])
    if x["missing"]: blockers.append(f"gone-in-terra:{x['missing']}f")
    loc = x["loc"]
    ch = sum(churn.get(f["path"], 0) for f in fs)
    drift = ch / max(1, loc)
    unverified = x["labels"].get("DEDUPE-UNVERIFIED", 0)
    conf = "high"
    if share < 0.6 or drift > 0.25 or unverified or x["labels"].get("MIXED", 0) > 5: conf = "medium"
    if (share < 0.4) or drift > 0.6 or (primary in ("SPLIT", "SERVER") and loc > 3000): conf = "low"
    hard = [b for b in blockers if b.split(":")[0].split(" ")[0] in ("cycle-cuts", "feature-SCC", "server-port", "new-dep", "owner")]
    totals["opus"] += opus_tok; totals["sonnet"] += son_tok; totals["exec"] += exec_tok
    rows.append({
        "feature": name, "kind": primary, "kind_mix": " ".join(f"{k}:{v}" for k, v in kind_loc.most_common()),
        "confidence": conf, "files": x["files"], "loc": loc, "labels": " ".join(f"{k}:{v}" for k, v in sorted(x["labels"].items())),
        "jini_pkgs": ",".join(list(x["pkgs"])[:4]) or "-", "blockers": ";".join(blockers) or "-",
        "hard_blocked": "yes" if hard else ("partial" if blockers else "no"),
        "depends_on": ",".join(sorted(d for d in x["deps"] if d in feats)) or "-",
        "level": level[c], "slices": len(slices),
        "slice_tiers": " ".join(f"{k}:{v}" for k, v in sorted(tiers.items())), "fill_in_cost": cost,
        "est_sheet_tok_opus": opus_tok, "est_sheet_tok_sonnet": son_tok, "est_exec_tok_sonnet": exec_tok,
        "drift_since_survey": f"{drift:.2f}", "path": next(iter(sorted({re.sub(r'/[^/]+$', '', f['path']) for f in fs}, key=len))),
    })
rows.sort(key=lambda r: (r["hard_blocked"] == "yes", r["level"], r["fill_in_cost"] != "script", r["loc"]))
cols = ["feature", "path", "kind", "kind_mix", "confidence", "files", "loc", "labels", "jini_pkgs", "blockers", "hard_blocked",
        "depends_on", "level", "slices", "slice_tiers", "fill_in_cost", "est_sheet_tok_opus", "est_sheet_tok_sonnet",
        "est_exec_tok_sonnet", "drift_since_survey"]
with open(f"{OUT}/CLASSIFY.tsv", "w") as fh:
    fh.write("\t".join(cols) + "\n")
    for r in rows: fh.write("\t".join(str(r[c]) for c in cols) + "\n")
stats = {
    "features": len(rows), "files": len(files), "totals": dict(totals),
    "by_cost": collections.Counter(r["fill_in_cost"] for r in rows),
    "by_kind": collections.Counter(r["kind"] for r in rows),
    "by_conf": collections.Counter(r["confidence"] for r in rows),
    "hard": collections.Counter(r["hard_blocked"] for r in rows),
    "slices": sum(r["slices"] for r in rows),
    "big_sccs": [(scc_id[c], len(c), list(c)) for c in big_sccs],
    "file_kinds": collections.Counter(f["kind"] for f in files),
    "file_kind_loc": {k: sum(int(f["loc"]) for f in files if f["kind"] == k) for k in set(f["kind"] for f in files)},
    "blocker_counts": collections.Counter(b.split(":")[0].split(" ")[0] for r in rows for b in r["blockers"].split(";") if b != "-"),
    "levels": max(r["level"] for r in rows),
}
json.dump(stats, open(f"{SP}/stats.json", "w"), indent=1, default=list)
print(json.dumps({k: v for k, v in stats.items() if k != "big_sccs"}, indent=1, default=list))
print([(a, b) for a, b, _ in stats["big_sccs"]])
