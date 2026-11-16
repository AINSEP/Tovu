#!/usr/bin/env python3
"""Mechanical sheet filler (PLAN.md W0.3). Python stdlib only; READ-ONLY on both clones.

Usage: make-sheet.py <feature path|name> [--tovu DIR] [--jini DIR] [--kind K|all] [--files SUBSTR]
                     [--out DIR|-] [--max-hits N]
Fills: blobs, loc, exported names + lines, importer census (resolved, scoped to the feature's own
specifiers), tests, baselines, path literals, Jini package/subpath/name existence, re-export maps,
KIND-SUSPECT warnings. Everything needing judgment stays `TODO(judge)`.
"""
import argparse, csv, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
M = os.path.dirname(HERE)
TODO = "TODO(judge)"
CENSUS_INLINE = 25
SIDECAR = []
KIND_PREFIX = {"REPOINT": "RP", "DELETE": "DL", "HARDEN": "HD", "MOVE": "MV", "DEDUPE": "DD", "UI": "UI", "SPLIT": "SP", "SERVER": "SV"}
KIND_SLUG = {"REPOINT": "repoint", "DELETE": "delete", "HARDEN": "harden", "MOVE": "move", "DEDUPE": "dedupe", "UI": "ui", "SPLIT": "split", "SERVER": "server"}


def file_kind(f):  # same rule as scripts/classify.py
    lab, ui, srv = f["label"], f["ui"] == "True", f["server"] == "True"
    if lab == "SHIM": return "REPOINT"
    if lab == "DELETE": return "DELETE"
    if lab in ("DEDUPE", "DEDUPE-UNVERIFIED"): return "DEDUPE"
    if lab in ("DEDUPE-AFTER-HARDENING", "DELETE-AFTER-PARITY"): return "HARDEN"
    if srv: return "SERVER"
    if ui: return "UI"
    return "MOVE" if lab in ("MOVE", "MOVE-AFTER") else "SPLIT"


def run(cmd, cwd):
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    return p.stdout


def blob(root, rel):
    if not os.path.isfile(os.path.join(root, rel)): return "MISSING"
    return run(["git", "hash-object", rel], root).strip() or "MISSING"


# ---------- source reading ----------
def strip_comments(text):
    """Blank out comments but keep newlines so line numbers survive."""
    text = re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)
    return re.sub(r"(?m)(^|\s)//.*$", r"\1", text)


EXPORT_DECL = re.compile(r"(?m)^export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(function\*?|class|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)")
EXPORT_LIST = re.compile(r"(?ms)^export\s+(type\s+)?\{([^}]*)\}(?:\s*from\s*[\"']([^\"']+)[\"'])?")
EXPORT_STAR = re.compile(r"(?m)^export\s+(type\s+)?\*(?:\s+as\s+([\w$]+))?\s+from\s+[\"']([^\"']+)[\"']")
IMPORT_STMT = re.compile(r"(?ms)^import\b.*?[\"'][^\"']+[\"'];?")


def analyze(text):
    code = strip_comments(text)
    ln = lambda pos: code.count("\n", 0, pos) + 1
    exports, reexports = [], []  # (name, line, kind) ; (name, line, spec, is_type)
    for m in EXPORT_DECL.finditer(code):
        exports.append((m.group(2), ln(m.start()), m.group(1)))
    imported = {}
    for m in re.finditer(r"(?ms)^import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*[\"']([^\"']+)[\"']", code):
        for part in m.group(1).split(","):
            part = re.sub(r"^type\s+", "", part.strip())
            if part: imported[part.split(" as ")[-1].strip()] = m.group(2)
    for m in EXPORT_LIST.finditer(code):
        for part in m.group(2).split(","):
            part = part.strip()
            if not part: continue
            is_t = bool(m.group(1)) or part.startswith("type ")
            name = re.sub(r"^type\s+", "", part).split(" as ")[-1].strip()
            local = re.sub(r"^type\s+", "", part).split(" as ")[0].strip()
            if m.group(3): reexports.append((name, ln(m.start()), m.group(3), is_t))
            elif local in imported: reexports.append((name, ln(m.start()), imported[local], is_t))
            else: exports.append((name, ln(m.start()), "list"))
    for m in EXPORT_STAR.finditer(code):
        reexports.append((m.group(2) or "*", ln(m.start()), m.group(3), bool(m.group(1))))
    rest = EXPORT_STAR.sub("", EXPORT_LIST.sub(lambda m: "" if (m.group(3) or all(re.sub(r"^type\s+", "", p.strip()).split(" as ")[0].strip() in imported for p in m.group(2).split(",") if p.strip())) else m.group(0), IMPORT_STMT.sub("", code)))
    rest_lines = [l for l in rest.splitlines() if l.strip() not in ('', ';')]
    has_body = bool(re.search(r"\bfunction\b|=>|\bclass\b", rest))
    return {"exports": exports, "reexports": reexports, "code_lines": len(rest_lines), "has_body": has_body, "code": code}


# ---------- census ----------
def stem_of(rel):
    return re.sub(r"\.(tsx?|jsx?|mjs)$", "", rel)


def census(tovu, rel, max_hits=60):
    stem = stem_of(rel)
    base = os.path.basename(stem)
    key = os.path.basename(os.path.dirname(stem)) if base == "index" else base
    pat = "[\"'][^\"']*" + re.escape(key) + (r"(/index)?" if base == "index" else "") + r"(\.[jt]sx?)?[\"']"
    cmd = ["rg", "-n", "--no-heading", "--no-messages", "-e", pat, "apps", "content", "development", "--glob", "!**/node_modules/**"]
    shown = "rg -n --no-heading -e '%s' apps content development --glob '!**/node_modules/**'  # then resolved against %s" % (pat, rel)
    hits = []
    out = run(cmd, tovu)
    if base == "index":  # an index is also imported as ".", "..", "../x/index.js" etc. from inside its own folder only
        d = os.path.dirname(stem)
        out += "\n" + run(["rg", "-n", "--no-heading", "--no-messages", "-e", "[\"']\\.\\.?(/\\.\\.)*(/index(\\.[jt]sx?)?)?[\"']", d], tovu)
        shown += "  # plus ./ and ../ index specifiers inside " + d
    for line in out.splitlines():
        m = re.match(r"([^:]+):(\d+):(.*)$", line)
        if not m: continue
        path, lno, text = m.group(1), int(m.group(2)), m.group(3)
        for spec in re.findall(r"[\"']([^\"']+)[\"']", text):
            res = resolve(path, spec)
            if res is None: continue
            res = re.sub(r"\.(js|ts|tsx|jsx)$", "", res)
            res = re.sub(r"/index$", "", res)
            tgt = re.sub(r"/index$", "", stem)
            if res == tgt or res == stem:
                hits.append((path, lno, spec, classify_use(text)))
                break
    return shown, sorted(set(hits))[:max_hits * 4]


def resolve(hitfile, spec):
    if spec.startswith("./") or spec.startswith("../"):
        return os.path.normpath(os.path.join(os.path.dirname(hitfile), spec))
    if spec.startswith("#src/"): return "apps/website/src/" + spec[5:]
    if spec.startswith("@/"): return "apps/admin/src/" + spec[2:]
    return None


def classify_use(text):
    if re.search(r"\bimport\s*\(", text): return "dynamic"
    if re.search(r"import\s+type\s*\*|import\s*\*\s*as", text): return "namespace"
    if re.search(r"\b(vi\.mock|mock\.module|jest\.mock)\b", text): return "MOCK"
    if re.search(r"^\s*export\b", text): return "reexport"
    if re.search(r"import\s*\(\s*\"[^\"]+\"\s*\)\.", text): return "import-type"
    return "static"


def is_test(path):
    return "/__tests__/" in path or re.search(r"\.(test|spec)\.[jt]sx?$", path) is not None


def path_literals(tovu, rel, hits):
    stem = stem_of(rel)
    parts = stem.split("/")
    needle = "/".join(parts[-2:]) if len(parts) > 1 else stem
    out = run(["rg", "-n", "--no-heading", "--no-messages", "-F", needle, "apps", "content", "development", ".github", "package.json", "--glob", "!**/node_modules/**", "--glob", "!**/coverage/**", "--glob", "!*.info"], tovu)
    known = {(h[0], h[1]) for h in hits}
    res = []
    for line in out.splitlines():
        m = re.match(r"([^:]+):(\d+):", line)
        if m and (m.group(1), int(m.group(2))) not in known and m.group(1) != rel:
            res.append(line[:200])
    return needle, res[:15]


def baselines(tovu, rel):
    out = run(["rg", "-l", "--no-messages", "-F", rel, "apps", "development", "--glob", "*.json", "--glob", "!**/node_modules/**"], tovu)
    return [l for l in out.splitlines() if l]


# ---------- jini ----------
def jini_exports_line(jini, pkg, subpath):
    pj = os.path.join(jini, "packages", pkg, "package.json")
    if not os.path.isfile(pj): return None, "no packages/%s/package.json" % pkg
    sp = "." if subpath in ("", "/") else "." + subpath.rstrip(".").rstrip("/")
    lines = open(pj).read().splitlines()
    key = '"%s":' % sp
    for i, l in enumerate(lines, 1):
        if l.strip().startswith(key) and ("{" in l or "./" in l):
            return i, "packages/%s/package.json:%d has exports key %s" % (pkg, i, sp)
    return None, "exports key %s ABSENT in packages/%s/package.json (new subpath)" % (sp, pkg)


def jini_name(jini, pkg, name):
    d = "packages/%s/src" % pkg if pkg and os.path.isdir(os.path.join(jini, "packages", pkg, "src")) else "packages"
    out = run(["rg", "-n", "--no-heading", "--no-messages", "-w", "-e", "(export|interface|type|function|const|class)\\s+" + re.escape(name), d, "--glob", "!**/__tests__/**"], jini)
    ls = [l for l in out.splitlines() if l]
    return ls[:2]


def jini_spec_check(jini, spec):
    """@jini-ai/pkg/sub -> exports line in that package."""
    m = re.match(r"@jini-ai/([^/]+)(?:/(.*))?$", spec)
    if not m: return "not a @jini-ai specifier"
    _, msg = jini_exports_line(jini, m.group(1), "/" + m.group(2) if m.group(2) else "")
    return msg


def survivor_from_note(jini, note):
    """Find a Jini survivor file named in the survey note, and report token parity vs the Tovu file later."""
    for cand in re.findall(r"`([\w./-]+\.tsx?)`", note):
        out = run(["rg", "--files", "--no-messages", "-g", "*" + os.path.basename(cand), "packages", "--glob", "!**/node_modules/**", "--glob", "!**/dist/**"], jini)
        fs = [f for f in out.splitlines() if "/node_modules/" not in f]
        for f in fs:
            if f.endswith("/" + cand) or f == cand: return f
        exact = [f for f in fs if os.path.basename(f) == os.path.basename(cand)]
        if len(exact) == 1: return exact[0]
    return None


def tokens(code):
    return set(re.findall(r"[A-Za-z_$][\w$]*", re.sub(r"[\"'][^\"'\n]*[\"']", " ", code)))


def literals(code):
    return set(re.findall(r"[\"']([^\"'\n]+)[\"']", code))


# ---------- sheet pieces ----------
class FileInfo:
    def __init__(self, tovu, jini, row, a_rel, hits_cap):
        self.row, self.rel = row, a_rel
        self.blob = blob(tovu, a_rel)
        txt = open(os.path.join(tovu, a_rel), errors="replace").read() if self.blob != "MISSING" else ""
        self.text = txt
        self.a = analyze(txt)
        self.kind = file_kind(row)
        self.cmd, self.hits = census(tovu, a_rel, hits_cap)
        self.prod = [h for h in self.hits if not is_test(h[0])]
        self.tests = sorted({h[0] for h in self.hits if is_test(h[0])})
        self.lit_needle, self.lits = path_literals(tovu, a_rel, self.hits)
        self.baselines = baselines(tovu, a_rel)
        self.suspect = []
        if self.blob == "MISSING":
            self.suspect.append("MISSING-FILE: %s does not exist in %s (already moved/deleted in this clone?); blob guard cannot be written" % (a_rel, tovu))


def suspects(tovu, jini, fi):
    a, k, row = fi.a, fi.kind, fi.row
    if k == "DELETE" and a["has_body"]:
        fns = [n for n, _, kd in a["exports"] if kd.startswith("function") or kd in ("const", "class")]
        fi.suspect.append("KIND-SUSPECT DELETE: file has real function bodies beyond re-exports (%s); likely DEDUPE/reduce-to-binding or a fold with moved bodies" % (", ".join(fns) or "non-exported helpers"))
    if k == "REPOINT" and a["code_lines"] > 0:
        fi.suspect.append("KIND-SUSPECT REPOINT: %d non-re-export code line(s); T-REPOINT requires re-exports only (else DEDUPE)" % a["code_lines"])
    if k == "HARDEN":
        sv = survivor_from_note(jini, row.get("note", ""))
        if sv:
            jt = analyze(open(os.path.join(jini, sv), errors="replace").read())["code"]
            only = sorted(tokens(a["code"]) - tokens(jt))
            only_lit = sorted(literals(a["code"]) - literals(jt))
            fi.survivor = sv
            fi.parity_tokens = (only, only_lit)
            if not only and not only_lit:
                fi.suspect.append("KIND-SUSPECT HARDEN: parity diff is EMPTY vs %s (Tovu identifiers and literals are all present); likely DEDUPE" % sv)
            elif not [t for t in only if not re.fullmatch(r"[A-Za-z]+", t) or t in ("rule",)] and only_lit and len(only) <= 2:
                fi.suspect.append("KIND-SUSPECT HARDEN: Tovu-only content is limited to %s and string literals %s; looks like a narrowing/binding (DEDUPE), not a Jini gap" % (only, only_lit[:6]))
        else:
            fi.survivor = None


def census_block(fi, lines):
    lines.append("census_cmd: " + fi.cmd)
    lines.append("importers (%d prod, %d test; resolved to this file):" % (len(fi.prod), len(fi.tests)))
    shown = fi.hits if len(fi.hits) <= CENSUS_INLINE else fi.hits[:10]
    for p, l, s, u in shown:
        lines.append("  - %s:%d | %s | \"%s\"" % (p, l, u, s))
    if not fi.hits: lines.append("  - -")
    if len(fi.hits) > CENSUS_INLINE:
        lines.append("  - ... %d more; the full list is in the sidecar <sheet>.census.txt (same format)" % (len(fi.hits) - 10))
        SIDECAR.append((fi.rel, fi.hits))
    flagged = [h for h in fi.hits if h[3] in ("namespace", "MOCK")]
    for h in flagged:
        lines.append("  WARNING %s:%d uses %s (T-REPOINT step 2 / STOP rule)" % (h[0], h[1], h[3]))
    lines.append("path_literals (rg -F \"%s\", not already importers):" % fi.lit_needle)
    for l in fi.lits: lines.append("  - " + l)
    if not fi.lits: lines.append("  - -")
    lines.append("baselines (json files naming the path): " + (", ".join(fi.baselines) if fi.baselines else "-"))


def names_block(fi, lines):
    lines.append("declarations (name | line | kind):")
    for n, l, k in fi.a["exports"]: lines.append("  - %s | %s:%d | %s" % (n, fi.rel, l, k))
    for n, l, spec, t in fi.a["reexports"]: lines.append("  - %s | %s:%d | re-export%s from \"%s\"" % (n, fi.rel, l, " (type)" if t else "", spec))
    if not fi.a["exports"] and not fi.a["reexports"]: lines.append("  - -")


def jini_block(jini, fi, lines):
    row = fi.row
    pkg, sub = row.get("pkg", ""), row.get("subpath", "")
    if not pkg:
        lines.append("jini_target: %s (survey names no package)" % TODO)
        return
    _, msg = jini_exports_line(jini, pkg, sub)
    lines.append("jini_target: %s %s | %s" % (pkg, sub or "/", msg))
    lines.append("jini_names (existing declaration in packages/%s/src, excluding tests; none = free to add):" % pkg)
    names = [n for n, _, _ in fi.a["exports"]] + [n for n, _, _, _ in fi.a["reexports"] if n != "*"]
    for n in names:
        hit = jini_name(jini, pkg, n)
        lines.append("  - %s -> %s" % (n, hit[0] if hit else "ABSENT"))
    if not names: lines.append("  - -")
    lines.append("jini_guards:")
    lines.append("  - %s must not exist" % TODO + "  # new Jini file path")
    lines.append("  - %s blob %s" % ("packages/%s/package.json" % pkg, blob(jini, "packages/%s/package.json" % pkg)))
    lines.append("  - %s blob %s" % ("packages/%s/README.md" % pkg, blob(jini, "packages/%s/README.md" % pkg)))
    lines.append("  - rg -n \"%s\" packages/%s/src -> prints nothing" % ("|".join(names[:12]) or "NAME", pkg))
    if names:
        out = run(["rg", "-n", "--no-messages", "-w", "|".join(map(re.escape, names)), "packages/%s/src" % pkg, "--glob", "!**/__tests__/**"], jini)
        lines.append("    (today it prints %d line(s)%s)" % (len([l for l in out.splitlines() if l]), "; names already exist, check twin/SPLIT" if out.strip() else ""))


def head(kind, feature, fi_list, tag):
    return ["id: %s-%s-1   %s" % (KIND_PREFIX[kind], tag, "(skeleton by make-sheet.py; judgment fields are %s)" % TODO), "feature: " + feature]


def sheet_for(kind, feature, fis, tag, tovu, jini):
    L = head(kind, feature, fis, tag)
    for fi in fis:
        for s in fi.suspect: L.append("WARNING " + s)
    if kind == "DELETE":
        for fi in fis:
            L.append("tovu_file: %s | blob %s" % (fi.rel, fi.blob))
            L.append("why_dead: %s   # dead-root | dead-cluster | pass-through to {target} | barrel | superseded by {jini specifier}" % TODO)
            L.append("reach_check:")
            L.append("  - rg -n --no-heading -F \"%s\" apps content development .github package.json --glob '!**/node_modules/**' --glob '!%s'" % (os.path.basename(stem_of(fi.rel)), fi.rel))
            census_block(fi, L); names_block(fi, L)
            L.append("folds: %s" % TODO)
            L.append("tests:")
            for t in fi.tests: L.append("  - %s | blob %s | %s" % (t, blob(tovu, t), TODO + " delete|repoint"))
            if not fi.tests: L.append("  - -")
            L.append("why_moves: %s\nbaselines_to_edit: %s" % (TODO, ", ".join(fi.baselines) or "-"))
    elif kind == "REPOINT":
        for fi in fis:
            L.append("tovu_file: %s | blob %s" % (fi.rel, fi.blob))
            L.append("symbol_map:")
            for n, l, spec, t in fi.a["reexports"]:
                L.append("  - %s -> %s | %s" % (n, spec, jini_spec_check(jini, spec) if spec.startswith("@jini-ai/") else "not a Jini specifier"))
            if not fi.a["reexports"]: L.append("  - %s (no re-exports found)" % TODO)
            L.append("jini_why: %s   # pointer only | already on Jini declaration | MOVE {comment} -> {jini file}" % TODO)
            L.append("comments_in_file: %d code-free comment line(s) to preserve" % len([1 for x in fi.text.splitlines() if x.strip().startswith(("//", "/*", "*"))]))
            census_block(fi, L)
            L.append("comment_refs: %s" % TODO)
    elif kind == "HARDEN":
        L.append("tovu_files:")
        for fi in fis: L.append("  - %s | blob %s | %s   # delete-and-repoint | reduce-to-binding" % (fi.rel, fi.blob, TODO))
        for fi in fis:
            sv = getattr(fi, "survivor", None)
            L.append("jini_survivor: %s" % ("%s | blob %s" % (sv, blob(jini, sv)) if sv else TODO + " (survey note names none that resolves)"))
            if sv:
                only, lit = fi.parity_tokens
                L.append("parity_hints (mechanical token diff, Tovu-only vs survivor; judge each):")
                L.append("  identifiers only in Tovu: %s" % (only or "none"))
                L.append("  string literals only in Tovu: %s" % (lit or "none"))
            L.append("parity: %s   # P1..Pn rows, generic? yes -> Jini | no -> Tovu option" % TODO)
            census_block(fi, L); jini_block(jini, fi, L)
        L += ["wire_drift: %s" % TODO, "jini_failing_tests: %s" % TODO, "jini_change: %s" % TODO, "new_options: %s" % TODO,
              "changeset: %s" % TODO, "tovu_binding_or_repoint: %s" % TODO, "tovu_tests: %s" % TODO, "jini_msg / tovu_msg: %s" % TODO]
    else:  # MOVE / SPLIT / DEDUPE / UI / SERVER share the mechanical core
        L.append("precondition: %s   # MOVE-AFTER only (label: %s)" % (TODO, ",".join(sorted({f.row['label'] for f in fis}))))
        L.append("tovu_files:")
        for fi in fis:
            tail = "%s" % TODO + " delete|keep-reduced" if kind == "MOVE" else "blob-guarded"
            L.append("  - %s | blob %s | %s | %s loc" % (fi.rel, fi.blob, tail, fi.row["loc"]))
        L.append("tovu_tests:")
        seen = set()
        for fi in fis:
            for t in fi.tests:
                if t in seen: continue
                seen.add(t); L.append("  - %s | blob %s | %s   # move-to-jini | keep-repointed | delete" % (t, blob(tovu, t), TODO))
        if not seen: L.append("  - -")
        for fi in fis:
            L.append("--- file: %s (survey label %s; note: %s)" % (fi.rel, fi.row["label"], (fi.row.get("note") or "-")[:160]))
            names_block(fi, L)
            if kind == "SPLIT":
                L.append("split:   # one row per declaration above, none omitted")
                for n, l, k in fi.a["exports"]: L.append("  - %s | %s" % (n, TODO + " MOVE -> {jini file} | STAY-PRODUCT | STAY-WIRING | DELETE"))
                L.append("ports: %s\nshape_changes: %s" % (TODO, TODO))
            census_block(fi, L); jini_block(jini, fi, L)
        L += ["symbol_map: %s" % TODO, "values_injected: %s" % TODO, "leaf_import_rewrites: %s" % TODO,
              "header_rewrite: %s" % TODO, "why_moves: %s" % TODO, "deletions_in_copy: %s" % TODO, "entry: %s" % TODO,
              "importer_edits: %s   # exact old -> new per importer line above" % TODO]
        if kind == "SPLIT":
            L += ["jini_code: %s" % TODO, "jini_index: %s" % TODO, "tovu_reduced: %s" % TODO, "binding_edits: %s" % TODO, "tests_split: %s" % TODO]
    return "\n".join(L) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("feature")
    ap.add_argument("--tovu", default="/Users/la/Programming/tovu-codex-trial-terra")
    ap.add_argument("--jini", default="/Users/la/Programming/jini-terra-base")
    ap.add_argument("--kind", default=None, help="kind to write, or 'all'; default = the feature's dominant kind")
    ap.add_argument("--files", default=None, help="only files whose path contains this substring")
    ap.add_argument("--out", default=os.path.join(M, "sheets"))
    ap.add_argument("--classify", default=M)
    ap.add_argument("--max-hits", type=int, default=60)
    a = ap.parse_args(argv)
    feats = list(csv.DictReader(open(os.path.join(a.classify, "CLASSIFY.tsv")), delimiter="\t"))
    frow = next((r for r in feats if a.feature in (r["path"], r["feature"])), None)
    if not frow: sys.exit("feature not in CLASSIFY.tsv: " + a.feature)
    rows = [r for r in csv.DictReader(open(os.path.join(a.classify, "CLASSIFY-files.tsv")), delimiter="\t") if r["feature"] == frow["feature"]]
    if a.files: rows = [r for r in rows if a.files in r["path"]]
    kinds = sorted({file_kind(r) for r in rows}) if a.kind == "all" else [a.kind or frow["kind"]]
    written = []
    for kind in kinds:
        sel = [r for r in rows if file_kind(r) == kind]
        if not sel: print("no %s files in %s" % (kind, frow["feature"]), file=sys.stderr); continue
        fis = []
        for r in sel:
            fi = FileInfo(a.tovu, a.jini, r, r["path"], a.max_hits)
            suspects(a.tovu, a.jini, fi); fis.append(fi)
        tag = os.path.basename(frow["path"].rstrip("/"))
        text = sheet_for(kind, frow["feature"], fis, tag, a.tovu, a.jini)
        if a.out == "-": print(text)
        else:
            os.makedirs(a.out, exist_ok=True)
            p = os.path.join(a.out, "%s-%s.gen.md" % (KIND_SLUG[kind], tag))
            open(p, "w").write(text); written.append(p)
            if SIDECAR:
                with open(p[:-3] + ".census.txt", "w") as fh:
                    for rel, hits in SIDECAR:
                        fh.write("# importers of %s\n" % rel)
                        for h in hits: fh.write("%s:%d | %s | \"%s\"\n" % h)
                SIDECAR.clear()
    for p in written: print("wrote", p)
    return written


if __name__ == "__main__":
    main()
