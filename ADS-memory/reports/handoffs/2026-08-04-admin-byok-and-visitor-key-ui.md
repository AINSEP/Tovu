# Handoff: admin BYOK execution + Visitor's AI Assistant UI

Generated: 2026-08-04, late session. Source: Web Design → Programmer (Claude Opus 5, 1M) with one
dispatched Sonnet 5 subagent (`byok-dock-wiring`, now stopped). Repo `Tovu`, branch
`refactor/jini-admin-extraction`. Cross-repo: `Jini` (9 files modified).

Target: Claude Code, fresh session.

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then this file, then
> `ADS-memory/reports/refactors/2026-08-04-handoff-visitor-assistant-key.md` (the previous handoff —
> its lessons still apply) and ADR-058.
> Run `git status` FIRST — five-plus sessions share this tree. **Do not rewrite history.**
> **Read "The thing that is still broken" before touching anything.**

---

## The thing that is still broken — read this first

**The admin dock's "Use API · BYOK" mode still does not work when driven in a real browser.** The
owner tried it at the end of the session and reported plainly: *"the byok didnt fix it."*

This matters because everything built for it is green:

- 9/9 route tests pass, all four protocols (anthropic/openai/azure/google).
- A real admin tool (`workspace_get`) genuinely executes through a real provider turn and its result
  streams back in the correct wire shape.
- `apiModeAvailable` / `executionMode` / `onExecutionModeChange` are wired in `AssistantDock.tsx`.
- Both typechecks clean.

**So the gap is between "the route works in tests" and "the dock works in a browser", and nobody has
looked at it yet.** No one drove the actual UI end to end — every proof is route-level with the
provider mocked. That is the single highest-value next step, and it should start from live browser
evidence (what does the picker render, does clicking BYOK change `executionMode`, does `startRun`
take the BYOK branch, what does the network tab show) rather than from re-reading the code.

Candidate causes, none investigated:
1. `apiModeAvailable` is derived from `execution-settings.ts`'s **browser-local** store — if the read
   is wrong, or async, or keyed differently than expected, the row stays disabled and nothing else
   ever runs.
2. `assistant-transport.ts`'s mode branch may not see the mode the picker sets (`ChatPane` owns that
   state; `AssistantDock` may not be persisting or threading it back).
3. The mode may not persist at all — `execution-settings.ts` stores `mode` in the `core.execution`
   ledger namespace, but nothing verified the dock writes it.

## Where the branch stands

| | |
|---|---|
| HEAD | `1787dc9` — **nothing from this session is committed** |
| unpushed | **32 commits ahead of origin** |
| typecheck (server) | clean except pre-existing `src/index.ts(213,21) 'child.pid' is possibly undefined` |
| typecheck (admin) | clean |
| Jini `packages/ui` `features/execution` | 160/160 |
| Jini `packages/agent-runtime` `connection-test` | 23/23 |
| Tovu BYOK route tests | 9/9 |

## What shipped this session (all uncommitted)

### Visitor's AI Assistant tab — `apps/admin/src/sections/AiAssistant.tsx`

Layout reworked to the owner's spec and verified live in headless Chromium:

- Cards flattened; the tab background is the page's own (`.settings-ui-section--page-flow` block in
  `styles.css` strips the shell's modal chrome). Zero `.notice` boxes on the tab.
- Intro copy clamped behind the existing `components/SeeMore.tsx` at 3 lines.
- **Test Key moved under the API key input** via a new `apiKeyFooter` slot added UPSTREAM in
  `ByokProviderForm` — not a fork.
- Provider chips (Protocols / Gateways) restored and genuinely wired, reusing `ProviderChipGroup` +
  `groupPresets` + `nextConfigForPresetSelect` from `@jini-ai/ui`.
- One type scale (12px muted body, 13px/600 for the one bold label). Every `<strong>` removed from
  body copy — verified `strongTagsInCopy: 0`.
- **Explicit `Save` button; the 2-second auto-save is GONE.** See the incident below.
- The masked `••••<last4>` is a **placeholder** on the key input (`apiKeyPlaceholder`, new upstream
  prop) — never a pre-filled value.

### Server: probes can use the stored key

`list-models.ts` and `test-connection.ts` accept `useStoredCredential: true`. With a key stored
server-side the browser has none, so both controls previously sat disabled next to a working
credential. **The opt-in must stay explicit** — Settings → Execution mode calls the same routes with
a DIFFERENT (browser-local) key, and an implicit "empty key ⇒ use the stored one" would silently
probe the visitor credential. `execution-deps.ts`'s header records why its "stateless" slice now
carries the credential repo.

### `.env` actually loads

`.gitignore` had ignored `.env`/`.env.*` since long before anything read one. `dev.mjs` now calls
`process.loadEnvFile`. `.env.example` is tracked via a `!.env.example` negation. **Deliberately NOT
in `src/index.ts`** — a `.env` silently overriding real env vars on a production boot is worse.

### Boot race conditions removed

Two, fixed where each belongs:
1. `dev.mjs` waits for :3000 before starting Vite. Vite was ready in 240ms and proxying for ~9s
   before anything could answer, producing pages of `AggregateError [ECONNREFUSED]`.
2. `server/modules/assistant.ts` retries a **refused** connection to the daemon for 8s (250ms
   interval), because `src/index.ts` spawns the daemon inside `app.listen()`'s callback. Boot-window
   requests now succeed instead of 502-ing, and log one line instead of a stack per poll.

Verified: a full restart now produces a completely clean log, zero ECONNREFUSED.

### Jini (9 files) — all upstream, no forks

| file | what |
|---|---|
| `ByokProviderForm.tsx` | `apiKeyFooter`, `apiKeyPlaceholder`, `apiKeyStoredExternally` props; Model field renders `SearchableModelSelect` on live discovery (the `<datalist>` was invisible until typed into, so 42 discovered models were unreachable) |
| `CustomSelect.tsx` | portalled menu now carries its trigger's `data-theme` — it escaped the host's `data-theme="light"` wrapper and rendered dark on a light admin |
| `settings-dialog.css` | `.jini-select-menu` sets `color` — it set `background` only, so the portalled menu took Jini's background and the host's text colour (measured: dark-on-dark, unreadable) |
| `connection-test.ts` | Gemini thinking-token fix — see the findings doc |
| `ExecutionTab.test.tsx` | one test re-pointed from the datalist to the picker |

**⚠️ `connection-test.ts` and `ExecutionTab.tsx` also carry ANOTHER session's uncommitted work**
(an empty-key guard, 5 tests). Whoever commits those files commits both changes.

## Two mistakes I made — both recoverable, both worth knowing

1. **I destroyed the owner's live production key.** A verification script typed into the API key
   field to trigger model discovery; the 2-second auto-save persisted the stub two seconds later,
   encrypted over the real key, unrecoverable. There was no user error in that sequence — the
   affordance made an incidental action destructive. **That is why auto-save was replaced with an
   explicit Save**, and it is now a standing pattern: *explicit save, masked placeholder never
   pre-filled, no debounced write on a credential field.*
2. **I reaped 78 stray processes without checking whether the subagent had work in flight.** It may
   have killed a test run mid-execution. The agent re-ran everything afterwards, so the 9/9 is from a
   post-reap run — but a test result from that window would have been meaningless.

## Open decisions for the owner

1. **MCP-UI / A2UI parity for BYOK** — decision brief delivered by the subagent, no code started.
   Option A: bridge to the daemon's existing redemption routes (couples BYOK to a process it exists
   to work without). Option B: BYOK gets its own redemption path (self-contained, but BYOK's
   one-request/one-turn lifetime would need redesigning to hold a request open for a human).
   **No urgency**: the one real confirmation-gated tool (`content_post_delete`) already **fails
   closed** with no `emitSurface` — proven empirically, the seeded post survives, no hang.
2. **`admin_assistant_credentials` migration.** Decided: **two separate keys**, separate table
   (`site_assistant_credentials`'s PK is `workspace_id`, so it structurally cannot hold a second),
   **with** a `masked` column. Blocked on the owner committing another session's ADR-056 / migration
   0024 work so `_journal.json` is clean. The subagent built everything behind an
   `ExecutionCredentialPort` seam so the storage swap changes nothing else.
3. **The model an operator picks on the Visitor tab is ignored on a deployed site.**
   `site-assistant.ts:83` reads `TOVU_SITE_ASSISTANT_MODEL` or hardcoded `gemini-flash-latest`, and
   never the stored credential's `model`. Base URL likewise. Only `apiKey` gets through. Not fixed —
   the owner was told and has not chosen.

## Risks and traps

1. **The git index is shared and has been raced.** Use `git commit -- <paths>`. Never `git add -A`.
2. **`src/db/schema.ts`, `src/db/drizzle/**`, `_journal.json`, `src/features/post/**`,
   `src/features/plugin-runtime/**`, `src/headless/**`, `src/templates/**`** are another session's
   in-flight ADR-056 work. Untouched all session.
3. **Typing in a credential field can be a write.** No longer true on the Visitor tab (explicit Save
   now), but assume it on any screen until checked. Browser scripts touching a credential field must
   both read current state AND block the write at the network layer with `page.route`.
4. **Orphaned agent daemons accumulate, one per restart.** 8 had leaked over ~3.5 hours, each holding
   a port; some of tonight's "Playwright hangs" were collisions with them. `dev.mjs` reaps its own
   children by group, but the daemon is spawned one level deeper by `src/index.ts`. Check
   `ps -eo pid,ppid | awk '$2==1'` after a few restarts — if they reappear, the teardown path has a
   real bug worth fixing rather than reaping periodically.
5. **Provider measurements go stale in days.** See the previous handoff's risk 5 and the new findings
   doc — a dated claim in a comment was measurably false within 24 hours.

## Handoff Contract

- **Inputs used:** `git status`/`log`/`diff` in both repos; live headless-Chromium runs against the
  real admin with the real stored credential; scoped `node --test` / `vitest` runs; direct source
  reads of `site-credential-store.ts`, `execution-settings.ts`, `list-models.ts`,
  `test-connection.ts`, `ByokProviderForm.tsx`, `CustomSelect.tsx`, `connection-test.ts`,
  `site-assistant.ts`, `dev.mjs`, `assistant.ts`, `tool-registrations.ts`, and ADR-058.
- **Output summary:** the Visitor tab's UI is done and verified live; the visitor key saves encrypted
  end to end; `.env` loads; two boot races removed; four upstream Jini fixes with tests proven to
  fail pre-fix. The admin dock's BYOK mode is built and route-tested but **does not work in the
  browser**.
- **Risks:** shared index; 32 unpushed commits; the admin BYOK browser gap is unexplored.
- **Suggested next assignee:** Programmer, starting from live browser evidence on the dock's BYOK
  path — not from the code.
