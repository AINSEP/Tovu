# Adds a `note` column to knip.tsv: Tovu @jini-ai/* dependency findings are checked with rg for real
# imports (link:jini symlinks make knip miss them); other Tovu app deps get a caveat note.
import subprocess,csv,os
D="/home/user/Tovu/development/cloud/quality-1111/static"
rows=list(csv.reader(open(D+"/knip.tsv"),delimiter="\t"))
rows[0].append("note")
cache={}
for r in rows[1:]:
    r.append("")
    if r[0]!="tovu" or r[1] not in("dependencies","devDependencies"): continue
    ws=os.path.dirname(r[2]) or "."
    dirs=[ws] if ws!="." else ["apps/website","development","packages"]
    if r[3].startswith("@jini-ai/"):
        k=(ws,r[3])
        if k not in cache:
            fs=set()
            for q in ('"',"'"):
                fs|=set(subprocess.run(["rg","-l","--glob","!**/node_modules/**","--glob","!**/dist/**","-F",q+r[3]]+dirs,cwd="/home/user/Tovu",capture_output=True,text=True).stdout.split())
            cache[k]=len(fs)
        n=cache[k]
        r[-1]=f"LINK-ARTIFACT: specifier appears in {n} files under {','.join(dirs)}" if n else "no import found by rg: real candidate"
    elif ws.startswith("apps/"):
        r[-1]="unverified: may be a peer dep of a linked @jini-ai/* package (knip cannot see through link:jini)"
csv.writer(open(D+"/knip.tsv","w"),delimiter="\t",lineterminator="\n").writerows(rows)
