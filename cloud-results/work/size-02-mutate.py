import subprocess,re,sys
C='/home/user/Tovu/apps/website/src/server/runtime/composition/'
T=[C+'__tests__/'+n for n in ['create-app-lifecycle.pin.test.ts','create-app-precedence.pin.test.ts','create-app-route-table.pin.test.ts','create-app-visitor-capabilities.pin.test.ts','create-app-boot-work.test.ts']]
def swap(s):
    a='  registerMemberPageRoutes(app, routeDeps);\n'; assert a in s
    s=s.replace(a,'',1); b='  registerSiteRoutes({ app, deps: routeDeps });\n'; assert b in s
    return s.replace(b,b+a,1)
M=[
 ('1 member-pages/site-catch-all order swap','http-app/mount-public-site.ts',swap),
 ('2 themeIdOverride ignored','http-app/public-middleware.ts',lambda s:s.replace('if (options.themeIdOverride !== undefined) applyRenderThemeOverride(','if (false) applyRenderThemeOverride(',1)),
 ('3 oversized-body responder removed','app.ts',lambda s:s.replace('  app.use(respondToOversizedBody);\n','',1)),
 ('4 admin locals middleware dropped','app.ts',lambda s:s.replace('res.locals.adminFailureTracker = routeDeps.tracker; ','',1)),
 ('5 subscribe-once guard removed','site-event-subscriptions.ts',lambda s:s.replace('  if (busesWithSiteEventHandlers.has(routeDeps.bus)) return;\n','',1)),
 ('6a boot work never removed','site-app-boot-work.ts',lambda s:re.sub(r'  void bootWork\.then\(.*\n','',s,1)),
 ('6b boot work not handed to onBootWork','site-app-boot-work.ts',lambda s:s.replace('  options.onBootWork?.({ work: byokAssistantModule.toolSurface.ready });\n','',1)),
 ('7 idle-stop hook not registered','http-app/public-middleware.ts',lambda s:s.replace('if (!options.stopForIdle) return;','return;',1)),
 ('8 recoverInterrupted dropped','http-app/mount-assistant.ts',lambda s:s.replace('      recoverInterrupted: options.recoverAssistantChatRuns,\n','',1)),
 ('9 share-backend veto removed','app.ts',lambda s:s.replace('    if (routeDeps.siteShareBackend && routeDeps.siteShareBackend.hasWork?.({}) !== false) return true;\n','',1)),
 ('10 comments salt resolved lazily','http-app/visitor-submit.ts',lambda s:re.sub(r'ipHashSalt: resolveCommentsIpHashSalt\(\{(.*?)\}\)\.then\(\(\{ salt \}\) => salt\),',lambda m:'ipHashSalt: Promise.resolve().then(() => resolveCommentsIpHashSalt({'+m.group(1)+'}).then(({ salt }) => salt)),',s,1,re.S)),
 ('11 remote media still probes disk','http-app/visitor-submit.ts',lambda s:s.replace('        if (await routeDeps.siteBackupSources?.isMediaRemote?.()) return undefined;\n','',1)),
 ('12 System-principal message changed','http-app/visitor-submit.ts',lambda s:s.replace("form uploads require the site's System principal","form uploads need a principal",1)),
]
only=sys.argv[1:] 
for name,f,fn in M:
    if only and name.split()[0] not in only: continue
    p=C+f; orig=open(p).read(); new=fn(orig)
    if new==orig: print('NOCHANGE',name,flush=True); continue
    open(p,'w').write(new)
    try:
        r=subprocess.run(['/tmp/runtests.sh']+T,capture_output=True,text=True,timeout=900)
        m=re.search(r'ℹ fail (\d+)',r.stdout); fails=int(m.group(1)) if m else -1
        names=re.findall(r'^✖ (.*?) \(',r.stdout,re.M)
        print(('CAUGHT' if fails>0 else 'MISSED'),name,'fails=',fails,'|',sorted(set(names))[:2],flush=True)
    finally:
        open(p,'w').write(orig)
