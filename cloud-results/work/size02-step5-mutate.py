#!/usr/bin/env python3
"""Mutation proof for size-02 step 5 pins. Usage: size02-step5-mutate.py <mutations.json>
Each mutation: {name, file, old, new, tests:[...]}; applies it, runs the tests, reports caught/MISSED, restores the file."""
import json, subprocess, sys, shutil, os
root = "/home/user/Tovu"
muts = json.load(open(sys.argv[1]))
only = sys.argv[2:] 
env = dict(os.environ, PATH=os.path.expanduser("~/.local/node24/bin") + ":" + os.environ["PATH"], TSX_TSCONFIG_PATH="apps/site-chat/tsconfig.json")
for m in muts:
    if only and m["name"] not in only: continue
    path = os.path.join(root, m["file"])
    src = open(path).read()
    if src.count(m["old"]) != 1:
        print(f'{m["name"]}: SKIP old text occurs {src.count(m["old"])} times'); continue
    shutil.copy(path, "/tmp/claude-0/mut.bak")
    open(path, "w").write(src.replace(m["old"], m["new"]))
    try:
        r = subprocess.run(["node", "--import", "tsx", "--import", "./development/test-support/composed-bundle-env.ts", "--test", "--experimental-test-module-mocks", "--test-concurrency=2", *m["tests"]],
                           cwd=root, env=env, capture_output=True, text=True, timeout=600)
        out = r.stdout + r.stderr
        fails = [l for l in out.splitlines() if l.startswith("✖") and "failing tests" not in l]
        tail = [l for l in out.splitlines() if l.startswith("ℹ fail")]
        print(f'{m["name"]}: {"CAUGHT" if r.returncode != 0 else "MISSED"} ({tail[0] if tail else "?"}) first: {fails[0][:110] if fails else "-"}')
    finally:
        shutil.copy("/tmp/claude-0/mut.bak", path)
