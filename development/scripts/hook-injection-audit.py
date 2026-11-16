"""Audit: React components that CALL imported custom hooks directly instead of receiving them as an
injectable prop (`function X({ useFooHook = useWiredFoo })`). Rule: apps/admin/INFO.md ## Hooks.
Heuristic (regex, not AST) — limits stated in the output.
usage: hook_injection_audit.py <root-dir> <subdir> [<subdir> ...]
"""
import os, re, sys, collections

BUILTINS = {"useState", "useEffect", "useRef", "useMemo", "useCallback", "useContext", "useId", "useReducer",
            "useLayoutEffect", "useSyncExternalStore", "useTransition", "useDeferredValue",
            "useImperativeHandle", "useInsertionEffect", "useOptimistic", "useActionState", "useFormStatus", "use"}
CALL = re.compile(r"(?<![\w.])(use[A-Z]\w*)\s*\(")
PROP_DEFAULT = re.compile(r"(\w+)\s*=\s*(use[A-Z]\w*)\b")
IMPORT = re.compile(r"import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['\"]([^'\"]+)['\"]", re.S)
COMPONENT = re.compile(r"(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w*)\s*\(|(?:export\s+)?const\s+([A-Z]\w*)\s*=\s*(?:memo\()?\(?")

root, subdirs = sys.argv[1], sys.argv[2:]
per_file = {}
hook_counts = collections.Counter()
by_source = collections.Counter()
for sub in subdirs:
    for dp, dn, fn in os.walk(os.path.join(root, sub)):
        dn[:] = [d for d in dn if d not in ("node_modules", "dist", "__tests__", "__mocks__", "test", "tests")]
        for f in fn:
            if not f.endswith(".tsx") or ".test." in f or ".stories." in f or ".spec." in f:
                continue
            p = os.path.join(dp, f)
            src = open(p, encoding="utf-8", errors="ignore").read()
            if not COMPONENT.search(src):
                continue
            imported = {}
            for names, mod in IMPORT.findall(src):
                for n in names.split(","):
                    n = n.strip().split(" as ")[-1].strip()
                    if n.startswith("use") and n[3:4].isupper():
                        imported[n] = mod
            injected_defaults = {h for _, h in PROP_DEFAULT.findall(src)}
            injected_names = {n for n, _ in PROP_DEFAULT.findall(src)}
            direct = []
            for m in CALL.finditer(src):
                h = m.group(1)
                if h in BUILTINS or h in injected_names:
                    continue
                if h not in imported:  # local helper hooks defined in the same file count too, but separately
                    continue
                line = src.count("\n", 0, m.start()) + 1
                # skip the default-value occurrence itself (`useX = useWiredX` has no call paren, so fine)
                direct.append((h, imported[h], line))
            if direct:
                rel = os.path.relpath(p, root)
                per_file[rel] = direct
                for h, mod, _ in direct:
                    hook_counts[h] += 1
                    by_source["@jini-ai/*" if mod.startswith("@jini-ai/") else ("react/3rd-party" if not mod.startswith(".") else "local")] += 1

total_calls = sum(len(v) for v in per_file.values())
print(f"files with direct (non-injected) imported-hook calls: {len(per_file)}; calls: {total_calls}")
print("by hook source:", dict(by_source))
area = collections.Counter()
for f, v in per_file.items():
    parts = f.split("/")
    area["/".join(parts[:4])] += len(v)
print("top areas:", area.most_common(15))
print("top hooks:", hook_counts.most_common(20))
out = os.environ.get("OUT")
if out:
    with open(out, "w") as fh:
        fh.write("file\tline\thook\timported_from\n")
        for f, v in sorted(per_file.items()):
            for h, mod, line in v:
                fh.write(f"{f}\t{line}\t{h}\t{mod}\n")
print("LIMITS: regex heuristic; counts imported hooks called inside .tsx component files (tests/stories excluded); "
      "a hook called inside another hook file (.hooks.ts) is not counted; third-party hooks (@tiptap useEditorState etc.) are listed separately in 'by hook source'.")
