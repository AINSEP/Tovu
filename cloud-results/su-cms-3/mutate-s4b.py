#!/usr/bin/env python3
"""S4b T0 mutation loop: each mutation must turn its named test red; the source is restored after each."""
import subprocess, sys
ROOT = "/home/user/Tovu"
T = "apps/website/src/features/trash/"
SRC = T + "table-adapter.ts"
TESTS = [T + "__tests__/table-adapter.characterization.test.ts", T + "__tests__/table-adapter.test.ts"]
M = [
 ("swap not-found and version-changed (hide)", "        const before = await readMarkerRow({ workspaceId, entityId });\n        if (!before) return { ok: false, reason: \"not-found\" };\n        if (hasVersionChanged({ entry, row: before, expectedVersion })) {\n          return { ok: false, reason: VERSION_CHANGED };\n        }\n        if (!isMarkerValueLive({ marker: entry.marker, value: before.marker })) {",
  "        const before = await readMarkerRow({ workspaceId, entityId });\n        if (!before) return { ok: false, reason: \"not-found\" };\n        if (!isMarkerValueLive({ marker: entry.marker, value: before.marker })) {\n          return { ok: true, version: entry.versionColumn ? (before.version ?? null) : null, noop: true };\n        }\n        if (hasVersionChanged({ entry, row: before, expectedVersion })) {\n          return { ok: false, reason: VERSION_CHANGED };\n        }\n        if (false as boolean) {", "stale versions win over an already-in-target marker"),
 ("hide: drop noop on idempotent re-hide", "          return { ok: true, version: entry.versionColumn ? (before.version ?? null) : null, noop: true };\n        }\n        const blocked", "          return { ok: true, version: entry.versionColumn ? (before.version ?? null) : null };\n        }\n        const blocked", None),
 ("hide: blocker checked before the idempotent no-op", "        if (!isMarkerValueLive({ marker: entry.marker, value: before.marker })) {\n          // Already trashed", "        const early = await checkBlocker({ entityId });\n        if (early) return early;\n        if (!isMarkerValueLive({ marker: entry.marker, value: before.marker })) {\n          // Already trashed", "never evaluates the blocker"),
 ("hide: drop the blocker", "        const blocked = await checkBlocker({ entityId });\n        if (blocked) return blocked;\n", "", "TERM_HAS_CHILDREN"),
 ("unhide restores a constant instead of priorMarker", "(priorMarker ?? entry.marker.restoreFallback)", "entry.marker.restoreFallback", "recorded priorMarker"),
 ("timestamp hide records priorMarker", "        return { ok: true, version };\n      });\n    },\n\n    /**\n     * Move the marker back", "        return { ok: true, version, priorMarker: null as unknown as string };\n      });\n    },\n\n    /**\n     * Move the marker back", None),
 ("purge: remove the live check", "        if (isMarkerValueLive({ marker: entry.marker, value: row.marker })) return VERSION_CHANGED; // never purge a live row\n", "", "purge of a LIVE"),
 ("purge: claim without the marker guard", "            eb(qualified({ table: entry.table, column: entry.marker.column }), \"=\", row.marker),\n          ];\n          if (entry.versionColumn && row.version", "          ];\n          if (entry.versionColumn && row.version", "claim finds the marker changed"),
 ("purge: claim without the version guard", "            guards.push(eb(qualified({ table: entry.table, column: entry.versionColumn }), \"=\", row.version));", "            void 0;", "a purge raced after its initial read"),
 ("purge: skip phantom trashed_items cleanup", "    if (childIds.length === 0) return;\n", "    return;\n", "taxonomy: purge removes"),
 ("purge: cascade after the parent delete is not possible; skip cascades", "        for (const cascade of entry.purgeFirst ?? []) {\n          await runCascade({ workspaceId, entityId, cascade });\n        }\n", "", None),
 ("hide: remove the lock", "        await lockRow({ workspaceId, entityId });\n        const before = await readMarkerRow({ workspaceId, entityId });\n        if (!before) return { ok: false, reason: \"not-found\" };\n        if (hasVersionChanged({ entry, row: before, expectedVersion })) {\n          return { ok: false, reason: VERSION_CHANGED };\n        }\n        if (!isMarkerValueLive", "        const before = await readMarkerRow({ workspaceId, entityId });\n        if (!before) return { ok: false, reason: \"not-found\" };\n        if (hasVersionChanged({ entry, row: before, expectedVersion })) {\n          return { ok: false, reason: VERSION_CHANGED };\n        }\n        if (!isMarkerValueLive", "hide takes the row's lock key"),
 ("unhide: remove the lock", "        const { priorMarker } = optional;\n        await lockRow({ workspaceId, entityId });\n", "        const { priorMarker } = optional;\n", "unhide takes the row's lock key"),
 ("purge: remove the lock", "        const { workspaceId, entityId, expectedVersion } = purgeRequired;\n        await lockRow({ workspaceId, entityId });\n", "        const { workspaceId, entityId, expectedVersion } = purgeRequired;\n", "purge takes the row's lock key"),
 ("destructure db eagerly", "  let resolved: TrashDb | undefined;\n  const kernel = (): TrashDb => (resolved ??= required.db);", "  const eager = required.db;\n  const kernel = (): TrashDb => eager;", "the database is read on the first call"),
]
def sh(*a): return subprocess.run(a, cwd=ROOT, capture_output=True, text=True)
bad = 0
for name, old, new, expect in [(m[0], m[1], m[2], m[3]) for m in M]:
    orig = open(f"{ROOT}/{SRC}").read()
    if orig.count(old) != 1: print("PATTERN NOT UNIQUE:", name, orig.count(old)); bad += 1; continue
    open(f"{ROOT}/{SRC}", "w").write(orig.replace(old, new))
    r = sh("bash", "/tmp/claude-0/tt.sh", *TESTS)
    out = r.stdout + r.stderr
    open(f"{ROOT}/{SRC}", "w").write(orig)
    failed = [l for l in out.splitlines() if l.startswith("✖") and "(" in l]
    if r.returncode == 0: print("NOT CHARACTERIZED:", name); bad += 1
    elif expect and not any(expect in l for l in failed): print("RED FOR ANOTHER REASON:", name, failed[:3]); bad += 1
    else: print("red ok:", name, "->", (failed[0][:110] if failed else "?"))
print("bad =", bad)
sys.exit(1 if bad else 0)
