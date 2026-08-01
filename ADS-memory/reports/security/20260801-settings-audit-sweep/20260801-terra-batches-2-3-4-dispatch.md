# Terra audit batches 2, 3, 4 — dispatch record

Dispatched: 2026-07-31 ~21:14–21:19 local. Coordinator (Claude Opus 5, 1M context), single-agent.
Peer model: **`gpt-5.6-terra`, `model_reasoning_effort=xhigh`** (verified against the live process
arguments, not assumed).

**Status at time of writing: all four RUNNING. No reports extracted yet.**

## Why these batches exist

Batch 1 (already reported, findings verified in `20260801-terra-high-findings-verification.md`)
covered 50 of 249 files ranked by last-touched. Batch 2 was staged by a prior session but never
dispatched. Batches 3 and 4 are new, carved from the 149 files that remained.

Scope arithmetic, from `terra-audit-scope/`:

| | Files | Repo split |
|---|---|---|
| Total ranked | 249 | — |
| Batch 1 (audited) | 50 | 36 Jini + 14 Tovu |
| Batch 2 (staged, now dispatched) | 50 | 37 Tovu + 13 Jini |
| **Remaining after 1+2** | **149** | 123 Jini + 26 Tovu |

Batch 3 takes the 26 remaining Tovu files (minus CSS/`INFO.md`/type shims) **plus 13 new or
heavily-modified working-tree files that are not in the 249 list at all** — they were written after
the list was built. Batch 4 takes all 61 files of Jini's `ui-core/src/features`.

Still unscoped after this round: **Jini `packages/ui/src/features` (58 React components) + 4
stragglers** (`ui-core/src/index.ts`, `ui/src/index.ts`, `react/components/CustomSelect.tsx`,
`utils/appearance.ts`) — a future batch 5.

## The four runs

| Run | Repo | Files | Packet | Raw output |
|---|---|---|---|---|
| batch 2 — Tovu | Tovu | 37 | `terra-audit-scope/packet-batch2-tovu.md` | `runs/batch2-tovu.jsonl` |
| batch 2 — Jini | Jini | 13 | `terra-audit-scope/packet-batch2-jini.md` | `runs/batch2-jini.jsonl` |
| batch 3 — Tovu | Tovu | 36 | `terra-audit-scope/packet-batch3-tovu.md` | `runs/batch3-tovu.jsonl` |
| batch 4 — Jini | Jini | 61 | `terra-audit-scope/packet-batch4-jini.md` | `runs/batch4-jini.jsonl` |

`packet-batch2-tovu.md` was pre-existing. The other three were written this session.

`runs/*.ABORTED.jsonl` are partial outputs from a first launch that was stopped ~40s in and
relaunched. **They are not reports — ignore them.**

### What each batch is actually looking for

- **Batch 2 — Tovu.** Admin section components, `apps/admin/src/lib/api.ts`, and the assistant
  execution routes (`detect-agents.ts`, `test-agent.ts`, `assistant-execution.ts`). Priorities:
  server-side authz on the execution routes, `apiKey` handling on error paths, command/argument
  injection via local CLI probing, XSS in the editor sections, unchecked `response.ok` in `api.ts`.

- **Batch 2 — Jini.** The `source-config-list` feature plus `Icon`, `LanguageMenu`, and
  `utils/notifications`. Priorities: secrets in rendered/attribute/error text, test-result
  attribution to the wrong item, stale "connection OK" after an edit, async races in the two hooks.

- **Batch 3 — Tovu.** The Settings domain end-to-end plus the assistant/daemon core. **This is the
  highest-value batch: roughly a third of it has never been reviewed by anyone.** It targets the
  three subsystems built in the uncommitted working tree:
  1. `settings_set_ui_preference`, the first agent-callable settings WRITE — the packet asks Terra to
     assume the JSON Schema `enum` is bypassed and prove or refute each of the four claimed
     structural bounds independently.
  2. The SSE change feed — whether it discloses anything the caller could not otherwise read
     (including by timing or sequence-gap inference), whether the client-supplied `Last-Event-ID`
     cursor is safe as untrusted input reaching SQL, and whether a disconnected client leaves a
     SQLite poll loop running.
  3. The removed value cache — any remaining stale-read path, and whether the no-op
     `invalidateWorkspaceSettingsCache` can silently defeat a purge.
  Plus: multi-tenant scoping in `repo.sqlite.ts`/`write-service.ts`, authz on
  `agent-daemon-server.ts`, and a third data-loss bug in `use-settings-slice.hooks.ts` (two have
  already been found there by audit).

- **Batch 4 — Jini.** All 61 files of `ui-core/src/features` (~5,700 lines, 13 domains). The premise:
  `rules.ts` files are usually the *only* validation, so the packet asks what each rule wrongly
  ACCEPTS — `file:`/`data:`/`javascript:` URLs, userinfo-embedded hosts, link-local addresses — given
  batch 1 already confirmed a real SSRF-via-redirect in this repo. Also `execution/rules.ts` (507
  lines, path/command handling), `memory/async-commit-guard.ts` (concurrency), redaction in
  `memory/formatters.ts` fallback branches, and unknown-enum-defaults-to-allowed in state rules.

## Dispatch pattern (naive `codex exec` WILL hang)

```bash
printf '%s\n\n' '<<PEER_DISPATCH>>' | cat - packet.md | \
codex exec --ignore-rules --ignore-user-config --ephemeral --json \
  -m gpt-5.6-terra -c model_reasoning_effort="xhigh" -C <repo> - > out.jsonl 2> err.txt
```

## Extraction checklist — do this before trusting any result

**Exit 0 does NOT mean success.**

1. `grep -cF '"type":"error"' out.jsonl` — must be 0.
2. `grep -cF '"type":"turn.failed"' out.jsonl` — must be 0.
3. `grep -cF '"type":"turn.completed"' out.jsonl` — must be >= 1.

**Use `-F` and match the full `"type":"..."` key.** A bare `grep 'turn.failed'` treats `.` as a
regex wildcard and matches the literal words "turn failed" anywhere in the agent's own prose or
command output — it produced a false failure alarm on batch 3.
4. Findings live in `item.completed` items of type `agent_message`; the report is the last one.
5. Write each extracted report to `ADS-memory/.local-artifacts/handoff/20260801-terra-audit-<batch>.md`.

## Then: verify before fixing

Batch 1's findings were re-verified against current code and **two of six HIGH findings did not
survive contact** — one was narrower than reported (needs a second process to race), one was not
exploitable in Tovu at all. Do not fix from the raw Terra report. Verify first, the way
`20260801-terra-high-findings-verification.md` did, then fix.

Extra caution for batch 3: it audits **uncommitted** code. Re-check every finding against the file
as it stands when the fix is written.

## Caveat worth knowing

An unrelated `codex` process (pid 45208, started Thu 14:00) is running with
`--dangerously-bypass-approvals-and-sandbox`. If it has write access to these repos it could edit
files while the audits read them. Not investigated, not touched.
