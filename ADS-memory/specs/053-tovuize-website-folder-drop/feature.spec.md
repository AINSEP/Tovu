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
| last_edited | 2026-09-13T00:00:00Z |
| owner | Leona Burime |
| spec_agent | Spec Agent (s10-plugin-specs) |
| spec_mode | brownfield |

---

## Overview

Lets a user drop a folder containing a website they already built onto the desktop chat, have the agent read it safely, and turn it into a Tovu theme (for a whole multi-page site) or a single Page (for one bespoke page) — without hand-typing the folder path and without any new filesystem-access or write mechanism.

---

## Problem Statement

**Current state:** Two of the three pieces this feature needs already exist in the codebase but are not connected end to end, and the third exists but is effectively undiscoverable:
1. Dropping a folder onto the desktop chat composer already inserts the folder's absolute path as text (`apps/desktop/src/renderer/folder-drop.ts`, wired in `apps/desktop/src/renderer/App.tsx:1076-1111`) instead of attaching every file inside it — this part is done.
2. A general-purpose, already-sandboxed "read this folder" agent tool already exists (`fs_list_files`/`fs_read_file` with `root: "custom"`, `apps/website/src/features/fs-files/*`) — but it only works once an operator has set the `custom` root via an **admin-HTTP route** (`PUT /api/admin/v1/workspaces/:workspaceId/fs-files/custom-root`) driven by an **admin-only** UI component (`FsFolderIndicator`) that the desktop chat surface does not use at all. So today, dropping a folder in desktop chat inserts the path as text, but the agent's very next `fs_list_files(root:"custom")` call fails, because nothing set the `custom` root — the two halves were built independently and never wired together.
3. A working "convert a static site into a Tovu theme" agent-plugin skill already exists (`content/agent-plugins/tovuize-site/`, proven against a real site per its own worked example) — but every bundled plugin, including this one, ships **inactive by default** (`{enabled:false, origin:"bundled"}`, `apps/website/src/features/agent-plugins/seed-bundled.ts`), by deliberate, product-wide design. The owner's own worklist (`ADS-memory/.local-artifacts/owner-worklist.md` §3, item 15) independently records "not among the installed plugins... if it doesn't exist, it needs building" — the plugin exists, but nothing today makes an operator aware it does.

**Desired state:** A user can drop a folder of an existing website onto the desktop chat, have the agent immediately able to read inside it (no separate "set the folder" step), and ask the agent to turn it into a Tovu theme or into one bespoke Page — with the agent proactively mentioning the existing conversion plugin rather than the user needing to already know it exists or ask for it by name.

**Why now:** Owner's own words, worklist item 3: *"i still cant drop a folder path to chat input so the agent can look inside it. i just adds all the files in the folder. the use case is...I want to make a website i created into a tovu theme or Pages and dont wanna handtype the full url on my computer."* No hard deadline; flagged alongside the Supabase plugin as needing a design/decision pass before implementation spend.

**Success signal:** A user can drop a folder of an existing static website onto the desktop chat and, within the same conversation, have the agent list and read its files without any manual setup step, then produce either a working Tovu theme or a Page from it.

---

## User Journey

**Trigger:** The user has a website they built (or downloaded) sitting in a folder on their computer and wants Tovu to turn it into a theme or a Page, without typing its full path.

**Steps:**
1. The user drags the folder onto the desktop app's chat composer.
2. The composer inserts the folder's absolute path as text (already implemented) **and** the drop handler sets that path as the workspace's `custom` filesystem root (the gap this feature closes), so the agent can read inside it immediately.
3. The user asks the agent to turn the folder into a Tovu theme, or into a Page — or simply says what they want ("make this my new homepage") and lets the agent infer which.
4. If the target is a whole reusable site, the agent uses the existing `tovuize-site` plugin skill (proactively surfacing/enabling it if the user has not heard of it) to read the folder (via `fs_list_files`/`fs_read_file`, `root: "custom"`) and produce a `static`-tier Tovu theme package.
5. If the target is one bespoke page, the agent extracts only that page's inner body markup (no `<html>`/`<head>`/nav/footer) and creates or updates a Page through the existing Pages agent tools.
6. If the source folder contains binary assets (images, fonts, video) the agent's text-only file tools cannot move, the agent says so explicitly and tells the user which files need to be copied by hand.

**Outcome:** The user has either a new Tovu theme or a new Page derived from their existing website, without ever typing the folder's path or manually flipping on a plugin or a custom root.

**Alternate paths:**
- The dropped path no longer exists or is not a directory by the time it's used: the custom-root set fails visibly (existing validation), and the agent tells the user rather than silently reading nothing.
- The user drops a second, different folder later in the same conversation: the `custom` root moves to the new folder; the old one is no longer readable through it.
- The folder contains files the denylist refuses (e.g., a `.env`, a `.db` file, anything under a `secrets` folder): those files are silently excluded from listings and refused on direct read, exactly as the existing generic tool already behaves — no plugin-specific exception is introduced.
- The user is on the browser-based admin (not desktop): folder drop cannot recover a real filesystem path there at all (see EC-05); this feature does not change that.

Note: precedence between a theme-shaped and a Page-shaped conversion, and the "most recent drop wins" rule for the `custom` root, are detailed in `behavior.spec.md`.

---

## Scope

**In scope:**
- Wiring the desktop chat's existing folder-drop-to-path handler (`apps/desktop/src/renderer/App.tsx`'s `onDropCapture`) to also call the existing `PUT /api/admin/v1/workspaces/:workspaceId/fs-files/custom-root` endpoint with the dropped absolute path.
- Confirming/documenting that the existing `fs_list_files`/`fs_read_file` denylist, `node_modules`/`.git`/build-output listing exclusions, and per-file size cap (`apps/website/src/features/fs-files/fs-files.ts`) already satisfy the "safe, scoped folder read" requirement — no new tool or sandboxing mechanism.
- New guidance content (SKILL.md additions or a small companion skill) teaching the agent to proactively mention and, if needed, walk the user through enabling the existing `tovuize-site` plugin when the user's intent matches its use case.
- New guidance content for the "convert to one Page, not a whole theme" path, reusing the existing Pages agent tools and `HtmlDocumentStore` write path unmodified.
- Explicit, user-facing handling of binary assets the text-only file tools cannot move.

**Out of scope:**
- Rebuilding `fs_list_files`/`fs_read_file`, the folder-drop-to-path renderer logic, or the `tovuize-site` theme-conversion logic itself — all three already exist and are reused as-is.
- Changing the product-wide "bundled plugins ship inactive by default" security posture — this feature makes the existing plugin discoverable within a conversation, it does not flip its default.
- Fixing the Plugins admin page's file-tree modal or general discoverability UI — that is worklist item 12.2, already in flight as a separate task (`o4-plugins-files`).
- Building a binary-file copy/upload tool — flagged as a follow-up decision (OQ-03), not built here.
- Any change to the browser (non-desktop) admin's chat drop behavior beyond documenting its current limitation (EC-05, OQ-04).

---

## Requirements

- REQ-01: When a user drops a folder onto the desktop chat composer, the system MUST insert the folder's absolute path as text into the composer, and MUST NOT attach the folder's individual files as chat attachments. *(Already implemented; restated here as a regression-guarding requirement for this feature.)*
- REQ-02: When a user drops a folder onto the desktop chat composer, the system MUST also set that folder's absolute path as the active workspace's `custom` filesystem root, so that a subsequent `fs_list_files`/`fs_read_file` call with `root: "custom"` resolves to it without any separate manual step.
- REQ-03: This feature MUST reuse the existing `fs_list_files`/`fs_read_file` denylist, `node_modules`/`.git`/build-output listing exclusions, and per-file size cap unmodified; it MUST NOT introduce a new or parallel filesystem-access mechanism.
- REQ-04: Setting the `custom` root from a drop event MUST go through the same validation the existing manual path uses (absolute, exists, is a directory) — a drop naming a path that fails this validation MUST surface a visible error, not a silent no-op.
- REQ-05: Dropping a new folder MUST replace the workspace's previously set `custom` root; at most one `custom` root MUST be active per workspace at a time.
- REQ-06: When a user's request matches the "turn a folder into a reusable Tovu theme" intent, the agent MUST be able to discover the existing `tovuize-site` plugin skill even while it is inactive (via the existing `search_agent_plugin_local` tool), and MUST proactively mention it and offer to walk the user through enabling it, rather than requiring the user to already know the plugin exists.
- REQ-07: When a user's request matches "turn this into one page," not a whole reusable theme, the guidance content MUST direct the agent to extract only that page's inner body markup (no `<html>`, `<head>`, navigation, or footer chrome) and create or update a Page through the existing Pages agent tools — not the theme pipeline.
- REQ-08: When a conversion needs binary assets (images, fonts, video, audio) that Tovu's text-only file tools cannot move, the guidance content MUST direct the agent to say so explicitly and name which files need to be copied by hand, rather than fabricating placeholder assets or silently omitting them.
- REQ-09: No tool exercised by this feature MUST write into the dropped source folder — it is read-only for the duration of the conversion; all writes go through the existing theme-write or Page-write tools, which are already scoped to the active site's own data.
- REQ-10: The system MUST NOT widen the closed `root` enum (`repo`/`site`/`custom`) that `fs_list_files`/`fs_read_file` accept — this feature's wiring only changes what directory `custom` resolves to, never the set of valid root values a tool call may request.

---

## Acceptance Criteria

- AC-01 (REQ-01) [P1]: Given a folder is dropped onto the desktop chat composer, when the drop is handled, then the composer's text contains the folder's absolute path and no per-file attachment upload is triggered for that drop.
- AC-02 (REQ-02) [P1]: Given a folder is dropped onto the desktop chat composer, when the agent subsequently calls `fs_list_files` with `root: "custom"`, then it returns the dropped folder's contents without any prior manual custom-root-setting step in the same conversation.
- AC-03 (REQ-03) [P1]: Given the dropped folder contains a `node_modules` directory, a `.git` directory, and a `.env` file, when `fs_list_files` lists it, then `node_modules` and `.git` are excluded from the listing for readability and `.env` is excluded because it is denylisted — using the existing, unmodified rules.
- AC-04 (REQ-04) [P1]: Given a dropped path that does not exist or is not a directory, when the drop handler attempts to set it as the `custom` root, then the attempt fails and the user is shown a clear error rather than the root silently remaining unset with no explanation.
- AC-05 (REQ-05) [P1]: Given a `custom` root is already set from an earlier drop in the same conversation, when a second, different folder is dropped, then subsequent `fs_list_files(root:"custom")` calls resolve to the second folder, not the first.
- AC-06 (REQ-06) [P1]: Given the `tovuize-site` plugin is installed but inactive, when the user expresses an intent matching "turn this folder into a theme," then the agent's response names the plugin and offers to enable it, without the user having asked for it by name.
- AC-07 (REQ-07) [P2]: Given the user asks for one bespoke page rather than a whole theme, when the agent completes the conversion, then the result is a Page (`bodyFormat: "html"`) containing only inner body markup, not a new theme package.
- AC-08 (REQ-08) [P1]: Given the dropped folder contains at least one binary asset referenced by the site's markup, when the agent reports its conversion result, then the response explicitly names the binary files that still need to be copied by hand.
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
- EC-02: What happens when the user drops a file, not a folder? Expected behavior: the existing folder-vs-file detection (`folderPathsFromDataTransfer`) does not treat it as a folder drop; it goes through the normal chat-attachment upload path unchanged (REQ-01 only applies to folder drops).
- EC-03: What happens when the dropped folder is extremely large (tens of thousands of files, e.g., an unpruned `node_modules`-heavy project)? Expected behavior: listing exclusions already keep `node_modules`/`.git`/build output out of the walk; if the remaining file count is still large, the existing tool's own limits (e.g., a maximum listed-files cap) apply unmodified — this feature does not add a separate, folder-drop-specific limit.
- EC-04: What happens when the user drops a second folder mid-conversion, before the first conversion finishes? Expected behavior: per REQ-05/INV-02, the `custom` root moves to the new folder; any in-flight `fs_read_file` calls already issued for the first folder are unaffected (they addressed absolute paths already resolved), but new `root:"custom"` calls resolve to the second folder — this is a genuine behavior seam the user should be warned about, see Open Questions.
- EC-05: What happens when a folder is dropped onto the browser-based (non-desktop) admin chat? Expected behavior: a plain browser cannot recover a dropped folder's real filesystem path (`webUtils.getPathForFile` is an Electron-only, main-process-bridged API) — this feature does not change or fix that; it is documented here as a known platform limitation, not silently glossed over.
- EC-06: What happens when the site the conversion targets already has a theme or Page with the same name/slug as the one being produced? Expected behavior: the existing theme-install and Page-creation tools' own conflict handling applies unmodified — this feature introduces no new naming or overwrite policy.
- EC-07: What happens when the agent cannot tell whether the user wants a theme or a Page? Expected behavior: the agent asks, rather than guessing — a full multi-page site with its own navigation strongly suggests a theme; a single HTML file with no site-wide chrome strongly suggests a Page, but the agent confirms rather than assuming when the folder's shape is ambiguous.

---

## Dependencies

| Dependency | What It Provides | Failure Mode | Fallback |
|------------|------------------|--------------|----------|
| `apps/desktop/src/renderer/folder-drop.ts` + `App.tsx`'s `onDropCapture` | Existing, already-shipped folder-path insertion on drop | A regression reintroduces per-file attachment on folder drop | None — this is treated as a P1 regression, covered by AC-01 |
| `apps/website/src/features/fs-files/*` (`agent-tools.ts`, `fs-files.ts`, `layout.ts`, `custom-root-store.ts`) | The sandboxed `fs_list_files`/`fs_read_file` tools and the `custom` root mechanism this feature wires into | Denylist or size-cap logic regresses | None — this feature adds no independent safety net; it depends entirely on this existing one |
| `PUT /api/admin/v1/workspaces/:workspaceId/fs-files/custom-root` (existing admin route) | The endpoint the drop handler calls to set the `custom` root | Endpoint unreachable from the desktop app's local server | Drop still inserts the path as text (REQ-01 still holds); only the auto-wiring (REQ-02) degrades, with a visible error per REQ-04 |
| `content/agent-plugins/tovuize-site/` (existing plugin skill) | The actual theme-conversion knowledge and worked example this feature's discoverability requirement surfaces | Plugin content becomes unavailable or corrupted | Agent falls back to explaining it cannot convert the site right now — no silent partial conversion |
| `apps/website/src/features/pages/*` (existing Pages agent tools, `HtmlDocumentStore`) | The write path for the "convert to one Page" route | Write conflict or store unavailable | Existing Pages tool error handling applies unmodified; no plugin-specific fallback |

---

## Open Questions

- OQ-01: Should the desktop drop handler ask for confirmation before overwriting an already-set `custom` root (EC-04), or is silent replacement acceptable given the root is scoped to one workspace and one conversation? Recommended default applied in this spec: silent replacement (REQ-05), since the existing manual custom-root UI already behaves this way and a confirmation dialog would interrupt the exact "don't make me do an extra step" outcome this feature exists to deliver. — Owner: Leona Burime — Resolve by: 2026-09-20
- OQ-02: Should the agent be allowed to enable the `tovuize-site` plugin itself once it identifies the matching intent, or must it always stop and ask the operator first? Recommended default applied in this spec: ask first — enabling a plugin changes what tools are available for the rest of the workspace, which is exactly the kind of state change bundled-inactive-by-default is meant to gate. — Owner: Leona Burime — Resolve by: 2026-09-20
- OQ-03: Should a future iteration add a binary-asset copy tool (so images/fonts/video referenced by a dropped site don't need to be moved by hand), or is "the agent tells the user which files to copy" an acceptable permanent behavior? Recommended default applied in this spec: acceptable for v1 (REQ-08); revisit only if this becomes a frequent complaint. — Owner: Leona Burime — Resolve by: 2026-10-01
- OQ-04: Should the browser (non-desktop) admin chat get its own, different folder-drop affordance (e.g., a native multi-file picker with a warning that it uploads contents, not a path), or should it explicitly refuse folder drops with an explanatory message instead of today's undocumented behavior? Recommended default applied in this spec: out of scope for this feature (see Scope); document the limitation (EC-05) and leave current behavior unchanged until a follow-up decides. — Owner: Leona Burime — Resolve by: 2026-10-01

---

## Constitution Compliance

| Article | Status | Notes |
|---------|--------|-------|
| I — Library-First | COMPLIES | Reuses the existing `fs_list_files`/`fs_read_file` tools, the existing `custom-root-store`, the existing `tovuize-site` plugin, and the existing Pages tools; no new library or protocol is introduced. |
| II — Test-First | COMPLIES | TDD Agent is dispatched before Programmer per the standard pipeline; every AC above is written to seed a test directly. |
| III — Simplicity Gate | COMPLIES | Every change (one wiring call in the drop handler, two guidance-content additions) traces to REQ-01 through REQ-10. |
| IV — Anti-Abstraction Gate | COMPLIES | No new abstraction layer; the drop handler calls the existing custom-root endpoint directly. |
| V — Integration-First Testing | COMPLIES | Every P1 AC is stated as an observable integration-level behavior (composer text, tool call results, file-system state) rather than an implementation detail. |
| VI — Security-by-Default | COMPLIES | REQ-03/REQ-09/REQ-10 and INV-01–INV-03 explicitly forbid introducing any new or widened filesystem access; Security Agent review is still required before merge per this article's own rule. |
| VII — Spec Integrity | COMPLIES | `spec_id` and `content_hash` are recorded; all downstream agents must reference this version. |
| VIII — Observability | COMPLIES | REQ-04 requires a visible error rather than a silent no-op when custom-root validation fails. |

---

## Implementation Readiness Gate

- [x] spec_id assigned and unique
- [x] version set to correct semver
- [x] status set to APPROVED (not DRAFT or REVIEW)
- [x] content_hash computed using the Speckit canonical hash rule and verified by the provider-local validator
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

**Gate result:** PASS

---

## Agent Directives (optional)

Always:
- Treat the dropped source folder as read-only for the entire conversion — INV-01 is absolute, not a preference.
- Mention the existing `tovuize-site` plugin proactively when its use case matches, even while it is inactive — do not make the user ask for it by name.

Ask before:
- Enabling the `tovuize-site` plugin on the user's behalf (OQ-02's applied default: always ask first).
- Overwriting an existing theme or Page that shares the target name/slug — defer to the existing tool's own conflict handling rather than silently picking a side.

Never:
- Write to the dropped source folder.
- Widen the `root` enum (`repo`/`site`/`custom`) or introduce a parallel filesystem-access tool.
