import json,sys,collections
for p in sys.argv[1:]:
  d=json.load(open(p))['files']
  for f,fd in d.items():
    s=[m for m in fd['mutants'] if m['status'] in ('Survived','NoCoverage')]
    if len(s)<5: continue
    print('##',f.split('src/')[-1],len(s))
    print('  ', '; '.join('%d %s%s→%s'%(m['location']['start']['line'],m['mutatorName'][:6],'(st)' if m.get('static') else '',(m.get('replacement') or '')[:28].replace('\n',' ')) for m in sorted(s,key=lambda m:m['location']['start']['line'])))
