import json,glob,os,collections
rows=[]
for p in sorted(glob.glob('/root/stryker/reports/*.json')):
    d=json.load(open(p))
    for f,v in d['files'].items():
        c=collections.Counter(m['status'] for m in v['mutants'])
        k=c['Killed'];t=c['Timeout'];s=c['Survived'];n=c['NoCoverage']
        tot=k+t+s+n
        sc=100.0*(k+t)/tot if tot else 100.0
        surv=[f"{m['location']['start']['line']}:{m['mutatorName']}" for m in v['mutants'] if m['status'] in('Survived','NoCoverage')]
        rows.append((f.replace('/home/user/Tovu/','').replace('apps/website/src/',''),tot,k,t,s,n,sc,surv))
for r in rows:
    print(f"| {r[0]} | {r[1]} | {r[2]} | {r[3]} | {r[4]} | {r[5]} | {r[6]:.1f} % |")
print()
for r in rows:
    if r[7]: print(r[0], ' '.join(r[7][:40]))
