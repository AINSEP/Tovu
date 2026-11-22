#!/usr/bin/env python3
"""S4a T0 mutation loop: each mutation must turn exactly its named test red; the source is restored from git after each."""
import subprocess, sys
ROOT = "/home/user/Tovu"
TEST = "apps/website/src/features/trash/__tests__/entry-sql.characterization.test.ts"
T = "apps/website/src/features/trash/"
M = [
 ("claimDue: drop the due predicate", T+"repo.ts", '          .where("purge_after", "<=", required.now)\n', "", "claimDue takes rows due"),
 ("claimDue: ignore the lease", T+"repo.ts", '          .where((eb) => eb.or([eb("purge_lease_expires_at", "is", null), eb("purge_lease_expires_at", "<=", required.now)]))\n', "", "claimDue takes rows due"),
 ("claimDue: drop the sweep lock", T+"repo.ts", "      await this.kernel.lockKey(SWEEP_LOCK_KEY);\n", "", "claimDue takes the sweep lock"),
 ("claimDue: no transaction (concurrent claimers overlap)", T+"repo.ts", "    return this.kernel.transaction(async () => {\n      await this.kernel.lockKey(SWEEP_LOCK_KEY);", "    return (async () => {\n      await this.kernel.lockKey(SWEEP_LOCK_KEY);", "two concurrent claimers"),
 ("notTrashed: invert the status branch", T+"not-trashed.ts", ': eb(column, "<>", marker.trashed);', ': eb(column, "=", marker.trashed);', "notTrashed, as a real WHERE"),
 ("notTrashed: invert the timestamp branch", T+"not-trashed.ts", 'eb(column, "is", null)', 'eb(column, "is not", null)', "notTrashed, as a real WHERE"),
 ("notTrashed: drop the parent condition", T+"not-trashed.ts", "eb.and([own, parentNotTrashed({ eb, table: entry.table, spec: entry.hiddenWithParent })])", "own", "notTrashed, as a real WHERE"),
 ("readLiveSnapshot: remove notTrashed", T+"entry-sql.ts", "      .where((eb) => notTrashed({ entityType: entry.entityType as TrashEntityType }, { registry: deps.registry })(eb))\n", "", "readLiveSnapshot returns a live row"),
 ("entryWhere: drop the scope clause", T+"entry-sql.ts", "  if (entry.scope) conditions.push(", "  if (false as boolean) conditions.push(", "entryWhere keeps the entry's fixed scope"),
]
def sh(*a, **k): return subprocess.run(a, cwd=ROOT, capture_output=True, text=True, **k)
bad = 0
for name, SRC, old, new, expect in M:
    orig = open(f"{ROOT}/{SRC}").read()
    if orig.count(old) != 1: print("PATTERN NOT UNIQUE:", name); bad += 1; continue
    open(f"{ROOT}/{SRC}", "w").write(orig.replace(old, new))
    r = sh("bash", "/tmp/claude-0/tt.sh", TEST)
    out = r.stdout + r.stderr
    open(f"{ROOT}/{SRC}", "w").write(orig)
    failed = [l for l in out.splitlines() if l.startswith("✖") ]
    if r.returncode == 0: print("NOT CHARACTERIZED:", name); bad += 1
    elif not any(expect in l for l in failed): print("RED FOR ANOTHER REASON:", name, failed[:3]); bad += 1
    else: print("red ok:", name, "->", expect)
print("bad =", bad)
sys.exit(1 if bad else 0)
