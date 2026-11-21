# COMMIT-PLAN

Executor branch: `codex/tv-dg-durable`. Base for every entry:
`2095ffdd47c1764d682ad0b28899fc6f62e89521` (`codex/tv-engaps2`).
The coordinator stages and commits. No Git writes, test runs, builds, installs,
type checks, linters, package edits, or migration edits were performed.
Implementation order: 8A, 8B, 3E, 10A. Tests were written before their registry,
comparison implementation, fixture, or production comment. Runtime RED/GREEN is
unmeasured; the contract-only cases can pass on an already-correct combined base.

## 8A — done; required package baseline verification owed

- Files: `development/scripts/__tests__/persisted-names.test.ts`,
  `development/scripts/persisted-names.json`, `development/scripts/README.md`.
- Test: the single live-declaration comparison covers all eight specified keys,
  using normal package resolution. Before the registry is added, its JSON read
  fails; after bootstrap, the test pins the existing contract.
- Registry values are exactly the sheet's initial values, with empty `changes`.
  They are not certified against installed payloads: the package is absent here.
  See `REFRESH.md` before accepting this baseline. No cutover approvals were added.
- Combine mutation: change only the installed Sheets header constant; the
  live-declaration assertion must report `sheets.submission.id` as mismatched.
- API-baseline delta (Jini): none. Look owed: none.
- Diff reread deletions: none; no unrelated implementation was introduced.

## 8B — done; target gate execution owed

- File: `development/scripts/__tests__/persisted-names.test.ts`.
- Tests: unchanged registry; rename without evidence; newly registered migration
  with historical/unregistered controls; removal with approved cutover and wrong
  old-value control; target comparison using `SEMGREP_BASE`. Before the private
  comparator is added, the inline cases cannot resolve it. Historical IDs must
  fail even if their transition is newly appended. Git failures propagate.
- Only private `PersistedNameRegistry` and
  `findUnrecordedPersistedNameChanges` were introduced. Baseline history must stay
  an intact prefix. Direct added migration stems are intersected with registered
  content migration IDs. Newly registered name keys require no transition.
- Combine mutations: on a post-bootstrap candidate rename a source and its
  registry value together without evidence (live test passes, target test fails);
  then permit historical migration IDs (historical control must fail).
- Cloud explicitly supplies the reviewed SHA through `SEMGREP_BASE`. Only the
  target case skips when that variable is absent. No CI wiring was changed.
- API-baseline delta (Jini): none. Look owed: none.
- Diff reread deletions: none.

## 3E — done; native-channel execution owed

- File: `apps/desktop/src/desktop-agent-service.test.ts`.
- Test: one real-requester case uses the unchanged `harness`, `ServerChild` and
  `serverBoot`. It pins occupied-binding refusal, replacement URL/numeric PID/site
  capability, and malformed registration refusal with no daemon operation.
  This is a contract test; no pre-change failure on correct production is claimed.
- The EventEmitter peer is connected, forwards requests to the contender and
  receives replies through the test mock facility. Cleanup disposes the requester
  and shuts down the harness. No casts or error-boundary edits were needed.
- Combine mutations, independently: drop success payload (endpoint assertions);
  drop explicit refusal field in Jini (public-reason assertion); bypass the Desktop
  parser (missing-siteId generic-refusal assertion).
- API-baseline delta (Jini): none. Look owed: Electron owned-site registration,
  refusal while occupied, and successful replacement; no browser look.
- Diff reread deletions: none.

## 10A — done; durable replay execution owed

- Files: `apps/website/src/platform/db/sqlite/__tests__/webhook-delivery-repo.sqlite.test.ts`,
  `apps/website/src/features/webhooks/delivery.ts`.
- Test: one accepted-POST/lost-settlement/restart case, using private
  `prepareWebhookReplay`, real SQL delivery/envelope storage, real host worker,
  two in-memory subscriptions at the same destination, fixed-secret signing,
  and the typed receiver fake. Only the first repo's settlement is mocked.
  This pins the existing contract; no pre-change runtime failure is claimed.
- Witnesses: exact settlement sentinel and attempt-one lease; stale settlement
  snapshot stays delivering at attempt two; real settlement delivers; two POSTs
  retain the persisted ID and one receiver effect; the second subscription retains
  the event ID but receives a different delivery ID and produces a second effect.
- Production change: only the exact requested at-least-once/deduplication sentence.
- Combine mutations, independently: attempt-derived wire ID (POST ID assertion);
  remove SQL attempt fence (stale-settlement snapshot); suppress expired reclaim
  (attempt-two snapshot). Do not change settlement ownership.
- API-baseline delta (Jini): none. Look owed: none.
- Diff reread deletions: removed the fixture's unnecessary subscription-specific
  URL suffix, so both subscriptions exercise the same receiver destination.

## Review evidence

Targeted source-to-HEAD diffs were reread. Existing `_optional = {}` and
`_options = {}` pads and API signatures are intact. No production importer
repoints, re-export shells, dependencies, casts, suppressions, or new production
helpers were introduced. Only the one requested production comment was added.
No same-repoint test importers required updates.

Manual function review: comparator 23 lines; native IPC case 36 lines; replay
fixture 18 lines; replay case 46 lines. Each new function/callback has at most
10 decision paths by inspection; no complexity tool was run. The comparator uses
O(history bytes + baseline keys × appended records) time; transport and replay
fixtures use fixed, bounded inputs. Named mutations above are the adversarial
witnesses; they have not been executed.

Function quality: comparator, native IPC case, replay fixture and replay case
have no recorded source findings after checking naming, scope, effects, cleanup
and assertion reachability. Public API changes: none. Architecture audit: WARNING
only for unverified combined-package contracts; inspected Tovu boundaries are
unchanged. Documentation: one required production sentence and the named rule.
Fresh evidence is targeted file inspection, not runtime validation or coverage.
No touched file exceeds 500 lines (largest: SQL test, 491). Open items are all
listed in `REFRESH.md`; no tests were deleted or weakened.
