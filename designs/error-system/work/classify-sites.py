import json,csv,os,re,sys,collections
S='<scratch>/'
ROOT={'tovu':'/home/user/code','jini':'/home/user/Jini'}
OVR=json.load(open(S+'work/overrides.json')) if os.path.exists(S+'work/overrides.json') else {}
def lines(repo,f,cache={}):
    k=(repo,f)
    if k not in cache: cache[k]=open(os.path.join(ROOT[repo],f),encoding='utf-8',errors='replace').read().split('\n')
    return cache[k]
PAYLOAD=re.compile(r'(skills/.*/scripts/|agent-plugins/(?!src/)[^/]+/|content/themes/).*\.(mjs|js)$')
def cls_s(repo,f,ln):
    L=lines(repo,f); cur=L[ln-1]; prev=L[ln-2] if ln>=2 else ''; two=(prev+' '+cur)
    t=cur.strip()
    if re.search(r'waitForLoadState|waitForTimeout|waitForSelector',two): return ('FP','wait-timeout','none: allowlist idiom in payload scripts')
    if re.search(r'[lL]oader\.load\(\)\.catch',cur): return ('FP','query-owned-reload','W1')
    if re.search(r'\b(queue|tail|pending|writes|turn|lane|surfaces|this\.pending|queuedNext|writeQueueRef\.current)\s*=\s*.*\.catch\(',two) or re.search(r'\.catch\(\(\) => (\{\}|undefined)\)\s*\.then\(',two) or re.search(r'=\s*\w+\.catch\(\(\) => (\{\s*\}|undefined)\);?\s*$',t):
        return ('FP','queue-tail','W1')
    if re.search(r'^(void |await )?[\w.?!()\[\]]*?(ready|pending|promise|result|attached|settle|gate|closing|work|siteTitleReady|targetInstallationId|registered\)?|registryPublication|initialReset|sessionConnection|schema|settingsReady\)?|inFlight\.get\(key\))\??\.catch\(\(\) => (\{\s*\}|undefined)\)',t) or re.search(r'state\.pending\?\.catch|refresh\??\.?\(\)\.catch|refresh\?\.\(\)\.catch',cur):
        return ('FP','mark-observed','W1')
    if re.search(r'\.json\(\)\.catch\(',cur): return ('FP','error-body-parse','W1')
    if re.search(r'\b(rm|rmdir|unlink|chmod|close|cancel|stop|abort|destroy|kill|exitFullscreen|rollback|rollbackIfOwned|retire|resetOwnedTarget|removeManagedDownload|pruneManagedDownloads|deleteUnclaimed|cancelAttempt|arrayBuffer|chatDetach|end)\??\.?\(',two) or 'iterator.return' in cur or re.search(r'runs\.cancel',cur):
        return ('real','best-effort-cleanup','W3')
    if re.search(r'\bemit\(|respondError|\.raise\(|deps\.send|notice\(|exchange\?\.send|onError|appendFile|persistUserTurn|store\.update|writeJson|flush|send\(\)',two): return ('real','dropped-notification','W4')
    if re.search(r'readFile|readdir|\bstat\(|hashFile|\.open\(|resolve\w*\(|read\w*\(|find\w*\(|lifecycle\.get|list\w*\(|ensure\w*\(|compute\w*\(|linkedProvider|fetch\w*\(|runStatus|importRequest|warmStylesheet|import\(|=> null\)|=> undefined\)',two): return ('real','probe-as-absent','W5')
    if re.search(r'catch\s*\{\s*\}?\s*$',t): return ('real','empty-catch','W3')
    return ('real','other-swallow','W3')
PARSE=re.compile(r'JSON\.parse|new URL\(|decodeURI|TextDecoder|fatal: true|atob\(|fromBase64|BigInt\(|parse\w*\(|\.decode\(|normalize\w*Path|safeRelative|Buffer\.from')
def cls_g(repo,f,ln):
    L=lines(repo,f); body=' '.join(x.strip() for x in L[ln-1:ln+5]); 
    tryb=' '.join(x.strip() for x in L[max(0,ln-7):ln])
    # restrict catch body roughly to up to first closing of catch
    cb=body
    if re.search(r'set[A-Z]\w*\(|store\.set\(|textContent\s*=|setCustomValidity',cb.split('} finally')[0][:230]): return ('real','ui-fixed-message','W6')
    if PARSE.search(tryb) and re.search(r'throw |return |invalid\(|refus',cb[:200]): return ('FP','parse-refusal','none: allowlisted (pure parse in try, specific refusal)')
    if re.search(r'console\.\w+\(|logger\.\w+\(|\bwarn\w*\(|\breport\(',cb[:230]) and not re.search(r'^\W*catch[^{]*\{\s*throw',cb): return ('real','log-fixed-text','W7')
    if re.search(r'throw ',cb[:230]): return ('real','rethrow-without-cause','W8')
    return ('real','fixed-result-without-cause','W8')
out=[];rev=[]
for repo in ('tovu','jini'):
    cur=[v for v in json.load(open(S+f'work/or-{repo}.json'))['violations'] if v['rule'] in('swallowed-error','generic-error-catch')]
    cur.sort(key=lambda v:(v['file'],v['line']))
    inp=list(csv.reader(open(S+f'errors-{repo}.tsv',encoding='utf-8'),delimiter='\t',quoting=csv.QUOTE_NONE))[1:]
    inpc=collections.Counter((r[0],r[1]) for r in inp); used=collections.Counter()
    for i,v in enumerate(cur):
        k=(v['rule'],v['file']); 
        status='current' if used[k]<inpc[k] else 'current-not-in-input'; used[k]+=1
        c=(cls_s if v['rule']=='swallowed-error' else cls_g)(repo,v['file'],v['line'])
        key=f"{repo}:{i}"
        depth='line'
        if key in OVR: c=tuple(OVR[key][:3]); depth=OVR[key][3] if len(OVR[key])>3 else 'line'
        if PAYLOAD.search(v['file']) and c[0]=='real': c=(c[0],c[1]+' (plugin/skill payload)',c[2])
        out.append((repo,f"{v['file']}:{v['line']}",v['rule'],status,c[0],c[1],c[2],depth))
        rev.append(f"{repo}:{i} {'S' if v['rule'][0]=='s' else 'G'} {c[0]:4} {c[1][:28]:28} | {v['file'].split('/src/')[-1][-46:]}:{v['line']} {lines(repo,v['file'])[v['line']-1].strip()[:60] if v['rule'][0]=='s' else v['snippet'][:60]}")
    # input rows no longer flagged
    curc=collections.Counter((v['rule'],v['file']) for v in cur); seen=collections.Counter()
    for r in inp:
        k=(r[0],r[1]); seen[k]+=1
        if seen[k]>curc[k]: out.append((repo,f"{r[1]}:{r[2]}",r[0],'input-only (not flagged on integ/wave-b-r2)','gone','-','none: already fixed, reshaped or documented; the gate baseline re-checks','script'))
json.dump(out,open(S+'work/sites.json','w'))
open(S+'work/review.txt','w').write('\n'.join(rev))
c=collections.Counter((o[0],o[4],o[5].split(' (')[0]) for o in out)
for k,v in sorted(c.items()): print(v,k)
