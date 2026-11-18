import subprocess, sys, os, re, json
os.chdir("/home/user/Tovu")
SRC = "apps/website/src/features/navigation/repo.ts"
TEST = "apps/website/src/features/navigation/__tests__/repo.characterization.test.ts"
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


WSM = '.where("workspace_id", "=", required.workspaceId)'
M = {
 "N1 compareAndSet drops the version predicate": ("a save with a stale expectedVersion", lambda s: in_method(s,"SqlMenuRepo","private async compareAndSet",'.where("version", "=", expectedVersion)',"")),
 "N2 findOne drops the trash filter": ("menu reads:", lambda s: in_method(s,"SqlMenuRepo","private async findOne",'if (!includeTrashed) query = query.where("status", "!=", TRASH);',"")),
 "N3 findBySlug drops the trash filter": ("menu reads:", lambda s: in_method(s,"SqlMenuRepo","async findBySlug",'.where("status", "!=", TRASH)',"")),
 "N4 list drops the trash filter": ("menu reads:", lambda s: in_method(s,"SqlMenuRepo","async list",'.where("status", "!=", TRASH)',"")),
 "N5 upsert drops the live-row guard": ("a plain save never revives", lambda s: in_method(s,"SqlMenuRepo","async save",'.where("menus.status", "!=", TRASH)',"")),
 "N6 remove drops the workspace predicate": ("every menu read and the remove", lambda s: in_method(s,"SqlMenuRepo","async remove",WSM,"")),
 "N7 findBySlug drops the workspace predicate": ("every menu read and the remove", lambda s: in_method(s,"SqlMenuRepo","async findBySlug",WSM,"")),
 "N8 list drops the workspace predicate": ("every menu read and the remove", lambda s: in_method(s,"SqlMenuRepo","async list",WSM,"")),
 "N9 findOne drops the workspace predicate": ("every menu read and the remove", lambda s: in_method(s,"SqlMenuRepo","private async findOne",'.where("workspace_id", "=", required.workspaceId)',"")),
 "N10 compareAndSet drops the workspace predicate": ("a compare-and-set save never touches", lambda s: in_method(s,"SqlMenuRepo","private async compareAndSet",'.where("workspace_id", "=", record.workspaceId)',"")),
 "N11 menu transaction takes a lock": ("the menu transaction commits", lambda s: in_method(s,"SqlMenuRepo","async transaction","return this.kernel.transaction(fn);","return this.kernel.transaction(async () => { await this.kernel.lockKey(\"menus\"); return fn(); });")),
 "N12 listByMenu drops the workspace predicate": ("binding reads and writes", lambda s: in_method(s,"SqlNavLocationBindingRepo","async listByMenu",WSM,"")),
 "N13 removeByMenu drops the workspace predicate": ("binding reads and writes", lambda s: in_method(s,"SqlNavLocationBindingRepo","async removeByMenu",WSM,"")),
 "N14 binding remove drops the workspace predicate": ("binding reads and writes", lambda s: in_method(s,"SqlNavLocationBindingRepo","async remove(",WSM,"")),
 "N15 rebuild delete drops the workspace predicate": ("binding reads and writes", lambda s: in_method(s,"SqlNavLocationBindingRepo","async rebuildForWorkspace",'.where("workspace_id", "=", required.workspaceId)',"")),
 "N16 findByLocation drops the workspace predicate": ("binding reads and writes", lambda s: in_method(s,"SqlNavLocationBindingRepo","async findByLocation",WSM,"")),
 "N17 listByWorkspace drops the workspace predicate": ("binding reads and writes", lambda s: in_method(s,"SqlNavLocationBindingRepo","async listByWorkspace",WSM,"")),
 "N18 findByIdIncludingTrashed is trash-aware": ("menu reads:", lambda s: in_method(s,"SqlMenuRepo","async findByIdIncludingTrashed","return this.findOne(required, true);","return this.findOne(required, false);")),
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
