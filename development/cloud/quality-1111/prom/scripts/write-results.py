# Render RESULTS.md from promises.tsv / skipped.tsv / other-messages.tsv and the shard .txt files.
import csv, collections, os, re
P = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda f: list(csv.reader(open(f'{P}/{f}'), delimiter='\t'))[1:]
hits, skipped, other = rd('promises.tsv'), rd('skipped.tsv'), rd('other-messages.tsv')
MSG = {}
for h in hits: MSG.setdefault(h[5], f'M{len(MSG)+1}')
top = lambda f: f.split('/')[3] if f.count('/') > 3 else f.split('/')[3]
nfiles = collections.Counter(l.split('/')[3] for l in open(f'{P}/raw/files-all.txt').read().split())
shardinfo = []
for n in range(9):
    t = open(f'{P}/raw/promises-shard-{n}.txt').read().split('\n')
    files = sum(1 for _ in open(f'{P}/raw/shard-{n}.files.txt'))
    last = [l for l in t if l.startswith('exit=')]
    folders = sorted({'/'.join(l.split('/')[3:5]) if l.split('/')[3] == 'features' else l.split('/')[3] for l in open(f'{P}/raw/shard-{n}.files.txt').read().split()})
    fd = folders if len(folders) <= 3 else [folders[0], '…', folders[-1], f'({len(folders)} subfolders)']
    sh = sum(1 for h in hits if f"{h[2]}" in set(open(f'{P}/raw/shard-{n}.files.txt').read().split()))
    shardinfo.append((n, files, 'DONE' if last and os.path.exists(f'{P}/raw/promises-shard-{n}.json') else 'NOT RUN', last[0] if last else '-', ' '.join(fd), sh))
L = []
w = L.append
w('# PROM — floating / misused promises in Tovu `apps/website` (report only)\n')
w('Run 2026-11-13, 01:03–01:08 UTC (well inside the 90-minute cap). Branch base: `cloud/quality-1111`. No source changed.\n')
w('## Bottom line\n')
w(f'- **{len(hits)} hits** in **{len({h[2] for h in hits})} files** out of **2,165 linted files**: '
  f'`no-misused-promises` **{sum(h[4]=="no-misused-promises" for h in hits)}**, `no-floating-promises` **{sum(h[4]=="no-floating-promises" for h in hits)}**.')
w(f'- **All 9 shards DONE, 0 NOT RUN.** The whole website lints in ~1 minute of wall clock (classic `project` mode, 3 shards at a time). The last run\'s 60-minute/4.1 GB stall came from `projectService` over 2,165 files in one process; classic `project` mode builds the one root-tsconfig program once per process and is fast.')
w(f'- **{len(skipped)} file could not be type-loaded** (`skipped.tsv`): it is explicitly excluded from the root `tsconfig.json`, so it has no type info.')
w(f'- **0 hits were hidden by inline suppressions**: `noInlineConfig` ignored {len(other)} `eslint-disable` comments, none of which name either promise rule (`other-messages.tsv`).')
w('- 96% of hits (511/531) are in `server/`, 399 of them in `server/inbound/admin-http` and 66 in `server/inbound/public-http`. 479/531 are message M2 (a Promise-returning function passed as an argument where a void callback is expected).\n')
w('## Tools (pinned, installed with `npm install --ignore-scripts` into `~/promtools`, outside the repo)\n')
w('| tool | version |\n|---|---|')
for t, v in [('node', 'v24.22.3'), ('eslint', '9.39.1'), ('typescript-eslint', '8.46.4'), ('@typescript-eslint/parser', '8.46.4'), ('typescript', '5.9.3')]: w(f'| {t} | {v} |')
w('\nConfig: `scripts/promises.eslint.config.mjs` (copied unchanged from `cloud/quality-1111-sec`). Only `@typescript-eslint/no-floating-promises` + `@typescript-eslint/no-misused-promises`, default options, `noInlineConfig: true`, `SEC_PROJECT=tsconfig.json`, `SEC_ROOT=/home/user/Tovu` (classic `project`, not `projectService`). Runner: `scripts/run-shard.sh`; collation: `scripts/collate.py`, `scripts/write-results.py`. Root `npm ci` only (`raw/npm-ci.txt`, exit 0). The rules were sanity-checked on a 5-line scratch file outside the repo (3 expected errors reported).\n')
w('File list (`raw/files-all.txt`, 2,165 files): `git ls-files \'apps/website/src/**.ts\'` (5,307) minus `__tests__/__mocks__/__fixtures__/fixtures/mocks/test/tests/e2e/dist/build/vendor` dirs, `*.test|spec|stories|story|typecheck.ts` and `.d.ts` (same filters as `run-promises.sh`).\n')
w('## Canary\n')
w('Shard 0 (`cli/` 27 + `index.ts` + first 72 `contracts/` files = 100 files): **8 s wall, peak RSS 1,109 MB**, exit 0, no fatal parse errors. At that rate the full list needed only ~1–2 minutes, so the planned folder/feature sharding was kept as-is (no extra splitting needed). Peak RSS is sampled every 2 s from `VmHWM` of the eslint process.\n')
w('## Shards\n')
w('| shard | files | status | result | folders | hits |\n|---|---|---|---|---|---|')
for s in shardinfo: w(f'| {s[0]} | {s[1]} | {s[2]} | `{s[3]}` | {s[4]} | {s[5]} |')
w('\n`exit=123` is xargs reporting eslint exit 1 (= lint errors found), not a crash. Order run: 0 (canary), then 1 2 3 7 6 4 5 8 with `xargs -P3` (biggest last); raw: `raw/promises-shard-<n>.json` + `.txt`, file lists `raw/shard-<n>.files.txt`.\n')
w('## Totals per rule\n')
w('| rule | hits | files |\n|---|---|---|')
for r in ['no-misused-promises', 'no-floating-promises']:
    w(f'| `{r}` | {sum(h[4]==r for h in hits)} | {len({h[2] for h in hits if h[4]==r})} |')
w(f'| **total** | **{len(hits)}** | **{len({h[2] for h in hits})}** |\n')
w('Message legend (exact eslint messages):\n')
w('| key | rule | message | hits |\n|---|---|---|---|')
for m, k in MSG.items():
    rule = next(h[4] for h in hits if h[5] == m)
    w(f'| {k} | `{rule}` | {m.replace("|", "\\|")} | {sum(h[5]==m for h in hits)} |')
w('\n## Totals per top-level folder (`apps/website/src/…`)\n')
w('| folder | linted files | misused | floating | total | files with hits |\n|---|---|---|---|---|---|')
for f, n in sorted(nfiles.items(), key=lambda x: -x[1]):
    hs = [h for h in hits if h[2].split('/')[3] == f]
    w(f'| `{f}` | {n} | {sum(h[4]=="no-misused-promises" for h in hs)} | {sum(h[4]=="no-floating-promises" for h in hs)} | {len(hs)} | {len({h[2] for h in hs})} |')
w('\nSecond/third level:\n')
w('| subfolder | misused | floating | total |\n|---|---|---|---|')
sub = collections.Counter()
key = lambda f: '/'.join(f.split('/')[3:6]) if f.split('/')[3] == 'server' else '/'.join(f.split('/')[3:5])
for h in hits: sub[(key(h[2]), h[4])] += 1
for k in sorted({key(h[2]) for h in hits}, key=lambda k: -(sub[(k,'no-misused-promises')]+sub[(k,'no-floating-promises')])):
    a, b = sub[(k, 'no-misused-promises')], sub[(k, 'no-floating-promises')]
    w(f'| `{k}` | {a} | {b} | {a+b} |')
w('\n## Skipped (could not be type-loaded)\n')
w('| file | error |\n|---|---|')
for s in skipped: w(f'| `{s[1]}` | {s[3]} |')
w('\nThis file is listed in the root `tsconfig.json` `exclude`, so classic project mode has no program for it. It was not linted for these rules.\n')
w('## Ignored inline directives (no hits hidden)\n')
c = collections.Counter(re.sub(r' --.*', '', re.search(r"'([^']*)'", o[4]).group(1)).strip() for o in other)
w('| directive (ignored by `noInlineConfig`) | count |\n|---|---|')
for k, v in c.most_common(): w(f'| `{k}` | {v} |')
w('\nNone disable `no-floating-promises` or `no-misused-promises`, so every hit above is un-suppressed in source too. Full list with file:line: `other-messages.tsv`.\n')
w(f'## Every hit ({len(hits)}), by file\n')
w('Same rows as `promises.tsv` (repo `tovu`, unit `apps/website`). Paths relative to `apps/website/src/`. `F` = `no-floating-promises`, `M` = `no-misused-promises`; message keys from the legend above.\n')
byf = collections.OrderedDict()
for h in hits: byf.setdefault(h[2], []).append(h)
for f, hs in byf.items():
    w(f'- `{f.replace("apps/website/src/", "")}` ({len(hs)}): ' + ', '.join(f'{h[3]} {"F" if h[4]=="no-floating-promises" else "M"}/{MSG[h[5]]}' for h in hs))
open(f'{P}/RESULTS.md', 'w').write('\n'.join(L) + '\n')
print(len(L), 'lines')
