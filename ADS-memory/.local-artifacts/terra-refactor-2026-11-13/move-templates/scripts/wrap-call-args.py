#!/usr/bin/env python3
"""Wrap the single positional argument of every call to NAME in an object: NAME(x) -> NAME({ KEY: x }).
Usage: wrap-call-args.py FILE NAME KEY EXPECTED_COUNT. Balanced-paren scan that skips string/template
literals. Refuses (exit 1, file untouched) when the count differs or a call has a top-level comma."""
import re, sys

def scan_arg(s, i):
    depth, q = 0, None
    j = i
    while j < len(s):
        c = s[j]
        if q:
            if c == "\\": j += 2; continue
            if c == q: q = None
        elif c in "'\"`": q = c
        elif c in "([{": depth += 1
        elif c in ")]}":
            if depth == 0: return j
            depth -= 1
        elif c == "," and depth == 0: return -1
        j += 1
    return -2

path, name, key, expected = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
src = open(path).read()
out, pos, n = [], 0, 0
for m in re.finditer(r"(?<![\w$.])" + re.escape(name) + r"\(", src):
    start = m.end()
    if m.start() < pos: continue
    end = scan_arg(src, start)
    if end < 0: sys.exit(f"STOP: {path}: call at offset {m.start()} has a top-level comma or is unbalanced")
    arg = src[start:end]
    if arg.strip() == "" or arg.lstrip().startswith("{"): sys.exit(f"STOP: {path}: call at offset {m.start()} is empty or already object-shaped")
    out.append(src[pos:start]); out.append("{ " + key + ": " + arg + " }"); pos = end; n += 1
out.append(src[pos:])
if n != expected: sys.exit(f"STOP: {path}: {n} calls of {name}, sheet expects {expected}")
open(path, "w").write("".join(out)); print(f"OK {path}: {n} calls of {name} wrapped")
