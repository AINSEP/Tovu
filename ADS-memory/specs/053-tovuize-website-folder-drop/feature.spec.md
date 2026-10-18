# Feature Spec: tovuize-website-folder-drop

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/feature.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-053 |
| version | 1.0.0 |
| status | APPROVED |
| content_hash | sha256:7dd48cc27c0fbf8a55ef9203796b00442fa7d1349aac86a774015d34e583be70 |
| feature_name | FEAT-053-tovuize-website-folder-drop |
| last_edited | 2026-10-17T00:00:00Z |
| owner | Leona Burime |
| spec_agent | Spec Agent (s10-plugin-specs) |
| spec_mode | brownfield |

---

## Owner decision — 2026-10-17

This amendment supersedes the retired-plugin, manual-binary-copy and theme-vs-Page inference
wording in the original SPEC-053 package. Only feature.spec.md and traceability.spec.md change
in this round; recorded hashes/version remain historical and have not been regenerated.
Other package files are not current authority where they conflict with this decision.

Tovuize lives in the existing `tovu-theme` (Tovu Theme) agent plugin. The in-app assistant asks
one `assistant_ask_choice` checkbox card before conversion. Default: images into Media and
real editable Tovu Pages with matching theme shells. The unchecked `static` opt-out keeps the
same appearance as a static theme without individual page editing. No new composer modal,
plugin-enabling question, second scope question or second activation approval.

## Overview

Drop a static website folder onto desktop admin chat, read it through the owner's existing
custom root, then convert using the submitted choice. Source files remain unchanged.

## Problem Statement

The folder-drop and guarded-read mechanisms already exist. Tovu Theme's former theme-only
instructions left content uneditable, and local fonts/icons had no theme binary importer.
Reuse Media, Pages, Jini's guarded reader and the URL theme importer's validation/persistence
to close those gaps without another workflow service or Jini API.

---

## User Journey

**Trigger:** The user has a website they built (or downloaded) sitting in a folder on their computer and wants Tovu to turn it into a theme or a Page, without typing its full path.

**Steps:**
1. The user drops a folder onto desktop admin chat; its path is inserted and the existing custom-root validation selects it.
2. Tovu Theme asks one checkbox card: “How should I convert this website?” Default copy explains Media + editable Tovu Pages; the optional static choice is unchecked.
3. Only `submitted: true` proceeds: `selections: []` selects editable Pages; `["static"]` selects static theme. Cancellation, expiry or ambiguous free text stops conversion.
4. Survey the read-only source and layout families. Editable: import images into Media, build matching family shells/partials/styles, create Page drafts, then write inner HTML with stable editable-region handles using the shared site-import content-mapping reference directly.
5. Static: preserve the existing faithful static conversion and publishedPages/rescan path; create no CMS Page rows. Both branches import local theme fonts/icons through theme_import_local_file and use existing Media import for video.
6. Resolve homepage/slug collisions reversibly and report moved entries. Activate the finished theme before assigning custom Page template filenames. Verify rendered pages at desktop/mobile sizes and publish locally for usability; explicit draft/preview requests prevail.

**Outcome:** The converted site preserves its appearance and is editable page by page by default;
the submitted opt-out keeps it static. Report actual imports, publication, incomplete pages and refused assets.

**Alternate paths:**
- The dropped path no longer exists or is not a directory by the time it's used: the custom-root set fails visibly (existing validation), and the agent tells the user rather than silently reading nothing.
- The user drops a second, different folder later in the same conversation: the `custom` root moves to the new folder; the old one is no longer readable through it.
- The folder contains files the denylist refuses (e.g., a `.env`, a `.db` file, anything under a `secrets` folder): those files are silently excluded from listings and refused on direct read, exactly as the existing generic tool already behaves — no plugin-specific exception is introduced.
- The user is on the browser-based admin (not desktop): folder drop cannot recover a real filesystem path there at all (see EC-05); this feature does not change that.

Note: the submitted choice above supersedes behavior.spec.md’s old conversion-target inference. Its most-recent-drop-wins custom-root rule remains applicable.

---

## Scope

**In scope:**
- Existing desktop admin folder drop, root validation and read-only fs-files mechanisms.
- Tovu Theme's one submitted choice, editable default and explicit static branch.
- Direct reuse/extension of site-import's content-mapping reference for local sources, Media paths and Page writes.
- Local theme binary adapter in the existing theme-import-file contributor, sharing guarded roots, byte/type/extension validation, atomic persistence, write gates and reload with existing owners.
- Discovery metadata, existing items[] batch support, plugin version bump retaining its id, and focused unit-test extensions.

**Out of scope:**
- New filesystem primitives, Jini API changes, composer modal or workflow service.
- Browser folder-path recovery, source-framework builds or backend migration.
- Editing content-addressed installed plugin copies.
- Test execution/typechecks/builds/server restarts/commits during this implementation round.
- New integration tests, live assistant evaluations, other spec edits or hash regeneration this round.

---

## Requirements

- REQ-01: When a user drops a folder onto the desktop chat composer, the system MUST insert the folder's absolute path as text into the composer, and MUST NOT attach the folder's individual files as chat attachments. *(Already implemented; restated here as a regression-guarding requirement for this feature.)*
- REQ-02: When a user drops a folder onto the desktop chat composer, the system MUST also set that folder's absolute path as the active workspace's `custom` filesystem root, so that a subsequent `fs_list_files`/`fs_read_file` call with `root: "custom"` resolves to it without any separate manual step.
- REQ-03: This feature MUST reuse the existing `fs_list_files`/`fs_read_file` denylist, `node_modules`/`.git`/build-output listing exclusions, and per-file size cap unmodified; it MUST NOT introduce a new or parallel filesystem-access mechanism.
- REQ-04: Setting the `custom` root from a drop event MUST go through the same validation the existing manual path uses (absolute, exists, is a directory) — a drop naming a path that fails this validation MUST surface a visible error, not a silent no-op.
- REQ-05: Dropping a new folder MUST replace the workspace's previously set `custom` root; at most one `custom` root MUST be active per workspace at a time.
- REQ-06: Tovuize MUST use the existing Tovu Theme plugin and ask exactly one existing assistant_ask_choice checkbox card up front, with an unchecked static opt-out. Only submitted:true proceeds; [] means editable, ["static"] means static. Cancellation, expiry, an absent answer or ambiguous free text MUST stop conversion.
- REQ-07: The default branch MUST import source images into Media and create/update real editable Tovu Pages via content_post_create and pages_write_html, with inner-only HTML and stable region handles. It MUST reuse the shared site-import content-mapping reference directly, preserve source layout families through matching theme shells with content markers, and activate the theme before assigning custom template filenames. The static branch MUST create no CMS Page rows.
- REQ-08: Supported local images/video MUST use media_import_local_file; local theme fonts/icons/images MUST use theme_import_local_file in the existing contributor. Both theme source adapters MUST share type/extension validation and bounded atomic persistence, theme.edit permission, write gates and reload. The local tool MUST use existing guarded roots/deny rules and items[] batching. Refused or unsupported assets MUST be reported with source/destination paths and errors, never fabricated or silently omitted.
- REQ-09: No tool exercised by this feature MUST write into the dropped source folder — it is read-only for the duration of the conversion; all writes go through the existing theme, Media or Page storage owners, which are already scoped to the active site's own data.
- REQ-10: The system MUST NOT widen the closed `root` enum (`repo`/`site`/`custom`) that `fs_list_files`/`fs_read_file` accept — this feature's wiring only changes what directory `custom` resolves to, never the set of valid root values a tool call may request.

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given a folder is dropped onto the desktop chat composer, when the drop is handled, then the composer's text contains the folder's absolute path and no per-file attachment upload is triggered for that drop.
- AC-02 (REQ-02) [P1]: Given a folder is dropped onto the desktop chat composer, when the agent subsequently calls `fs_list_files` with `root: "custom"`, then it returns the dropped folder's contents without any prior manual custom-root-setting step in the same conversation.
- AC-03 (REQ-03) [P1]: Given the dropped folder contains a `node_modules` directory, a `.git` directory, and a `.env` file, when `fs_list_files` lists it, then `node_modules` and `.git` are excluded from the listing for readability and `.env` is excluded because it is denylisted — using the existing, unmodified rules.
- AC-04 (REQ-04) [P1]: Given a dropped path that does not exist or is not a directory, when the drop handler attempts to set it as the `custom` root, then the attempt fails and the user is shown a clear error rather than the root silently remaining unset with no explanation.
- AC-05 (REQ-05) [P1]: Given a `custom` root is already set from an earlier drop in the same conversation, when a second, different folder is dropped, then subsequent `fs_list_files(root:"custom")` calls resolve to the second folder, not the first.
- AC-06 (REQ-06) [P1]: Given a folder conversion request, when Tovu Theme starts, then it asks one unchecked static opt-out card; unchecked submission returns submitted:true with [] and selects editable Pages; checked selects static; no answer stops conversion without another scope or activation question.
- AC-07 (REQ-07) [P1]: Given the default submission, when conversion completes, then images have Media URLs and Pages have inner HTML with stable editable regions and matching family templates; given static opt-out, then no CMS Page rows are created.
- AC-08 (REQ-08) [P1]: Given local font/icon bytes in an allowed root, when imported, then bytes land unchanged in the theme and reload status is returned; denied/escaping/symlink-escape paths, permission refusal, oversize/type mismatch write nothing; a failing batch item does not prevent later valid items. The report names every unsupported/refused asset.
- AC-09 (REQ-09) [P1]: Given a conversion is in progress, when the dropped source folder is inspected afterward, then none of its files have been modified — all writes landed in the site's own theme or Page storage instead.
- AC-10 (REQ-10) [P1]: Given any tool call this feature exercises, when its `root` argument is inspected, then it is always one of `repo`, `site`, or `custom` — never a new value introduced by this feature.

---

## Invariants

- INV-01: The dropped source folder must never be written to by any tool this feature exercises.
- INV-02: At most one `custom` filesystem root must ever be active for a given workspace at one time.
- INV-03: A file matching the existing `fs-files` denylist must never be returned by `fs_list_files` or `fs_read_file`, regardless of which root (`repo`, `site`, or `custom`) is used to reach it.
- INV-04: A folder drop on the desktop chat composer must never result in the folder's individual files being uploaded as chat attachments.
- INV-05: A theme or Page produced by this feature's guidance must never contain code that Tovu's own theme/Page write tools did not write — no plugin-specific bypass of the existing write path.

---

## Edge Cases

- EC-01: What happens when the user drops a folder that is empty? Expected behavior: `fs_list_files` returns an empty result (already the existing tool's documented behavior for a root that exists but has nothing in it); the agent tells the user the folder appears empty rather than treating it as an error.
- EC-02: What happens when the user drops a file, not a folder? Expected behavior: the existing folder-vs-file detection (`folderPathsFromDataTransfer`: `@jini-ai/ui`'s `features/folder-path-drop/rules.ts` for the admin chat, `apps/desktop/src/renderer/folder-drop.ts` for the desktop chat) does not treat it as a folder drop; it goes through the normal chat-attachment upload path unchanged (REQ-01 only applies to folder drops).
- EC-03: What happens when the dropped folder is extremely large (tens of thousands of files, e.g., an unpruned `node_modules`-heavy project)? Expected behavior: listing exclusions already keep `node_modules`/`.git`/build output out of the walk; if the remaining file count is still large, the existing tool's own limits (e.g., a maximum listed-files cap) apply unmodified — this feature does not add a separate, folder-drop-specific limit.
- EC-04: What happens when the user drops a second folder mid-conversion, before the first conversion finishes? Expected behavior: per REQ-05/INV-02, the `custom` root moves to the new folder; any in-flight `fs_read_file` calls already issued for the first folder are unaffected (they addressed absolute paths already resolved), but new `root:"custom"` calls resolve to the second folder — this is a genuine behavior seam the user should be warned about, see Open Questions.
- EC-05: What happens when a folder is dropped onto the browser-based (non-desktop) admin chat? Expected behavior: a plain browser cannot recover a dropped folder's real filesystem path (`webUtils.getPathForFile` is an Electron-only, main-process-bridged API) — this feature does not change or fix that; it is documented here as a known platform limitation, not silently glossed over.
- EC-06: Existing homepage/slug collisions: move unrelated entries reversibly to free slugs using current expectedVersion, report moves, never overwrite/trash them. A version conflict preserves the concurrent edit. Published CMS entries must not silently hide the converted static pages.
- EC-07: Ambiguous intent or free text: the single submitted checkbox card determines conversion mode. Do not infer consent or introduce another scope question; cancelled/expired/unsubmitted results stop conversion.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| `@jini-ai/ui` `features/folder-path-drop` (admin chat, through `apps/admin/src/features/fs-files/hooks/use-folder-drop.hooks.ts`; Jini `59acc4db`); `apps/desktop/src/renderer/folder-drop.ts` + `use-workspace-chat-pane.hooks.ts`'s `captureFolderDrop` (desktop chat) | Existing, already-shipped folder-path insertion on drop | A regression reintroduces per-file attachment on folder drop | None — this is treated as a P1 regression, covered by AC-01 |
| `apps/website/src/features/fs-files/*` (`agent-tools.ts`, `fs-files.ts`, `layout.ts`, `custom-root-store.ts`) | The sandboxed `fs_list_files`/`fs_read_file` tools and the `custom` root mechanism this feature wires into | Denylist or size-cap logic regresses | None — this feature adds no independent safety net; it depends entirely on this existing one |
| `PUT /api/admin/v1/workspaces/:workspaceId/fs-files/custom-root` (existing admin route) | The endpoint the drop handler calls to set the `custom` root | Endpoint unreachable from the desktop app's local server | Drop still inserts the path as text (REQ-01 still holds); only the auto-wiring (REQ-02) degrades, with a visible error per REQ-04 |
| `content/agent-plugins/tovu-theme/` (existing plugin skill) | The conversion instructions, choice and worked example | Plugin content becomes unavailable or corrupted | Agent falls back to explaining it cannot convert the site right now — no silent partial conversion |
| `apps/website/src/features/pages/*` (existing Pages agent tools, `HtmlDocumentStore`) | The write path for editable Pages | Write conflict or store unavailable | Existing Pages tool error handling applies unmodified; no plugin-specific fallback |

---

## Open Questions

- OQ-01: Should the desktop drop handler ask for confirmation before overwriting an already-set `custom` root (EC-04), or is silent replacement acceptable given the root is scoped to one workspace and one conversation? Recommended default applied in this spec: silent replacement (REQ-05), since the existing manual custom-root UI already behaves this way and a confirmation dialog would interrupt the exact "don't make me do an extra step" outcome this feature exists to deliver. — Owner: Leona Burime — Resolve by: 2026-09-20
- OQ-02: RESOLVED by owner 2026-10-17: Tovuize is in Tovu Theme; no separate retired-plugin enablement question.
- OQ-03: RESOLVED by owner 2026-10-17: supported binaries use existing local Media import and the shared local theme importer. Report actual refusals; manual copy is no longer the default path.
- OQ-04: Should the browser (non-desktop) admin chat get its own, different folder-drop affordance (e.g., a native multi-file picker with a warning that it uploads contents, not a path), or should it explicitly refuse folder drops with an explanatory message instead of today's undocumented behavior? Recommended default applied in this spec: out of scope for this feature (see Scope); document the limitation (EC-05) and leave current behavior unchanged until a follow-up decides. — Owner: Leona Burime — Resolve by: 2026-10-01

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Reuses the existing `fs_list_files`/`fs_read_file` tools, the existing `custom-root-store`, the existing `tovu-theme` plugin, and the existing Pages tools; no new library or protocol is introduced. |
| II — Test-First | EXCEPTION | Owner directs focused test extensions without execution in this round. |
| III — Simplicity Gate | COMPLIES | The choice, two conversion branches and thin local adapter trace to REQ-01 through REQ-10. |
| IV — Anti-Abstraction Gate | COMPLIES | No new abstraction layer; the drop handler calls the existing custom-root endpoint directly. |
| V — Integration-First Testing | COMPLIES | Every P1 AC is stated as an observable integration-level behavior (composer text, tool call results, file-system state) rather than an implementation detail. |
| VI — Security-by-Default | COMPLIES | REQ-03/REQ-09/REQ-10 and INV-01–INV-03 explicitly forbid introducing any new or widened filesystem access; Security Agent review is still required before merge per this article's own rule. |
| VII — Spec Integrity | EXCEPTION | Owner limits edits to two spec files and forbids hash regeneration; header hash is historical. |
| VIII — Observability | COMPLIES | REQ-04 requires a visible error rather than a silent no-op when custom-root validation fails. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique
- [x] version set to correct semver
- [x] status set to APPROVED (not DRAFT or REVIEW)
- [ ] Amendment hashes intentionally not regenerated, per owner instruction
- [x] feature_name matches the FEAT folder name exactly
- [x] Zero `[NEEDS CLARIFICATION]` markers remain in this file
- [x] All Open Questions have an owner and a resolution target date
- [x] All REQ-* items are testable and contain no vague qualifiers
- [x] All REQ-* items have at least one AC
- [x] All AC items have a [P1], [P2], or [P3] priority tag
- [x] All AC items follow Given/When/Then format
- [x] All Invariants are written as absolute, falsifiable statements
- [x] All Edge Cases have an explicit Expected Behavior
- [x] Dependencies table is complete — no blank failure mode or fallback cells
- [x] Constitution Compliance table complete — all 8 articles marked COMPLIES / EXCEPTION / N/A
- [x] Scope: in-scope list present and non-empty
- [x] Problem Statement: "Why now" field is filled
- [x] User Journey: trigger, steps, outcome, and alternate paths are present
- [x] Scope: out-of-scope list present and non-empty
- [x] Full spec-system package present: all `PRESENT` files listed in spec-manifest.md exist
- [x] behavior.spec.md complete (feature has non-trivial precedence/replacement rules: theme-vs-Page routing, most-recent-drop-wins for `custom` root)
- [x] traceability.spec.md complete (pending implementation — rows marked "pending")
- [x] spec-manifest.md complete — all 10 logical files listed with `PRESENT` or `OMITTED` and concrete reasons
- [x] spec-dod.md filled and all items PASS or NA with concrete justification
- [x] spec-dod.md Spec Agent sign-off row completed; Coordinator row reserved for Coordinator Planning Preflight
- [x] spec_mode is `brownfield`; brownfield evidence paths are recorded in `spec-manifest.md`

**Gate result:** Historical PASS; 2026-10-17 amendment not re-certified or executed.

---

## Agent Directives (optional)

Always:
- Keep source folders read-only; reuse existing roots and deny rules.
- Ask the one up-front choice and honor only its submitted answer.
- Reuse Media, Pages, theme tools and shared content mapping; report failed imports and reversible slug moves.
- Honor explicit draft/preview requests.

Never:
- Ask another plugin-enabling, scope or activation question in this conversion flow.
- Fabricate missing assets, bypass write gates or widen repo/site/custom roots.
