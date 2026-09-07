# `development/todos.md` de-stale reconciliation — 2026-09-06

Agent: CodeBase Analyzer(Execution). Branch: `restructure/apps-website-phased`.
Source file before: **1720 lines**.

Disposition policy applied per the dispatch:
1. verified-done -> delete outright; 2. CORRECTION+historical -> collapse to corrected truth;
3. verified non-reproducing -> delete; 4. verified open -> keep + tighten;
5. cannot settle cheaply -> keep verbatim, prefix `[UNVERIFIED 2026-09-06]`.

Written incrementally, pass by pass.

---

## Pass 1 — top-of-file dated entries (lines 24-301)

### Deleted outright (rule 1 — verified done)

| Entry | Evidence |
|---|---|
| `✅ DONE, 2026-08-29 — SonarQube set up in development/sonarqube/` | `ls development/sonarqube/` -> `README.md docker-compose.yml scan.sh sonar-project.properties` |
| `✅ FIXED 2026-08-30 — tovu serve never starts an agent daemon` | `apps/website/src/cli/commands/serve.ts:308` calls `startAssistantDaemon({...}, { registerProcessSignalHandlers: false })`; `apps/website/src/server/runtime/lifecycle/agent-daemon-port.ts` exists (7176 bytes). (Entry's own `serve.ts:178` line ref was already stale — the call is at :308.) |
| `✅ RESOLVED (2026-08-18) — Retrofit the assistant transport onto AG-UI + CopilotKit` | `ADS-memory/reports/architecture/ADR-059-assistant-transport-ag-ui-canary.md` exists; the entry's own last paragraph records the §12 cross-reference fix as already applied. |

### Rewritten

| Entry | Was | Now |
|---|---|---|
| `⚠️ RECURRING 2026-09-03 — Admin SSE connection-pool exhaustion ... fix sitting disabled` | claimed the C1 mkcert fix was disabled at `apps/admin/.certs.disabled/` | **FALSE.** `apps/admin/.certs*` does not exist at all; certs moved to the repo root (`apps/admin/vite.config.ts:49-53`) and `.certs/localhost.pem` + `.certs/localhost-key.pem` are present with no `.certs.disabled/`, so `vite.config.ts:67-73` enables HTTPS/2. Collapsed to the one genuinely-open residual: the 2026-08-18 ADR's unexplained "14 connections vs 3 tabs" anomaly (`ADS-memory/reports/2026-09-03-admin-sse-connection-exhaustion.md:206`). 9 lines -> 7. |
| `🎯 DIRECTION 2026-08-29 — Tovu-Runner becomes an EXTERNAL MCP SERVER` | 44 lines of open questions 1-5 + "pieces already exist" survey | Both directions now have ADRs: **ADR-060** (`runner-unified-operator-chat`) is `PROPOSED — requires owner sign-off` and **ADR-061** (`runner-tools-for-tovu-site-assistant`) is `ACCEPTED — signed off 2026-08-29` (`ADR-INDEX.md:63-64`). Collapsed to a pointer + the call-sites sizing caution. 44 -> 16 lines. |
| `✅ RESOLVED — Users/Roles/Policies + Plugins admin surface` | marked RESOLVED but its own body listed unfinished phases/gates | Header was wrong (not resolved). Retitled to the open remainder only. Verified: neither `005-plugin-system/pipeline-state.md` nor `006-identity-and-authorization/pipeline-state.md` records phases past Architecture Sign-Off; SPEC-006 row 19 reads `COMPLETE, status reverted to DRAFT`; ADR-PIPE-006/ADR-048 row 20 reads `PROPOSED`. 22 -> 14 lines. |
| `🔧 IN PROGRESS 2026-07-28 — finish SPEC-003 recertification` | 24 lines incl. a long coverage-gate debate that the entry itself then records as decided | Coverage-gate decision was made 2026-07-28 (owner) — superseded prose deleted. Kept the still-open part: `003-site-install-dir/pipeline-state.md`'s ledger ends at `Architecture Sign-Off | APPROVED | 2026-07-28` (21 lines total, no Code Inspection row). 24 -> 12 lines. |
| `⚠️ OWED — /audit-work + /code-inspection across this session AND the previous (uncommitted)` | "all still uncommitted and unreviewed" | **Premise false.** `git log --oneline --since=2026-07-28 --until=2026-08-05 \| wc -l` = **318** commits. A code+security review also ran: `ADS-memory/reports/audit/2026-08-02-03-sunday-monday-code-security-review.md`. Kept the real residual: `grep -E "^\| (Code Inspection\|Security\|TestRunner\|Programmer\|TDD)"` over all three `pipeline-state.md` files returns **zero** rows. 12 -> 7 lines. |
| `⚠️ OWED — specs/ADRs/tests for the 2026-08-05 embeds work` | CORRECTION block + "Historical text follows" + superseded prose | Rule 2 collapse. Correction independently re-verified: `apps/website/src/contracts/core/embeds/marker.ts` and `apps/website/src/features/widgets/html-embeds.ts` both exist; `grep -rn "data-widget-embed\|data-form-embed" apps/website/src/features/post` = **0 hits**, and the same pattern DOES match `apps/website/src/features/widgets/{html-embeds,resolver-service}.ts` (so the zero is real, not a silent-miss). ADR-047's gate confirmed still open at `ADR-INDEX.md:54` ("owes `/audit-work` before ACCEPTED"). 47 -> 23 lines. |

### New gaps discovered while verifying (NOT fixed)

- **7 ADRs exist on disk but have no row in `ADS-memory/reports/architecture/ADR-INDEX.md`**: ADR-053 (mcp-ui-confirmation-transport), ADR-055 (mcp-ui-return-path), ADR-056 (pages-vibecoding), ADR-057 (site-glue-tier), **ADR-059 (assistant-transport-ag-ui-canary)**, ADR-063 (admin-tab-deep-linking), ADR-064 (agent-guided-deployment). `grep -c "059" ADR-INDEX.md` = 0. The todos entry that was just deleted pointed at ADR-059 as the authority for a resolved decision, so the index is missing exactly the ADRs that recent work depends on.
- **ADR-047 is live in production code but never reached ACCEPTED** — the widgets/embeds implementation shipped (SPEC-043, commits `03a87816`/`285bbfc1`/`cf41bf14`) while `ADR-INDEX.md:54` still records "owes `/audit-work` before ACCEPTED".

---

## Pass 2 — Admin Section Spec Sweep + 2026-08-10 Commerce/Auth/Agent-Plugins slice

Rewrote the whole 17-row matrix down to remaining-work rows only. Verified each disposition:

### Rows dropped as done (rule 1)
- **Collections, User management, SEO, Redirects** — the matrix's own "What is still not done" column already read "No material admin-screen gap found" / an intentional exclusion. Left as a one-line "nothing outstanding" list rather than four table rows.
- **Comments** — the row's remaining item ("Remove the stale `soon` badge/unfinished copy in the panel registry") is **now false**. `apps/admin/src/panels.tsx:435-440` documents that `soon: true` on a panel rendering a real screen is a deliberate owner call, the only entry in the file shaped that way, made coherent by `soonPreviewable: true`. Removing the badge would now contradict a recorded decision.

### Rows corrected (claim was stale, section still has other open work)
- **Database / Storage** — "Wire the drift banner" is **done**: `SchemaStateWarningBanner` exists in `Database.tsx:32` with a dedicated test (`Database.unit.test.tsx:223`). Still open per `Database.tsx:40`: "the `PENDING_MIGRATION` boot banner and the Tier-3 browser have no route yet".
- **Media** — "Replace Images/Videos filter placeholders" is **done since 2026-08-24**: `Media.tsx:31-34` records that `AdminMedia.contentType` now drives `rules.ts`'s `filterMediaByTab`, "replacing the 'not wired up yet' placeholders those tabs used to render". Replaced with the real current gap from `Media.tsx:900-907`: the screen's file-input `accept` lists images only while `DEFAULT_ALLOWED_MIME_TYPES` accepts `video/mp4`+`video/webm` — an explicit pending owner decision.
- **Analytics** — the "stale 'in memory' copy" item is **done**: `Analytics.tsx:13-15` records the notice was corrected because the in-memory `LocalBufferSink` is only reachable under `TOVU_DB=memory`.

### Rows confirmed still open (kept, tightened with a source citation)
- **Newsletter** — `panels.tsx:984-989` renders `<Placeholder sectionId="newsletter">`; no `apps/admin/src/features/newsletter/` directory exists.
- **Forms** — SPEC-010 / ADR-PIPE-010 have **zero** hits in `ADR-INDEX.md`, while the same ids DO match `ADS-memory/specs/043-widgets/feature.spec.md:464` (so the zero is real, not a silent-miss).
- **Settings** — "Five of 13 tabs" is exactly right: `SettingsUi.tsx` declares 13 tab ids and contains 5 `settings-ui-inert-wrap` occurrences.
- **Menus** — drag-and-drop still absent: `grep -i "draggable|dragstart|dnd" apps/admin/src/features/menus/` returns nothing.
- Categories & Tags, Roles & Permissions, Members, Integrations/API, Backups/Recovery — kept verbatim; not cheaply falsifiable from source alone, and each names concrete unbuilt controls.

### Commerce/Auth/Agent-Plugins checklist
- Deleted all 5 `[x]` items (done by their own marking; git history keeps them).
- **Kept 3 `[ ]` items**, each confirmed against `panels.tsx`: commerce (`payments`/`orders`/`products`/`subscriptions`/`billing` all `soon: true`), authentication (`soon: true`), Agent Plugin Marketplace (`plugins-marketplace` `soon: true` + `Placeholder`).
- **Closed 3 `[ ]` items** that source contradicts:
  - "Build the Agent Plugin loader/installer, validation, trust/permission review, lifecycle, sandboxing, execution boundaries" — `apps/website/src/features/agent-plugins/` ships `install.ts` (205: `installAgentPlugin`), `install-from-url.ts` (72), `capability-projection.ts`, `tool-registrations.ts` (380). `install.ts:5-32` documents hardened extraction (zip-slip, symlink refusal, decompression bombs) and records that *no plugin code is executed at all in v1* — so "sandboxing/execution boundaries" is a deliberate non-goal, not a gap.
  - "Extend the Tovu daemon attachment contract beyond `image/*`" — done. `AssistantDock.tsx:567-584`: `attachmentAccept` deliberately removed, `agent-daemon-server.ts`'s non-image filter deleted, upload path kind-agnostic end to end.
  - "Replace the bounded source catalog with real installed/enabled inventories" — moot. `tool-catalog-composer-source.ts:10-25`: the source was deliberately unwired by owner decision 2026-08-21.
- Folded the standalone "Coverage-gap note (2026-07-07 audit-of-parity)" paragraph into the sweep's own "still separately wanted" blockquote — same subject, was duplicated.

