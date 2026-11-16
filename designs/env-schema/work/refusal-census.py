#!/usr/bin/env python3
"""r2 (judge finding 6): every product `throw` / `process.exit(` that has an env name within the 6 lines above it.
A candidate list, not a verdict: T0/J1 classify each row (boot refusal | request-time error | launch-contract check)
before any reader moves. Usage: python3 refusal-census.py <tovu-root> <jini-root> > refusal-census.tsv"""
import os, re, subprocess, sys
VERIFIED = {  # read by hand in r2
 'apps/website/src/server/runtime/boot/bind-host.ts:80': 'boot refusal (security): invalid TOVU_HOST / --host throws ValidationError; a fallback would widen the listener',
 'packages/server/src/storage/backend-config.ts:46': 'boot refusal, only when JINI_SQLITE_BACKEND=postgres (conditional)',
 'packages/server/src/storage/backend-config.ts:59': 'boot refusal, only when JINI_SQLITE_BACKEND=postgres (conditional)',
 'packages/server/src/storage/backend-config.ts:75': 'boot refusal, only when JINI_SQLITE_BACKEND=postgres (conditional)',
 'packages/server/src/storage/backend-config.ts:109': 'boot refusal: unknown JINI_SQLITE_BACKEND',
}
print('repo\tsite\tenv_names_nearby\tclass')
for repo, root, dirs in (('tovu', sys.argv[1], ['apps/website/src', 'apps/desktop/src', 'packages']), ('jini', sys.argv[2], ['packages'])):
    for f in subprocess.run(['git', '-C', root, 'ls-files', *dirs], capture_output=True, text=True).stdout.split('\n'):
        if not re.search(r'\.(ts|tsx|mjs)$', f) or re.search(r'__tests__|\.test\.|/testing/|/e2e/|fixtures|/scripts/', f): continue
        try: L = open(os.path.join(root, f)).read().split('\n')
        except OSError: continue
        for i, l in enumerate(L):
            if not re.search(r'\bthrow\b|process\.exit\(', l): continue
            win = ' '.join(L[max(0, i - 6):i + 1])
            names = {a or b for a, b in re.findall(r'(?:process\.env|\b\w*[eE]nv)\??\.([A-Z][A-Z0-9_]{2,})|\b((?:TOVU|JINI)_[A-Z0-9_]{3,})\b', win)}
            names -= {'TOVU_ERROR_REDACTION_OPTIONS', 'TOVU_DATABASE_MESSAGES', 'TOVU_MAX_UPLOAD_BYTES'}
            if names: print(f"{repo}\t{f}:{i + 1}\t{' '.join(sorted(names))}\t{VERIFIED.get(f'{f}:{i + 1}', 'NOT CLASSIFIED')}")
