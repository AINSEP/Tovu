#!/usr/bin/env python3
"""Mechanical signals for move-to-Jini classification (read-only).

Inputs: d1 backlog (opus-backlog.files.tsv + opus-backlog.md feature lines), dossier-v4 batch rows
(resolved imports/importers), Tovu terra clone source text, Jini terra clone package.json deps.
Outputs: <out>/CLASSIFY-files.tsv (per file) and <out>/features.json (per-feature rollup).
"""
import csv, json, os, re, sys, glob, collections

D1 = "/Users/la/Programming/tovu-terra-d1/development/refactor-patterns/move-to-jini"
DOS = "/Users/la/Programming/Tovu/ADS-memory/.local-artifacts/extraction-survey/2026-11-11/dossier-v4"
TOVU = "/Users/la/Programming/tovu-codex-trial-terra"
JINI = "/Users/la/Programming/jini-terra-base"
OUT = sys.argv[1]

rows = list(csv.DictReader(open(f"{D1}/opus-backlog.files.tsv"), delimiter="\t"))
dos = {}
for f in glob.glob(f"{DOS}/batches/*.jsonl"):
    for line in open(f):
        r = json.loads(line)
        dos[r["path"]] = r
feature_of = {p: r["feature"] for p, r in dos.items()}

# feature lines from opus-backlog.md
flines = {}
for m in re.finditer(r"^- \*\*(.+?)\*\*: (.*)$", open(f"{D1}/opus-backlog.md").read(), re.M):
    flines[m.group(1)] = m.group(2)
scc24 = {f for f, l in flines.items() if "24-feature SCC" in l}

def jini_deps(pkg):
    p = f"{JINI}/packages/{pkg}/package.json"
    if not pkg or not os.path.exists(p):
        return None
    j = json.load(open(p))
    names = set()
    for k in ("dependencies", "peerDependencies", "optionalDependencies"):
        names |= set(j.get(k, {}))
    names |= set(j.get("jini", {}).get("optionalPeers", {}) or {})
    return names

def strip_comments(src):
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    return re.sub(r"(^|[^:\"'`])//[^\n]*", r"\1", src)

RE = {
    "express": re.compile(r"""from\s+["']express["']|require\(["']express["']\)|\bexpress\.Router\b|\bRequestHandler\b|\bres\.(status|json|send|set|cookie|redirect)\(|\bnext\(\s*(err|error)?\s*\)"""),
    "react": re.compile(r"""from\s+["']react["']|\buse(State|Effect|Memo|Callback|Ref)\("""),
    "classname": re.compile(r"className="),
    "console": re.compile(r"\bconsole\.(log|warn|error|info|debug)\("),
    "env": re.compile(r"\bprocess\.env\b|\bimport\.meta\.env\b"),
    "tovu": re.compile(r"tovu", re.I),
    "sql": re.compile(r"\b(SELECT|INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|CREATE TABLE)\b"),
    "fetch": re.compile(r"\bfetch\("),
}

label_of = {r["path"]: r["action"] for r in rows}
files_out = []
for r in rows:
    p = r["path"]
    full = f"{TOVU}/{p}"
    exists = os.path.exists(full)
    src = open(full, errors="replace").read() if exists else ""
    code = strip_comments(src)
    d = dos.get(p, {})
    imps = d.get("imports", {})
    npm = sorted({re.sub(r"^(@[^/]+/[^/]+|[^/@][^/]*).*$", r"\1", s.split()[-1]) for s in imps.get("npm", [])})
    node = sorted(set(imps.get("N", [])))
    deps = jini_deps(r["pkg"])
    new_deps = [n for n in npm if deps is not None and n not in deps and n not in ("react", "react-dom", "express")]
    tdeps = set(); stay_imports = set()
    for t in imps.get("T", []):
        tp = t.split()[-1]
        tf = feature_of.get(tp)
        is_type = t.startswith("type ")
        if not is_type and tp not in label_of and tp in feature_of:
            stay_imports.add(tp)
        if tf and tf != r["feature"] and tp in label_of:
            tdeps.add(("type:" if is_type else "") + tf)
    jini_core = any("@jini-ai/core" in j for j in imps.get("J", []))
    sig = {k: len(rx.findall(code)) for k, rx in RE.items()}
    is_ui = p.endswith(".tsx") or p.endswith(".css") or sig["react"] > 0
    is_server = "express" in npm or bool(re.search(r"""from\s+["']express["']""", code)) or "/server/inbound/" in p
    files_out.append({
        "path": p, "feature": r["feature"], "label": r["action"], "pkg": r["pkg"], "subpath": r["subpath"],
        "loc": int(r["loc"] or 0), "exists": exists, "tier": d.get("tier", ""),
        "prod_importers": d.get("importers", {}).get("prod", ""), "tests": d.get("importers", {}).get("tests", ""),
        "ui": is_ui, "server": is_server, "classnames": sig["classname"], "console": sig["console"],
        "env": sig["env"], "tovu_text": sig["tovu"], "sql": sig["sql"], "node_builtins": ",".join(node),
        "npm": ",".join(npm), "new_deps": ",".join(new_deps), "d2": r["pkg"] == "core",
        "imports_core": jini_core, "tovu_deps": ",".join(sorted(tdeps)), "stay_imports": len(stay_imports),
        "note": (r["survey_note"] or "")[:200].replace("\t", " "),
    })

cols = list(files_out[0].keys())
with open(f"{OUT}/CLASSIFY-files.tsv", "w") as fh:
    fh.write("\t".join(cols) + "\n")
    for f in files_out:
        fh.write("\t".join(str(f[c]) for c in cols) + "\n")

feat = collections.OrderedDict()
for f in files_out:
    x = feat.setdefault(f["feature"], {"files": 0, "loc": 0, "labels": collections.Counter(), "pkgs": collections.Counter(),
                                       "ui": 0, "server": 0, "console": 0, "env": 0, "sql": 0, "new_deps": set(),
                                       "d2": 0, "deps": set(), "type_deps": set(), "tier2": 0, "max_importers": 0,
                                       "missing": 0, "tovu_text": 0, "classnames": 0, "node": set()})
    x["files"] += 1; x["loc"] += f["loc"]; x["labels"][f["label"]] += 1
    if f["pkg"]: x["pkgs"][f["pkg"]] += 1
    for k in ("ui", "server", "d2"):
        x[k] += int(bool(f[k]))
    for k in ("console", "env", "sql", "tovu_text", "classnames"):
        x[k] += f[k]
    x["tier2"] += int(f["tier"] == 2)
    x["missing"] += int(not f["exists"])
    if isinstance(f["prod_importers"], int): x["max_importers"] = max(x["max_importers"], f["prod_importers"])
    x["new_deps"] |= set(filter(None, f["new_deps"].split(",")))
    x["node"] |= set(filter(None, f["node_builtins"].split(",")))
    for dd in filter(None, f["tovu_deps"].split(",")):
        (x["type_deps"] if dd.startswith("type:") else x["deps"]).add(dd.replace("type:", ""))
for name, x in feat.items():
    x["type_deps"] -= x["deps"]
    x["scc24"] = name in scc24
    x["line"] = flines.get(name, "")
    for k in ("new_deps", "deps", "type_deps", "node"):
        x[k] = sorted(x[k])
    x["labels"] = dict(x["labels"]); x["pkgs"] = dict(x["pkgs"].most_common())
json.dump(feat, open(f"{OUT}/features.json", "w"), indent=1)
print("files", len(files_out), "features", len(feat), "scc24", len(scc24), "missing", sum(not f["exists"] for f in files_out))
