import subprocess, os
os.chdir("/home/user/Tovu")
SRC = "apps/website/src/features/content-types/repo.rows.ts"
TEST = "apps/website/src/features/content-types/__tests__/repo.characterization.test.ts"
env = dict(os.environ, PATH=os.path.expanduser("~/.local/node24/bin")+":"+os.environ["PATH"], TSX_TSCONFIG_PATH="apps/site-chat/tsconfig.json")
orig = subprocess.check_output(["git","show","HEAD:"+SRC]).decode()
DECL = "apps/website/src/features/content-types/declared-owners.ts"
decl_orig = subprocess.check_output(["git","show","HEAD:"+DECL]).decode()
M = {
 "O1 toRecord returns no owner": ("the widget and widget-area types", SRC, lambda s: s.replace("...(owner !== undefined ? { owner } : {}),", "")),
 "O2 toRecord spreads owner: undefined": ("a site type reads back with no owner key", SRC, lambda s: s.replace("...(owner !== undefined ? { owner } : {}),", "owner,")),
 "O3 toRow drops the undeclared-owner throw": ("an undeclared owner is refused", SRC, lambda s: s.replace("if (record.owner !== undefined && record.owner !== declaredOwnerFor({ key: record.key })) {", "if (false) {")),
 "O4 plain index lookup of the owner": ("a type keyed like an Object.prototype member", DECL, lambda s: s.replace("Object.prototype.hasOwnProperty.call(DECLARED_CONTENT_TYPE_OWNERS, required.key) ? DECLARED_CONTENT_TYPE_OWNERS[required.key] : undefined", "DECLARED_CONTENT_TYPE_OWNERS[required.key]")),
}
for key,(frag,path,fn) in M.items():
    src = orig if path==SRC else decl_orig
    mut = fn(src); assert mut != src, key
    open(path,"w").write(mut)
    r = subprocess.run(["node","--import","tsx","--import","./development/test-support/composed-bundle-env.ts","--test","--experimental-test-module-mocks",TEST],capture_output=True,text=True,env=env)
    out = r.stdout + r.stderr
    fails = [l for l in out.splitlines() if l.startswith("✖") and "failing" not in l]
    verdict = "NOT CHARACTERIZED" if r.returncode==0 else ("RED (expected test)" if any(frag in l for l in fails) else "RED FOR ANOTHER REASON")
    print(f"{key}: {verdict}; red tests: {sorted(set(l[:70] for l in fails))}")
    open(path,"w").write(src)
subprocess.run(["git","status","--porcelain"])
