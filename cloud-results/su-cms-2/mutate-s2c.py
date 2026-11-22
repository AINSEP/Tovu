#!/usr/bin/env python3
"""S2c T0 mutation loop: each mutation must turn exactly its named test red; the source is restored from git after each."""
import subprocess, sys
ROOT = "/home/user/Tovu"
SRC = "apps/website/src/features/entries/trash-aware-memory-repo.ts"
TEST = "apps/website/src/features/entries/__tests__/unit/trash-aware-memory-repo.characterization.unit.test.ts"
M = [
 ("save: drop the invalidation", "    await this.inner.save(row, options);\n    invalidateMediaAccessEvidence({ owner: this });", "    await this.inner.save(row, options);", "a successful save empties"),
 ("save: invalidate before the checks (a refused save would clear too)", "  async save(row: EntryRecord, options: { expectedVersion?: number | null } = {}): Promise<void> {\n", "  async save(row: EntryRecord, options: { expectedVersion?: number | null } = {}): Promise<void> {\n    invalidateMediaAccessEvidence({ owner: this });\n", "a REFUSED save"),
 ("transaction: drop the finally", "    finally { invalidateMediaAccessEvidence({ owner: this }); }", "    finally { /* none */ }", "a transaction empties"),
 ("transaction: invalidate only on success", "    try { return await this.inner.transaction({ fn }); }\n    finally { invalidateMediaAccessEvidence({ owner: this }); }", "    const out = await this.inner.transaction({ fn });\n    invalidateMediaAccessEvidence({ owner: this });\n    return out;", "a transaction empties"),
 ("saveAny: drop the invalidation", "    await this.inner.save(row);\n    invalidateMediaAccessEvidence({ owner: this });", "    await this.inner.save(row);", "saveAny empties"),
 ("hardDelete: drop the invalidation", "    this.deletedAt.delete(required.id);\n    invalidateMediaAccessEvidence({ owner: this });", "    this.deletedAt.delete(required.id);", "hardDelete empties"),
 ("hardDelete: invalidate for a missing id too", "    if (!(await this.inner.findById(required))) return;", "    if (!(await this.inner.findById(required))) { invalidateMediaAccessEvidence({ owner: this }); return; }", "hardDelete empties"),
 ("a constant owner instead of this (save)", "    await this.inner.save(row, options);\n    invalidateMediaAccessEvidence({ owner: this });", "    await this.inner.save(row, options);\n    invalidateMediaAccessEvidence({ owner: {} });", "only the writing repository"),
 ("findById shows a trashed row", "  async findById(params: { workspaceId: string; id: string }): Promise<EntryRecord | null> {\n    const row = await this.inner.findById(params);\n    return row && !this.deletedAt.has(row.id) ? row : null;", "  async findById(params: { workspaceId: string; id: string }): Promise<EntryRecord | null> {\n    const row = await this.inner.findById(params);\n    return row ?? null;", "a trashed row is hidden"),
 ("listByWorkspace shows trashed rows", "    const live = (await this.inner.listByWorkspace(required, rest)).filter((row) => !this.deletedAt.has(row.id));", "    const live = await this.inner.listByWorkspace(required, rest);", "a trashed row is hidden"),
 ("findAnyById loses the marker", "    return row ? { ...row, deletedAt: this.deletedAt.get(row.id) ?? null } : null;\n  }\n\n  /** The `(type, slug)` holder", "    return row ? { ...row, deletedAt: null } : null;\n  }\n\n  /** The `(type, slug)` holder", "a trashed row is hidden"),
 ("slug conflict: drop the trashed-holder refusal", "    if (holder && holder.id !== row.id && this.deletedAt.has(holder.id)) {", "    if (false as boolean) {", "a slug held by a trashed row"),
 ("slug conflict: rethrow a generic error", "throw new EntrySlugConflictError({ message: `an entry with slug", "throw new VersionConflictError({ message: `an entry with slug", "a slug held by a trashed row"),
 ("hardDelete ignores the workspace", "    if (!(await this.inner.findById(required))) return;\n", "", "every read and hardDelete is scoped"),
 ("offset ignored", "    return sorted.slice(offset, offset + query.limit);", "    return sorted.slice(0, query.limit);", "listPublishedForDisplay honours offset"),
]
def sh(*a, **k): return subprocess.run(a, cwd=ROOT, capture_output=True, text=True, **k)
bad = 0
orig = open(f"{ROOT}/{SRC}").read()
for name, old, new, expect in M:
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
