import os,re,collections
exec(open("/tmp/claude-0/-home-user/738bbbdd-5025-5b0f-b5c8-790cc0a725c0/scratchpad/table.py").read().split("rows=[]")[0])
D="/home/user/Tovu/apps/desktop/"
def walk(d,exts,ex=()):
    out=[]
    for root,dirs,files in os.walk(D+d):
        rel=os.path.relpath(root,D)
        dirs[:]=[x for x in dirs if x!="node_modules" and not x.startswith(".") and os.path.join(rel,x) not in ex]
        for f in files:
            if f.endswith(".test.ts") or f.endswith(".d.ts"): continue
            if any(f.endswith(e) for e in exts): out.append(os.path.normpath(os.path.join(rel,f)))
    return sorted(out)
areas={"src main-process":walk("src",[".ts",".cjs"],("src/renderer","src/contracts","src/preload")),
 "src renderer+contracts":walk("src/renderer",[".ts"])+walk("src/contracts",[".ts"]),
 "bin":walk("bin",[".ts"])}
def code_lines(rel,c):
    src=open(D+rel).read().split("\n"); t=h=0
    for n,cnt in c["DA"].items():
        s=src[n-1].strip() if n-1<len(src) else ""
        if s=="" or s.startswith(("//","*","/*")): continue
        t+=1; h+= cnt>0
    return t,h
def agg(files,label):
    T=collections.Counter(); missing=[]
    for f in files:
        c=recs.get(f)
        if not c:
            missing.append(f); n=len(open(D+f).read().split("\n")); T["LF"]+=n; T["CLF"]+=n; continue
        for k in ["LF","LH","BRF","BRH","FNF","FNH"]: T[k]+=c[k]
        t,h=code_lines(f,c); T["CLF"]+=t; T["CLH"]+=h
    p=lambda a,b: f"{100*T[a]/T[b]:.2f}%" if T[b] else "n/a"
    print(f"{label}: files={len(files)} line {p('LH','LF')} codeonly-line {p('CLH','CLF')} branch {p('BRH','BRF')} funcs {p('FNH','FNF')}  missing-from-lcov={missing}")
    return T
allcur=[]
for k,v in areas.items(): agg(v,k); allcur+=v
agg(allcur,"ALL CURRENT AREAS")
extra=["main.ts"]+walk("src/renderer",[".tsx"])+["src/preload/preload.mts","src/speech/preload-speech.cts"]
agg(extra,"EXTRA (main.ts+.tsx+preloads)")
agg(allcur+extra,"ALL + EXTRA")
agg(allcur+["main.ts"],"ALL + main.ts only")
# per-file gating
for thr in (96,):
  for label,files in (("current",allcur),("with extra",allcur+extra)):
    fails=[f for f in files if f in recs and recs[f]["BRF"] and 100*recs[f]["BRH"]/recs[f]["BRF"]<thr]
    ffails=[f for f in files if f in recs and recs[f]["FNF"] and 100*recs[f]["FNH"]/recs[f]["FNF"]<thr]
    print(f"per-file branch<{thr}% {label}: {len(fails)} files: {fails}")
    print(f"per-file funcs<{thr}% {label}: {len(ffails)} files")
    cl=[f for f in files if f in recs and (lambda t,h: t and 100*h/t<thr)(*code_lines(f,recs[f]))]
    print(f"per-file code-line<{thr}% {label}: {len(cl)} files: {cl}")
print("tsx lines", sum(len(open(D+f).read().split('\n')) for f in walk('src/renderer',['.tsx'])), len(walk('src/renderer',['.tsx'])))
for f in ["main.ts","src/preload/preload.mts","src/speech/preload-speech.cts","src/desktop-agent-inventory.ts","src/desktop-agent-tools.ts","src/desktop-agent.ts","src/desktop-chat-main.ts"]:
    print(f, len(open(D+f).read().split("\n")), "in lcov" if f in recs else "NOT in lcov")
