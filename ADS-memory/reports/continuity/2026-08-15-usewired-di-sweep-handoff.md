# Handoff — apps/admin useWiredX / Orc-BASH DI sweep

- **Session:** 2026-08-14 → 2026-08-15
- **Branch:** `general-work` · **Base:** `1c30c1e` · **41 commits**, 153 files, +6261/−940
- **Target:** Claude Code · **Focus:** finish verification, then decide the small cleanup list
- **Owner:** Leona Burime

---

## 1. What this was

Move leftover UI state, `t` binding, and `lib/api` access out of `apps/admin` components into hooks,
injected via `useX(port)` / `useWiredX()`, with components taking the hook as a **prop defaulted to
the wired pair**. This is Orc-BASH (`AI-Dev-Shop/skills/frontend-react-orcbash/SKILL.md`) with one
deliberate deviation the owner specified: **no `orchestrators/` layer — `useWiredX()` IS the
orchestrator.**

- Normative spec: `apps/admin/INFO.md` `## Hooks` (updated this session).
- Reference implementation: `apps/admin/src/features/pages/hooks/use-theme-pages.hooks.ts`.
- Component contract reference: `apps/admin/src/features/posts/Posts.tsx:48`.

Executed by 11 Sonnet subagents on disjoint file sets, then audited by 5 auditors.

## 2. State: green

| Check | Result |
|---|---|
| `cd apps/admin && npx vitest run` | **207 files / 2770 tests passing** |
| `cd apps/admin && npx tsc --noEmit` | 36 errors, **all pre-existing** `TS2348 Mock<...> is not callable` (17 of 34 affected files untouched by this diff) |
| `npx tsx development/scripts/check-admin-complexity-drift.ts` | **OK** |
| Complexity debt list | **12 → 9 entries** |

## 3. Owner rulings — DO NOT re-propose these

1. **Interactive DOM-chrome state stays LOCAL in the component** (active tab, sort toggle, dialog
   open, focus). Async/API state always moves into the hook. Reason: every controller fake in
   `apps/admin` is a *static object*, so injected setters are `vi.fn()` stubs — moving live chrome
   state broke 6 real-DOM assertions in `ThemeExplore.unit.test.tsx` (proven, then reverted).
   **Adopting stateful test fakes was offered and explicitly DECLINED.** Ratified precedent:
   `Posts.tsx:69` (`updatedSort`). Comment markers exist at all 5 declined sites.
   - Refinement that also holds: extraction IS fine where pre-existing DOM-behaviour tests keep
     exercising the real hook with no override (that is why `Playground` was allowed). The rule is
     about the *test consequence*, not the state category.
2. **`useAdminLocale` — stopped half-way, deliberately.** It has a port + `useWiredAdminLocale()`,
   injecting both `loadLanguage` and the refresh-bus subscription. Its `port` param **defaults** to
   the real binding (unique in the codebase) because **44 files still call it bare**. Two distinct
   follow-ups exist and must not be conflated: renaming the 44 buys *consistency only*; simplifying
   the 3 contorted tests requires **threading `locale` as an injected dep** through consuming hooks.
   Owner chose to stop. The 3 test workarounds (`Users.unit.test.tsx:60`,
   `AssistantDock.unit.test.tsx:78`, `Collections.unit.test.tsx:91`) REMAIN and are expected.
3. **URL builders go through the port** — applied to 4 of 5 sites. TipTap node views under `lib/`
   are excluded by scope decision, documented in `media-port.hooks.ts`.
4. **Feedback contract unchanged** — controllers keep `error: string | null`. Orc-BASH's
   `screen`/`notification` split was deliberately not adopted.
5. **No new entries in `admin-complexity-debt.json`.** Deleting stale entries is encouraged.

## 4. The catalog was wrong 7 times — one root cause

The coordinator's initial scan was built from regexes matching an assumed **shape**, then treated as
measurements of a **property**. Every error came from that. Agents caught all of them by checking the
disk instead of complying.

| # | Claim | Reality |
|---|---|---|
| 1 | Class B components not prop-injected | All 19 already were, defaulted to the *bare* hook |
| 2 | `use-dashboard` makes 0 api calls | Makes 5 — multi-line chain `api\n  .listPosts()` |
| 3 | `use-post-editor` has no port | Has a full 6-member port (filename-derived guess) |
| 4 | `Collections.tsx` value-imports `lib/api` | Imports `CONTENT_TYPE_FIELD_KINDS`, a const array |
| 5 | `Redirects.tsx` value-imports `lib/api` | Imports `describeApiError`, a pure classifier |
| 6 | 3 URL-builder sites | 5 |
| 7 | 9 `useAdminLocale` consumers | Several comment-only; `AgentPlugins.tsx` has zero |

Plus **Class D was a phantom** — "16 hooks lack ports" was filename-derivation error. Re-derived from
actual imports: **57 of 60 hooks have a full port + dependencies + fake triple**, 0 have a port
without a fake, and the 3 without ports are genuinely I/O-free.

**Rule for next time:** resolve imports and read call sites. Never count occurrences. The three
recurring false-positive shapes are `api.xxx()` inside a doc comment, `deps.api` as a locally-scoped
parameter, and a multi-name import clause.

**An 8th instance, same shape, one section over.** This handoff's own section 6 (item 5, second
dispatch, 2026-08-15) originally claimed `apps/admin/INFO.md` has a pure-helper exception list
naming 2 items (`describeApiError`, `CONTENT_TYPE_FIELD_KINDS`) and needing a 3rd (`ApiError`).
Wrong on the file (no such list exists in `INFO.md` at all), the count (the real list, in
`development/docs/architecture/wired-hooks-convention.md`, already named 3 —
`persistableMessages`, `describeApiError`, `hasUsableAdminKey`), and the named items
(`CONTENT_TYPE_FIELD_KINDS` was never in it, and `ApiError`'s actual usage — ~11 `rules.ts` files
and 4 hooks — was undercounted as "`rules.ts` files and 2 hooks"). Full account and fix in section
6's item-5 bullet, commits `857e066`/`6ee3721`. Same root cause as the seven above — a claim
recorded as a measurement without reading the file it was about — just caught by an agent that
refused to comply with a brief instead of a scan output.

## 5. Audit — 5 auditors, `TM-usewired-2026-08-14`

Packet: `ADS-memory/reports/external-audit/packets/20260814T-usewired-sweep-audit-packet.md`

| Auditor | Repo access | Score | Gate |
|---|---|---|---|
| Internal Sonnet 5 | yes | 7.0 | FAIL → blocker fixed |
| codex `gpt-5.6-terra` high | yes | 9.2 | PASS |
| codex `gpt-5.6-sol` high | yes | 8.7 | FAIL → blocker fixed |
| agy `gemini-3.7-flash-high` | **no** | 8.7 | PASS |
| agy `gemini-3.1-pro-high` | **no** | 6.5 | FAIL (refuted) |

**Two real blockers, both from repo-access auditors, both FIXED:**
1. **HEAD did not build** — `ComposioKeyField.tsx` imported `./hooks/use-composio-key-field.hooks`,
   which was never committed (orphaned when a concurrent `git reset` unwound `6c0c84d` and only the
   PageEditor half was re-landed as `b431808`). Every test run was a **false green** against the
   working tree. Fixed in **`f408226`**.
2. **Committed markup depended on uncommitted CSS** — three files switched to
   `jini-tabbed-dialog--inline` while the CSS rename sat uncommitted. Fixed by landing the pure 1:1
   rename (23 rules + 2 call sites, zero unrelated lines).

**Methodological finding worth keeping:** score tracked *repo access*, not rigor. Both packet-only
auditors raised the same debounce "blocker"; both were wrong. That convergence was **shared-input
correlation** — the packet said "depends on `post?.id` rather than the whole post object", omitting
that `bodyJson` is also in the array. Real array:
`[view, post?.id, canShowPendingContentPreview, bodyJson, templateChoice]`. Gemini 3.1 also escalated
three items to HIGH whose own text says *"the packet is insufficient to judge"*.
**Never send a packet-only auditor a lossy paraphrase of the thing you want checked.**

## 6. Open items

**Substantive (1) — done, 2026-08-15 (second dispatch):**
- [x] **Negative-verify the ~10 previously-unexecuted test files.** Completed:
      `ADS-memory/reports/2026-08-15-negative-verification-usewired-batch.md`. 11/11 files verified,
      9/11 clean, 2 findings (1 genuinely vacuous test, 1 narrow assertion-precision gap). Both acted
      on below (the two items that used to be this section's own to-do): the vacuous
      `use-admin-locale.hooks.test.ts` test was deleted in `126aab1`, then its coverage gap was
      closed for real in `a717697` (see that commit — a spy-based test proving the hook's own
      cleanup calls `unsubscribe()`, RED/GREEN-proven by mutation, zero production or fake changes).
      The `ThemeExplore.unit.test.tsx` `.liquid` assertion was tightened in `1d6db82`, RED/GREEN-proven
      by reverting the extension-strip and confirming the mutated test failed.

**Cosmetic (4) — all four resolved, 2026-08-15 (second dispatch):**
- [x] Two vacuous tests, same tautology — `use-dashboard.hooks.unit.test.ts` ("t falls back to the
      English source string…") and `use-members.hooks.unit.test.ts:36`. Both pass with `t` unwired
      because the dict has no `en` entries, so `?? key` and identity produce the same string. Both
      have working Spanish siblings, so coverage is not lost. **Deleted** both (commit `1ab2d79`) —
      `use-members`'s version also carried a `locale === "en"` assertion that looked like real
      coverage but wasn't: its `waitFor` was gated on the tautological `t()` condition (already true
      pre-fetch), so the assertion wasn't reliably proven to run after the fetch resolved
      (`DEFAULT_LOCALE` is coincidentally also `"en"`).
- [x] Stale comment: a method comment said `templateAssetUrl` lives in `PostTemplateModal.tsx`; it
      moved to `use-post-template-source.hooks.ts`. Fixed in `post-template-port.hooks.ts`, commit
      `444a3d0`.
- [ ] `c578a77`'s message says content was unchanged from `b891763`; one comment line differed
      (`useDashboard` → `useWiredDashboard`). Terra's own advice: **do not rewrite history**, just
      note it — this bullet already is that note; no further action needed.
- [x] **This bullet's own original claim was itself wrong — an 8th catalog error, same root cause as
      section 4's seven (a claim built from an assumed shape, recorded as a measurement).** It said
      `apps/admin/INFO.md`'s pure-helper exception list names 2 (`describeApiError`,
      `CONTENT_TYPE_FIELD_KINDS`) and needs a 3rd (`ApiError`, "used for `instanceof` in `rules.ts`
      files and 2 hooks"). None of that survived contact with the files: **`apps/admin/INFO.md` has
      no such list at all** (its only nearby text is a table row at line 77); the real list is
      `development/docs/architecture/wired-hooks-convention.md:85-91` ("What stays a direct
      import — never injected"), and it already named **3** items before this pass
      (`persistableMessages`, `describeApiError`, `hasUsableAdminKey`) — `CONTENT_TYPE_FIELD_KINDS`
      was never in it. The one real omission was `ApiError` (`lib/api.ts:945`), and its usage was
      undercounted too: `instanceof ApiError` actually appears in ~11 `rules.ts` files and 4 hooks
      (`use-admin-execution-credential`, `use-theme-explore`, `use-widgets-library`,
      `taxonomy-dependencies`), plus `lib/ledger-slice.ts` and `lib/execution-settings.ts` — not
      "rules.ts files and 2 hooks". Added as its own bullet in the convention doc rather than folded
      into the pure-rules one, since the reasoning differs (a class used for `instanceof` has no
      decision a fake could swap — the check IS the constructor's identity). Fixed in commit
      `857e066`. `CONTENT_TYPE_FIELD_KINDS` was deliberately **not** added anywhere — it's a plain
      data constant with one consumer (`Collections.tsx`), not a pure-rule function, and folding it
      into that bullet would blur what the list is about.

**Refuted — no action:** both Gemini debounce findings; Gemini 3.1's three "packet insufficient"
HIGHs (resolver semantics, URL-builder async-ness, ComposioKeyField draft) — all verified correct by
code-reading auditors. All 20 resolvers use `override ?? default`, no `||`. All 4 URL builders are
typed synchronous `string`. ComposioKeyField clears the draft on **every** save attempt (its
`save()` never rejects) — byte-identical to pre-refactor, and its comment says so.

## 7. Traps this session paid for

- **Concurrent agents share ONE git index.** `git add` + verify + commit is NOT enough — a peer's
  `git add` lands between the check and the commit. **Use `git commit -m "..." -- <exact paths>`**,
  which commits only those paths regardless of what is staged; `git add` new files first (the
  `-- <path>` form ignores untracked). Verify against **the hash `git commit` returns**, not `HEAD`
  (HEAD moves under you). Three commits were contaminated; one reset destroyed work that had to be
  re-landed (`c578a77`), and one half was never re-landed at all until the audit caught it.
- **Uncommitted work is invisible to CI and one `git clean` from gone.** Three separate artifacts hit
  this: the orphaned hook module, `INFO.md`, and this session's own catalog report.
- **`agy` headless auto-denies tool calls** → empty output, exit 0. Packet must be self-contained and
  must NOT tell it to read files. Also: **every flag before `--print`**, or the flag name becomes the
  prompt and the model is silently swapped for `claude-sonnet-4-6`.
- **A failed peer dispatch still exits 0.** Parse JSONL for `error`/`turn.failed`; empty stdout with
  a clean exit is the silent-failure shape.
- `noInlineConfig` is set repo-wide → `// eslint-disable-next-line` comments have **no effect**.
  They are documentary only.

## 8. Referenced artifacts

| Path | Relevance |
|---|---|
| `ADS-memory/reports/2026-08-14-usewired-migration-catalog.md` | The catalog + its full correction record |
| `ADS-memory/reports/2026-08-14-port-consistency-audit.md` | 8 port trios, 0 bugs; all 14 dep arrays enumerated |
| `ADS-memory/reports/2026-08-14-class-d-port-coverage.md` | Re-derived coverage, 57/60 |
| `ADS-memory/reports/2026-08-14-theme-liquid-preview-status.md` | `.liquid` preview pipeline DOES exist; the old test was stale |
| `ADS-memory/reports/external-audit/packets/20260814T-usewired-sweep-audit-packet.md` | Frozen threat model |

## 9. Next-agent prompt

> Read `AI-Dev-Shop/AGENTS.md` first, then
> `ADS-memory/reports/continuity/2026-08-15-usewired-di-sweep-handoff.md`.
>
> Continue from section 6. Start with the one substantive item: negative-verify the ~10 test files
> listed there — break the fake each test depends on, run that single test by name, confirm it goes
> RED, revert, confirm green. Report the true hit rate including any test that stays green; do not
> quietly patch a vacuous test.
>
> Do not re-propose anything in section 3 — those are settled owner decisions. Do not rewrite git
> history. Use `git commit -m "..." -- <exact paths>` for every commit.
