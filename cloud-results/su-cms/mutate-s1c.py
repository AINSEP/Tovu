import subprocess, os
os.chdir("/home/user/Tovu")
SRC = "apps/website/src/features/presentation/repo.ts"
TEST = "apps/website/src/features/presentation/__tests__/repo.characterization.test.ts"
env = dict(os.environ, PATH=os.path.expanduser("~/.local/node24/bin")+":"+os.environ["PATH"], TSX_TSCONFIG_PATH="apps/site-chat/tsconfig.json")
orig = subprocess.check_output(["git","show","HEAD:"+SRC]).decode()
WS = '.where("workspace_id", "=", workspaceId)'
M = {
 "C1 save drops the conflict target (plain insert)": ("a second save for the workspace replaces", lambda s: s.replace('''.onConflict((oc) =>
          oc.column("workspace_id").doUpdateSet({ active_theme_id: row.active_theme_id, updated_at: row.updated_at })
        )''', '')),
 "C2 conflict update keeps the old theme": ("a second save for the workspace replaces", lambda s: s.replace("doUpdateSet({ active_theme_id: row.active_theme_id, updated_at: row.updated_at })", "doUpdateSet({ updated_at: row.updated_at })")),
 "C3 conflict update keeps the old timestamp": ("a second save for the workspace replaces", lambda s: s.replace("doUpdateSet({ active_theme_id: row.active_theme_id, updated_at: row.updated_at })", "doUpdateSet({ active_theme_id: row.active_theme_id })")),
 "C4 findByWorkspaceId drops the workspace predicate": ("a workspace's read returns only its own row", lambda s: s.replace(WS, "", 1)),
 "C5 conflict target is not the workspace (upsert replaces every row)": ("a save for one workspace leaves every other", lambda s: s.replace('oc.column("workspace_id").doUpdateSet(', 'oc.column("workspace_id").doUpdateSet(').replace('.insertInto("presentation_settings")', '.insertInto("presentation_settings")')),
}
del M["C5 conflict target is not the workspace (upsert replaces every row)"]
for key,(frag,fn) in M.items():
    mut = fn(orig); assert mut != orig, key
    open(SRC,"w").write(mut)
    r = subprocess.run(["node","--import","tsx","--import","./development/test-support/composed-bundle-env.ts","--test","--experimental-test-module-mocks",TEST],capture_output=True,text=True,env=env)
    out = r.stdout + r.stderr
    fails = [l for l in out.splitlines() if l.startswith("✖") and "failing" not in l]
    verdict = "NOT CHARACTERIZED" if r.returncode==0 else ("RED (expected test)" if any(frag in l for l in fails) else "RED FOR ANOTHER REASON")
    print(f"{key}: {verdict}; red tests: {[l[:70] for l in fails]}")
    open(SRC,"w").write(orig)
subprocess.run(["git","diff","--stat","--",SRC])
