import subprocess, os
os.chdir("/home/user/Tovu")
SRC = "apps/website/src/features/entries/repo.ts"
NEW = "apps/website/src/features/entries/__tests__/repo.characterization.test.ts"
DIA = "apps/website/src/features/entries/__tests__/integration/repo.dialects.test.ts"
env = dict(os.environ, PATH=os.path.expanduser("~/.local/node24/bin")+":"+os.environ["PATH"], TSX_TSCONFIG_PATH="apps/site-chat/tsconfig.json")
orig = subprocess.check_output(["git","show","HEAD:"+SRC]).decode()
FIN = "    } finally {\n      invalidateMediaAccessEvidence({ owner: this });\n    }\n  }"
def once(s, old, new):
    assert s.count(old) == 1, (old, s.count(old))
    return s.replace(old, new)
M = {
 "E1 save drops the finally invalidation": (NEW, "a successful save empties", lambda s: once(s, FIN, "    }\n  }")),
 "E2 save invalidates only on the fall-through (not in finally)": (NEW, "a FAILED save", lambda s: once(s, "      throw error;\n"+FIN, "      throw error;\n    }\n    invalidateMediaAccessEvidence({ owner: this });\n  }")),
 "E3 transaction drops the finally invalidation": (NEW, "a transaction empties the cache", lambda s: once(s, "finally { invalidateMediaAccessEvidence({ owner: this }); }", "finally { }")),
 "E4 a constant object is the owner": (NEW, "only the writing repository's linked cache", lambda s: s.replace("invalidateMediaAccessEvidence({ owner: this })", "invalidateMediaAccessEvidence({ owner: {} })")),
 "E5 listPublishedForDisplay drops .offset": (DIA, "display paging applies an explicit offset", lambda s: once(s, ".offset(query.offset ?? 0)", "")),
 "E6 sort key uses the equality helper": (DIA, "sorts a numeric field numerically", lambda s: once(s, 'jsonSortKey(this.kernel.dialect, sql.ref("fields_json"), siteFieldPath({ field: by.field }))', 'jsonScalarEquals(this.kernel.dialect, sql.ref("fields_json"), siteFieldPath({ field: by.field }), "")')),
 "E7 ascending sort drops nullsFirst": (DIA, "a missing field first asc", lambda s: once(s, "ob.asc().nullsFirst()", "ob.asc()")),
 "E8 descending sort drops nullsLast": (DIA, "a missing field first asc", lambda s: once(s, "ob.desc().nullsLast()", "ob.desc()")),
 "E9 sort drops the id tiebreak": (DIA, "ties broken by id", lambda s: once(s, 'select.orderBy("id", "asc").limit', 'select.limit')),
 "E10 where guard removed": (DIA, "an injection-shaped field name matches nothing", lambda s: once(s, "SITE_FIELD_KEY.test(clause.field)\n            ?", "true\n            ?")),
 "E11 sort guard removed": (DIA, "an injection-shaped field name matches nothing", lambda s: once(s, "if (!SITE_FIELD_KEY.test(by.field)) return null;", "")),
 "E12 scoped shows the Trash": (DIA, "Trash: reads hide a trashed row", lambda s: once(s, 'return includeTrashed ? query : query.where("deleted_at", "is", null);', "return query;")),
 "E13 scoped drops the workspace predicate": (DIA, "workspace-scoping boundary", lambda s: once(s, 'const query = db.selectFrom("entries").selectAll().where("workspace_id", "=", workspaceId);', 'const query = db.selectFrom("entries").selectAll();')),
 "E14 slug refusal rethrows the raw error": (DIA, "its slug blocks a new entry", lambda s: once(s, "      if (isUniqueViolation(error)) throw trashedSlugConflict({ slug: record.slug });\n", "")),
 "E15 live upsert guard dropped (a stale save revives a trashed row)": (DIA, "save never revives it", lambda s: once(s, '.onConflict((oc) => oc.column("id").doUpdateSet(values).where("entries.deleted_at", "is", null))', '.onConflict((oc) => oc.column("id").doUpdateSet(values))')),
 "E16 findAnyById drops includeTrashed": (DIA, "findAny* see it", lambda s: once(s, 'this.scoped({ db, workspaceId: params.workspaceId }, { includeTrashed: true }).where("id", "=", params.id)', 'this.scoped({ db, workspaceId: params.workspaceId }).where("id", "=", params.id)')),
}
for key,(test,frag,fn) in M.items():
    mut = fn(orig); assert mut != orig, key
    open(SRC,"w").write(mut)
    r = subprocess.run(["node","--import","tsx","--import","./development/test-support/composed-bundle-env.ts","--test","--experimental-test-module-mocks",test],capture_output=True,text=True,env=env)
    out = r.stdout + r.stderr
    fails = [l for l in out.splitlines() if l.startswith("✖") and "failing" not in l]
    verdict = "NOT CHARACTERIZED" if r.returncode==0 else ("RED (expected test)" if any(frag in l for l in fails) else "RED FOR ANOTHER REASON")
    print(f"{key}: {verdict}; red: {sorted(set(l[:60] for l in fails))[:3]}", flush=True)
    open(SRC,"w").write(orig)
subprocess.run(["git","status","--porcelain","--",SRC])
