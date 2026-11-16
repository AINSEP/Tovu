# Index B — reconcile of `CROSSCHECK-B-2026-11-16.md` (2026-11-16)

Status: **COMPLETE.** 6 partial items accepted (0 rebutted). 7 conflicts resolved. Docs only; nothing
was run. Amendments are in `reconcile/AMENDMENTS-B.md`; this run edited no design branch.

Checked against Tovu `refactor/terra` `80b00f5b` and Jini `refactor/terra` `02edbb68`.

## Partial items

| Item | Design | Verdict | Amendment | Design sections that change |
|---|---|---|---|---|
| Baseline fencing has no observation for every write path | lost updates | accepted; 5 write paths found, 1 observed today | §1 LU-1 | §4.7, §8 row 12, S13 row, §7 |
| Plugin race test contradicts the queue | lost updates | accepted | §1 LU-2 | §5 T-effect, §4.6 step 5, S9c tests |
| S1 breaks in the middle | lost updates | accepted; 8-commit additive order | §1 LU-3 | §4.4, S1 row, §7 |
| Size is an unapproved exception | lost updates | accepted; function exceptions withdrawn, file question now blocks dispatch | §1 LU-4 | §8 row 3, D11, §7 |
| Capacity refusal comes after the executable handoff | AG-UI | accepted; park first | §2 AGUI-1 | §7.5, §7.4 rule 3, §6.1 FT-1/FT-2, §4, §6.6, S4/S5 tests |
| Crash cleanup uses a session-start snapshot | ACP | accepted; containment made at spawn | §5 ACP-1 | §3.10, A9, O-12 |

## Conflicts

| # | Between | Which design changes | Amendment |
|---|---|---|---|
| 1 | lost updates §4.9 ↔ error system §3.1/E5 (conflict codes) | error system keeps every existing code; lost updates splits its code column in two and gates S11 on E5 | §6 X1 |
| 2 | security A06 ↔ error system (two reporters) | one lifecycle: core `createErrorReporter`. A06 declares a port only; error system E4 takes the visitor path, E2 gains `tracker: 'skip'` and a formatting rule | §6 X2 |
| 3 | AG-UI §7.6 ↔ error system §3.3 (admin disclosure) | AG-UI: `describeFailure` returns the protocol's `RunErrorPayload`; admin gets words + ID + Copy details | §6 X3 |
| 4 | AG-UI §4.1 ↔ error system §3.4/E8 (field map) | both quote one table; E8 runs after AG-UI S1 on the moved files | §6 X4 |
| 5 | lost updates S13 ↔ publish engine B01/B02 | S13 runs after publish P0.6/P0.8 and before B01; five items for the publish revision | §6 X5 |
| 6 | ACP Phase A ↔ R8/C6/size-design 10 | ACP: Phase A split into A-client (may start) and A-daemon (after size-design 10) | §6 X6 |
| 7 | error system E5a ↔ R7 (route status) | E5a split into core, daemon leftovers, and http-kit only while cms still mounts through it | §6 X7 |

## Facts found that the cross-check did not have

1. Email templates use two conflict codes: `CONCURRENT_EDIT` over HTTP, `EMAIL_TEMPLATES_VERSION_CONFLICT` to the model (X1).
2. The status event has a `data` field that AG-UI §4.1's field map leaves out (X4).
3. Core's `errorAnswer` gets no host context, so E5a must pass it in (X7).
4. The external-MCP SQL adapter is under `features/external-mcp/`, not `platform/db/repos/` (LU-3).

## Order that results (only the parts these amendments change)

- Publish baseline: publish P0.1–P0.8 → lost-updates S13 → B01 → F1/F2 → B02 → B03.
- Conflict codes: lost-updates guards → error-system E5 → S11 (optional).
- Visitor errors: A03 fixes → A06 (port only) → E2 → E3 → E4 → AG-UI S5.
- Chat failures: field map (X4) → AG-UI S1 → E8 → AG-UI S3 onward.
- Route status: C-ORIGIN-PORT → E5a-1 → R7 G1–G3 → E5a-2; E5a-3 only if R9 has not converted cms.
- Daemon launcher files: R8a → C6 → R8b → lane K → size-design 10 → ACP A-daemon. ACP A-client is independent.

## For the runs revising other designs

- **Publish engine** (`plan/publish-engine-design-2026-11-16`): AMENDMENTS-B §6 X5, items 1–5.
- **Env schema**: not read by this run. AMENDMENTS-B §7 lists the three places that may touch it; no
  amendment adds an environment variable.

## Owner decisions raised (detail in AMENDMENTS-B §9)

| # | Decision | Recommendation |
|---|---|---|
| B1 | May a lost-updates step edit an already over-500-line file without growing it? Blocks S1, S3, S5, S6, S9c, S9d | Decide once the size lane prices the splits |
| B2 | Visitor error records keep 30 stack lines, not the whole diagnostic | Accept |
| B3 | Agent adapters start in their own process group; one stated limit remains | Yes |
| B4 | Admin assistant run errors show words + ID + Copy details, never raw text unless the operation owner approved it | Yes |
| B5 | `CONCURRENT_EDIT` stays as a core legacy code until S11 | Yes |
| B6 | ACP Phase A split; the daemon half waits | Yes |

## Lessons applied

5 (migration graph: LU-3, X5, X6, X7) · 6 (tests able to fail, each with a mutation: LU-1, LU-2,
AGUI-1, ACP-1) · 7 and 20 (absent is not "not read": LU-1) · 9 (host values stay in Tovu: X2) ·
10 (untangle lanes first, debt keys: X5, X6, X7) · 11 (seams unverified are listed: AMENDMENTS-B §10) ·
15 (constraint before estimate: LU-4) · 16 (every writer advances the version during the transition:
LU-3) · 18 (per-event safety: AGUI-1) · 21 (process death is its own case: ACP-1) · 24 (redaction is
not disclosure; both reader directions: X2, X3) · 25 (every prerequisite scheduled: X5).

## Not verified

See AMENDMENTS-B §10 (seven points). The two that could change an amendment: the A06 sheet text
(X2 was written from the review's quotes and today's code), and whether the AG-UI encoder keeps an
extra field on `RUN_ERROR` (X4 has a stated fallback).
