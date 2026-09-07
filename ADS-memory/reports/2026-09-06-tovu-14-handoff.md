# Handoff — session tovu-14, 2026-09-06/07

## RUNNING RIGHT NOW (4 Fable 5.1 auditors, read-only)
Scope `4b89cd09..HEAD`, 242 commits, all 2026-09-06. Each writes ONE report and commits only that file:
- `ADS-memory/reports/2026-09-06-fable-audit-bugs.md`
- `ADS-memory/reports/2026-09-06-fable-audit-security.md`
- `ADS-memory/reports/2026-09-06-fable-audit-architecture.md`
- `ADS-memory/reports/2026-09-06-fable-audit-tests.md`

If they finished, READ THOSE FILES FIRST — they are the current state, not this handoff.
Caveat given to Leona: model = Fable 5.1, but reasoning effort is NOT settable via the subagent
tool. She asked for xhigh; that needs a local CLI run she drives.
All four were told: account for all 242 commits (read or explicitly skipped with a reason), and
separate CONFIRMED from PLAUSIBLE. The prior Sep 1-3 audit skipped ~150 of 292 silently.

## SHIPPED TONIGHT — 12 agents, every claim verified by me against source/git/db
- `media_import_from_url` (`b1ce2d0a` `dd187ece` `a346b3ec` `24bdafc1`) — the original task. Proven
  LIVE: assistant found it unprompted via its own search_tools query, ranked #1 (31.2). Stored blob
  byte-identical to source. Required making `platform/http`'s `HttpResponse` byte-capable
  (`bodyBytes`/`bodyTruncated`) because `bodyText` is a lossy UTF-8 decode.
- `8e973578` workspace-deletion identity guard. The bug was REAL: `workspace.manage` alone could
  delete the server's own workspace by minting a decoy. A green test (AC-06c) asserted the exploit
  as acceptance criteria.
- Jini `434d781e`/`be29a436` identity seed idempotency + built. Ctrl-C during first `tovu serve`
  bricked a site permanently. Boot-4 proof: bricked install self-heals.
- `0d9e41d5`/`37ac1943` MCP refusals now reach operator AND model.
- `b2a46c7e` `65b8fd74` `c201d948` `f02ac28e` desktop registry: dismissals, boot scan, Rescan.
- Runner `e82bd39`/`7e720fb` on branch `restructure/tovu-runner-manifest-fix`.
- `e56965a6` tsc 31->0 (apps/admin), `4ede4562` 2->0 (e2e). I re-ran both: exit 0.
- `570e5822` `--db` off the live db. `0ea4f887` three clobbered subjects. `68ce4909` HTML-Pages
  symptom REFUTED. `fa70c175` media-seed WAS deployed. `b27cdba4` Leona's MenuEditor.
- `fb5ad748` `b06b4ec7` `0bfd3430` todos/provenance records.

## AWAITING LEONA'S DECISION
1. 6 untracked seed blobs (`00b3ca18` `535a1194` `6f69b29e` `c0d50d1c` `d56763e9` `d63c2247`) —
   seed has 16 asset_blobs rows, 6 have bytes only as untracked files. A clone ships rows with no
   bytes. Fix: commit them, re-run seed:site, make the guard check git not the filesystem.
2. 4 orphaned Runner launchers in `~/Library/Application Support/tovu-runner/mcp-bridge/`
   (`66c28818` `6f5c1c7b` `71ba421f` `ca82d87c`) — each bakes a LIVE bearer token. Mode 0700.
3. Uncommitted Jini `packages/cms/package.json` version bump 0.3.1 -> 0.3.4 (not ours).
4. `generate_image_batch` not in the Higgsfield allowlist — deliberate, needs a ruling.
5. Trashed dup media row `4aa84d3d` — purge or restore.
6. FREE TEST, not run: `gemini-3.1-flash-image-preview` may already generate with the existing
   GEMINI_API_KEY (no OPENAI_API_KEY here, so default gpt-image-2 fails). One prompt settles
   whether she needs to buy a key.

## TOP UNDISPATCHED WORK
- Tool refusals reach the model as bare `INTERNAL_ERROR` (observed live: an SSRF loopback block
  looked like a crash and fooled Leona). Second invisibility bug, unowned.
- todos L1554 `content/themes/` vs `sites/` drift — an upgrade/reinstall SILENTLY deletes the
  nested menu (tracked nav.html lacks `"variant":"tree"`). basic-only, so IN scope.
- todos L1713 assistant dock corrupts Visitor's AI Assistant form; Save left enabled over a bad
  value, can overwrite a good stored key.
- f6 C8: cannot author HTML into a NEW Page (`rules.ts:196`). C10: `updatePost` has no
  optimistic concurrency, silent clobber.
- Footer: all 8 menu items are raw URLs, so the availability filter cannot protect them.
- `template-preview.ts:194` bypasses the page-shell fallback.
- Owed process gates: SPEC-006 reverted to DRAFT + ADR-048 still PROPOSED (api_keys NOT cleared to
  build); SPEC-003 `/code-inspection` never ran; no Code Inspection/Security row in any of
  SPEC-003/005/006's pipeline-state ledgers.

## PARKED AT HER INSTRUCTION
Sep 1-3 Fable re-run. Deploy (831 commits stacked; nothing technical blocks it).
Only the `basic` theme matters — other themes explicitly out of scope (`fb5ad748`).

## STANDING TRAPS THAT COST REAL TIME TONIGHT
- Commit trailers misattribute the MODEL. See
  `ADS-memory/reports/2026-09-06-commit-trailers-misattribute-the-model.md`.
- A4 (attachment wipe) is STALE — `agent-daemon-server.ts:1209` passes `retainAcrossRestarts: true`.
- Three of twelve agents were handed a FALSE premise and caught it by verifying. Do not trust an
  inherited premise; only implementations get tested, premises get repeated.
