import sys,json,collections
sys.path.insert(0,'/home/user/stryker'); from analyze import analyze,score,strict
old,new=sys.argv[1],sys.argv[2]
ro,to,_,_=analyze(old); rn,tn,coll,vto=analyze(new)
def fmt(c): return 'K%d T%d S%d NC%d' % (c['Killed'],c['Timeout'],c['Survived'],c['NoCoverage'])
print('| file | run 2 | run 2 score | forced | forced score | Δ | static surv (r2→forced) | coll-err kills | vitest-timeout kills | strict forced |')
print('|---|---|---|---|---|---|---|---|---|---|')
for f in sorted(set(ro)|set(rn), key=lambda f: score(rn.get(f,collections.Counter()))):
    a=ro.get(f,collections.Counter()); b=rn.get(f,collections.Counter())
    print('| %s | %s | %.2f | %s | %.2f | %+.2f | %d→%d | %d | %d | %.2f |'%(f.split('src/')[-1],fmt(a),score(a),fmt(b),score(b),score(b)-score(a),a['staticSurvived'],b['staticSurvived'],b['KilledCollection'],b['KilledVitestTimeout'],strict(b)))
print('| **total** | %s | **%.2f** | %s | **%.2f** | %+.2f | %d→%d | %d | %d | %.2f |'%(fmt(to),score(to),fmt(tn),score(tn),score(tn)-score(to),to['staticSurvived'],tn['staticSurvived'],tn['KilledCollection'],tn['KilledVitestTimeout'],strict(tn)))
# score if collection kills counted as survivors (= unpatched runner behaviour)
c=tn.copy(); c['Killed']-=c['KilledCollection']; c['Survived']+=c['KilledCollection']
print('\nForced score if collection-error kills were counted as Survived (upstream runner behaviour): %.2f %%' % score(c))
