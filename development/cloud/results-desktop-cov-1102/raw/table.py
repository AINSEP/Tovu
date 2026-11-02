import sys,os,collections,subprocess
R="/home/user/Tovu/development/cloud/results-desktop-cov-1102/raw"
D="/home/user/Tovu/apps/desktop/"
recs={}
for f in ["node.lcov","tsx.lcov"]:
    cur=None
    for line in open(os.path.join(R,f)):
        line=line.strip()
        if line.startswith("SF:"):
            p=line[3:]; cur={"LF":0,"LH":0,"BRF":0,"BRH":0,"FNF":0,"FNH":0,"DA":{}}; name=p
        elif cur is None: continue
        elif line.startswith("DA:"):
            n,c=line[3:].split(",")[:2]; cur["DA"][int(n)]=int(c)
        elif ":" in line and line.split(":")[0] in cur:
            k,v=line.split(":",1); cur[k]=int(v)
        elif line=="end_of_record":
            if True:
                rel=name[len(D):] if name.startswith(D) else name
                if rel.startswith("/") or ".." in rel: cur=None; continue
                prev=recs.get(rel)
                if prev is None or cur["LH"]+cur["BRH"]>prev["LH"]+prev["BRH"]: recs[rel]=cur
            cur=None
rows=[]
for rel,c in recs.items():
    rows.append((c["BRF"]-c["BRH"],rel,c))
rows.sort(key=lambda r:(-r[0],-(r[2]["LF"]-r[2]["LH"])))
out=open(os.path.join(R,"per-file-coverage.md"),"w")
out.write("| file | lines hit/total | line % | branches hit/total | branch % | uncovered branches | funcs hit/total |\n|---|---|---|---|---|---|---|\n")
pct=lambda h,t: "n/a" if t==0 else f"{100*h/t:.2f}"
for u,rel,c in rows:
    out.write(f"| {rel} | {c['LH']}/{c['LF']} | {pct(c['LH'],c['LF'])} | {c['BRH']}/{c['BRF']} | {pct(c['BRH'],c['BRF'])} | {u} | {c['FNH']}/{c['FNF']} |\n")
out.close()
print(len(rows),"files")
# Totals
T=collections.Counter()
for _,_,c in rows:
    for k in ["LF","LH","BRF","BRH","FNF","FNH"]: T[k]+=c[k]
print(T)
# comment/blank lines counted covered
blank_cov=0; blank_tot=0
for rel,c in recs.items():
    try: src=open(D+rel).read().split("\n")
    except: continue
    for n,cnt in c["DA"].items():
        if n-1<len(src):
            s=src[n-1].strip()
            if s=="" or s.startswith("//") or s.startswith("*") or s.startswith("/*"):
                blank_tot+=1
                if cnt>0: blank_cov+=1
print("comment/blank DA lines",blank_tot,"of which counted covered",blank_cov)
