import json,sys,re,collections
def load(p):
    d=json.load(open(p)); return d
TO=re.compile(r'timed? ?out in \d+ ?ms|Test timed out|Hook timed out',re.I)
def analyze(p):
    d=load(p); rows={}; tot=collections.Counter(); coll=[]; vto=[]
    for f,fd in d['files'].items():
        c=collections.Counter()
        for m in fd['mutants']:
            s=m['status']; r=m.get('statusReason') or ''
            if s=='Killed' and 'STRYKER-FORCE-COLLECTION-ERROR' in r: c['KilledCollection']+=1; coll.append((f,m['location']['start']['line'],m['mutatorName'],r[:160]))
            elif s=='Killed' and TO.search(r): c['KilledVitestTimeout']+=1; vto.append((f,m['location']['start']['line'],m['mutatorName'],r[:120]))
            c[s]+=1
            if m.get('static'): c['static']+=1
            if m.get('static') and s=='Survived': c['staticSurvived']+=1
        rows[f]=c; tot.update(c)
    return rows,tot,coll,vto
def score(c):
    det=c['Killed']+c['Timeout']; val=det+c['Survived']+c['NoCoverage']
    return 100*det/val if val else float('nan')
def strict(c):
    # killed excluding vitest-timeout kills and Stryker Timeouts
    det=c['Killed']-c['KilledVitestTimeout']; val=c['Killed']+c['Timeout']+c['Survived']+c['NoCoverage']
    return 100*det/val if val else float('nan')
if __name__=='__main__':
    rows,tot,coll,vto=analyze(sys.argv[1])
    print('TOTAL',dict(tot),'score %.2f strict %.2f'%(score(tot),strict(tot)))
    for f,c in sorted(rows.items(),key=lambda x:score(x[1])):
        print('%-60s n=%4d K=%4d(vto %d, coll %d) T=%3d S=%3d NC=%2d RE=%d CE=%d static=%d/%dS  %.2f%%'%(f,sum(c[k] for k in ['Killed','Timeout','Survived','NoCoverage','RuntimeError','CompileError','Ignored']),c['Killed'],c['KilledVitestTimeout'],c['KilledCollection'],c['Timeout'],c['Survived'],c['NoCoverage'],c['RuntimeError'],c['CompileError'],c['static'],c['staticSurvived'],score(c)))
    print('COLLECTION-ERROR KILLS',len(coll))
    for x in coll[:40]: print(' ',x)
    print('VITEST-TIMEOUT KILLS',len(vto))
    for x in vto[:20]: print(' ',x)
