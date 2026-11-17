import json,os,re,subprocess,sys
ROOT='/home/user/code'; W='apps/website/src/'
g=json.load(open('graph.json'))
def istest(f): return bool(re.search(r'__tests__|__specs__|\.test\.|\.spec\.|/e2e/|/tests?/',f))
def short(p): return p.replace(W,'')
groups={
'S1':['features/taxonomy/repo.ts','features/taxonomy/repo.rows.ts','features/taxonomy/repo.sqlite.ts','features/navigation/repo.ts','features/navigation/repo.sqlite.ts','features/presentation/repo.ts','features/presentation/repo.rows.ts','features/presentation/repo.sqlite.ts','features/workspace/repo.ts','features/workspace/repo.sqlite.ts'],
'S2':['features/entries/repo.ts','features/entries/repo.rows.ts','features/entries/repo.sqlite.ts','features/entries/trash-aware-memory-repo.ts','features/content-types/repo.ts','features/content-types/repo.rows.ts','features/content-types/repo.sqlite.ts','features/content-types/repo.memory.ts'],
'S3':['features/identity/repo.ts','features/identity/repo.sqlite.ts','features/identity/repo.memory.ts','features/identity/mfa.repo.ts','features/identity/passkeys.repo.ts','features/identity/recovery-codes.repo.ts','features/identity/user-purge.ts','features/identity/user-purge.sqlite.ts','features/identity/user-purge-types.ts'],
'S4':['features/trash/repo.ts','features/trash/repo.sqlite.ts','features/trash/table-adapter.ts','features/trash/registry.ts','features/trash/entry-sql.ts','features/trash/entry-sql.types.ts','features/trash/not-trashed.ts','features/trash/db-port.ts','features/trash/ports.ts','features/trash/adapters/marker-sql.ts','features/trash/adapters/comment.ts','features/trash/adapters/post.ts','features/trash/adapters/redirect.ts','features/trash/adapters/media.ts','features/trash/adapters/member.ts','features/trash/adapters/user.ts','features/trash/adapters/directory.ts','features/trash/adapters/plugin.ts','features/trash/adapters/theme.ts'],
'S5':['features/settings/repo.ts','features/settings/repo.sqlite.ts','platform/db/repos/gated-mutation-token-repo.ts','platform/db/sqlite/gated-mutation-token-repo.sqlite.ts','platform/db/repos/origin-repo.ts','platform/db/sqlite/origin-repo.sqlite.ts','features/origin/configured-origin.ts'],
'S6':['platform/db/repos/change-set-repo.ts','platform/db/sqlite/change-set-repo.sqlite.ts','platform/db/repos/outbox-repo.ts','platform/db/sqlite/outbox-repo.sqlite.ts','platform/db/repos/webhook-repo.ts','platform/db/sqlite/webhook-repo.sqlite.ts','platform/db/repos/form-delivery-repo.ts','platform/db/repos/form-submission-receipt-repo.ts','contracts/core/events/enqueue-only-outbox.ts','contracts/core/events/jini-outbox-adapter.ts','contracts/core/events/outbox-drainer.ts','contracts/core/events/outbox-retry-policies.ts','contracts/core/events/outbox-worker.ts'],
'S7':['platform/db/repos/media-repo.ts','platform/db/sqlite/media-repo.sqlite.ts','features/media/versioned-media-repo.ts','features/media/guard-rendition-repo.ts'],
'S8':['contracts/core/entry-refs/extractor.ts','contracts/core/entry-refs/ports.ts','contracts/core/entry-refs/repo.memory.ts','contracts/core/entry-refs/types.ts','platform/db/repos/entry-refs-repo.ts','platform/db/sqlite/entry-refs-repo.sqlite.ts','contracts/core/events/memory-bus.ts','contracts/core/expand-partials.ts'],
'U12':['features/members/'+x for x in 'access-resolver.ts agent-tools.ts auth-mail.ts capability-card.ts consent-service.ts index.ts mailer.console.ts password-auth.ts ports.ts repo.memory.ts repo.rows.ts repo.sqlite.ts repo.ts subscriber-directory.ts tool-registrations.ts trash-member.ts types.ts write-service.ts'.split()],
'U3':['features/identity/api-key-secret.ts','features/identity/api-key-service.ts','features/identity/api-key-types.ts','features/identity/site-key-permission.ts'],
}
out=open('inventory.tsv','w'); out.write('group\tpath\tlines\tblob\tprod_importers\ttest_importers\tjini_imports\tother_ext\tcross_feature_imports\n')
tot={}
for gk,fl in groups.items():
    for f in fl:
        p=W+f
        if not os.path.exists(os.path.join(ROOT,p)): print('MISSING',p); continue
        n=sum(1 for _ in open(os.path.join(ROOT,p),encoding='utf8'))
        blob=subprocess.check_output(['git','-C',ROOT,'hash-object',p],text=True).strip()[:10]
        imps=g['importers'].get(p,[]); pi=[i for i in imps if not istest(i)]; ti=[i for i in imps if istest(i)]
        ext=g['ext'].get(p,[]); ji=[e for e in ext if e.startswith('@jini-ai/')]; oe=[e for e in ext if not e.startswith('@jini-ai/')]
        d=os.path.dirname(p)
        cross=[short(i) for i in g['imports'].get(p,[]) if not i.startswith(d+'/')]
        out.write('\t'.join([gk,f,str(n),blob,str(len(pi)),str(len(ti)),','.join(ji),','.join(oe),','.join(cross)])+'\n')
        tot.setdefault(gk,[0,0]); tot[gk][0]+=1; tot[gk][1]+=n
out.close()
for k,v in tot.items(): print(k,v)
print('S total',sum(v[1] for k,v in tot.items() if k.startswith('S')),'U total',sum(v[1] for k,v in tot.items() if k.startswith('U')))
