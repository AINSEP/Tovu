#!/usr/bin/env python3
"""Per-row pre-check table for the MOVE stages (06-11), embedded in each stage prompt.

Why a script: Terra gets nothing but its prompt, so the prompt names, per row, the exact Jini
destination (export entry -> src folder), the Tovu tests that import the file, the prod importers
it must repoint, and the imports that would block the move. Every value is a HINT computed when the
prompt was written; the prompt's READY check re-verifies each row before any edit.

Usage (from the Tovu clone root): python3 development/refactor-patterns/move-to-jini/move-table.py 06 [07 ...]
Prints one markdown table per stage to stdout; write-prompts.py embeds them. Read-only.
"""
import json, os, re, sys

TOVU = os.getcwd()
JINI = "/Users/la/Programming/jini-terra-d1"
D = "development/refactor-patterns/move-to-jini"
SPEC_RE = re.compile(r"""(?:^|\n)\s*(import|export)\s+(type\s+)?[^'";]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*import\s*['"]([^'"]+)['"]""")
EXTS = (".ts", ".tsx", ".mts")


def resolve(frm, spec):
    if spec.startswith("#src/"):
        base = os.path.join(TOVU, "apps/website/src", spec[5:])
    elif spec.startswith("@/") and "/apps/admin/" in frm:
        base = os.path.join(TOVU, "apps/admin/src", spec[2:])
    elif spec.startswith("."):
        base = os.path.normpath(os.path.join(os.path.dirname(frm), spec))
    else:
        return None
    base = re.sub(r"\.(js|mjs|ts|tsx)$", "", base)
    for cand in [base + e for e in EXTS] + [os.path.join(base, "index" + e) for e in EXTS]:
        if os.path.isfile(cand):
            return os.path.relpath(cand, TOVU)
    return None


def specs(path):
    try:
        src = open(os.path.join(TOVU, path), encoding="utf8").read()
    except OSError:
        return []
    out = []
    for m in SPEC_RE.finditer(src):
        spec = m.group(3) or m.group(4) or m.group(5)
        out.append((spec, bool(m.group(2))))
    return out


def walk(root):
    for dp, dns, fns in os.walk(root):
        dns[:] = [d for d in dns if d not in ("node_modules", "dist", "build", ".vite")]
        for f in fns:
            if f.endswith(EXTS) and not f.endswith(".d.ts"):
                yield os.path.relpath(os.path.join(dp, f), TOVU)


def is_test(p):
    return "__tests__" in p or re.search(r"\.(test|spec)\.", p) is not None


def importers_index():
    idx = {}
    for p in walk(os.path.join(TOVU, "apps")):
        for spec, _ in specs(p):
            r = resolve(os.path.join(TOVU, p), spec)
            if r:
                idx.setdefault(r, set()).add(p)
    return idx


def jini_pkg(pkg):
    try:
        return json.load(open(f"{JINI}/packages/{pkg}/package.json"))
    except OSError:
        return None


def entry_src(exp):
    tgt = exp if isinstance(exp, str) else (exp.get("import") or exp.get("default") or exp.get("types"))
    if not isinstance(tgt, str):
        return None
    src = re.sub(r"^\./dist/", "src/", tgt)
    src = re.sub(r"\.d\.ts$|\.js$", ".ts", src)
    return src


def destination(row, pj):
    pkg = row["pkg"]
    exports = pj.get("exports", {}) if pj else {}
    cands = []
    if row["subpath"]:
        cands.append("." + row["subpath"])
    for m in re.finditer(r"@jini-ai/%s(/[\w./-]+)?" % re.escape(pkg), row["home"]):
        cands.append("." + (m.group(1) or "").rstrip("./") if m.group(1) else ".")
    if not cands:
        cands.append(".")
    for c in cands:
        if c in exports:
            e = entry_src(exports[c])
            if e and not os.path.isfile(f"{JINI}/packages/{pkg}/{e}") and os.path.isfile(f"{JINI}/packages/{pkg}/{e[:-3]}.tsx"):
                e = e[:-3] + ".tsx"
            return c, e
    return cands[0], None


def table(stage, idx):
    return table_from(f"{D}/stage-{stage}.files.tsv", stage, idx)


def table_from(tsv, stage, idx):
    lines = []
    print = lines.append
    rows = []
    with open(tsv, encoding="utf8") as fh:
        head = fh.readline().rstrip("\n").split("\t")
        for line in fh:
            rows.append(dict(zip(head, line.rstrip("\n").split("\t"))))
    stage_set = {r["path"] for r in rows}
    print("| # | path (loc) | pkg | export -> entry file | Tovu tests (M = may move, S = stays) | prod importers | pre-check |")
    print("|---|---|---|---|---|---|---|")
    for i, r in enumerate(rows, 1):
        pj = jini_pkg(r["pkg"])
        sub, entry = destination(r, pj)
        deps = set((pj or {}).get("dependencies", {}) or {}) | set((pj or {}).get("peerDependencies", {}) or {})
        flags = []
        if not os.path.isfile(os.path.join(TOVU, r["path"])):
            flags.append("MISSING")
        if entry is None:
            flags.append(f"no export `{sub}` (BLOCKED unless READY step 3 finds one)")
        src = open(os.path.join(TOVU, r["path"]), encoding="utf8").read() if os.path.isfile(os.path.join(TOVU, r["path"])) else ""
        for spec, type_only in specs(r["path"]):
            res = resolve(os.path.join(TOVU, r["path"]), spec)
            if res:
                if res not in stage_set:
                    flags.append(f"{'type ' if type_only else ''}Tovu `{spec}`")
            elif spec.startswith("@jini-ai/"):
                p = spec.split("/")[1]
                if p not in ("core", r["pkg"]) and not type_only:
                    flags.append(f"value `{spec}`")
            elif spec.startswith("node:") or spec.startswith("."):
                pass
            else:
                npm = "/".join(spec.split("/")[:2]) if spec.startswith("@") else spec.split("/")[0]
                if npm == "express" or npm not in deps:
                    flags.append(f"npm `{npm}` not in {r['pkg']} deps")
        code = "\n".join(l for l in src.split("\n") if not re.match(r"\s*(//|\*|/\*)", l))
        if re.search(r"\bTovu\b|\btovu\b|TOVU_", code):
            flags.append("Tovu string in code")
        if stage == "09" and re.search(r"className|style=|\.css['\"]", src):
            flags.append("visual (className/CSS): stage 12")
        imps = sorted(idx.get(r["path"], ()))
        tests = [t for t in imps if is_test(t)]
        prods = [p for p in imps if not is_test(p)]
        tcol = []
        for t in tests:
            local = {resolve(os.path.join(TOVU, t), s) for s, _ in specs(t)} - {None}
            mocks = re.search(r"\bmock\b", open(os.path.join(TOVU, t), encoding="utf8").read()) is not None
            other = sorted(x.split("/")[-1] for x in local - stage_set)
            why = "mock" if mocks else ("also " + ",".join(other[:3]) if other else "")
            tcol.append(("M " if not why else f"S({why}) ") + t)
            flags = list(dict.fromkeys(flags))
        print(f"| {i} | `{r['path']}` ({r['loc']}) | {r['pkg']} | `{sub}` -> `{entry or '-'}` | {'<br>'.join(tcol) or 'none'} | {len(prods)}: {', '.join(p.split('/')[-1] for p in prods[:6])}{' ...' if len(prods) > 6 else ''} | {'; '.join(flags) or 'clean'} |")


    return "\n".join(lines)


if __name__ == "__main__":
    index = importers_index()
    for st in sys.argv[1:]:
        sys.stdout.write(table(st, index) + "\n")
