PARTIAL run V6 | branches 4/5 | tests run 3912 pass 3910 fixed 8 dropped 1 | weak fixed 0 | bugs 3 (2 fixed in prod, 1 open) | left: codex/w62-cov-misc-4 (in progress)

# Verify 2026-11-27 — run V6 (Jini)

Unattended cloud run, Opus high, AI-Dev-Shop TDD role (tdd/skills.md, test-design, testing-mistakes 1-192 + Author Checklist, coding-foundations, testable-design-patterns, coverage-integrity-policy). Base `integ/merge-28-2026-11-26` (d1ced6c5).

## Setup
Node 24 (`/opt/node24/bin`), Jini `pnpm install --frozen-lockfile` (13 s) + `pnpm -r build` (2m35s, green). Delegated branches ran in git worktrees `/home/user/jw/<job>` (`pnpm install --frozen-lockfile --offline` + `dist/` copied from the green build of the same base; the branches change test files only). gitleaks v8.24.3 built from source (`go install`) into the scratch dir; `gitleaks protect --staged` clean before every commit. No commit plans exist for these jobs (`plans/w62-cov-*-COMMIT-PLAN.md` absent) — mutations below are my own.
Typecheck method: package tsconfigs exclude `__tests__`, so a temporary `packages/<pkg>/tsconfig.verify.json` (extends the package tsconfig, or `tsconfig.tests.json` where present; include = the branch's changed test files; noEmit) — deleted before commit. Coverage: `vitest run <dirs> --coverage.enabled --coverage.include=<FILES>` per package (package-scoped; thresholds zeroed on the CLI for the measurement only, configs untouched).

## codex/w62-cov-misc-5 — DONE, final sha `59ac58b5`
- 23 test files + 1 helper (search, server, sidecar, ui-kit, vibecoding). Typecheck: 0 errors. Run: 469 tests (search 16, server 141 + 1 pre-existing LAN `skipIf`, sidecar 132, ui-kit 48, vibecoding 132).
- **Red → fixed (1):** `sidecar/src/supervision/__tests__/supervisor.test.ts` "readiness retries a failed discovery read and reuses the ready child" — timed out (5 s). Cause: the rejected readiness read settles through the async wrapper in 3 microtask turns but `readyHarness.tick()` drains only 2 before moving the fake clock, so the 250 ms retry was scheduled at t=249 (due 499) and never fired. Fix: let the failed read settle (`setImmediate`) before the first tick. Assertions unchanged (no read at 249 ms, exactly one retry at 250 ms, ready child reused without a third read).
- **Weak tests:** none found. Reviewed every added test against the checklist: exact port args (`toEqual` on mock calls), real sqlite kernel for CMS scan/access, real Express/node servers for mount-routes, fake timers restored by file-level `afterEach`. Two acceptable module-level seams noted: `store-native-errors.test.ts` mocks `node:fs/promises.lstat` (a dependency, for an EIO fault; the store has no injected lstat port), `parse5-region-parser` test reuses the file's existing `parse5` mock.
- **Mutation spot-checks (all red, reverted):** `route-host.ts` `nodeSessionTimer.cancel` → no-op (route-host test red); `close-store-on-shutdown.ts` beforeExit `daemonStopped ??=` → `=` (boot-work "reuses a signal-initiated shutdown" red); `media-search-source.ts` drop `aggregateId !== ""` (documentIdOf test red); `supervisor.ts` discovery `catch` → `return` (retry test red).
- **Coverage (L/B/F before → after):**
  | file | before | after |
  |---|---|---|
  | search/site/access.ts | 16.33/100/25 | 100/100/100 |
  | search/site/cms-document-source.ts | 85.26/97.78/93.33 | 100/98.11/100 |
  | search/site/media-search-source.ts | 61.63/75/54.55 | 100/100/100 |
  | server/create-local-node-daemon.ts | 100/98.99/100 | 100/100/100 |
  | server/kernel-base.ts | 100/100/92.31 | 100/100/92.3 |
  | server/mount-routes.ts | 100/86.67/100 | 100/100/100 |
  | server/route-host.ts | 84/100/83.33 | 100/100/100 |
  | server/shutdown/close-store-on-shutdown.ts | 98/85.29/100 | 100/85.71/100 |
  | sidecar/json-ipc.ts | 100/98.68/100 | 100/98.68/100 |
  | sidecar/supervision/child-readiness.ts | 100/93.75/100 | 100/93.75/100 |
  | sidecar/supervision/child-registry.ts | 100/98.15/100 | 100/100/100 |
  | sidecar/supervision/child-stop.ts | 100/91.67/100 | 100/100/100 |
  | sidecar/supervision/supervisor-node.ts | 100/95.83/100 | 100/97.26/100 |
  | sidecar/supervision/supervisor.ts | 100/96.11/100 | 100/97.82/100 |
  | ui-kit/react/SecretInput.tsx | 100/50/100 | 100/100/100 |
  | ui-kit/react/agent-attrs.hooks.ts | 100/96.36/100 | 100/98.14/100 |
  | ui-kit/react/native/Controls.hooks.ts | 100/98.39/100 | 100/100/100 |
  | ui-kit/react/native/Navigation.hooks.ts | 100/97.8/100 | 100/100/100 |
  | ui-kit/react/secret-reveal.hooks.ts | 100/77.78/100 | 100/100/100 |
  | vibecoding/html/node/parse5-region-parser.ts | 100/98.9/100 | 100/98.88/100 |
  | vibecoding/node/paths.ts | 100/97.56/100 | 100/97.61/100 |
  | vibecoding/node/project.ts | 98.41/95.22/91.67 | 100/96.27/91.66 |
  | vibecoding/node/store.ts | 96.88/94.41/98.41 | 100/97.19/100 |
  (after = this branch's package dirs only, so small decimal drift vs. the brief's whole-suite numbers.)
- **Refactor candidate (not a bug):** `server/src/kernel-base.ts:205` `let disposeTracing = (): void => {}` is a placeholder never called (always reassigned by `tracedIfConfigured`, or the acquisition rethrows) — the one function keeping kernel-base at 92.3% fn. `let disposeTracing!: () => void` would remove it; production untouched here (no bug).
- BUGs: none.

## codex/w62-cov-misc-2 — DONE, final sha `86675058`
- 69 test files (chat 39, cookie-consent 18, core 11, cli 1). After the fixes: 1127 tests pass (chat 819, cookie-consent 141, core 158, cli 9). 3 red fixed, 1 typecheck fix, 0 dropped.
- **Red → fixed:**
  - `core/src/__tests__/approval.test.ts` "consumes a failed proposal…": expected the error to contain `'target changed'`, but `approval.ts:353` deliberately reports only the error class (`describeErrorForLog`). It is now an exact `toEqual({ pending: null, error: 'The approved action stopped with an error (Error).' })`, which is stricter than before.
  - `core/.../ai-trace/__tests__/recorder-boundaries.unit.test.ts` "reports a pricing failure…": the expected usage had `totalTokens: null`, which is not a field of `AiTokenUsage` (types.ts:35). Removed the key; the exact-args check stays.
  - `chat/src/react/hooks/__tests__/useSurfaceRecovery.test.ts` "closing the card aborts its second answer after the first settles…": **real BUG, fixed (1 line)** — see BUGs.
- **Typecheck:** `cookie-consent/src/site/__tests__/document-assets.test.ts` had implicit-`unknown` `Array.from` callback params; now typed `Element`.
- **Pre-existing typecheck errors (base too, not fixed):** cookie-consent has no `@types/jsdom` devDependency, so every test importing `jsdom` fails with TS7016 (base `client.test.ts`, `bundle.smoke.test.ts`; the new ensure-privacy-defaults/http/privacy-page-template/document-assets inherit it). `src/__tests__/scripts.unit.test.ts:8-11` TS2322 on base code.
- **Weak tests:** none found (the subagent grepped the added lines for weak-only matchers, snapshots, `vi.mock`, `as any` and skips, and read the chat, core and cli diffs).
- **Mutations (red, reverted):** approval.ts error text; privacy-page-template email no longer escaped; ToolCard.rules bad-JSON catch returns raw content; capabilities.ts `.sort()` removed on unknown argument names; useSurfaceRecovery original code (I re-confirmed: 1 failed/3 passed on the pre-fix source, 4/4 after).
- **Coverage (before → after, scoped to the changed tests only, so files that sibling suites also cover read low: approval.ts, Markdown, useComposer, durable-run-store, store.ts, runtime.ts):** chat-cleanup-routes 56/42.9/33.3 → 100/100/100; accept.ts 95 → 100/100/100; run-guarded-chat-store 96.2 → 100/100/100; checkpoint-delta br 80 → 100; create-frontend-request-caller br 75 → 100; surface-recovery-stream br 78.3 → 92.9; ConversationChatPane / useConversationChatPane br 50 / 66.7 → 100; own-link, mcp-ui-surface-state, RoutedA2ui, FolderChips, useStoredConversations br → 100; useSurfaceRecovery 91.5/82.5/85.7 → 100/91.1/100; cli stdin-line br 94.4 → 100; core env-schema, capabilities, blob, events, forms, mail, observability, runtime/environment, model-catalog, agents/index, proxy-provider-kit → 100/100/100; recorder 91.8/89.3/91.2 → 99.1/85.3/100; cookie-consent document-assets 22/57/17 → 100/100/100, ensure-privacy-defaults 0 → 100/100/83.3, http 61/55/50 → 95.5/76/91.7, service 44.5/71/47 → 100/88.9/100, revisions.repo 77.5 → 100/93.5/100, tool-registrations 89/56/31 → 100/85/64.3, privacy-page-template/region-plugins/request/settings/scripts → 100/100/100.
- **Exceptions (barrels or entry points; no fake tests written):** chat `bridged-chat/index.ts`, `conversation-chat-pane/index.ts`, `conversations/index.ts`; cookie-consent `client.min.ts`, `extensions.min.ts`, `client/entry.ts`; core `contracts/runtime.ts`.
- **Not verified:** cli `run-command.ts:192-193` (no test targets these lines); chat `Markdown.tsx` 350-351/608-609 and `useComposer.ts` 222-223 (they need the sibling suites, which were not run).

## codex/w62-cov-misc-3 — DONE, final sha `7859b2ff`
- 70 test files (core 43, daemon 27): 1552 tests, all passing after the fixes. Typecheck had 1 error, now fixed. 3 red fixed, 0 dropped, production code untouched.
- **Red → fixed (all wrong tests):**
  - `daemon/src/http/__tests__/runs.test.ts` "returns the created run if its host lookup has no newer view": asserted `run.contextRef`, which `RunStatus` (protocol/src/run.ts:18) does not have (this was also the TS2339 error). It now asserts `lifecycle.list({}, { contextRef: 'brief-1' })` equals `[run]`.
  - `daemon/src/routines/__tests__/scheduler.durable.test.ts` "stop completes a waiting drain…": expected run id `'1'`, but the fixture issues `'routine-run-1'`. Corrected the literal.
  - `daemon/src/agent-executor/__tests__/child-events-characterization.test.ts` "reports a failed tool-event subscription…": the test rejected the first `lifecycle.stream` call, but that call is the run-output observer (child-lifecycle.ts:148), not the tool subscription (:179). It now passes the first call through to the real stream and rejects the second, asserting both calls' args and the exact `onCleanupFailure` context.
- **Weak tests:** none. Two daemon tests build a partial `AttachmentStore` with `as unknown as` (not `as any`); left as is.
- **Mutations (red, reverted):** route-policy `targetPrincipalId === callerPrincipalId` → `!==`; native-approval-memory drops `workspaceId` from `connectionId` (lets grants cross workspaces); runs.ts:228 `?? started.run` removed; child-lifecycle.ts:186 `reportPostCloseFailure` call removed.
- **Coverage (before → after, changed tests plus sibling importers):** reached 100/100/100: contracts/runtime/process (br 90), api-error (fn 66.67), conformance (br 93.33), server/testing (br 93.55), loopback-host (85.71/80/100), site/cms-media, media-provider-contribution, media-upload-limits, post-author, request-facts (all from 0 lines), site-serving-gate (br 92.31), vault/invariants, env/format-env-issue, env/parse-env, errors/testing, native-approval-memory and operator-locale (from 0), net/public-dns-vocabulary, object-store, optimistic-concurrency, optional-peer, primitives/logger, settings/route-policy (from 7.41 lines), settings/settings, text/descriptor-i18n (from 17.14 lines), text/mime (br 46.15), tool-input-envelope. Improved: route-table 93.98/93.51/92.31 → 97.59/93.82/100; sse 97.22/88.68 → 100/94.33; coercers br 96.55 → 98.38, fn 82.61 → 95.65; format-error-for-log br 88.89 → 96.29; user-facing-error br 83.61 → 94.11; endpoint-policy br 97.46 → 99.16. daemon: http/routines 82.4/90.11/78.26 → 98.82/93.93/100; durable-scheduler 89.93/79.46/88.89 → 100/87.4/97.22; attachment-owner-read 94.33/60 → 100/77.96; surface-callback-request 92.39/–/76.92 → 100/97.82/100; argv-prompt-variants 91.8/88.89 → 98.36/97.43; bound-confirmations 98.2/90.16/88.89 → 99.09/92.06/94.44. Unchanged (the branch adds no test for these lines): db-ops 241-243, delegated-tools 355-357, terminals 101-103, child-stream-events 52-54, sse-commit fn 75, approval-i18n br 91.3, redaction-spans br 86.
- BUGs: none.

## codex/w62-cov-platform-1 — DONE, final sha `6e266794`
- 47 test files (platform: mail, mail/sql, net, object-store, retention, secrets, web). Typecheck 0 errors. First run: 784 tests, 779 passed, 2 failed, 3 skipped (the skips are on the base; the branch adds no skip). 1 fixed through a production bug fix, 1 dropped (open BUG).
- **Red → fixed:** `secrets/root-key/__tests__/files.test.ts` "removes candidate bytes if preparing the temporary key permissions fails" — **real BUG, fixed** (see BUGs). I re-confirmed: red on the pre-fix source (1 failed/8 passed), green after; the root-key sibling suite passes 135/135.
- **Dropped (1):** `mail/__tests__/email-template-operations.test.ts` "a hidden first row does not make a live template on the next page unreachable" — proves an open contract-level BUG (see BUGs). The test code is preserved below.
- **Weak tests:** none (no weak-only matchers, snapshots, `vi.mock` or `as any`; port calls checked with exact args; real temp dirs; real `node:sqlite` running the queries Kysely compiles).
- **Mutations (red, reverted):** fs/backup-once `!== 'EEXIST'` → `===`; fs/staged-file:43 final length-mismatch throw removed; mail/sql/suppression-admin.repo:60 `AND revision = …` removed; mail/sql/feedback-inbox.repo:27 `inserted`/`duplicate` swapped.
- **Coverage (before → after):** fs/backup-once 14.29/100/0 → 100/100/100; fs/staged-file 4.76/100/0 → 100/94.59/100; fs/reviewed-file 97.96/79.41/83.33 → 100/93.33/100; fs/owned-temp-root 96.69/86.57/100 → 100/96.15/100; mail/email-template-operations 68.42/90.62/65 → 100/100/100; email-template-tool-registrations 64.15/100/37.5 → 100/100/100; provider-mailer 12/100/0 → 100/100/100; provider-setup 97.7/73.85/100 → 100/98.7/100; purpose-gate-probe 33.33/100/0 → 100/100/66.66; test-send 93.57/84.88/100 → 100/97.91/100; use-readiness 93.68/76.92/100 → 100/89.83/100; mail/sql activity, attempts, capture, index, ledger, suppression-admin repos 0 lines → 100 (branches 97.91 / 78.94 / 97.14 / 100 / 90.9 / 95.65); feedback-inbox.repo 42.11/50/33.33 → 100/100/100; suppression.repo 60.87/50/25 → 100/100/100; net/local-http-request 100/63.64/100 → 100/93.33/100; object-store/local-fs 77.68/100/92.31 → 100/100/100; artifact-provider 95.45/70/100 → 100/100/100; retention/routes 95.45/75/80 → 100/100/100; vault-archive br 82.61 → 95.83; root-key/ensure 93.06/82.26/79.49 → 100/92.95/85; root-key/files 66.67/58.33/85.71 → 98.88/92.1/100 (the remaining line is the ignored `unlinkSync` failure in the cleanup step); root-key/material 81.25/82.76/80 → 100/93.18/100; ordered-keyring 76.25/94.29/86.96 → 100/100/95.83; site-keyring-errors br 61.54 → 100; sources 95.45/83.78/84.21 → 100/90.47/100; web/tool-registrations 93.94/87.5/100 → 100/93.75/100. Unchanged (no test added): root-key/reconcile 98-100, web/strip-html-presentation. `retention/index.ts` is a barrel (exception).

## BUGs
1. **FIXED** `Jini packages/chat/src/react/hooks/useSurfaceRecovery.ts:72` — when two answers overlap, the first answer's `finally` cleared `answerController.current`, which by then held the second answer's controller, so closing the card could not abort the second answer. Fix: `finally { if (answerController.current === controller) answerController.current = undefined; }` (branch misc-2, test-first).
2. **FIXED** `Jini packages/platform/src/secrets/root-key/files.ts:67-90` `atomicCreateSiteKeyFile` — if `writeSync`, `fsyncSync` or `chmodSync` threw, the `.key.hex.tmp-*` file holding candidate key material stayed on disk. Every step after `openSync` now runs inside the `try` whose `finally` unlinks the temp file; an `EEXIST` from `linkSync` is still swallowed and the canonical file is read back (branch platform-1, test-first).
3. **OPEN** `Jini packages/platform/src/mail/email-template-operations.ts:234-236` (store type at `email-template-tool-registrations.ts:22`) — `listPage` returns `null` for an entry that is not a live template, and that `null` still counts toward `limit`. If every row on a page is `null`, no `nextCursor` comes back even when more rows exist, so every live template after that point can never be listed. Proposed fix (a contract change, too big for this pass): `listPage` returns hidden entries as `{ hidden: true, id, updatedAt }` rather than `null`, and the cursor is built from the last row on the page, hidden or not. Dropped test (append to `packages/platform/src/mail/__tests__/email-template-operations.test.ts` once fixed):
```ts
test("a hidden first row does not make a live template on the next page unreachable", async () => {
  const { store } = memoryStore();
  const hiddenPosition = { id: "trashed", updatedAt: "2026-01-02T00:00:00.000Z" };
  const visible = { id: "live", name: "Welcome", html: HTML, version: 2, updatedAt: "2026-01-01T00:00:00.000Z" };
  const withHiddenRow: EmailTemplateStore = {
    ...store,
    listPage: async ({ limit, before }) => {
      if (before === undefined) return [null, visible].slice(0, limit);
      expect(before).toEqual(hiddenPosition);
      return [visible].slice(0, limit);
    },
  };
  const first = await listEmailTemplates({ store: withHiddenRow, input: { limit: 1 } });
  if (first.templates.length !== 0) {
    expect(first.templates.map(template => template.id)).toEqual(["live"]);
    return;
  }
  if (!first.nextCursor) throw new Error("A filtered page must not hide a later live template");
  const next = await listEmailTemplates({ store: withHiddenRow, input: { limit: 1, cursor: first.nextCursor } });
  expect(next.templates.map(template => template.id)).toEqual(["live"]);
});
```

## Owner decisions
1. BUG 3 (email-template paging): approve the `listPage` contract change (hidden rows carry a position) so the dropped test can come back.
2. cookie-consent tests import `jsdom` without `@types/jsdom` (TS7016 on base and branch): add the devDependency?
3. Refactor candidate: kernel-base.ts:205 placeholder `disposeTracing` (see misc-5).
