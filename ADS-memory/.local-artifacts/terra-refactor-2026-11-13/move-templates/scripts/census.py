import os,re,sys,json
root=sys.argv[1]; target=os.path.abspath(sys.argv[2])  # file path
tdir=os.path.dirname(target); tbase=os.path.splitext(os.path.basename(target))[0]
isindex = tbase=="index"
folder=tdir if isindex else None
aliases={"#src/":os.path.join(root,"apps/website/src/"),"@/":os.path.join(root,"apps/admin/src/")}
spec_re=re.compile(r"""(["'`])((?:\.{1,2}/|#src/|@/)[^"'`\n]*)\1""")
exts=["",".js",".ts",".tsx",".mjs","/index.ts","/index.tsx","/index.js"]
def resolves(base):
    for e in exts:
        p=os.path.abspath(base+e)
        if p==target: return True
        # .js specifier mapping to .ts
    b=os.path.abspath(base)
    if b.endswith(".js") and os.path.abspath(b[:-3]+".ts")==target: return True
    if b.endswith(".mjs") and os.path.abspath(b[:-4]+".ts")==target: return True
    return False
out=[]
for d in ["apps","content","development",".github"]:
    for dp,dn,fn in os.walk(os.path.join(root,d)):
        dn[:]=[x for x in dn if x not in("node_modules","dist",".git")]
        for f in fn:
            if not f.endswith((".ts",".tsx",".mjs",".js",".json",".yml",".yaml",".cjs",".sh",".md")): continue
            p=os.path.join(dp,f)
            if os.path.abspath(p)==target: continue
            try: lines=open(p,encoding="utf8").read().split("\n")
            except: continue
            for i,l in enumerate(lines,1):
                for m in spec_re.finditer(l):
                    s=m.group(2); base=None
                    for a,r in aliases.items():
                        if s.startswith(a): base=os.path.join(r,s[len(a):])
                    if base is None: base=os.path.join(dp,s)
                    if resolves(base): out.append((os.path.relpath(p,root),i,s,l.strip()[:120]))
                if os.path.basename(target) in l or (isindex and False): pass
for o in out: print("%s:%d | %s | %s"%(o[0],o[1],o[2],o[3]))
print(len(out),"hits",file=sys.stderr)
