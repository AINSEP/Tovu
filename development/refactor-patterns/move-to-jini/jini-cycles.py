#!/usr/bin/env python3
"""Module-level import cycles inside one Jini package, as a before/after ratchet for MOVE stages.

Why: feature-cycles.mjs only sees Tovu features. A moved file that imports its own package's entry
file (`./index.js`) while that entry re-exports it makes `index -> moved -> index`, a cycle no Tovu
gate can see. This runs Jini's own dependency-cruiser config (type edges included, like Tovu's
canonical no-circular) on ONE package and prints each `no-circular` violation as `from -> to`.

Usage (any cwd; needs the Jini clone's node_modules):
  python3 jini-cycles.py <pkg> > before.txt          # before the Jini half
  python3 jini-cycles.py <pkg> --baseline before.txt # after: exit 1 and print the NEW cycles, if any
"""
import json, subprocess, sys

JINI = "/Users/la/Programming/jini-terra-d1"


def cycles(pkg):
    cmd = ["npx", "--no-install", "depcruise", "--config", ".dependency-cruiser.mjs", f"packages/{pkg}/src", "--output-type", "json"]
    run = subprocess.run(cmd, cwd=JINI, capture_output=True, text=True)
    if not run.stdout.strip().startswith("{"):
        sys.exit(f"depcruise failed (exit {run.returncode}): {run.stderr.strip()[:500]}")
    data = json.loads(run.stdout)
    return sorted({f"{v['from']} -> {v['to']}" for v in data.get("summary", {}).get("violations", []) if v.get("rule", {}).get("name") == "no-circular"})


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    found = cycles(args[0])
    if "--baseline" not in args:
        print("\n".join(found))
        return
    with open(args[args.index("--baseline") + 1], encoding="utf8") as fh:
        before = {line.strip() for line in fh if line.strip()}
    new = [c for c in found if c not in before]
    print(f"cycles before={len(before)} after={len(found)} new={len(new)}")
    for c in new:
        print("NEW", c)
    sys.exit(1 if new else 0)


if __name__ == "__main__":
    main()
