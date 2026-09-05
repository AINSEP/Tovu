# Model provenance — 2026-09-02 session

Which model AUTHORED each commit, and which model AUDITED/FIXED it.
Purpose: never re-audit work Opus already audited; keep the Sonnet-writes / Opus-audits split.

## Sonnet 5 authored — audited by Opus 5

| commit | what | Opus verdict | Opus fix |
|---|---|---|---|
| `ed1dd2e9` | static-tier page-shell fallback | SOUND-WITH-CAVEATS — comment falsely claimed "every static theme ships this file" (2 of 5 did); cited `static-render.test.ts`, which never existed; zero unit tests | `e7715996`, `c891e62a` |
| `cada14df` | preserve OAuth clientSecret on token clear | **DEFECTIVE** — made `disconnect`/`markNeedsReauth` throw on an unopenable blob; operator got a bare 500 on their only escape hatch; 0 tests for a failing sealer | `112b7bea`, `80e52453` |
| `ae893f48` | mark needs_reauth on a live 401/403 | SOUND-WITH-CAVEATS — guarantee was conditional on `cada14df`'s defect | folded into `112b7bea` |
| `41c2c2ad` | sitemap modal | SOUND-WITH-CAVEATS — fetched even when disabled; a test asserted the opposite of reality and passed only via a pending-promise race | `8f5fa50d` |
| `7d56cd33` / `fac94efc` | provider honesty (integrated:false) | SOUND — guard proven to fail; rewritten tests stronger than the originals | none |
| `af025bb6` | derive WIRED_CATALOGS | SOUND — but derives only 29 of 35 domains; the 6 hand-maintained ones include every MCP-UI surface domain | open |
| `a1f8abd4` | in-chat MCP-UI re-auth surface | SOUND — tripwire strengthened with near-miss probes, not weakened | none |
| `75970524` | Interactive canvas page-shell | SOUND — but reported the light/dark mismatch BACKWARDS (claimed Preview correct; Interactive is correct, published page is dark) | open |

## Opus 5 authored — DO NOT RE-AUDIT
`112b7bea` · `80e52453` · `e7715996` · `c891e62a` · `8f5fa50d` · `f840a24c` · `dbbc3f01` ·
`b627a884` · `b83735e8` · `7c75f9b7` · `c4c530a6` · `9449b6c5` · `4aeb2118`

Opus also audited Jini `2268bd5c` (Sonnet-era, "overlay for all 24 runtimes") -> found 7 of 24, fixed in `b627a884`.

## Measured outcome — why keep this split

**Sonnet-authored, Opus-corrected: 4 of 8 commits carried a real defect.** One was severity-1
(`cada14df` broke the only recovery path for a broken credential). Two shipped false claims in
their own comments. One shipped a test asserting the opposite of reality.

**Sonnet agents also made 3 confident false CLAIMS in their reports**, each caught only by
independent re-verification:
1. "3 failing tests are flaky, a different subset each run" — same 3 failed deterministically every run.
2. "Two hung processes self-resolved via Node's watchdog" — they were killed by hand; the real cause
   was a dropped `--test` flag.
3. "Preview is correct, Interactive shows the wrong mode" — exactly backwards.

**Opus agents self-corrected instead**: one re-measured 6/24 -> 7/24 after finding a channel it had
missed and reported the correction; one rejected the coordinator's own suggested signal
(`oauthExpiresAt`) with RFC 6749 evidence; one refused the naive fix and proved the naive version
double-delivers.

## The rule
- **Sonnet writes. Opus audits and fixes.** Cheap on the write, expensive only where it pays.
- **Never dispatch Opus to audit an Opus-authored commit** — see the DO-NOT-RE-AUDIT list above.
- **Every subagent report is a CLAIM.** Re-verify load-bearing ones regardless of model; the
  confident-sounding explanation is where a fabrication hides.
