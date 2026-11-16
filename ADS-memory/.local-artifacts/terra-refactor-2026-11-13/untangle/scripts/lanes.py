"""Read-only: assign every non-allowed production site to exactly one execution lane (by owner package/folder)
and list the contract lanes each needs. Writes LANES-files.tsv. Usage: python3 lanes.py <untangle-dir>"""
import csv, sys, os, collections
D = sys.argv[1]
NEED = {'L-TEXT':'C1','L-HANDLES':'C2','L-STORAGE':'C3','L-ROUTES':'C4','L-PLATFORM':'C5','L-AGENTS':'C6','L-REG-ADMIN':'C7',
        'L-ADMIN-PORTS':'C8','L-PROV':'C8','L-REG-MISC':'C8','L-KIT-ADMIN':'C9a','L-KIT-CHAT':'C9b','L-KIT-UM':'C9c','L-SURF':'C10',
        'Q1':'Q1','Q2':'Q2','Q3':'Q3','Q4':'Q4'}
def lane(r):
    o, f = r['owner'], r['file']
    if o in ('server','cli','sqlite','infra'): return 'R13-hosts'
    if o == 'daemon': return 'R7-daemon-http' if '/src/http/' in f else 'R8-daemon-runtime'
    if o in ('cms','cms-forms'): return 'R9-cms'
    if o == 'provider-plugins': return 'R12-providers'
    if o in ('admin',): return 'R1-admin-react' if ('/react/' in f or f.endswith('.tsx')) else 'R2-admin-core'
    if o == 'user-management': return 'R3-user-management'
    if o == 'chat': return 'R4-chat'
    if o == 'ui': return 'R5-ui'
    if o == 'commerce': return 'R6-commerce'
    if o in ('agent-runtime','analytics'): return 'R10-agent-runtime'
    return 'R11-platform-consumers'
rows = [r for r in csv.DictReader(open(os.path.join(D,'EDGES-sites.tsv')), delimiter='\t') if r['allowed'] != 'yes']
L = collections.defaultdict(lambda: {'files': {}, 'lines': 0, 'needs': set(), 'owners': set()})
for r in rows:
    l = L[lane(r)]; l['files'][r['file']] = int(r['file_loc']); l['lines'] += 1; l['needs'].add(NEED[r['lane']]); l['owners'].add(r['owner'])
with open(os.path.join(D,'LANES-files.tsv'),'w') as fh:
    fh.write('lane\tfile\tspec\tline\tfix\tneeds\n')
    for r in sorted(rows, key=lambda r: (lane(r), r['file'], int(r['line']))):
        fh.write(f"{lane(r)}\t{r['file']}\t{r['spec']}\t{r['line']}\t{r['fix']}\t{NEED[r['lane']]}\n")
for k in sorted(L, key=lambda k: int(k[1:].split('-')[0])):
    v = L[k]; print(f"{k:24} files={len(v['files']):3} lines={v['lines']:3} loc={sum(v['files'].values()):6} owners={','.join(sorted(v['owners']))} needs={','.join(sorted(v['needs']))}")
