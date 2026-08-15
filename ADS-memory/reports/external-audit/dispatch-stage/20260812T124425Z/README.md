# Dispatch stage — `PKT-TOVU-20260812T124425Z` (never dispatched)

The session-6 external audit was fully prepared on 2026-08-12 and **never ran**. Everything needed to
dispatch it is committed here. Nothing needs rebuilding.

| Artifact | Path |
|---|---|
| Packet (frozen) | `ADS-memory/reports/external-audit/packets/20260812T124425Z-audit-packet.md` |
| Shared prompt body | `PROMPT-BODY.md` (this directory) |
| `agy` prompt (no repo access — reads `./files/`) | `prompt-agy.txt` |
| `codex` prompt (`<<PEER_DISPATCH>>`, has repo read access) | `prompt-codex.txt` |
| Staging rebuild for `agy` | `restage-files.sh` |

- **Packet ID** `PKT-TOVU-20260812T124425Z` · **threat model** `TM-TOVU-2026-08-12-B` (frozen) ·
  **round 1** · **score floor 8.5** · target `df109b5^..800bf20` restricted to 26 files.
- Resume with `reuse_packet=ADS-memory/reports/external-audit/packets/20260812T124425Z-audit-packet.md`.
  Do **not** rebuild the packet — the threat model is frozen and a rebuild would not be round 1 anymore.

## Why these files were moved here

They were originally written to `ADS-memory/.local-artifacts/` (gitignored — one `git clean -xdf` from
gone) and to a **session-scoped scratchpad** directory. The session-6 handoff pointed at both. A later
session resolves `<scratchpad>` to its own empty directory and finds nothing, so "resume, don't rebuild"
was unachievable as written. The originals are left in place; these are copies.

Only one edit was made to the originals: `prompt-codex.txt`'s packet path now points at the committed
copy instead of the `.local-artifacts` one. The prompt bodies are otherwise verbatim.

## Restaging `files/` for `agy`

`agy` has no repo access, so its prompt reads everything from `./files/` in its working directory. That
tree is regenerated rather than committed (it is 300K of duplicated source):

```
bash ADS-memory/reports/external-audit/dispatch-stage/20260812T124425Z/restage-files.sh
```

**Stage from `800bf20`, not `b658e1d`.** The packet's scope table lists `b658e1d` last, but `800bf20`
(12:23) landed seven minutes *after* it (12:16) and is the real tip of the audited range. The original
staged tree was diffed against both: `800bf20` reproduces all 14 files byte-identically, `b658e1d`
reproduces 10 of 14 — it predates the Cache-Control change, so the four `src/server/routes/site/*.ts`
files would be staged in their pre-fix state and the auditor would review code that was never shipped.
The script hardcodes the correct anchor.

## Known packet defect, disclosed rather than fixed

The scope section is headed **"the 9 commits under review"** but its table names **10** distinct SHAs
(`df109b5`, `4c71c3f`, `9c8d86f`, `289e722`, `0636f77`, `42b5389`, `3c9e2c4`, `1bef1fa`, `800bf20`,
`b658e1d`). The packet is frozen, so the count is left as-is. Disclose it in the dispatch — a prior
round recorded that *both* Geminis raised the same false blocker from a packet omission, logged as a
dispatch defect rather than an auditor failure.
