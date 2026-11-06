# merge-rest — in progress

Branch: cloud/combine. Starting SHA: abead52498c80fd86b8f7b37a2caed31d98a7307.

Scope: merge security-release, om-chat-2, tag-b, passkeys, commerce in order; restore the lost Tovu model inventory metadata wiring. Push only cloud/combine. No version bumps, publish, deploy, or full suites.

Loaded COMMON.md, merge-rest.md, AI Dev Shop AGENTS.md and software-architect/programmer/tdd skills.md from origin/cloud-plans-1105.

Setup in progress: rebuild Jini on cloud/combine and relink Tovu. Existing package-store cache is read-only; copying the non-secret dependency cache to workspace and installing there. Checks and merge outcomes pending.

FINDING: pre-existing untracked Jini packages/plugin-ui-ux-design leftovers are untouched.

## Merge checkpoint — in progress

All requested source tips included in order. Jini security-release was already an ancestor; all other source branches have real merge commits. No branch omitted.

Conflicts: bundled-catalog.ts, migrations/checksums.ts, site/render.ts, composition/provider-plugins.unit.test.ts, app.ts, deps.ts, provider-contracts.ts, provider-plugins.ts. Preserved additive imports, all selected plugins, all historical migration hashes, both tests, form-provider retirement plus payment leases and both contract registrations. No assertions or why comments removed. Commerce activation/off and owned /products checks pending.

Starting Jini recursive build PASS after frozen install into workspace-local store. Tovu contracts and SDK builds, link:jini and both original inventory test commands PASS. Metadata restoration and post-merge verification pending.

First-parent commits so far:

```text
72b82ed977a499d47ac779bbce43d3c00c6d5273 Merge commerce updates into cloud/combine
e88c27e3cbed3e65fad220297b726ce4b6fcab0c Merge identity updates into cloud/combine
11fc5958e82878a29bc52254be90dfb78a66c9c5 Merge shared control updates into cloud/combine
ac91dd41883f4534b6859789ad8cf61d73d5bea1 Merge chat updates into cloud/combine
0ab7b24664f163b93ab30daa875b82b4cb0ea82d Merge release updates into cloud/combine
a5be70ca8b74b56f5e4555a13b6eac720dfda357 docs: record integration scope and starting points
```

## Verification checkpoint — in progress

Delivered cloud/combine head: ddf8d65050ca24fb732cc73e6b43547ce2a9dd69. All five fetched source tips in each repository are confirmed ancestors by GitHub compare (behind_by=0; merge base equals each source tip). CLI authentication expired after the first report pushes; connector delivery uses separate ordered real merge commits, identical verified tree hashes, current-head leases and force=false. No other ref is changed. Local commit IDs differ from connector-created commit IDs; the tested content trees match exactly.

PASS: starting and merged Jini recursive builds; rebuilt contracts/SDK and Jini links; source plugin guard; 14 inventory tests (new missing-metadata cases failed before wiring); all69 selected Tovu conflict/integration assertions now pass. The generic form-validator fixture was missing a valid plan port on the pre-merge first parent too; the fixture now covers both forms and payments without changing either assertion. Fresh-site commerce-off, inactive bundled plugins and CMS-owned /products all pass.

PASS: site-chat typecheck. Pending: remaining Tovu typechecks, Jini all-package typecheck and packed plugin guard. Catalog tests: 60 pass, one unchanged 5-second packing timeout during concurrent checks. Direct packing succeeds with the expected five files, taking31.672 seconds under load; a single isolated retry is pending lower load. No timeout, rule or assertion changed.

FINDING: composition lint remains above the ceiling: createRouteDeps11 and createApp11 (both11 on base); composeSiteRouteDeps21/21 (base18/18; commerce source17/13). Kept both branches' behavior under merge-only/no-refactor scope. Other resolved-code and inventory lint passes.

FINDING: checkpoint secret scans flag only the public RFC6238 synthetic TOTP vector: Jini1 detection and Tovu3 historical detections. No allowlist/rule changes. Final range scan pending final report.

No full suites, publication, tags, deployment or main push. The test-created Tovu form-protection marker was removed; pre-existing Jini plugin payload leftovers remain untouched.
