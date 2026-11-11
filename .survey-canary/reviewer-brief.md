<<SUBAGENT_DISPATCH>>
HARD RULE (first): stop before ~250k tokens of your own context; report what you have and what's left.
## Rules
- Read only: /home/user/Tovu source (apps/, packages/, content/, scripts/), /home/user/Jini, and /tmp/canary-inputs/. Never read /home/user/Tovu/.survey-canary/out/, development/open-bugs.md or todos.md.
- rg, git read-only, file reads only. Never edit source, build, install, run tests or tsc, checkout/stash. Leave no processes running. Never commit or push.
- Public repo: describe what goes wrong, never how to abuse it.
## Your files
ONLY the files listed in /tmp/canary-inputs/{BATCH}/files.jsonl whose `tier` is {TIER}. Ignore the others in that batch (another reviewer has them, or the script labels them).
{TIER_NOTE}

## Batch {BATCH} — {TIER_LABEL}
Exactly the files listed in `/tmp/canary-inputs/{BATCH}/files.jsonl` (`path`). Dossier input folder: /tmp/canary-inputs/{BATCH}

## Repos (read-only)
- Tovu (host app): /home/user/Tovu — live tree, branch port/wip-1110. Shipped agent plugins (real implementers of contracts) under `content/agent-plugins/`.
- Jini (generic @jini-ai/* packages): /home/user/Jini (current main). Agent/provider plugins under `packages/agent-plugins`, `packages/provider-plugins`.

## Goal
Tovu will move generic code into Jini. Before any refactor, survey this batch. For EVERY non-test file do all four: (1) extraction label, (2) duplicates (Tovu↔Jini AND Tovu↔Tovu), (3) over-engineering (layers, wrappers, options, files that earn nothing), (4) bugs. Nothing gets fixed — report only.

## The dossier (script output — use it, don't trust it blindly)
`/tmp/canary-inputs/{BATCH}/files.jsonl`: per file loc, tier guess + `why`, imports (T: Tovu / J: @jini-ai with `pkg=` = the package actually imported / npm), importers (prod list; `direct` = files importing THIS file, which is what a barrel/facade has), exports (`re:` = re-exported), bug hints (store writes, awaits before the first abort check / before a close listener, swallowed catches, whole-collection PUTs).
`/tmp/canary-inputs/{BATCH}/twins.jsonl`, `port-edges.jsonl`, `format-couplings.jsonl` (incl. event names, path literals, Jini strings Tovu parses), `legacy-twins.jsonl` (whole Tovu feature that is an older copy of a mounted Jini module), `jini-rules.jsonl`, `composition-drift.jsonl`. `/tmp/canary-inputs/dossier-summary.md` explains fields.
Known weak spots: near-copies that are restructured (not identical), and route/boilerplate twins (many sim-1 pairs can be one generic helper or a real over-engineering finding — say which). Note every fact it got WRONG or MISSED.
NEW in dossier v4: `module-twins.jsonl` (whole Tovu file vs a Jini module, summed similarity), `wire-drift.jsonl` (route path / permission names that differ between Tovu and its Jini twin), `tool-calls.jsonl` (per assistant tool: declared vs hand-written permission checks, ctx.signal read, hand-parsed input, generic errors, test coverage). KNOWN MISS in v4: it does NOT find Jini copies under a DIFFERENT NAME (e.g. a Tovu hook/helper that re-implements a Jini export such as useConfirmRequest, copyToClipboard, decodeSseFrames, createBrowserSessionStore). For every non-trivial helper/hook/util, search Jini by BEHAVIOUR (key calls, string literals), not by name. Also check Tovu↔Tovu copies across apps/admin, apps/website, apps/desktop.


## 1. Label — use EXACTLY one of these words (MIXED lists symbols per word)
MOVE · MOVE-AFTER(x) · DEDUPE · DEDUPE-AFTER-HARDENING · DELETE (incl. shims/barrels/pass-throughs: delete and repoint callers — give the caller count from `direct`) · DELETE-AFTER-PARITY(legacy twin; list the parity gaps) · STAY-WIRING · STAY-PRODUCT · MIXED.
Flag CORE-CONTRACT-NEEDED when the generic part would need ≥2 non-core Jini packages. Give the Jini home (EXISTING package + subpath — no new package/entry without a one-line reason) and the host contract (ports the host supplies). Say what a file is blocked on if it imports another Tovu feature.
HARD RULE: every DEDUPE claim diffs BEHAVIOUR (not names) against the counterpart AND checks one real implementer or prod caller. If you can't, write DEDUPE-UNVERIFIED.
Tier actually needed: 0 (script could label) / 1 (header + exports) / 2 (behaviour diff, implementer, cross-feature). Agree or disagree with the dossier.

## 2–3. Duplicates and over-engineering
Duplicates: both sides file:line; copy / diverged / wrapper; behaviour diff; caller checked.
Over-engineering: file:line; what to cut and what it becomes; lines saved (be realistic).

## 4. Bugs — runtime files (stores, services, tools, routes, IPC, hooks with effects, CLI commands)
Ask at least:
- Same owner? Do save / list / update / delete (create/get/remove) all use the same owner/scope/table/key?
- Many writers? Can another tab, user, the assistant or a background job write the same thing (whole-object/whole-map PUT, read-modify-write without a revision/lock)?
- Stop reaches every write? Is the close/abort listener registered before the first await? Is there an await between the last abort check and an external write (network, DB, file, child process)?
- Also: limits/pagination that silently drop rows; errors swallowed or turned generic/misleading; wrong fallback/default; check-then-act gaps.
SEVERITY RUBRIC (apply exactly):
- high = secret exposure, data loss, or wrong writes a user hits in a NORMAL flow.
- medium = user-visible wrong result in a NORMAL flow (no race, no special timing, no feature flag).
- low = needs a race between concurrent actions, a few-ms timing window, rare data, an experimental/canary flag, or operator-only paths.
- smell = not a bug.
Every bug gives: file:line · functional/security/smell · severity · REACHABILITY (normal flow / needs race / needs timing / needs flag / operator-only) · one-line scenario (steps → wrong result) · confidence (verified in code / plausible). No exploit detail — say what goes wrong, not how to abuse it.

## Report (your final message IS the report — markdown, no preamble). Write it to /tmp/canary-out/{BATCH}-{TIER}.md AND put the full report in your final message.
1. Per-file table: File | Lines | Label | Jini home / host contract | Tier (dossier → actual) | Reason.
2. Bugs (numbered, most severe first).
3. Duplicates (numbered).
4. Over-engineering (numbered) + total lines saved.
5. Dossier errors (one line each).
6. Cost: files read in full vs part, share of lines read, tool calls, and your TOTAL TOKENS (best estimate).
7. Three-line verdict on this batch.
