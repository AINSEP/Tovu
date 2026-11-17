# Lanes S (database code) and U (users): plan index — revision 3 complete, 2026-11-16; su-refresh 2026-11-17 (§1b). Planning only, nothing executed.

Revision 3 (table at the end) re-pinned every facts file on Tovu `integ/merge-final-2026-11-16` @ `232764af5` / Jini
`65d73b0d5`; the paragraphs below that name merge-a describe revision 2. Cross-plan collisions with lanes K/T: §3a.

Status: **revision 2 written for every sheet; no sheet carries a HOLD banner.** All 16 judge findings are fixed in the
sheet bodies ("Revision 2 - judge response" below). Of the 8 round-1 remainder items, 6 are closed and 2 stay open
(§7, numbered). What was NOT verified is listed per sheet and in §8; the plan was not compiled or run.

Code read for this revision: Tovu `integ/merge-a-2026-11-16` @ `e801e9ae` (no `merge-final` existed in Tovu; cross-checked
with `merge-b` @ `450ac748`: of all lane files only `platform/db/repos/change-set-repo.ts` differs, 2 lines) and Jini
`integ/merge-final-2026-11-16` @ `af33fcdb` (contains merge-a `dde69a6d` and merge-b `9c982fd9`).
Facts files were regenerated on that Tovu tree (`scripts/` now take `LANE_ROOT`).

## 1. Verified size (production lines, tests excluded; `inventory.tsv`)
| Lane | Lines | Files | Test files importing them (regenerated) |
|---|---|---|---|
| S | **9,705** | 78 | S1 18, S2 27, S3 19, S4 40, S5 12, S6 40, S7 27, S8 54 (overlapping) |
| U | **5,320** | 22 | members 56 + 16, API keys 7 |
`coverage.tsv`: 60 of the 100 files have a CLASSIFY label, 40 have none; 51 labelled files have no other sheet or design.

## 1b. Sheet status after su-refresh (2026-11-17, on `origin/refactor/terra` = Tovu `232764af5` / Jini `65d73b0d5`)
Labels: **READY** = body matches the tree, no edit needed; **READY-WITH-NOTE** = body matches after this refresh's fixes,
or carries a note the executor must read; dispatch still waits for the prerequisites named (each has a command; on the
base every xpkg / audit2 prerequisite prints nothing: R6-R9 `rg -q ColumnCatalogPort packages/cms/src/forms/sql`, N1
`test -f packages/node-adapters/package.json`, C9c, R3b, A07 `ls packages/user-management/src/members/ports.ts`; S0 has not
run); **BLOCKED** = cannot start even when those land (an open owner decision with no sheet-side answer, or unwritten work).
Base gates measured: Tovu `typecheck` green; `check:size`, `check:complexity`, `check:boundaries`, `check:architecture` RED
on the unmodified base (not lane-caused; T-SQLREPO §1 now captures them and §5 compares); `write-path-inventory.ts --check`
cannot run (T-SQLREPO §1); Jini `check:size`, `check:complexity`, `guard` green. Facts: all 12 regenerate byte-identical.
| Sheet | Status | What the refresh found / changed (details in the sheet) | Waits for |
|---|---|---|---|
| S3a | READY-WITH-NOTE | partition range fixed (:58-630); the cited open-bugs entry does not exist (reworded: carried in the report, no edit to `open-bugs.md`) | S0; xpkg C9c + R3b (both print nothing on the base) |
| S3b | READY-WITH-NOTE | `createMfaStore` 48 lines: measure with `limits` | S3a |
| S4a | READY-WITH-NOTE | barrel lines of moved symbols DELETED (were "repointed": fires xpkg S3) + 4 barrel importers listed with a command; `db-port.ts` STAYS (barrel fan-out 11 files); `notTrashed` has 1 call site, `isTrashedRecord` options required | S0; R6-R9; S2c (cms chain) |
| S4b | READY-WITH-NOTE | full constructor-call list (deps.ts:1641, taxonomy slice :23/:33, entries repair :100, 9 tests); `index.ts:60` deleted; `deps.ts` shared file | S4a |
| S5a | READY | 20 methods, ranges, lock line all match | S0; OD-1 |
| S5b | READY-WITH-NOTE | Tovu already adapts the port the other way (`token.ts:76 adaptTokenStore`): round trip accepted, follow-up named | S5a; OD-1 |
| S5c | READY-WITH-NOTE | origin gate rows rewritten: the "security profile" admin-Origin gate does not exist; real consumers are the egress / redirect allowlists and canonical host | S5b; OD-1 |
| S6a | READY-WITH-NOTE | `claimLeaseMs` is optional today; 3 positional test sites + 10 test importers listed | S5c; OD-1 + **OD-6 (sheet SKIPs without it)** |
| S6b | READY-WITH-NOTE | `DeliveryEnvelopeStore` is already an alias of the Jini port: comparison removed | xpkg R11b-3; OD-2 |
| S6c | READY-WITH-NOTE | invented "clamp" row replaced by today's behaviour (no clamp, default limit) | R6-R9; S8b (cms chain) |
| S7a | READY-WITH-NOTE | the port extends `MediaFileReplacementRepoPort` (not `MediaRepoPort`); lines :39/:49/:58/:80 | S4b; R6-R9 |
| S7b | READY-WITH-NOTE | partition ranges fixed; content-type port decided (Tovu-only; Jini-local interface, dedupe follow-up) | S7a |
| S8a | READY-WITH-NOTE | DD-entry-refs-1 re-pinned into the sheet: 9 blobs + survivor match, ONE importer moved (`type-registry.ts` -> `tovu-publish-ports.ts:22`), guard command proven both ways; S8a runs DD first if it has not landed | S7b; R6-R9 |
| S8b | READY | imports and `expandPartials` signature match | S8a |
| S8c | BLOCKED (OD-6 + the unwritten memory-outbox behaviour comparison, R3-1) | - | - |
| U1a | READY-WITH-NOTE | `withoutId` conditional resolved (used at :400/:477/:570) | A07; S3a; OD-3 |
| U1b | READY-WITH-NOTE | `findByTokenHash` does NOT filter revoked/expired: pinned as such | U1a; S4a |
| U2a | READY-WITH-NOTE | construction site `app.ts:627` under `wrapMailerWithPurposeGate`; `MailerPort` lives in `@jini-ai/core/contracts/mail` | xpkg N1 |
| U2b | READY-WITH-NOTE | members-barrel rule rewritten (delete + repoint 11 importers; command); `credentialLifecycle` binding keeps its `??` in-memory branch | U2c-2; S4a |
| U2c-1 | READY-WITH-NOTE | all 40 declaration lines match; S3 allowance for Tovu-internal barrel specifier changes | S0 only |
| U2c-2 | READY-WITH-NOTE | 2 barrel importers of `issueMemberSession` | A07; S3a; U2c-1 |
| U2c-3 | READY-WITH-NOTE | 3 barrel importers; `catch` at :676 | U2c-2 |
| U3 (U3a/U3b) | READY-WITH-NOTE | "per security profile" replaced by the real `localOwnerSignIn` input; `currentCredential` :268-292; command K, hasher/scheme STOP and declaration map re-run and match | S3b; OD-4 |
Shared-rule fixes this refresh (T-SQLREPO): §6 (a)/(c) guarded (an empty `NEW_JINI` made them search the whole clone: 570 /
746 false hits); §1 base captures + §5 comparisons for the four red Tovu ratchets; write-path baseline gated by a diff.
No STOP command sits in a markdown table with `\|` in any S/U sheet (checked: 0 hits).

## 2. Sheets (assemble per `T-SQLREPO.md` §0: xpkg `COMMON.md` + `T-SQLREPO.md` + sheet + facts)
| Run | Sheet | Target | Est. tokens | Needs (beyond S0) |
|---|---|---|---|---|
| S0 | `S/S0-pins.md` | Tovu: 8 pins + `schemaErasedKernel` | 120k | base pair green; OD-8 |
| S1w | `S/S1w-workspace-sql.md` (replaces `move-workspace.md`) | cms/workspace/sql | 90k | calibrates the template; xpkg R6-R9, C3 |
| S1a / S1b / S1c | `S/S1-…` | cms taxonomy / navigation / presentation `/sql` (+ `taxonomy/read-ports.ts` on `./taxonomy`) | 210k / 150k / 80k | S1w, xpkg R6-R9 |
| S2a / S2b / S2c | `S/S2-…` | cms content-types/sql, entries/sql, entries memory twin | 100k / 200k / 110k | xpkg R6-R9; not with A08 |
| S3a / S3b | `S/S3-identity-sql.md` | user-management/server/sql | 220k / 120k | xpkg C9c + R3b |
| S4a / S4b | `S/S4-trash-sql.md` | cms/trash (contracts) + trash/sql | 200k / 210k | xpkg R6-R9 |
| S5a / S5b / S5c | `S/S5-…` | db settings / gated-mutations / verified-origin | 180k / 100k / 130k | OD-1 |
| S6a / S6b / S6c | `S/S6-…` | db/events; integrations/webhooks/sql; cms/forms/sql | 200k / 190k / 170k | OD-1 + OD-6 (S6a); xpkg R11b-3 (S6b); xpkg R6-R9 (S6c) |
| S7a / S7b | `S/S7-media-sql.md` | cms/media, cms/media/sql | 110k / 240k | xpkg R6-R9; not with A08 |
| S8a / S8b | `S/S8-….md` | cms/widgets/sql; cms/widgets/markers | 110k / 70k | move-entry-refs |
| U1a / U1b | `U/U1-members-sql.md` | user-management/members/sql | 200k / 190k | A07, S3a, OD-3; U1b: S4a |
| U2c-1 / U2a / U2c-2 / U2b / U2c-3 | `U/U2-members-auth-domain.md` | Tovu split; platform/mail; user-management/members/server | 170k / 90k / 170k / 210k / 200k | U2c-1: nothing; others: A07; U2b: S4a |
| U3a / U3b | `U/U3-api-keys.md` | user-management core + server/api-keys + server/sql | 190k / 210k | S3a, OD-4 |
**Total: 31 runs, about 4.94M Sonnet tokens** (S 3.31M in 22 runs incl. S1w, U 1.63M in 9), every run under 250k. Revision 2
said 30 runs / 4.85M without the calibration run; revision 3 added S1w (90k) in place of the external `move-workspace`. Round 1 said 26
runs / 4.15M plus ~0.9M unwritten and one ~250k Opus design: the design (U2c) and the unwritten S2c are now inside the
total; U3c is gone. Not included: `move-entry-refs` (existing sheet on `plan/w1-sheets-d`; S8a needs only its DD slice, see `S/S8`), the open items of §7
(~0.5M if all are done), one batched cloud verification run per wave. Estimates use 30k + 25 tokens/line plus the
test-repoint load; none is measured.

## 3. Order and prerequisites
Outside this lane, first: xpkg waves 0b-3 for the packages named above (`N1` before U2a; `R6-R9`, `C9c` in wave 1;
`R3b` in wave 2; `R11b-3` in wave 3); audit2 A07 (before U1 and U2c-2) and A08 (never in a wave with S2b or S7);
existing `move-entry-refs` (S8a only). Designs that edit a file a sheet moves run BEFORE that sheet, and the
sheet's facts diff then fails until its table is regenerated: lost-updates (`identity/repo.ts`, `members/repo.ts`,
`settings/repo.ts`, `entries/repo.ts`), error-system (`members/write-service.ts`, `jini-outbox-adapter.ts`), env-schema
(settings defaults), publish-engine (outbox / change-set callers).
1. **S0**, alone: green, every mutation red, facts regenerated and committed.
2. **S1w** (calibration, `S/S1w-workspace-sql.md`; replaces `move-workspace`). If it does not land clean, fix `T-SQLREPO.md`
   before any fan-out.
3. Four chains, parallel with each other, serial inside (each run adds an export entry to ONE `package.json`, and an
   export must build in the commit that introduces it):
   - cms: S1w (step 2) -> S1a -> S1b -> S1c -> S2a -> S2b -> S2c -> S4a -> S4b -> S7a -> S7b -> S8a -> S8b -> S6c
   - db: S5a -> S5b -> S5c -> S6a
   - user-management: U2c-1 (Tovu only, may start right after S0) -> S3a -> S3b -> U3a -> U3b -> U1a -> U1b -> U2c-2 -> U2b -> U2c-3
     (U1b and U2b also wait for S4a on the cms chain)
   - single runs: S6b (integrations), U2a (platform)
4. Shared Tovu files are serialized by the table in `T-SQLREPO.md` §3 (no coordinator edits; baselines and the `kysely`
   peers travel in the commit that needs them). Two additions:
   - `server/runtime/composition/deps.ts`: at most one sheet per wave whose `wiring` names a line there. Known (su-refresh):
     S6a (outbox binding), S4b (`deps.ts:355` barrel import + `:1641` `createTableTrashAdapter`), U2b (barrel importer of
     the resolver symbols). A census hit in another sheet moves that sheet to the next wave.
   - `features/members/index.ts` (134-line barrel, 63 importers; round-1 item 7): serially on the user-management chain.
     su-refresh: a barrel line may NOT be repointed to a Jini specifier (xpkg COMMON S3 fails on it; owner rule: no
     forwarders). A run that moves a symbol to Jini DELETES its barrel line and repoints that symbol's barrel importers
     (`U/U2` "Barrel rule": U2b 11 files, U2c-2 2, U2c-3 3). Only U2c-1 (Tovu-internal split) changes `./…` specifiers
     of existing lines. U1a/U1b touch no barrel line (`repo.sqlite.ts` keeps its names). **R-BARRELS
     runs on this barrel either before U2c-1 or after U2c-3, never in between**; if after, it repoints the importers to
     the final owners these sheets created.

## 3a. Cross-plan: lanes S/U vs K/T (revision 3, R4-1; K/T `INDEX.md` "Cross-plan" holds the same text)
Both plans live in this folder on two branches: `plan/lanes-s-u-2026-11-16` (`INDEX-SU.md`, sheets `S/`, `U/`) and
`plan/lanes-k-t-2026-11-16` (`INDEX.md`, sheets `K/`, `T/`). This section is the same text in both index files.
- **Same-path files.** Only `scripts/inv.py` existed on both branches (two different scripts). S/U's copy is now
  `scripts/inv-su.py`; its callers were repointed (`scripts/facts.py`, the header line of every `*.facts.md`, `T-SQLREPO.md` §3).
  The second command below prints nothing after that.
- **Hard orderings (coordinator decision 1).** K-05 starts only after lane S S1a's T1 is pushed
  (`test ! -e apps/website/src/features/taxonomy/repo.ts`). K-07b (design queue) waits for S4b. K-06a, K-06b and K-08 are retired.
- **Rule for every row.** The two runs never run at the same time. The later one regenerates its facts (S/U, T-SQLREPO §3)
  or sidecars (K/T, `INDEX.md` header command) on the earlier one's pushed commit, then re-runs both commands below.
- **Runnable side by side now.** K/T wave 1 (K-01, K-02b, T-PO-01) shares no file with S0 (no facts file: it adds
  `__tests__/lane-su-pins/*` and edits `platform/db/content-kernel.ts`, both in no K/T set) or with S1w.

| K/T run | never at the same time as | shared files (generated; Tovu paths under `apps/website/src/`) |
|---|---|---|
| K-01 | S2, S4, S8, U2 | `assistant/__tests__/tool-registrations.trash-item.test.ts` (S2, S4); `assistant/__tests__/merged-readers-batch.test.ts`, `assistant/__tests__/mcp-ui-tool-calls-route.delete-confirmation-family.integration.test.ts` (S8); `assistant/__tests__/tool-registrations.contracts.test.ts` (U2). Jini `cms/src/redirects/` is only READ by S1w (its precedent): no constraint |
| K-02 | S2, S3, S4, S8, U2 | 14 widgets / assistant test files (S2, S8); contracts test (U2); `development/scripts/size-debt.json` (S3, S4, U2); Jini `cms/src/widgets/` (S8) |
| K-02b | S2, S7, S8 | `server/inbound/public-http/http/site/__tests__/leading-style-regression.test.ts` (S2, S7); `features/widgets/__tests__/integration/mediawidget.integration.test.ts` (S8); Jini `cms/src/widgets/` (S8) |
| K-03 | S2, S3, S4, S8, U2 | trash-item test (S2, S4); mcp-ui test (S8); contracts test (U2); `size-debt.json` |
| K-04 | S3, S4, U2 | contracts test (U2); `size-debt.json` |
| K-05 | S1 (hard: after S1a T1), S3, S4, U2 | Jini `cms/src/taxonomy/` (`index.ts`: S1a adds `read-ports.ts` to `./taxonomy`); `size-debt.json`; importer rows of `assistant/tool-registrations.ts`, `server/runtime/composition/tool-catalog-manifest.ts` (U2) |
| K-07 | S4, U1, U2 | `features/trash/{agent-tools,tool-registrations}.ts` + `features/trash/__tests__/tool-registrations.test.ts` (S4 importer rows); `features/trash/__tests__/member-adapter.test.ts` (S4, U1, U2); Jini `cms/src/trash/` (`index.ts`: S4a, U1) |
| K-09 | S3, S4, S6, S8, U2 | mcp-ui test (S8); contracts test (U2); `size-debt.json`; Jini `integrations/package.json` + README and `integrations/src/webhooks/` (S6b) |
| K-10a, K-10b | S3, S4, S6, S8, U2 | `server/runtime/composition/__tests__/form-delivery.security.test.ts` (S6); `features/forms/__tests__/common-fields.test.ts` (S8); contracts test (U2); `size-debt.json` (K-10a); Jini `cms/src/forms/` (S6c; S2 only reads it) |
| T-PO-01 | S8, U2 | `features/pages/html-document-store{,.memory}.ts` (S8); `features/seo/index.ts`, `features/site-search/{access,cms-document-source}.ts` (U2); Jini `cms/src/widgets/` (S8) |
| T-PO-01g | S1, S2, S8, U2, U3 | `server/routes/types.ts` (S1, S2, S8, U2, U3); html-document-store (S8); `features/post/__tests__/post.schedule-events.test.ts` (S8) |
| T-PO-02 | the whole S/U cms chain (S1w ... S6c, INDEX-SU §3: each adds an export entry to `packages/cms/package.json`) | Jini `cms/package.json` + README; `cms/src/media/` (S7); `cms/src/widgets/` (S8). Runs before S1w or between two cms-chain runs |
| T-TH-01 | S8 | `features/theme/static-render.ts` (S8) |
**su-refresh additions (2026-11-17; not in the generated table, which reads facts importer lists and so misses barrel
importers).** Re-reading the bodies added these Tovu write-set files; checked against the K/T sidecars (`[KT]/*.tsv` on
`origin/plan/lanes-k-t-2026-11-16`): `server/routes/types.ts` (S4a: trash registry types) -> T-PO-01g, K-05b, K-11,
T-PO-03, T-PO-04; `server/runtime/composition/deps.ts` (S4b, U2b) -> K-05b, K-11, T-PO-03, T-PO-04, T-TH-07;
`server/runtime/composition/memory-deps/slices/trash-adapters-taxonomy.ts` (S4b) -> K-05b; `features/seo/index.ts` (U2b)
-> K-04b, T-PO-01, T-PO-03; `features/site-search/cms-document-source.ts` (U2b) -> T-PO-01, T-PO-04;
`server/inbound/admin-http/routes/posts/template-preview-render.ts` (U2b) -> T-PO-03, T-TH-06;
`server/runtime/composition/modules/site-assistant.ts` (U2b) -> T-PO-03. New row-level edges: **T-PO-01g never with S4**
(was not listed); **K-04b never with U2** (design queue). The other files the refresh added (`features/entries/unreadable-owner-entries-repair.ts`,
`server/inbound/admin-http/routes/trash/deps.ts`, the trash / outbox tests, the members routes, `features/member-login/link-service.ts`,
`features/publish-content/tovu-publish-ports.ts`) are in no K/T sidecar.
Design-queue items also collide (generated rows name them): T-PO-03/04 with S1, S2, S4, S5, S7, S8, U2; K-07b with S3, S4, S6
(and the hard edge above); K-11 with S6, S7, S8; K-05b with S1, S4; T-TH-06/07, T-NL-01 with U2, S8. Order them when they
are written. Run on S/U `7f4f663aa` + K/T `5b4b28a56`: 109 rows (99 Tovu, 9 Jini, 1 bookkeeping).
Limits: Tovu sets are importer lists, so they over-approximate (an importer row is a candidate edit; e.g. K/T's identity
rule leaves `assistant/tool-registrations.ts` unedited). Jini sets are folders named in sheet bodies plus `package.json`
for a NEW entry, so a row means "same domain folder"; the shared file is usually the folder's `index.ts`. Sheets with
no facts or sidecars (S0, templates) are not in the command.
```bash
# 1) collision table (any Tovu clone with both plan branches fetched; SU= / KT= override the refs)
SU=${SU:-origin/plan/lanes-s-u-2026-11-16}; KT=${KT:-origin/plan/lanes-k-t-2026-11-16}
P=ADS-memory/.local-artifacts/terra-refactor-2026-11-13/move-templates/lanes-2026-11-16
T=$(mktemp -d); for b in SU KT; do mkdir -p "$T/$b"; git archive "${!b}" "$P" | tar -x -C "$T/$b"; done
python3 -I - "$T/SU/$P" "$T/KT/$P" <<'PY'
import sys,re,glob,os,collections
su,kt=sys.argv[1],sys.argv[2]; W='apps/website/src/'; ws=collections.defaultdict(lambda:[set(),set()])
PK=r'(cms|core|db|user-management|integrations|node-adapters|capability-providers|platform|ui|mail)'
def jini(text,sid,side):
    for m in re.finditer(r'(?<![\w/-])(?:packages/)?'+PK+r'/src/([A-Za-z0-9_-]+)',text): ws[('jini',f'packages/{m[1]}/src/{m[2]}/')][side].add(sid)
    for m in re.finditer(r'packages/'+PK+r'/(package\.json|README\.md)',text): ws[('jini',f'packages/{m[1]}/package.json+README')][side].add(sid)
    for m in re.finditer(r'(?<![\w/-])development/scripts/[\w.-]+\.json',text): ws[('book',m[0])][side].add(sid)
# S/U: facts = Tovu write set; sheet body = Jini + bookkeeping
for f in glob.glob(su+'/[SU]/*.facts.md'):
    sid=os.path.basename(f).split('-')[0]; t=open(f).read()
    for m in re.finditer(r'^\| ((?:features|platform|server|contracts|assistant|shared|__tests__)/\S+) \|',t,re.M): ws[('tovu',W+m[1])][0].add(sid)
    for m in re.finditer(r'^- (?:prod|test) importers \(\d+\): (.+)$',t,re.M):
        for p in m[1].split(', '):
            if p!='-': ws[('tovu',W+p)][0].add(sid)
    for m in re.finditer(r'^- (development/scripts/[\w.-]+\.json):',t,re.M): ws[('book',m[1])][0].add(sid)
for f in glob.glob(su+'/[SU]/*.md'):
    if f.endswith('.facts.md'): continue
    sid=os.path.basename(f).split('-')[0]; t=open(f).read(); jini(t,sid,0)
    for m in re.finditer(r'(?:jini_target: |-> (?:@jini-ai/)?)'+PK+r'\b(.*)',t):
        for d in re.findall(r'\./([A-Za-z0-9_-]+)',m[2]): ws[('jini',f'packages/{m[1]}/src/{d}/')][0].add(sid)
        if re.search(r'NEW (\./|subpath|Node subpath)',m[2]): ws[('jini',f'packages/{m[1]}/package.json+README')][0].add(sid)
# K/T: sidecars = Tovu write set; jini_target column + sheet body = Jini + bookkeeping
ids=sorted({os.path.basename(f).split('.')[0] for f in glob.glob(kt+'/[KT]/*.files.tsv')},key=len,reverse=True)
for f in glob.glob(kt+'/[KT]/*.files.tsv')+glob.glob(kt+'/[KT]/*.importers.tsv'):
    sid=os.path.basename(f).split('.')[0]
    for i,l in enumerate(open(f)):
        c=l.rstrip('\n').split('\t')
        if i==0 or not c[0]: continue
        ws[('tovu',c[0])][1].add(sid)
        if f.endswith('.files.tsv') and len(c)>4:
            m=re.match(r'@jini-ai/'+PK+r'/([A-Za-z0-9_-]+)',c[4])
            if m: ws[('jini',f'packages/{m[1]}/src/{m[2]}/')][1].add(sid)
for f in glob.glob(kt+'/[KT]/*.md'):
    b=os.path.basename(f)
    if b=='K-TOOLS-PATTERN.md' or 'RETIRED' in open(f).readline(): continue  # template examples; retired stubs
    sid=next((i for i in ids if b.startswith(i)),b.split('.')[0]); jini(open(f).read(),sid,1)
for (k,p),(a,b) in sorted(ws.items()):
    if a and b: print(f'{k}\t{p}\t{",".join(sorted(a))}\t{",".join(sorted(b))}')
PY
rm -rf "$T"
# 2) same-path files on both branches (prints nothing)
comm -12 <(git ls-tree -r --name-only "$SU" -- "$P" | sort) <(git ls-tree -r --name-only "$KT" -- "$P" | sort)
```

## 4. Owner decisions (local ids; not the xpkg ids)
| # | Decision | Recommendation |
|---|---|---|
| OD-1 | SQL adapters of ports declared in `@jini-ai/core` (settings, confirmation tokens, verified origin, change sets, outbox) live in `@jini-ai/db/<name>` | YES |
| OD-2 | `kysely` as an optional peer of `@jini-ai/user-management` (S3a's J1) and `@jini-ai/integrations` (S6b's J1), added in those commits with the lockfile | YES (no coordinator step any more) |
| OD-3 | Members SQL repos move to `user-management/members/sql` (A07 listed them as staying) | YES, after A07 |
| OD-4 | API keys enter `@jini-ai/user-management`; the scheme prefix stays a Tovu value passed as data | YES; stored hash format frozen, no migration |
| OD-5 | Dialect helpers reach a Jini SQL adapter as an injected port | DECIDED by the owner rule (option C); the alternative is withdrawn |
| OD-6 | One outbox port shape (core contract) or two | (a) core-contract shape; unblocks S6a, S8c, move-events |
| OD-7 | Delete `members/consent-service.ts` (labelled DELETE; writes privacy records; exported by the members barrel) | keep until a reachability proof exists |
| OD-8 (new) | One Tovu helper `schemaErasedKernel` holding the single schema-erasing cast, instead of one cast per binding (three bindings do that today) | YES; with NO, every binding copies the precedent cast and the "no new casts" gate lists them |
| OD-9 (new) | New Node subpath `@jini-ai/user-management/members/server` for member credential code (A07's `./members` stays universal) | YES |

## 5. Lock keys carried by these lanes (S0-P1 pins each)
`identity:<ws>` · `taxonomy:<ws>` (2) · `workspace:roster` · `setting_revisions` · `origin_settings:<ws>` ·
`gated_mutation_tokens:<token>` · `outbox_events:claim` · `webhook_deliveries:claim` ·
`["form-delivery-plan",ws,submission]` · `["form-receiver-pull",ws,receiver]` · `asset_blobs:<ws>:<sha>` · the media slug key (5 sites) ·
`trash:<entityType>:<ws>:<id>` (table adapter) = `trash:member:<ws>:<id>` (member session repo x2, password persist) ·
`trash:user:<ws>:<principal>` (stays in Tovu) · `trash:sweep-claim` · `members:magic-tokens:<ws>`.

## 6. Schema and data
No sheet changes a table, column, stored format or default; the Drizzle chain stays frozen and ADR-066 TS migrations
stay in Tovu. Existing installs need no migration: S0's N-1 fixtures (P4 key hash, P5 digests, P8 outbox row) are the
proof. No sheet adds a delete; each existing one that moves is listed in its sheet with why it exists.

## 7. Round-1 remainder items
| # | Item | Status |
|---|---|---|
| 1 | S4c trash adapters of other domains | **Closed** as a per-file ownership table (`S/S4`): five stay as Tovu product adapters, two stay as wiring, two are constants; one move is open (R3-2 below) |
| 2 | S2c trash-aware memory entry repo | **Closed**: written (`S/S2`, run S2c), same invalidation contract as S2b |
| 3 | S8c memory bus | **Open**, blocked on OD-6 and a behaviour comparison (R3-1) |
| 4 | U2c write-service | **Closed**: dependency-graph design and three runs in `U/U2` |
| 5 | U3c grant-clamp dedupe | **Closed**: compared, reused in U3b; U3c deleted |
| 6 | Identity files outside the SQL / API-key scope (audit row A26, CLASSIFY row 55) | **Open**, not planned here (R3-4) |
| 7 | `features/members/index.ts` barrel | **Closed** as a scheduling rule (§3.4) |
| 8 | Exact wiring texts and table types | **Closed by rule**: every sheet gives the binding expression, table map and port bindings; column lists are copied from the generated type at execution and compared by S0-P6 under `typecheck:tests` (not pasted here) |
### Still open (numbered)
R3-1 S8c memory bus (OD-6 + comparison; ~90k). R3-2 `trash/adapters/directory.ts` -> `@jini-ai/node-adapters` (needs xpkg
N1 and a function partition of its 75-line factory; ~120k). R3-3 S4d: bespoke trash adapters -> registry entries, one per
commit, only where S4b's parity table is identical (up to ~300k, Tovu only). R3-4 identity files of A26 / row 55
(`repo.memory.ts`, `user-purge-types.ts`, `tool-registrations.ts`, `owner-reset-env.ts`, `builtin-role-grants`,
`delete-user-service`, `permission-grants`, `permission-list-tool`, `wiring`): unplanned. R3-5 `consent-service.ts` (OD-7).

## 8. What was verified, and what was not
Verified by reading the code on the base pair: every file, line and declaration this revision cites (the invalidation
call sites and the cache keying; the content-type mapper's owner lookup; the trash registry, table adapter and its
closure; the three owner-factor stores and the identity guard; the session repo's upsert; the user purge; the settings
repo's method list; the token store's port shape; the form-delivery `store` body; the media repo's class ranges, locks
and deletes; the members write-service call graph (generated), password auth and the access resolver in full; the two
grant clamps; `issueApiKey` in full; the bearer path in `dev-auth.ts`; Jini's export map, `kysely` declarations, the
SQL precedent and the token helper). Generated: line counts, blobs, importer lists, tables, lock sites (facts files).
NOT verified: method-by-method port compatibility (step 0 of every sheet); the bodies each sheet lists under "Not
verified"; function sizes inside the new files (the eslint gate decides, with fixed split points); A07's final port
names (A07 has not landed); the xpkg lanes named as prerequisites (none has landed on the base pair); nothing was
compiled, typechecked or run, and no mutation was tried. The sandbox clock was unreliable: no wall-clock figures.

## Revision 2 - judge response (16 accepted, 0 rebutted, 16 fixed in sheet bodies)
| # | Sev. | Change made (file) |
|---|---|---|
| 1 | Blocker | `S/S2` S2b: required `onWriteSettled({ repo })` called in `finally` of `save` and `transaction` (success and failure), bound to `invalidateMediaAccessEvidence({ owner: repo })`; tests use the real linked cache incl. a pending entry, failed writes and a second owner. S2c shares it |
| 2 | Blocker | `U/U2`: write-service designed by its call graph; run U2c-1 (Tovu-only split) and U2c-2 (credential + challenge core to Jini) come BEFORE U2b; `requestPasswordReset` joins the host-coupled group so password auth no longer imports it |
| 3 | Blocker | `U/U2`: new Node subpath `./members/server` with its manifest lines and importer list; A07's `./members` stays universal with a command that proves it |
| 4 | Blocker | `S/S4`: registry TYPES and the lock-key builder land in S4a's J1 with the files that import them; `buildTrashRegistry` stays whole in Tovu; the invented validator test is removed |
| 5 | Major | `U/U1`: exact intermediate tree after U1a (reduced `repo.ts`, `repo.rows.ts`, split bindings, `withoutId` owner, table map) and U1b's successor guard |
| 6 | Major | `S/S2`: `declaredOwners` required data port + exact refusal text + prototype-key cases; `EntryPublishReadPort` / `TrashableEntryRecord` destination; `offset` added to the Jini query type; pagination test |
| 7 | Major | `S/S6` S6c: required `outboxRow` mapper port (the pattern `SqlUserPurge` already uses), insert stays in the plan transaction; rollback and end-to-end stored-row tests; S6c no longer depends on S6a |
| 8 | Major | `S/S0` P5 split into three pins on the three real producers with a mutation each; `S/S3` chain rewritten: outer anti-replay guard, MFA clear deletes passkeys, passkey ownership predicates, caller-owned recovery store |
| 9 | Major | `U/U2` chains R1-R3, P1-P6 describe the real resolver and password paths; the comparer and sign-in-lock rows are withdrawn; existing race tests mapped |
| 10 | Major | `S/S5`: settings table pins unconditional upserts and ledger ordering (no expected-revision claim); lost-updates is an either-order prerequisite with a detecting command; the action binding is located in the core service |
| 11 | Major | `U/U3` bearer gate: positive control asserting principal and credential kind, session precedence, non-operator fall-through, one test per credential-kind branch |
| 12 | Major | Partitions with line ranges: taxonomy (`S/S1`), identity repos (`S/S3`), table adapter (`S/S4`), media (`S/S7`), `issueApiKey` + full declaration map (`U/U3`) |
| 13 | Major | `T-SQLREPO.md` rewritten: inherits the xpkg COMMON (not the move-templates one), per-commit gate table incl. `typecheck:tests` and the mutation loop, STOP table with commands, no coordinator edits |
| 14 | Major | `T-SQLREPO.md` §3: successor guards via regenerated facts; shared-file table (the transaction test is edited by S6a only; `user-purge.sqlite.ts` stays so S3b does not touch it); `S/S0` commits regenerated facts |
| 15 | Major | `U/U3`: clamps compared; U3b imports the package's own `assertGrantClamp` by leaf path; U3c deleted |
| 16 | Minor | counts fixed (round 2a); `S/S1` and `S/S2` no longer call the navigation / content-type bindings unused |

## Revision 3 - Opus review + coordinator decisions (COMPLETE, 2026-11-16; first agent stopped at its context cap, R4-1..R4-5 finished by a second)
Renamed: `INDEX.md` -> `INDEX-SU.md`, `CODEX-JUDGE.md` -> `CODEX-JUDGE-SU.md` (decision 2; lanes K/T keep `INDEX.md`).
Coordinator decisions recorded here and to be mirrored in K/T `INDEX.md`:
1. Ownership: lane S owns the SQL repositories. Taxonomy SQL (`features/taxonomy/{repo,repo.rows,repo.sqlite,contracts}.ts`)
   = S1a (K-06a/K-06b RETIRED); trash SQL (`trash/{repo,table-adapter,entry-sql,entry-sql.types,not-trashed}.ts`,
   `trash/adapters/marker-sql.ts`) = S4a/S4b (K-08 RETIRED). Lane K owns only the agent-tool layers; K-05 waits for S1a T1,
   K-07b for S4b. Lane K wave 1 loses K-06a.
2. Index files renamed (above).
3. Facts re-pinned: every facts file and `inventory.tsv` regenerated on Tovu `integ/merge-final-2026-11-16` @ `232764af5`
   (`scripts/facts.py` takes `LANE_REF` / `LANE_SHA`). Drift vs merge-a: `change-set-repo.ts` (comment), `capability-card.ts`
   (import), 7 test files (blobs only). T-SQLREPO §1 base updated (Jini `65d73b0d5`).
4. Prerequisites found: both sheets exist on `plan/w1-sheets-d` of the Tovu GitHub origin (not in the terra clone).
   `move-workspace` used the old T-MOVE template, so it is folded into NEW `S/S1w-workspace-sql.md` (the calibration run;
   facts generated). `move-entry-refs`: exact location + fetch command in S8; S8a needs only its DD slice (real command).
5. U2c-3: the observer error goes to a required `report` port bound to `ObservabilityPort.reportError`; result unchanged.
Review items done: T-SQLREPO §5/§6 rewritten as fenced blocks (delete gate, kysely gate, multi-line import gate tested on a
scratch tree; T0 loop uses `git show HEAD:<p> > <p>`; LIMITS 50/10/10 block); U3 STOP `-g '*.ts'` + quoted literal; U3
credential-kind command fixed (round 2 matched nothing: server code uses single quotes; 5 branches); S3 `transactions.ts`
signature as TypeScript + C9c/R3b proving commands + row 3 references the open-bugs entry; S4 lock-key builder test moved
out of T0 (P5); S1 existing deletes listed (S1a, S1b were missing them) and `contracts.ts` importer list (round-2 rg also
matched other folders' `contracts.js`).
Rebuttal: P4 "sheets cannot be found" - they exist (origin `plan/w1-sheets-d`, commit `0337a8982`); the fix was template, not location.
### R4 items (all done)
| # | Item | Change | Where |
|---|---|---|---|
| R4-1 | Cross-plan collision table + command, in both index files | §3a here = K/T `INDEX.md` "Cross-plan" (same text): hard orderings, per-K/T-run table, design-queue summary, limits, one fenced command (109 rows on S/U `7f4f663aa` + K/T `5b4b28a56`). `scripts/inv.py` -> `scripts/inv-su.py` (callers: `facts.py`, every facts header, T-SQLREPO §3); the same-path command prints nothing | §3a; `scripts/` |
| R4-2 | K/T branch edits | K-06a/K-06b retired (stubs; `K-06.*` deleted), K-08 retired (queue; `K-08.*` deleted), `gen.py` + `K/INVENTORY.tsv` relabel 8 files `LANE-S`; K-05 prerequisite = S1a T1 (fenced `test ! -e` command); K-07b (2) = S4b; K-07 serial with S4a/S4b; wave 1 = K-01, K-02b, T-PO-01, chain K without K-06b; both K/T disjointness commands re-run, print nothing; decisions 1-5 recorded | K/T `5b4b28a56`, `6bc499132` |
| R4-3 | S1w in §2/§3 | §2 row (90k) replaces `move-workspace`; total 31 runs / ~4.94M; §3 step 2 and the cms chain start at S1w | §2, §3 |
| R4-4 | S6a merge-a/merge-b note | replaced: merge-final contains both, the facts blob is authoritative | `S/S6` |
| R4-5 | S2 re-read on merge-final | 3 corrections (`*RepoFor` not moved; `EntryPublishReadPort` importers incl. `tovu-publish-ports.ts:24`, re-export at `repo.sqlite.ts:5`; S2c has 5 prod importers, Jini sources for its `public-list.js` / error imports, cycle STOP); every other S2 line claim checked and correct (listed in the sheet) | `S/S2` "Revision 3" |
Not re-read in this pass: S5 and S6 bodies beyond the line checks of the first revision-3 agent; S3, S4, S7, S8, U1-U3 bodies
beyond the facts regeneration.
