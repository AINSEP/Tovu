"""EV-4 repoint: Tovu imports of the old events facade -> their owners.
Usage: python3 -I events-repoint.py <TOVU_CLONE> [--dry-run] [--ref <git-ref>]
Writes nothing unless every matched import is fully classified; prints CHANGED <path> per file and a total."""
import re, subprocess, sys

ROOT = sys.argv[1]
DRY = "--dry-run" in sys.argv
REF = sys.argv[sys.argv.index("--ref") + 1] if "--ref" in sys.argv else None
FOLDER = "apps/website/src/contracts/core/events/"
SKIP = {FOLDER + f for f in ("index.ts", "jini-outbox-adapter.ts", "enqueue-only-outbox.ts", "outbox-worker.ts",
                             "outbox-drainer.ts", "memory-bus.ts", "outbox-retry-policies.ts", "__tests__/memory-bus.test.ts")}
MODS = "index|memory-bus|outbox-worker|outbox-drainer|enqueue-only-outbox"
JINI = {"InMemoryOutbox", "InMemoryEventBus", "toEnqueueOnlyOutbox", "MAX_OUTBOX_ATTEMPTS", "DEFAULT_OUTBOX_CLAIM_LEASE_MS",
        "DEFAULT_OUTBOX_DELIVERY_TIMEOUT_MS", "DEFAULT_OUTBOX_DRAIN_INTERVAL_MS", "computeOutboxBackoffMs", "OutboxDrainer"}
TOVU = {"processOutbox", "startOutboxDrainer"}
JSPEC = "@jini-ai/infra/events/outbox"
IMPORT = re.compile(r'import(\s+type)?\s*\{([^}]*)\}\s*from\s*(["\'])([^"\']+)\3;')


def matches(path, spec):
    if re.fullmatch(r"(#src/|(\.\./)+)contracts/core/events/(%s)(\.js)?" % MODS, spec):
        return True
    return path.startswith(FOLDER + "__tests__/") and re.fullmatch(r"\.\./(%s)\.js" % MODS, spec) is not None


def bare(name):
    return name.replace("type ", "").strip()


def transform(path, text):
    hits = [m for m in IMPORT.finditer(text) if matches(path, m.group(4))]
    if not hits:
        return None
    jini_value, jini_type, quote, out, last = [], [], hits[0].group(3), [], 0
    for i, m in enumerate(hits):
        names = [n.strip() for n in m.group(2).split(",") if n.strip()]
        unknown = [n for n in names if bare(n) not in JINI | TOVU]
        if unknown:
            raise SystemExit(f"STOP unknown name(s) {unknown} in {path}")
        tovu = [n for n in names if bare(n) in TOVU]
        jini = [n for n in names if bare(n) in JINI]
        (jini_type if m.group(1) else jini_value).extend(jini)
        repl = []
        if tovu:
            mod = re.search(r"(%s)(\.js)?$" % MODS, m.group(4)).group(1)
            if mod not in ("index", "outbox-worker", "outbox-drainer"):
                raise SystemExit(f"STOP Tovu name from {m.group(4)} in {path}")
            repl.append(f"import{m.group(1) or ''} {{ {', '.join(tovu)} }} from {m.group(3)}{m.group(4)}{m.group(3)};")
        if i == len(hits) - 1:
            if jini_value:
                repl.append(f"import {{ {', '.join(jini_value)} }} from {quote}{JSPEC}{quote};")
            if jini_type:
                repl.append(f"import type {{ {', '.join(jini_type)} }} from {quote}{JSPEC}{quote};")
        out.append(text[last:m.start()])
        out.append("\n".join(repl))
        last = m.end()
    out.append(text[last:])
    new = "".join(out)
    new = re.sub(r"\n\n\n+", "\n\n", new) if new.count("\n\n\n") > text.count("\n\n\n") else new
    if re.search(r'from\s*["\']@jini-ai/infra/events/outbox["\'];[\s\S]*from\s*["\']@jini-ai/infra/events/outbox["\'];', new):
        raise SystemExit(f"STOP two {JSPEC} imports would exist in {path}")
    return new


def read(path):
    if REF:
        return subprocess.run(["git", "-C", ROOT, "show", f"{REF}:{path}"], capture_output=True, text=True, check=True).stdout
    with open(f"{ROOT}/{path}", encoding="utf8") as handle:
        return handle.read()


def files():
    ref = [REF] if REF else []
    cmd = ["git", "-C", ROOT, "grep", "-l", "-E", "contracts/core/events|from [\"']\\.\\./", *ref, "--", "apps/*.ts", "apps/*.tsx"]
    listed = subprocess.run(cmd, capture_output=True, text=True).stdout.split()
    paths = [p.split(":", 1)[1] if REF else p for p in listed]
    return [p for p in paths if p.endswith((".ts", ".tsx")) and p not in SKIP]


changes = {}
for p in files():
    text = read(p)
    if "contracts/core/events" not in text and not p.startswith(FOLDER):
        continue
    new = transform(p, text)
    if new is not None and new != text:
        changes[p] = new
for p in sorted(changes):
    print("CHANGED", p)
    if not DRY:
        with open(f"{ROOT}/{p}", "w", encoding="utf8") as handle:
            handle.write(changes[p])
print("TOTAL", len(changes))
