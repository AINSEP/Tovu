# S4b. Fix every guide mention, pin the named tools, switch the lint to strict (C1b, mechanism M2)

Repo: Tovu (and the Jini texts S4a listed, as a Jini part first). Estimate: 220k Sonnet.
Prerequisites: S4a merged with `candidates.unclassified` empty and the fit result reviewed.
Blocking decision: none.
Branching decision: **OD-7** (applies only when S4a reported that the named set does not fit. While OPEN and it
does not fit: STOP under §4.14 before any edit. When it fits, OD-7 does not apply).
Landed check: `test -f development/parity/tool-guides.json && node -e "const j=require('./development/parity/tool-guides.json'); process.exit(j.candidates.unclassified.length?1:0)"`.

## Lane check before editing (judge finding 17)
The files this sheet edits are whatever S4a listed. Before the first edit, for every listed Tovu path run
`git ls-files --error-unmatch <path>`; a path that is gone was moved by another lane (lanes K, T): find the text with
`rg` at its new place and say so. Theme tool files are owned by lane T (T-TH-08); this sheet lands **before** T-TH-08
(INDEX §3) and reports every theme file it touched so that lane's `*.files.tsv` blobs can be refreshed.

## Read first
`development/parity/tool-guides.json`, `../DESIGN.md` M2,
`rg -n "startupToolIds" apps/website/src/server/inbound/assistant/agent-daemon-scope.ts`, Jini `core/src/tool-call-text.ts`.

## Characterization (passes today)
`agent-daemon-server.typed-tools.integration.test.ts` (or a sibling): the startup list begins with the four theme file tools. Pin the first 10 ids.

## Red-first
1. `npm run check:tool-guides -- --strict` fails today; paste its output.
2. New `startup-tool-order.unit.test.ts`: every registered id in `tool-guides.json.named` comes before every unnamed
   id, and the four theme file tools follow the named set (fails: order is theme-first only).
3. For each `unknownCall`, a test at the owning feature asserting the corrected text exactly (one test per message).

## Change (one gated commit per numbered item; item 2 one commit per feature folder)
1. Extract the ordering into `apps/website/src/assistant/startup-tool-order.ts` (pure: `{ visibleIds, namedIds }` →
   ordered ids). `namedIds` comes from a generated, committed module written by `check-tool-guides.ts --write-pins`.
   The scope file loses lines.
2. Fix each `unknownCall`: the real id, or reword without a tool name. Never edit application code (SQL, helpers) to
   satisfy the lint: a false finding is fixed in the scanner with a new negative fixture, in its own commit.
3. A mention that cannot be pinned (OD-7 overflow only): `toolCallText({ toolId }, {})` (gateway form).
4. Call-form mentions of pinned tools stay as written; they are now true.
5. Make the check strict in `package.json` and add it to the script that runs the other `check:*` gates.
6. Every test from S4a's "reads guide text" list changes in the same commit as the text it reads. Do not regenerate
   search-eval fixtures unless a description changed; if one did, say which.

## Acceptance
- `npm run check:tool-guides -- --strict` exits 0. `unknownCalls` is empty. Fit margin printed.
- A wire test lists the MCP tools for a run and finds **every** named, registered, visible id in `tools/list` under
  its **wire name** (take the name from the exposure, as S3 does).
- Removing one named id from the pins makes the strict check fail (prove once, restore, paste).
- Gate green; every changed sentence listed old → new.
