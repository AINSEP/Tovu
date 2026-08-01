# Settings-domain audit sweep — 2026-08-01

Two independent audits of the same four scopes (147 files across Tovu and Jini), run with no shared
context, plus Coordinator verification of the contested findings.

**Start here: [`20260801-terra-vs-sonnet-crosscheck.md`](20260801-terra-vs-sonnet-crosscheck.md).**
It separates two-vote findings from one-vote ones, adjudicates the four places the auditors
contradicted each other, and gives a recommended fix order. The individual reports say what each
model believes; the cross-check says which beliefs survived reading the code.

## Contents

| File | What it is |
|---|---|
| `20260801-terra-vs-sonnet-crosscheck.md` | **The adjudication. Read this first.** |
| `20260801-critical-cross-tenant-settings-write-verification.md` | The one CRITICAL, verified by hand, with the fix |
| `20260801-terra-audit-batch{2-tovu,2-jini,3-tovu,4-jini}.md` | `gpt-5.6-terra` @ `xhigh`, raw |
| `20260801-sonnet-audit-batch{2-tovu,2-jini,3-tovu,4-jini}.md` | Claude Sonnet 5, raw, independent |
| `20260801-terra-batches-2-3-4-dispatch.md` | Dispatch record, scope arithmetic, extraction checklist |
| `packets/` | The four audit briefs both models were given |

Raw JSONL transcripts stayed in `ADS-memory/.local-artifacts/handoff/terra-audit-scope/runs/`
(gitignored — regenerable, and large).

## Auditors

- **`gpt-5.6-terra`**, `model_reasoning_effort=xhigh`, via `codex exec` as an external reviewer with
  no repo instructions loaded (`--ignore-rules --ignore-user-config --ephemeral`).
- **Claude Sonnet 5**, four subagents, each explicitly blocked from reading Terra's reports and from
  reading the design document that argues the new code is correct.

Independence was enforced, not assumed. Where they agree, they agree from cold.

## Totals

| | CRITICAL | HIGH | MEDIUM | LOW |
|---|---|---|---|---|
| Terra (4 batches) | 1 | 15 | 15 | 2 |
| Sonnet (4 batches) | 0 | 4 | 10 | 4 |

The gap is not noise. Terra rates on assumed host behavior; Sonnet refuses to rate on assumptions it
cannot verify from the code in front of it. The cross-check explains this per-finding.

## The result that matters most

**Each model found a real defect the other had affirmatively marked clean.**

- Terra found the CRITICAL cross-tenant write; Sonnet reported zero CRITICALs.
- Sonnet found `listRevisionsSince` missing its workspace predicate, in an area Terra's
  "assessed and found clean" section explicitly blessed.

Neither report alone was sufficient. **A clean second opinion is not clearance** — and by the same
logic, the batch-1 findings (`20260801-terra-audit-tovu.md`, `-jini.md`) have only ever had one pass.

## Scope still unaudited

Jini `packages/ui/src/features` (58 React components) plus four stragglers — `ui-core/src/index.ts`,
`ui/src/index.ts`, `react/components/CustomSelect.tsx`, `utils/appearance.ts`. That would be batch 5.
File lists are in `../../../.local-artifacts/handoff/terra-audit-scope/`.
