# Handoff: SPEC-046 client-directive channel — built and verified; the e2e specs are NOT saved

Generated: 2026-08-04
Source: Coordinator (Review/Pipeline Mode), Claude Code / Claude Opus 5 (1M), with four dispatched
Sonnet 5 subagents. Repos `Tovu` + `Jini`.
Target: Claude Code, fresh session.

Saved here rather than `.local-artifacts/` (the skill's default) deliberately: that path is
gitignored, and this repo's handoffs are committed artifacts the owner opens at session start.

## Next-Agent Prompt

> Read `AI-Dev-Shop/AGENTS.md`, then this file, then
> `ADS-memory/specs/046-site-assistant-page-actions/spec.md` (v2) and
> `ADS-memory/reports/refactors/2026-08-04-spec-046-verification.md`.
> Both repos are on `refactor/jini-admin-extraction`. **Run `git status` in BOTH first — at least one
> other human session is live in both trees.**
> **Do not re-derive anything below. The top job is Next Step 1: the e2e specs were never written.**

---

## Current State

| repo | branch | HEAD | pushed | tree |
|---|---|---|---|---|
| Tovu | `refactor/jini-admin-extraction` | `4f6ad41` | ✅ local == remote | other sessions' work uncommitted |
| Jini | `refactor/jini-admin-extraction` | `126e5e34` | — | other session active in `agent-runtime` |

**SPEC-046 REQ-0 through REQ-8 are built, wired, and browser-verified.** The public visitor assistant
can now navigate/scroll/highlight a visitor's browser through a validated directive channel, with a
persisted transcript that survives navigation, and the public endpoint is rate-limited.

## Completed Work

Commits this session, oldest first:

| commit | what |
|---|---|
| `6d8086b` | REQ-7 rate-limit the public chat endpoint (`SITE_ASSISTANT_PER_IP`, 10 req / 5 min / IP) |
| `506a7ae` | REQ-8 evict expired windows — map growth was attacker-controlled on an anonymous endpoint |
| `67da3a5` | admin roadmap row removed (it shipped); unit test asserts its **absence** |
| `4172c2b` | REQ-0 capability registry extracted from the SSE closed switch |
| `b738359` | REQ-1/REQ-2 transcript persistence + single-shot action queue |
| `9462e38` | REQ-3 bounded conversation history |
| `42cad2d` | storage consolidated into one `session-store.ts` + guard test |
| `6a21c8f` | REQ-4/5/6/8 server-side client-directive channel |
| `c4f0c7a` | client-side wiring: transport parsing, highlight CSS, D-1 propose-vs-auto |
| `44f9242` | closed the jsdom guard's storage-key drift gap |
| `7de3297` | route-level `client_directive` SSE **framing** test (byte-level) |
| `aa467f2` | AC5 crafted-target refusal, over the real route + DB |
| `07a9e38` | **BUG FIX — infinite navigation loop** |
| `e5a1dbd` | **BUG FIX — reduced-motion fade never ran** |
| `4f6ad41` | the verification report |

### The two bugs, because they are the point

Both were invisible to 62 green unit tests, the jsdom guards, and a clean typecheck.

**1. Infinite navigation loop (`07a9e38`, severe).** After a real "take me there", the destination
page's rehydrated transcript replayed the same already-executed auto-navigate directive on every
mount — `ChatPane`'s `onMessagesChange` fires on mount with rehydrated messages, and
`processedMessageIdsRef` started empty per component instance. **Measured live: 11 navigations to the
same page in 6 seconds, uncapped.** `sessionStorage` carried the poisoned state forward, so the site
was unusable for any visitor who used "take me there" once. Fixed by seeding the ref from
`initialState.messages`.

Note the shape: REQ-1's persistence is what *created* the bug class. Not an argument against it —
an argument for measuring in a browser once state survives navigation.

**2. Reduced-motion fade never ran (`e5a1dbd`).** The `tovu-official` theme's own accessibility reset
(`* { animation: ... !important }`) beat `widget.css`'s non-`!important` override — `!important`
outranks specificity regardless of selector weight. Measured: `animationName` computed `none`, the
outline held full opacity ~21s, then popped away via the JS fallback timer. Now completes at exactly
20000ms via the real `animationend`. **Only caught because the test used a context that actually sets
`prefers-reduced-motion`** — a default context passes regardless.

## Decisions And Constraints

- **D-1 — propose by default; auto-navigate only on explicit request** ("take me there"). Implemented
  structurally, not by instruction: the `auto` flag is computed in `site-assistant.ts` **before any
  tool runs**, and the tool has no such parameter — so a hijacked model cannot raise its own flag.
  Intent detection is a literal phrase list, knowingly not classification; a false positive costs
  "auto-navigated when it should have proposed", never a security gap.
  ⚠️ **The proposal is itself a validated directive, not a text link.** Never let "it's only a link"
  skip target validation.
- **D-2 — same tab.** This is what makes REQ-1's persistence load-bearing.
- **Tier model (REQ-5):** Tier A autonomous (navigate/scroll/highlight, server-validated pre-emit),
  Tier B redeemed (MCP-UI, human click + ADR-053 allowlist). Rule: **Tier A only if the worst case
  with a fully hijacked model is acceptable with no confirmation.** Worst case today is "visitor sent
  to another published page of this same site" — that is the invariant to preserve.
- **The public MCP-UI allowlist ships EMPTY** (spec §8). Tier B is defined, not populated.
- **REQ-0 kept default-deny.** Unknown capability and unauthorized caller return the same `refused`
  outcome. Do not regress into "anything registered is callable."
- **`posts.deleted_at` is independent of `status`** — a trashed post still reads
  `status: "published"`. Target validation goes through `listPublishedPosts`' predicate.
- Storage: **one module** (`session-store.ts`), narrow 3-method interface, guard test forbidding
  `sessionStorage` anywhere else under `apps/site-chat/src`.

## Risks And Open Questions

1. **The permanent e2e specs were never written.** See Next Steps 1. This is the single most important
   item and the owner asked about it directly.
2. **`site.assistant.public_enabled` is still ON** (workspace scope). Rate limiting now covers the
   cost-attack surface, but turn it off when not testing.
3. **Cloud dispatch is broken.** `trig_01CAUstQNdYszzRJHwfGxJK6` fired 2026-08-04T17:32Z and produced
   **zero commits and no run log**. The owner predicted this. `RemoteTrigger`'s `list`/`get` expose no
   transcript, so a failed run cannot be diagnosed after the fact. **Do not dispatch cloud work until
   this is understood.** Brief is committed at
   `ADS-memory/reports/cloud-runs/briefs/spec-046-client-directive-verification.md` and is reusable.
4. **Mid-flight `SendMessage` is not a reliable control channel here.** Four directives went unread
   until after task completion this session; two were never acted on at all. **Put constraints in the
   spawn prompt** — it is the only channel read at t=0.
5. **Multiple sessions share both trees.** Uncommitted work spans ADR-056/057, SPEC-047/048,
   `src/features/site-glue/`, a2ui poster, `schema.ts` + a new migration, and Jini's `agent-runtime`
   provider tests. **Targeted `git add` only — never `git add -A`.**
6. `development/e2e/a2ui-transport-contract.spec.ts` and `playwright.a2ui.config.ts` are **untracked**
   — another session's, not yet committed. Don't assume they're durable.
7. **The FAB icon task is still not done** — carried over from the previous handoff. Jini-side, fully
   specified in `2026-08-04-site-assistant-agent-notes.md`. ⚠️ Copy the SVG at **20×20**.

## Next Steps

1. **Write the e2e specs into `development/e2e/` — top priority.** The Playwright measurements that
   found both bugs live only in a scratchpad and will evaporate. Owner's standing rule. Split by
   behaviour, one concern per file, NOT one omnibus spec:
   - `site-assistant-navigation.spec.ts` — AC1, D-1 branches, **and the infinite-loop regression**
     (highest value; the jsdom guard only proves "didn't re-fire once", not the loop)
   - `site-assistant-persistence.spec.ts` — AC3 reload, rehydration, poisoned storage
   - `site-assistant-highlight.spec.ts` — AC2/AC4/AC7. **The slow one** (~20s lifecycle) — isolate it.
     **Never shorten the 20s to make the test convenient.**
   - `site-assistant-limits.spec.ts` — AC6's 429 surfacing readably
   Add a sibling config following `playwright.a2ui.config.ts`. Must **not** need a live
   `GEMINI_API_KEY`: use `page.route` to intercept only the widget's fetch, replaying the SSE format
   already proven byte-for-byte by `7de3297`. **Comment why that is sound evidence**, or a later
   reader sees "mocked" and discounts it.
   Do **not** duplicate AC5 in a browser spec — `aa467f2` covers it permanently.
2. Turn off `site.assistant.public_enabled` when testing stops.
3. The FAB icon (Jini-side, needs a `packages/chat` rebuild).
4. Spec §8 open questions: which tools (if any) reach the public MCP-UI allowlist; and ADR-054's
   unresolved "does a logged-in admin get the visitor assistant or the admin one?"

## Suggested Skills

- `qa-e2e` persona + `browser-live-analysis` — for Next Step 1.
- `e2e-test-architecture` — spec organisation.
- ⚠️ **Never use the Playwright MCP tools on this machine.** They drive the owner's real Chrome and
  hang 30–60s. Import from `/Users/la/Programming/Tovu/node_modules/playwright` by absolute path.
- ⚠️ **`waitUntil: "networkidle"` never resolves** against this app (open SSE) and fails *silently*.
  Use `domcontentloaded` + wait on a real condition. Prefer `waitForSelector`/`waitForFunction` over
  fixed waits; fixed waits are legitimate only for the inherently temporal 20s fade.
- Environment note: `npm run dev:server` uses `tsx watch` and restarts whenever a concurrent agent
  rebuilds a symlinked `@jini-ai/*` package, producing misleading test symptoms. Use
  `npx tsx src/index.ts` (no watch) when other sessions are active.

## Handoff Contract

- **Inputs used:** `git log`/`status`/`ls-remote` in both repos; scoped `node --test` and vitest runs
  (62 + 21 + 6 green, verified independently, not taken from agent reports); direct source inspection
  of `capability-registry.ts`, `session-store.ts`, `SiteAssistantWidget.tsx`, `widget.css`,
  `rate-limit.ts`; `RemoteTrigger` create/update responses; SPEC-046 v2 and the verification report.
- **Output summary:** a fresh session can write the e2e specs and finish the remaining items without
  replaying any investigation.
- **Risks:** e2e evidence is currently unreproducible; cloud dispatch silently broken; three-plus
  sessions sharing two trees; the public switch is on.
- **Suggested next assignee:** QA/E2E for Next Step 1, then Coordinator.
