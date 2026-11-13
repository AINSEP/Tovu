# Collate PROM shard JSON into promises.tsv / skipped.tsv / other-messages.tsv and print summaries.
import json, glob, collections, os, re
P = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = '/home/user/Tovu/'
hits, skipped, other, shards = [], [], [], []
for n in range(9):
    j = f'{P}/raw/promises-shard-{n}.json'
    nfiles = sum(1 for _ in open(f'{P}/raw/shard-{n}.files.txt'))
    if not os.path.exists(j):
        shards.append((n, nfiles, 'NOT RUN', 0)); continue
    d = json.load(open(j))
    shards.append((n, nfiles, 'DONE', len(d)))
    for r in d:
        f = r['filePath'].replace(ROOT, '')
        for m in r['messages']:
            msg = ' '.join(m['message'].split())
            if m.get('fatal'):
                skipped.append((n, f, m.get('line', ''), msg))
            elif m.get('ruleId', '').startswith('@typescript-eslint/no-') if m.get('ruleId') else False:
                hits.append(('tovu', 'apps/website', f, m['line'], m['ruleId'].split('/')[1], msg))
            else:
                other.append((n, f, m.get('line', ''), m.get('ruleId') or '-', msg))
hits.sort(key=lambda h: (h[2], h[3]))
with open(f'{P}/promises.tsv', 'w') as o:
    o.write('repo\tunit\tfile\tline\trule\tmessage\n')
    for h in hits: o.write('\t'.join(map(str, h)) + '\n')
with open(f'{P}/skipped.tsv', 'w') as o:
    o.write('shard\tfile\tline\terror\n')
    for s in skipped: o.write('\t'.join(map(str, s)) + '\n')
with open(f'{P}/other-messages.tsv', 'w') as o:
    o.write('shard\tfile\tline\truleId\tmessage\n')
    for s in other: o.write('\t'.join(map(str, s)) + '\n')
print('SHARDS', shards)
print('HITS', len(hits), 'SKIPPED', len(skipped), 'OTHER', len(other))
print('BY_RULE', collections.Counter(h[4] for h in hits))
print('BY_TOP', collections.Counter((h[2].split('/')[3], h[4]) for h in hits))
print('BY_FEATURE', collections.Counter(h[2].split('/')[4] for h in hits if h[2].split('/')[3] == 'features').most_common())
print('BY_MSG', collections.Counter((h[4], h[5]) for h in hits).most_common())
print('FILES_WITH_HITS', len({h[2] for h in hits}))
print('OTHER_KINDS', collections.Counter(re.sub(r"'[^']*'", "'…'", o[4]) for o in other))
for s in skipped: print('SKIP', s)
