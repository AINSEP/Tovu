#!/usr/bin/env python3
"""Generate lane K/T inventories and per-sheet sidecars. Run from the Tovu CODE worktree root.
usage: gen.py <out-dir (lanes-2026-11-16)>
Sidecars per sheet: <id>.files.tsv (blob guards), <id>.importers.tsv comes from symbols.cjs, <id>.census.txt."""
import os, re, subprocess, sys, collections

OUT = sys.argv[1]
F = 'apps/website/src/features/'

def sh(*a):
    return subprocess.run(a, capture_output=True, text=True).stdout

ALL = [f for f in sh('git', 'ls-files', 'apps', 'development', 'scripts', 'packages').split('\n')
       if re.search(r'\.(ts|tsx|mts|mjs|js|cjs)$', f) and 'node_modules' not in f]
ALLSET = set(ALL)
IMP = re.compile(r'''(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\brequire\(\s*|vi\.mock\(\s*|vi\.doMock\(\s*|importActual[^(]*\(\s*)(['"])([^'"\n]+)\1''')

def is_test(p):
    return '__tests__' in p or re.search(r'\.test\.|\.spec\.|/testing/|__fixtures__', p) is not None

def resolve(src, spec):
    if spec.startswith('#src/'): base = 'apps/website/src/' + spec[5:]
    elif spec.startswith('@/') and src.startswith('apps/admin/'): base = 'apps/admin/src/' + spec[2:]
    elif spec.startswith('.'): base = os.path.normpath(os.path.join(os.path.dirname(src), spec))
    else: return None
    base = re.sub(r'\.(js|mjs|jsx)$', '', base)
    for c in (base, base + '.ts', base + '.tsx', base + '/index.ts', base + '/index.tsx', base + '.mjs', base + '.js'):
        if c in ALLSET: return c
    return None

# importers[target] = list of (importer, line_no, spec)
importers = collections.defaultdict(list)
for f in ALL:
    try: lines = open(f, encoding='utf8', errors='replace').read().split('\n')
    except OSError: continue
    for i, line in enumerate(lines, 1):
        for m in IMP.finditer(line):
            r = resolve(f, m.group(2))
            if r: importers[r].append((f, i, m.group(2)))

# ---------------------------------------------------------------- label rules
# (regex on path relative to features/, label, jini target, sheet, basis)
RULES = [
 # ---- K: tools (existing Jini owner pattern cms/<domain>/{agent-tools,tool-registrations}.ts)
 (r'^redirects/agent-tools\.ts$', 'MOVE', '@jini-ai/cms/redirects (agent-tools.ts)', 'K-01', 'signals'),
 (r'^redirects/tool-registrations\.ts$', 'SPLIT', '@jini-ai/cms/redirects (tool-registrations.ts); contributeRedirectsTools stays', 'K-01', 'read'),
 (r'^redirects/phase-handler\.ts$', 'STAY', 'host routing binding (platform/routing); CLASSIFY says MIXED cms/redirects: revisit after R lanes', '-', 'signals'),
 (r'^widgets/agent-tools\.ts$', 'MOVE', '@jini-ai/cms/widgets (agent-tools.ts)', 'K-02', 'signals'),
 (r'^widgets/tool-registrations\.ts$', 'SPLIT', '@jini-ai/cms/widgets (tool-registrations.ts)', 'K-02', 'read'),
 (r'^widgets/media-html\.ts$', 'SPLIT', '@jini-ai/cms/widgets/html (3 console.* -> report port)', 'K-02b', 'signals'),
 (r'^widgets/deps\.ts$', 'STAY', 'composition of widget deps over 5 Tovu features', '-', 'signals'),
 (r'^comments/agent-tools\.ts$', 'MOVE', '@jini-ai/cms/comments (agent-tools.ts)', 'K-03', 'signals'),
 (r'^comments/tool-registrations\.ts$', 'SPLIT', '@jini-ai/cms/comments (tool-registrations.ts); settings get/set become ports', 'K-03', 'read'),
 (r'^comments/(builtin-provider|provider-selection|public-markers|comment-targets|types|data-module-install)\.ts$', 'STAY', 'provider binding/provenance is host-owned (plan-v6 K2); CLASSIFY rows keep their own sheets', '-', 'signals'),
 (r'^comments/ip-hash-salt\.ts$', 'STAY', 'reads process.env (env name stays in Tovu)', '-', 'signals'),
 (r'^seo/agent-tools\.ts$', 'MOVE', '@jini-ai/cms/seo (agent-tools.ts)', 'K-04', 'signals'),
 (r'^seo/tool-registrations\.ts$', 'SPLIT', '@jini-ai/cms/seo (tool-registrations.ts); settings + repos as ports', 'K-04', 'read'),
 (r'^seo/(cover-image|page-head-contributor)\.ts$', 'MOVE-AFTER', '@jini-ai/cms/seo after T-PO-02 (post cover policy) = audit2 B21', 'K-04b', 'audit2-B21'),
 (r'^taxonomy/agent-tools\.ts$', 'STAY', 'already a 39-line binding over @jini-ai/cms/taxonomy agent-tools', '-', 'signals'),
 (r'^taxonomy/tool-registrations\.ts$', 'SPLIT', '@jini-ai/cms/taxonomy (tool-registrations.ts); gateway/human-confirm/slug as ports', 'K-05', 'read'),
 (r'^taxonomy/repo(\.rows)?\.ts$', 'LANE-S', 'lane S run S1a (K-06 retired, coordinator decision 1)', 'S1a', 'signals'),
 (r'^taxonomy/(taxonomy-trash-follow-ups|trash-term|gated-hooks|collection-term-policy)\.ts$', 'MOVE-AFTER', '@jini-ai/cms/taxonomy after K-05 (they are K-05 ports first)', 'K-05b', 'signals'),
 (r'^taxonomy/publish-term-ids\.ts$', 'MOVE-AFTER', 'publish framework (audit2 B02 / row 140)', 'K-BLOCKED', 'signals'),
 (r'^taxonomy/render-entry\.ts$', 'MOVE-AFTER', 'holds a real renderer + cycle handling (rev 2, judge 18), not a forwarder: generic part -> @jini-ai/cms/taxonomy, design with K-05b', 'K-05b', 'read'),
 (r'^taxonomy/(content-targets|html-render|term-sync|contracts)\.ts$', 'STAY', 'thin Tovu forwarders/bindings; DELETE candidates are CLASSIFY rows, not this lane', '-', 'signals'),
 (r'^trash/agent-tools\.ts$', 'MOVE', '@jini-ai/cms/trash (agent-tools.ts)', 'K-07', 'read'),
 (r'^trash/trash-item-tool\.ts$', 'MOVE-AFTER', 'host-bound today (6 adapter consts, TrashDb, moveToTrash, readLiveSnapshot, registry): DESIGN after lane S S4b (K-08 retired; registry types land in S4a)', 'K-07b', 'read'),
 (r'^trash/tool-registrations\.ts$', 'SPLIT', '@jini-ai/cms/trash (tool-registrations.ts); permission map injected', 'K-07', 'read'),
 (r'^trash/permissions\.ts$', 'STAY', 'entity-type -> permission map is product policy (Codex, plan-v6 K4)', '-', 'plan-v6'),
 (r'^trash/registry\.ts$', 'STAY', 'plan-v6 S4: registry.ts stays; NO registry contract exists in @jini-ai/cms/trash (rev 2, judge 5): K-07 uses a local structural port', '-', 'plan-v6'),
 (r'^trash/(repo|table-adapter|entry-sql|entry-sql\.types|not-trashed)\.ts$', 'LANE-S', 'lane S runs S4a/S4b (K-08 retired, coordinator decision 1)', 'S4a', 'signals'),
 (r'^trash/adapters/marker-sql\.ts$', 'LANE-S', 'lane S S4 (stays in Tovu per S4; K-08 retired)', 'S4a', 'signals'),
 (r'^trash/adapters/', 'STAY', 'per-entity adapters bind Tovu tables/features; 4 are DEDUPE-AFTER-HARDENING in CLASSIFY (own rows)', '-', 'signals'),
 (r'^trash/(move-to-trash|remove-without-blocker|ports|widget-removal|scheduler\.node|db-port|agent-delete-policy)\.ts$', 'STAY', 'not in lane K scope (CLASSIFY rows own them: MIXED cms/trash, DEDUPE daemon/scheduler)', '-', 'classify'),
 (r'^webhooks/agent-tools\.ts$', 'MOVE', '@jini-ai/integrations/webhooks/tools (agent-tools.ts)', 'K-09', 'signals'),
 (r'^webhooks/tool-registrations\.ts$', 'SPLIT', '@jini-ai/integrations/webhooks/tools (audit2 B17; its sheet file was never pushed)', 'K-09', 'read'),
 (r'^webhooks/', 'STAY', 'NOT lane K: keyring/sealer/site-key = row 57 + audit2 B09; delivery/subscriptions already bind @jini-ai/integrations', '-', 'signals'),
 (r'^forms/agent-tools\.ts$', 'MOVE', '@jini-ai/cms/forms (agent-tools.ts)', 'K-10', 'signals'),
 (r'^forms/tool-registrations\.ts$', 'SPLIT', '@jini-ai/cms/forms (tool-registrations.ts); duplicate-handler + slug policy + pull/status ports', 'K-10', 'read'),
 (r'^forms/(form-file-maintenance|form-file-purge|protect-existing-files|submission-ip-expiry-sweep|import-remote-submissions|form-destination-manifest|field-length-caps)\.ts$', 'MOVE-AFTER', '@jini-ai/cms/forms(/sql) leftovers: design-level only (K-11)', 'K-11', 'signals'),
 (r'^form-destinations/', 'MOVE-AFTER', '@jini-ai/cms/forms destinations (CLASSIFY: 3 MOVE, 1 MOVE-AFTER, 1 MIXED, 1 DELETE): design-level only (K-11)', 'K-11', 'classify'),
 # ---- T theme
 (r'^theme/(template-applicability|theme-layout|static-asset-contract|build-conformance|theme)\.ts$', 'COVERED', 'audit2 B04 T1/T2/T5 (@jini-ai/cms/theme[/node])', 'B04', 'audit2-B04'),
 (r'^theme/validation/(profiles|references|structure)\.ts$', 'COVERED', 'audit2 B04 T1/T3/T4', 'B04', 'audit2-B04'),
 (r'^theme/(asset-path-rewrites|token-aliases|hardcoded-link-lists)\.ts$', 'MOVE', '@jini-ai/cms/theme (universal leaves; audit2 B15 files)', 'T-TH-01', 'read'),
 (r'^theme/font-links\.ts$', 'SPLIT', '@jini-ai/cms/theme: pure renderer with resources REQUIRED; host loader public-theme-resources.ts stays (rev 2, judge 4)', 'T-TH-01', 'read'),
 (r'^theme/public-theme-resources\.ts$', 'STAY', 'host resource loader: node:fs + product root + module cache (rev 2, judge 4)', '-', 'read'),
 (r'^theme/page-publication\.ts$', 'MOVE-AFTER', 'filesystem write + live-theme replace + preview refresh: lifecycle, after T-TH-05 (rev 2, judge 4)', 'T-TH-07', 'read'),
 (r'^theme/validation/(manifest-v2|markup|validate-theme-package)\.ts$', 'MOVE', '@jini-ai/cms/theme/node validation', 'T-TH-02', 'signals'),
 (r'^theme/validation/webmcp-markup\.ts$', 'MOVE', '@jini-ai/cms/theme/node (parse5 already a cms dep)', 'T-TH-02', 'signals'),
 (r'^theme/migration/theme-migration-plan\.ts$', 'MOVE', '@jini-ai/cms/theme (pure plan)', 'T-TH-02', 'signals'),
 (r'^theme/entry-list-render\.ts$', 'SPLIT', '@jini-ai/cms/listing (existing subpath); class prefix + safeHref injected', 'T-TH-03', 'classify'),
 (r'^theme/render-contract\.ts$', 'SPLIT', 'safeHref -> @jini-ai/core/text; rest -> @jini-ai/cms/theme with consent/slot ports', 'T-TH-03', 'classify'),
 (r'^theme/(handlebars-allowlist|liquid-allowlist)\.ts$', 'OWNER', 'new deps handlebars/liquidjs: optional-peer subpaths vs injected TemplateValidatorPort (D-T2)', 'T-TH-04', 'signals'),
 (r'^theme/theme-files\.ts$', 'SPLIT', 'containment/listing -> @jini-ai/platform/fs guarded reader (DEDUPE); theme paths -> cms/theme/node (row 162)', 'T-TH-05', 'classify'),
 (r'^theme/static-render\.ts$', 'SPLIT', '@jini-ai/cms/theme/node render engine; menu part needs a core contract (row 162)', 'T-TH-06', 'classify'),
 (r'^theme/(static-portability-index|code-tier-asset-normalizer)\.ts$', 'MOVE-AFTER', '@jini-ai/cms/theme/node after T-TH-06', 'T-TH-06', 'signals'),
 (r'^theme/(duplicate-theme|sync-originals|file-identity-lock|theme-preview-image|save-theme-original)\.ts$', 'MOVE-AFTER', '@jini-ai/cms/theme/node lifecycle after T-TH-05 (audit2 B10)', 'T-TH-07', 'audit2-B10'),
 (r'^theme/migration/migrate-theme\.ts$', 'MOVE-AFTER', '@jini-ai/cms/theme/node lifecycle after T-TH-05 (audit2 B10)', 'T-TH-07', 'audit2-B10'),
 (r'^theme/theme-trash\.ts$', 'STAY', 'binds Tovu trash feature (audit2 B10 lists it; generic part is the fs move helper only)', 'T-TH-07', 'signals'),
 (r'^theme/(agent-tools|tool-registrations|duplicate-theme-tool|trash-theme-tool|set-active-theme-tool|import-theme-file-tool|page-publish-tool|preview-switcher-tools|file-mutation-tools)\.ts$', 'MOVE-AFTER', '@jini-ai/cms/theme tools after the engine is in Jini', 'T-TH-08', 'signals'),
 (r'^theme/(visitor-publication|theme-file-import)\.ts$', 'STAY', 'CLASSIFY rows own them (agentic node entry; cms/media sniffer)', '-', 'classify'),
 (r'^theme/', 'STAY', 'active theme, preview switcher, watcher, roster, security headers, id aliases: one-site policy/wiring', '-', 'signals'),
 # ---- T post
 (r'^post/(post-vocabulary|html-plain-text|duplicate-embeds)\.ts$', 'MOVE', 'per CLASSIFY: cms/core, cms/seo, cms/widgets', 'T-PO-01', 'read'),
 (r'^post/featured-image\.ts$', 'MOVE-AFTER', '@jini-ai/cms/media; throws PostValidationError from post.ts, so it moves with the posts domain (rev 2)', 'T-PO-03', 'read'),
 (r'^post/go-live\.ts$', 'SPLIT', 'pure decisions + announce functions -> @jini-ai/cms/posts; startPostGoLiveSweep (timers, mutable state) STAYS as host scheduling (rev 2, judge 10)', 'T-PO-01g', 'read'),
 (r'^post/expected-version\.ts$', 'OWNER', 'DEDUPE onto existing @jini-ai/core/optimistic-concurrency parseExpectedVersion; safe-integer + error-class differences = D-T6 (rev 2, judge 11)', 'T-PO-01v', 'read'),
 (r'^post/cover-image\.ts$', 'SPLIT', '@jini-ai/cms/media/cover-image (new universal entry; cover policy); unblocks K-04b', 'T-PO-02', 'classify'),
 (r'^post/post\.ts$', 'SPLIT', '@jini-ai/cms/posts (NEW domain); size split first', 'T-PO-03', 'classify'),
 (r'^post/(repo|repo\.rows|repo\.memory|search-index\.contract|search-index\.postgres|search-index\.sqlite|search-index|search)\.ts$', 'MOVE-AFTER', '@jini-ai/cms/posts(/sql) after T-PO-03', 'T-PO-04', 'classify'),
 (r'^post/reverters\.ts$', 'MOVE-AFTER', '@jini-ai/cms/posts (audit2 B18) after T-PO-04', 'T-PO-04', 'audit2-B18'),
 (r'^post/(agent-tools|tool-registrations|content-stats-tool|preview-tool)\.ts$', 'MOVE-AFTER', '@jini-ai/cms/posts tools after T-PO-03; size split first', 'T-PO-05', 'classify'),
 (r'^post/(slug|template-options|search-index\.memory)\.ts$', 'STAY', 'audit2 rejected slug + search-index.memory; template-options binds theme+presentation', '-', 'audit2'),
 # ---- T newsletter
 (r'^newsletter/(campaign-write-service|campaign|errors|hooks|launch-gate|lists|ports|repo\.memory|types)\.ts$', 'COVERED', 'audit2 B05 (@jini-ai/cms/newsletter campaign domain)', 'B05', 'audit2-B05'),
 (r'^newsletter/(send-pipeline|subscriptions|unsubscribe|confirmation)\.ts$', 'MOVE-AFTER', '@jini-ai/cms/newsletter after B05 (CLASSIFY row 52)', 'T-NL-01', 'classify'),
 (r'^newsletter/repo(\.rows)?\.ts$', 'MOVE-AFTER', '@jini-ai/cms/newsletter/sql after B05', 'T-NL-02', 'signals'),
 (r'^newsletter/(agent-tools|tool-registrations|delivery/tool-registrations)\.ts$', 'MOVE-AFTER', '@jini-ai/cms/newsletter tools after T-NL-01', 'T-NL-03', 'signals'),
 (r'^newsletter/data-module-manifest\.ts$', 'STAY', 'provenance is host-owned (plan-v6 T3a)', '-', 'plan-v6'),
 # ---- generic defaults
 (r'/publish-content\.ts$|/active-theme-publish-content\.ts$', 'MOVE-AFTER', 'publish framework (audit2 B02/B08, row 140): BLOCKED, listed in INDEX', 'BLOCKED-PUBLISH', 'audit2-B08'),
 (r'/repo\.sqlite\.ts$', 'STAY', 'Tovu store binding (CLASSIFY: DELETE/inline where listed)', '-', 'rule'),
 (r'/index\.ts$|/(catalog|rendering|contracts|read-model|author)\.ts$', 'STAY', 'Tovu feature barrel/forwarder (not a re-export shell of moved code; shrinks as importers repoint)', '-', 'rule'),
 (r'/capability-card\.ts$', 'STAY', 'product wording (site-guide card)', '-', 'rule'),
 (r'/settings\.ts$', 'STAY', 'settings bindings stay (Codex, plan-v6 K4)', '-', 'plan-v6'),
 (r'.', 'STAY', 'no generic part identified from signals; not read line by line', '-', 'rule'),
]

def label(rel):
    for rx, lab, tgt, sheet, basis in RULES:
        if re.search(rx, rel): return lab, tgt, sheet, basis
    return 'STAY', '', '-', 'rule'

LANES = {'K': ['redirects', 'widgets', 'comments', 'seo', 'taxonomy', 'trash', 'webhooks', 'forms', 'form-destinations'],
         'T': ['theme', 'post', 'newsletter']}
sheets = collections.defaultdict(list)
summary = collections.defaultdict(lambda: collections.Counter())
for lane, feats in LANES.items():
    os.makedirs(os.path.join(OUT, lane), exist_ok=True)
    rows = []
    for ft in feats:
        for f in sorted(x for x in ALL if x.startswith(F + ft + '/') and re.search(r'\.tsx?$', x)):
            if is_test(f): continue
            rel = f[len(F):]
            loc = open(f, encoding='utf8', errors='replace').read().count('\n')
            blob = sh('git', 'hash-object', f).strip()
            lab, tgt, sheet, basis = label(rel)
            imps = importers.get(f, [])
            prod = sorted({i for i, _, _ in imps if not is_test(i)})
            tests = sorted({i for i, _, _ in imps if is_test(i)})
            own_tests = [t for t in tests if t.startswith(F + ft + '/')]
            rows.append((f, loc, blob, lab, tgt, sheet, basis, len(prod), len(tests)))
            summary[lane][lab] += loc
            summary[lane + ':' + ft][lab] += loc
            if sheet.startswith(('K-', 'T-')) and sheet not in ('K-BLOCKED',):
                sheets[(lane, sheet)].append((f, loc, blob, lab, tgt, imps))
    with open(os.path.join(OUT, lane, 'INVENTORY.tsv'), 'w') as fh:
        fh.write('path\tloc\tblob\tlabel\tjini_target_or_reason\tsheet\tbasis\tprod_importers\ttest_importers\n')
        for r in rows: fh.write('\t'.join(str(c) for c in r) + '\n')

for (lane, sid), files in sorted(sheets.items()):
    base = os.path.join(OUT, lane, sid)
    moved = {f for f, *_ in files}
    with open(base + '.files.tsv', 'w') as fh:
        fh.write('path\tloc\tblob\tlabel\tjini_target\n')
        for f, loc, blob, lab, tgt, _ in files: fh.write(f'{f}\t{loc}\t{blob}\t{lab}\t{tgt}\n')
    names = set()
    for f, *_ in files: names.add(re.sub(r'\.tsx?$', '', os.path.basename(f)))
    feats = sorted({f[len(F):].split('/')[0] for f in moved})
    pat = '|'.join(f'{ft}/(?:[a-z-]+/)?(?:{"|".join(sorted(re.escape(n) for n in names))})' for ft in feats)
    with open(base + '.census.txt', 'w') as fh:
        fh.write('# Re-run at execution time; every hit must be a row of ' + sid + '.importers.tsv (importer:line; written by scripts/symbols.cjs). Any other hit = STOP.\n')
        fh.write(f"rg -n --no-heading -e \"(from|import|mock|importActual)[^'\\\"]*['\\\"][^'\\\"]*({'|'.join(sorted(re.escape(n) for n in names))})(\\.js|\\.ts)?['\\\"]\" apps development scripts --glob '!**/node_modules/**' | rg \"({'|'.join(feats)})\"\n")
        fh.write('# importers that reach a moved name through a feature index.ts are the barrel: rows of the importers.tsv (not matched by this rg).\n')
        n = sum(len(i) for *_, i in files)
        fh.write(f'# planning-time rows: {n}\n')

for k in sorted(summary):
    print(k, dict(summary[k]), 'total', sum(summary[k].values()))
for (lane, sid), files in sorted(sheets.items()):
    print(sid, len(files), 'files', sum(l for _, l, *_ in files), 'loc', sum(len(i) for *_, i in files), 'import sites')
