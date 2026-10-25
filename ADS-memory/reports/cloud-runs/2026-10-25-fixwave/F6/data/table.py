import json,glob,collections,os
BEFORE={ # lane score (L7 = feature-wide __tests__; L12 = per-file test lists; pass-2 noted)
 'features/database-transfer/destination-store.ts':'86.1','features/database-transfer/exclusions.ts':'28.6',
 'features/identity/permission-list-tool.ts':'30.6','features/identity/user-manage-permission.ts':'0.0','features/identity/boot-session-token.ts':'82.8',
 'features/member-login/link-service.ts':'76.2','features/member-login/link-policy.ts':'97.3','features/member-login/ready-providers.ts':'0.0',
 'features/member-login/oidc-login.ts':'62.8','features/member-login/providers.ts':'55.8','features/identity/api-key-secret.ts':'63.3',
 'features/settings/form-delivery.ts':'93.0','features/members/password-auth.ts':'93.9*','features/mail/attempts.repo.ts':'77.3','features/settings/tool-registrations.ts':'78.1',
 'server/runtime/boot/site-listener-origin.ts':'30.8','server/inbound/public-http/routes/members/oidc-verify-email.ts':'64.1',
 'server/inbound/public-http/routes/members/complete-sign-in.ts':'74.6','server/inbound/public-http/routes/members/oidc-callback.ts':'80.8',
 'server/inbound/public-http/routes/members/unlink-identity.ts':'63.2','server/inbound/public-http/routes/members/me.ts':'86.3',
 'server/inbound/admin-http/publish-trust-auth.ts':'61.5 (pass-2 80.9)','server/inbound/admin-http/routes/api-keys/issue.ts':'73.3','server/inbound/admin-http/routes/api-keys/create-principal.ts':'83.3',
 'server/inbound/admin-http/routes/system/site-key.ts':'56.8 (pass-2 87.0)','server/inbound/public-http/middleware/canonical-site-host.ts':'87.0',
 'server/inbound/public-http/routes/api-connections/oauth-callback.ts':'87.7',
}
best={}
for p in sorted(glob.glob('/root/stryker/reports/*.json'), key=os.path.getmtime):
    run=os.path.basename(p)[:-5]
    d=json.load(open(p))
    for f,v in d['files'].items():
        c=collections.Counter(m['status'] for m in v['mutants'])
        tot=sum(c[k] for k in('Killed','Timeout','Survived','NoCoverage'))
        f=f.replace('/home/user/Tovu/','').replace('apps/website/src/','')
        best.setdefault(f,[]).append((run,tot,c['Killed'],c['Timeout'],c['Survived'],c['NoCoverage'],100.0*(c['Killed']+c['Timeout'])/tot if tot else 100.0))
print("| file | lane before | after (run) | mutants | killed | timeout | survived | no-cov |")
print("|--|--|--|--|--|--|--|--|")
for f in sorted(best):
    runs=best[f]; r=runs[-1]
    hist=' → '.join(f"{x[6]:.1f}" for x in runs)
    print(f"| {f} | {BEFORE.get(f,'n/a')} | **{r[6]:.1f} %** ({r[0]}{'; runs '+hist if len(runs)>1 else ''}) | {r[1]} | {r[2]} | {r[3]} | {r[4]} | {r[5]} |")
