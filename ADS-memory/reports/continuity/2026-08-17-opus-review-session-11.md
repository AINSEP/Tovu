# Opus 5 adversarial review of session 11's 7 commits (2026-08-17)

Owner requested an independent Opus-level review of commit range `16357b68..570d64b7` after this
session's work was pushed. Full agent report preserved below; this file exists so the finding and
fix are traceable together (per project convention: persist agent reports immediately).

## Real numbers the reviewer ran itself, not taken from commit messages
- `apps/admin` typecheck: 0 errors (confirms `571e8b90`'s claim)
- `apps/admin` vitest: 231 files, 3224 tests, all pass
- Both new Playwright specs (session-expiry kickback, theme-explore narrow sidebar): all green
- `check-route-coverage-diff.test.ts`: 5/5 pass
- `npm run check:architecture`: OK, at baseline
- No conflict markers anywhere at HEAD (confirms the §0 stash cleanup fully worked)
- All 3 stashes still intact; `git status` clean except the owner's `index.html` and another
  session's swarm-consensus files (both correctly untouched)

## Verdicts
- `120ed4fe` (Theme Explore preview) — **solid with caveats**. Server middleware claim verified
  true (bare `express.static`, no allowlist). CSS mechanism verified true (source-order dependent,
  confirmed correct). Caveat: `.cjs`/`.webmanifest` files would now preview as a silently blank
  iframe instead of an honest notice (CSP blocks the download fallback) — **latent, not live**, no
  shipped theme has either file type today. One doc comment overstates Chrome's JSON rendering
  (claims a tree viewer; stock Chrome shows plain text) — cosmetic.
- `f994e419` (login-kickback) — **had a real problem, now fixed** (see below).
- `061c7f54` (route-coverage-diff base ref) — **solid with caveats**. Priority order verified
  correct in code AND by a test that sets multiple tiers simultaneously (not just per-tier
  isolation, as originally worried). Caveats: a pre-existing (not introduced this session) doc/code
  order mismatch in the header comment; a force-push will now fail loud (safe direction, expected
  outcome per the reviewer, not a bug); pushes to `main` are now genuinely gated for the first time
  (intended, not accidental).
- `571e8b90` (58-file typecheck fix) — **solid**. Full diff swept for anything beyond the claimed
  mechanical change — found 3 more `ReturnType<typeof vi.fn>` widenings the commit message didn't
  enumerate (same pattern, different variable names) plus the 5 documented `closest<HTMLElement>`
  fixes. Zero production files touched, zero test assertions changed. Confirmed genuinely not a
  ratchet.

## The real bug: 401-vs-Composio false positive

`request()`'s `onUnauthenticated` notification fired on ANY HTTP 401, but 401 is not exclusively
"this session is invalid" in this codebase — Composio's own API (proxied through
`src/server/routes/admin/connectors/*`) returns 401 for a bad/expired Composio API key, and that
gets relayed verbatim by `sendConnectorError`. The repo's own code already documents this as a live
failure mode (`put-config.ts:84-86`: a bad Composio key surfaces when "a detail drawer 401s").
Before this session's fix, that just meant one broken drawer. After the fix, ANY of `listConnectors`
/ `get-by-id` / `statuses` hitting a bad Composio key would silently log the operator all the way
out to the Login screen, with a perfectly valid Tovu session — an unexplained-logout bug, worse than
what shipped before.

**Fix applied**: gate the notification on `body?.code === "UNAUTHENTICATED"` in addition to
`res.status === 401` — every genuine session-invalidity 401 in `dev-auth.ts` already sets that
code; Composio's relayed error sets `CONNECTOR_EXECUTION_FAILED` instead. Also fixed: a 40-line
JSDoc comment that landed on the wrong declaration (attached to `type UnauthenticatedListener`
instead of `request()`) when the new code was inserted between them. Added a third unit test case
proving a 401 with a non-`UNAUTHENTICATED` code does NOT clear the session. Tightened the e2e
403-negative-case assertion to check the actual response status, not just that a response arrived
(closes a silent-rot risk the reviewer flagged: the test would keep passing even if the URL glob
stopped matching, for the wrong reason).

## Caveats recorded, not acted on (correctly out of scope tonight)
- `.cjs`/`.webmanifest` blank-iframe gap — latent, no shipped theme hits it, worth a follow-up if a
  theme ever ships one.
- Route-coverage-diff header doc's stale ordering description — pre-existing, unrelated to this
  session's change, cosmetic.
- The shared `ReturnType<typeof vi.fn<(...args: any[]) => any>>` incantation repeated 60 times
  would be cheaper as one type alias — real but small, not urgent.

Full original agent report (verbatim, for anyone who wants the complete evidence chain including
every file:line citation) is in the session transcript this doc's commit references; the summary
above is complete for anyone deciding whether to trust this session's work.
