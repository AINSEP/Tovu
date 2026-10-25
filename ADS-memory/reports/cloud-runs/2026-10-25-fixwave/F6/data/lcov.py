import sys,re
def parse(p,root):
    out={};cur=None
    for line in open(p):
        line=line.strip()
        if line.startswith('SF:'):
            cur=line[3:].replace(root+'/','');out[cur]={}
        elif ':' in line and cur:
            k,v=line.split(':',1)
            if k in('LF','LH','BRF','BRH'):out[cur][k]=int(v)
    return out
b=parse('/tmp/f6-base.lcov','/home/user/Tovu/.f6base');a=parse('/tmp/f6-final.lcov','/home/user/Tovu')
def pct(d,h,f): return 100.0 if d.get(f,0)==0 else 100.0*d.get(h,0)/d[f]
print("| file | lines before | lines after | branches before | branches after |")
print("|--|--|--|--|--|")
for f in sorted(set(a)|set(b)):
    x=b.get(f,{});y=a.get(f,{})
    s=f.replace('apps/website/src/','')
    lb=f"{pct(x,'LH','LF'):.1f}" if x else "n/a"; bb=f"{pct(x,'BRH','BRF'):.1f}" if x else "n/a"
    print(f"| {s} | {lb} | {pct(y,'LH','LF'):.1f} ({y.get('LH')}/{y.get('LF')}) | {bb} | {pct(y,'BRH','BRF'):.1f} ({y.get('BRH')}/{y.get('BRF')}) |")
