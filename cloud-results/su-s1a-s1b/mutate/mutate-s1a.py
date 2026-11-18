import subprocess, sys, os, re, json
os.chdir("/home/user/Tovu")
SRC = "apps/website/src/features/taxonomy/repo.ts"
TEST = "apps/website/src/features/taxonomy/__tests__/repo.characterization.test.ts"
env = dict(os.environ, PATH=os.path.expanduser("~/.local/node24/bin")+":"+os.environ["PATH"], TSX_TSCONFIG_PATH="apps/site-chat/tsconfig.json")
orig = subprocess.check_output(["git","show","HEAD:"+SRC]).decode()

def rep(s, old, new, nth=1):
    idx = -1
    for _ in range(nth):
        idx = s.index(old, idx+1)
    return s[:idx] + new + s[idx+len(old):]

def cls(s, name):
    a = s.index("export class "+name)
    nxt = s.find("export class ", a+10)
    return a, (nxt if nxt != -1 else len(s))

def in_class(s, name, old, new):
    a, b = cls(s, name)
    seg = s[a:b]
    assert old in seg, (name, old)
    return s[:a] + seg.replace(old, new, 1) + s[b:]

def in_method(s, clsname, method, old, new):
    a, b = cls(s, clsname)
    seg = s[a:b]
    m = seg.index(method)
    assert old in seg[m:], (method, old)
    seg = seg[:m] + seg[m:].replace(old, new, 1)
    return s[:a] + seg + s[b:]

W = '.where("workspace_id", "=", this.workspaceId)'
M = {
 "M1 listByTaxonomy without termIsLive": ("term reads:", lambda s: in_method(s,"SqlTermRepo","async listByTaxonomy",".where(termIsLive)","")),
 "M2 term findAnyById gains a status filter": ("term reads:", lambda s: in_method(s,"SqlTermRepo","async findAnyById",'.where("id", "=", id)','.where("id", "=", id).where("status", "!=", TRASH_STATUS)')),
 "M3 trashing a taxonomy updates its terms": ("hiding is not a cascade", lambda s: in_method(s,"SqlTaxonomyRepo","async update","""        .execute()
    );
    return row;""","""        .execute()
    );
    await this.kernel.run((db) => db.updateTable("terms").set({ status: row.status }).where("taxonomy_id", "=", row.id).execute());
    return row;""")),
 "M4 taxonomy update drops the status guard": ("a stale update of a trashed row", lambda s: in_method(s,"SqlTaxonomyRepo","async update",'.where("status", "!=", TRASH_STATUS)\n        .execute()','.execute()')),
 "M5 term update drops termIsLive": ("a stale update of a trashed row", lambda s: in_method(s,"SqlTermRepo","async update",".where(termIsLive)","")),
 "M6 taxonomy transaction drops the lock": ("the taxonomy transaction takes", lambda s: in_method(s,"SqlTaxonomyRepo","async transaction","await this.kernel.lockKey(`taxonomy:${this.workspaceId}`);","")),
 "M7 repointTerm drops the lock": ("repointTerm takes the per-workspace lock", lambda s: in_method(s,"SqlEntryTermRepo","async repointTerm","await this.kernel.lockKey(`taxonomy:${this.workspaceId}`);","")),
 "M8 taxonomy list drops the workspace predicate": ("every class reads only", lambda s: in_method(s,"SqlTaxonomyRepo","async list",W,"")),
 "M9 listForContent drops the workspace predicate": ("every class reads only", lambda s: in_method(s,"SqlEntryTermRepo","async listForContent",'.where("entry_terms.workspace_id", "=", this.workspaceId)',"")),
 "M10 countByTerm drops the workspace predicate": ("every class reads only", lambda s: in_method(s,"SqlEntryTermRepo","async countByTerm",W,"")),
 "M11 listForContent drops termIsLive": ("assignment reads:", lambda s: in_method(s,"SqlEntryTermRepo","async listForContent",".where(termIsLive)","")),
 "M12 taxonomy findLive drops the status filter": ("taxonomy reads:", lambda s: in_method(s,"SqlTaxonomyRepo","private async findLive",'.where("status", "!=", TRASH_STATUS)',"")),
 "M13 listIdsForPurgeAudit gains termIsLive": ("term trash-blind reads", lambda s: in_method(s,"SqlTermRepo","async listIdsForPurgeAudit",'.where("taxonomy_id", "=", taxonomyId)','.where("taxonomy_id", "=", taxonomyId).where(termIsLive)')),
 "M14 countChildren gains a status filter": ("term trash-blind reads", lambda s: in_method(s,"SqlTermRepo","async countChildren",'.where("parent_id", "=", params.parentId)','.where("parent_id", "=", params.parentId).where("status", "!=", TRASH_STATUS)')),
 "M15 terms listByTaxonomy drops the workspace predicate": ("every class reads only", lambda s: in_method(s,"SqlTermRepo","async listByTaxonomy",W,"")),
 "M16 revision listForTests drops the workspace predicate": ("every class reads only", lambda s: in_method(s,"SqlTaxonomyRevisionRepo","async listForTests",W,"")),
}
which = sys.argv[1:] or list(M)
for name in which:
    key = [k for k in M if k.startswith(name)][0] if name not in M else name
    frag, fn = M[key]
    open(SRC,"w").write(fn(orig))
    r = subprocess.run(["node","--import","tsx","--import","./development/test-support/composed-bundle-env.ts","--test","--experimental-test-module-mocks",TEST],capture_output=True,text=True,env=env)
    out = r.stdout + r.stderr
    fails = [l for l in out.splitlines() if l.startswith("✖") and "failing" not in l]
    if r.returncode == 0: verdict = "NOT CHARACTERIZED"
    elif any(frag in l for l in fails): verdict = "RED (expected test)"
    else: verdict = "RED FOR ANOTHER REASON"
    print(f"{key}: {verdict}; red tests: {[l[:70] for l in fails]}")
    open(SRC,"w").write(orig)
subprocess.run(["git","diff","--stat","--",SRC])
