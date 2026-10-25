import json,sys,collections
def key(m): return (m['location']['start']['line'],m['location']['start']['column'],m['mutatorName'],m.get('replacement'),m['location']['end']['line'],m['location']['end']['column'])
old=json.load(open(sys.argv[1]))['files']; new=json.load(open(sys.argv[2]))['files']
gone=collections.defaultdict(list); newsurv=collections.defaultdict(list)
for f,fd in new.items():
    O={key(m):m for m in old.get(f,{}).get('mutants',[])}
    for m in fd['mutants']:
        o=O.get(key(m))
        if o is None: continue
        if o['status']=='Survived' and m['status']!='Survived': gone[f].append((key(m)[0],key(m)[2],m['status'],'static' if m.get('static') else '', ('COLL' if 'COLLECTION' in (m.get('statusReason') or '') else '')))
        if o['status']!='Survived' and m['status']=='Survived': newsurv[f].append((key(m)[0],key(m)[2],o['status']))
for f in sorted(gone): print('GONE',f.split('src/')[-1],len(gone[f]),'static=%d coll=%d'%(sum(x[3]=='static' for x in gone[f]),sum(x[4]=='COLL' for x in gone[f])),sorted(set((l,mu,s,st,c) for l,mu,s,st,c in gone[f]))[:30])
for f in sorted(newsurv): print('NEW-SURV',f.split('src/')[-1],newsurv[f])
