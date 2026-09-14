# Traceability Matrix: tovuize-website-folder-drop

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/traceability.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-053 |
| feature_name | FEAT-053-tovuize-website-folder-drop |
| version | 1.0.0 |
| content_hash | sha256:0000000000000000000000000000000000000000000000000000000000000 |
| last_edited | 2026-09-14T00:00:00Z |
| traceability_status | IMPLEMENTED — PARTIALLY VERIFIED (see §6) |

**Purpose:** Traces every REQ/AC/INV/EC/error code/behavior rule from this spec package to its implementation and test.

**Implementation commits:** 6307f04f (M1 folder drop), 7896d028 (M2 agent guidance), a9395a7a (M3 binary assets); review fixes 10871375 (bridge limited to /admin), 32316495 (plugins_set_enabled guidance), 8f71c429 (fs tools findable by search), Jini 559e233f (stuck drop outline).

**Status key:** VERIFIED = test run green in the 2026-09-14 review. TESTED = test exists, not run in that review. PARTIAL = implemented, but the AC's observable outcome is not covered. GAP = no test.

Paths: `admin/` = `apps/admin/src/`, `web/` = `apps/website/src/`, `desk/` = `apps/desktop/src/`.

---

## 1. Requirement-to-Implementation-to-Test Matrix

| REQ/AC ID | Description | Priority | Impl File | Impl Function | Test File | Test ID | Status |
|-----------|-------------|----------|-----------|---------------|-----------|---------|--------|
| REQ-01 | Folder drop inserts path, not attachments | — | admin/features/fs-files/hooks/use-folder-drop.hooks.ts; admin/features/fs-files/folder-drop.ts; desk/speech/preload-speech.cjs | `useFolderDrop.handleDropCapture`; `folderPathsFromDataTransfer`; `window.tovuFiles` | admin/features/fs-files/hooks/__tests__/use-folder-drop.hooks.unit.test.ts; admin/features/fs-files/__tests__/folder-drop.unit.test.ts; desk/speech/preload-speech.test.ts | "inserts the path and sets the custom root on a successful drop (AC-01/AC-02)"; "recovers the OS path for a single dropped folder"; "window.tovuFiles is exposed on the admin surface" | VERIFIED (unit) |
| AC-01 (REQ-01) | Composer text has path; no attachment upload | P1 | admin/App.tsx (`<aside onDropCapture>`); admin/components/AssistantDock/hooks/AssistantDock.hooks.tsx | `useFolderDropBridge` | none for the aside-to-hook wiring | — | PARTIAL — the wiring is untested; live 2026-09-13 the path did reach the composer |
| REQ-02 | Drop also sets `custom` fs root automatically | — | use-folder-drop.hooks.ts → web/server/inbound/admin-http/routes/fs-files/custom-root.ts → web/features/fs-files/custom-root-store.ts | `applyCustomRoot`; `setCustomFsRoot` | use-folder-drop.hooks.unit.test.ts | "inserts the path and sets the custom root on a successful drop (AC-01/AC-02)" | VERIFIED (unit); live 2026-09-13 `.fs-custom-root.json` was written |
| AC-02 (REQ-02) | `fs_list_files(root:"custom")` works with no manual step | P1 | web/assistant/tool-search-keywords.ts; web/assistant/tool-search-doc2query.ts | `fs_list_files`/`fs_read_file` entries | web/assistant/__tests__/tool-search-keywords.fs-files-ranking.test.ts | "an operator asking about a dropped or local folder finds the fs-files tools in the top 3" | PARTIAL — failed live 2026-09-13 (the model never searched, and the tools were unindexed); search fix VERIFIED; needs a daemon restart and an owner retest |
| REQ-03 | Reuse existing denylist/exclusions/size cap unmodified | — | web/features/fs-files/fs-files.ts (unchanged) | `resolveFsFilePath` | web/features/fs-files/__tests__/fs-files.test.ts | existing suite | TESTED (reused, not re-run) |
| AC-03 (REQ-03) | node_modules/.git excluded, .env denylisted | P1 | same | same | same | existing suite | TESTED |
| REQ-04 | Drop-triggered custom-root set uses existing validation | — | custom-root-store.ts (unchanged) | `setCustomFsRoot` | web/features/fs-files/__tests__/custom-root-store.test.ts | existing suite | TESTED |
| AC-04 (REQ-04) | Invalid path shown as visible error | P1 | use-folder-drop.hooks.ts; admin/components/AssistantDock/FolderDropError.tsx | `reasonForCustomRootError` | use-folder-drop.hooks.unit.test.ts; admin/components/AssistantDock/__tests__/FolderDropError.unit.test.tsx | "classifies a 'not a directory' validation failure distinctly from 'does not exist'"; "reports the endpoint as unreachable for a non-validation failure (network/500)" | VERIFIED |
| REQ-05 | New drop replaces previous custom root | — | custom-root-store.ts | `setCustomFsRoot` | use-folder-drop.hooks.unit.test.ts | "reports a replaced previous path when a different custom root was already set" | VERIFIED |
| AC-05 (REQ-05) | Second drop's folder wins over the first | P1 | use-folder-drop.hooks.ts | `handleDropCapture` (last folder wins) | use-folder-drop.hooks.unit.test.ts | "uses the LAST folder in a single multi-folder drop as the custom root, but joins all paths into the composer text" | VERIFIED |
| REQ-06 | Agent proactively surfaces inactive tovuize-site plugin | — | web/features/fs-files/layout.ts | `FS_ROOT_DESCRIPTORS` `custom` description | web/features/plugin-runtime/__tests__/unit/agent-plugin-enable-guidance.test.ts | "the custom fs root's description names plugins_set_enabled for enabling tovuize-site, and never claims no tool can" | PARTIAL — guidance text VERIFIED; model behaviour not evaluated |
| AC-06 (REQ-06) | Agent names plugin + offers to enable, unprompted | P1 | same | same | none (no behavioural eval) | — | GAP |
| REQ-07 | Page-only conversion extracts inner body only | — | web/features/pages/agent-tools.ts (existing) | `PAGE_HTML_CONTRACT` | none new | — | PARTIAL |
| AC-07 (REQ-07) | Result is a Page with bodyFormat html, inner-only | P2 | same | same | none | — | GAP |
| REQ-08 | Binary assets explicitly named, never fabricated/skipped silently | — | web/features/pages/agent-tools.ts; content/agent-plugins/tovuize-site/skills/tovuize-site/SKILL.md | `PAGE_HTML_CONTRACT` | none | — | PARTIAL — content only |
| AC-08 (REQ-08) | Response names binary files needing manual copy | P1 | same | same | none | — | GAP |
| REQ-09 | Source folder is never written to | — | web/features/fs-files/agent-tools.ts | `getFsFilesAgentToolCatalog` (both tools `sideEffects: "none"`; no write tool on any root) | none dedicated | — | PARTIAL — holds by construction |
| AC-09 (REQ-09) | Source folder unmodified after conversion | P1 | same | same | none | — | GAP |
| REQ-10 | `root` enum never widened | — | web/features/fs-files/layout.ts | `FS_ROOT_IDS` | web/features/fs-files/__tests__/layout.test.ts | "FS_ROOT_IDS lists exactly repo, site, and custom — in that order" | VERIFIED |
| AC-10 (REQ-10) | Every tool call's root is repo/site/custom only | P1 | same | same | same | same | VERIFIED |

---

## 2. Invariant Traceability

| INV ID | Invariant (copied from feature.spec.md) | Test File | Test ID | Status |
|--------|-----------------------------------------|-----------|---------|--------|
| INV-01 | Dropped source folder never written to | none (read-only tool catalog) | — | GAP — by construction |
| INV-02 | At most one `custom` root active per workspace | web/features/fs-files/__tests__/layout.test.ts | "resolveFsRoots keeps two workspaces' custom roots independent" | VERIFIED |
| INV-03 | Denylisted file never returned via any root | web/features/fs-files/__tests__/fs-files.test.ts | existing suite | TESTED |
| INV-04 | Folder drop never uploads files as attachments | use-folder-drop.hooks.unit.test.ts | "inserts the path and sets the custom root on a successful drop (AC-01/AC-02)" | VERIFIED (unit). Known gap: a mixed drop (folder plus loose files) also silently discards the loose files |
| INV-05 | No plugin-specific bypass of theme/Page write tools | none (content-only changes) | — | GAP — by construction |

---

## 3. Edge Case Traceability

| EC ID | Edge Case (copied from feature.spec.md) | Test File | Test ID | Status |
|-------|-----------------------------------------|-----------|---------|--------|
| EC-01 | Dropped folder is empty | none | — | GAP |
| EC-02 | User drops a file, not a folder | use-folder-drop.hooks.unit.test.ts; folder-drop.unit.test.ts | "falls through (no-op) when nothing dropped is a folder (EC-02, a loose file)"; "skips a file item whose entry is not a directory" | VERIFIED |
| EC-03 | Dropped folder is extremely large | none (custom-root-store.ts stats the path only) | — | GAP |
| EC-04 | Second folder dropped mid-conversion | none | — | GAP |
| EC-05 | Folder dropped on browser (non-desktop) admin chat | use-folder-drop.hooks.unit.test.ts; admin/features/fs-files/__tests__/folder-drop-port.unit.test.ts; desk/speech/preload-speech.test.ts | "does nothing when no folder-drop port is available (plain browser tab, EC-05)"; "returns null for a window with no tovuFiles bridge"; "window.tovuFiles is NOT exposed to same-origin public pages, previews, or look-alike paths" | VERIFIED |
| EC-06 | Name/slug collision with existing theme or Page | none | — | GAP |
| EC-07 | Agent cannot tell theme vs. Page intent | none (layout.ts guidance: "ask, don't guess") | — | GAP |

---

## 4. Error Code Traceability

| Error Code | Produced By (file/function) | Test File | Test ID | Status |
|------------|-----------------------------|-----------|---------|--------|
| DROPPED_PATH_NOT_A_DIRECTORY | use-folder-drop.hooks.ts `reasonForCustomRootError` → `"not-a-directory"` | use-folder-drop.hooks.unit.test.ts | "classifies a 'not a directory' validation failure distinctly from 'does not exist'" | VERIFIED |
| DROPPED_PATH_NOT_FOUND | same → `"does-not-exist"` | same | same | VERIFIED |
| CUSTOM_ROOT_ENDPOINT_UNREACHABLE | same → `"endpoint-unreachable"` | same | "reports the endpoint as unreachable for a non-validation failure (network/500)" | VERIFIED |
| TOVUIZE_PLUGIN_UNAVAILABLE | none found | none | — | GAP |
| BINARY_ASSETS_NOT_COPIED | web/features/pages/agent-tools.ts `PAGE_HTML_CONTRACT` (guidance text) | none | — | GAP |
| CONVERSION_TARGET_AMBIGUOUS | web/features/fs-files/layout.ts `custom` description (guidance text) | none | — | GAP |

---

## 5. Behavior Rule Traceability

| Rule | Section in behavior.spec.md | Test File | Test ID | Status |
|------|-----------------------------|-----------|---------|--------|
| Conversion-target routing (explicit > shape > ask) | § 1.1 | none (layout.ts guidance) | — | GAP |
| Custom-root write precedence (last write wins) | § 1.2 | use-folder-drop.hooks.unit.test.ts | "reports a replaced previous path when a different custom root was already set" | VERIFIED |
| Default: fresh workspace has no `custom` root | § 3 | web/features/fs-files/__tests__/layout.test.ts | "resolveFsRoots reports custom as undefined when no operator folder has been set for that workspace" | VERIFIED |
| Default: bundled `tovuize-site` starts disabled | § 3 | web/features/agent-plugins/__tests__/integration/bundled-inactive-gating.integration.test.ts | existing suite | TESTED |
| Failed drop validation leaves existing root unchanged | § 7 | custom-root-store.ts throws before writing; web/features/fs-files/__tests__/custom-root-store.test.ts | existing suite | TESTED |

---

## 6. Coverage Gaps

### 6.1 Unimplemented Requirements

| REQ/AC ID | Reason Unimplemented | Target Completion | Owner |
|-----------|---------------------|-------------------|-------|
| — | All REQs have an implementation (REQ-07/08 are guidance text only) | — | — |

### 6.2 Untested Requirements

| REQ/AC ID | Reason Untested | Target Completion | Owner |
|-----------|----------------|-------------------|-------|
| AC-01 | No test drives a real drop on App's `<aside>` through to `useFolderDrop` | Follow-up | Coordinator |
| AC-02 | End-to-end (drop → model calls fs_list_files) needs a live run; failed live 2026-09-13 | Owner retest after daemon restart | Leona Burime |
| AC-06, AC-07, AC-08, AC-09 | Agent behaviour; needs an eval, not a unit test | Follow-up eval | Coordinator |

### 6.3 Untested Error Codes

| Error Code | Reason Untested | Target Completion | Owner |
|------------|----------------|-------------------|-------|
| TOVUIZE_PLUGIN_UNAVAILABLE, BINARY_ASSETS_NOT_COPIED, CONVERSION_TARGET_AMBIGUOUS | Agent-guidance outcomes; no code path emits them | Follow-up eval | Coordinator |

### 6.4 Deferred Items

| REQ/AC ID | Deferred To | Reason | Approved By |
|-----------|-------------|--------|-------------|
| OQ-03 (binary-asset copy tool) | A future spec revision | Out of scope for v1; "agent tells the user" is the accepted v1 behavior | Leona Burime (pending explicit confirmation — see feature.spec.md OQ-03) |
| OQ-04 (browser admin folder-drop affordance) | A future spec revision | Out of scope for v1; current behavior documented, not changed | Leona Burime (pending explicit confirmation — see feature.spec.md OQ-04) |

---

## 7. Untraced Requirements

| REQ/AC ID | Reason Not In Matrix |
|-----------|---------------------|
| — | — |

---

## 8. Traceability Completeness Checklist

- [x] All REQ-* from feature.spec.md appear in the Section 1 matrix
- [x] All AC-* from feature.spec.md appear in the Section 1 matrix
- [x] All INV-* from feature.spec.md appear in the Section 2 matrix
- [x] All EC-* from feature.spec.md appear in the Section 3 matrix
- [x] All error codes from errors.spec.md appear in the Section 4 matrix
- [x] All behavior rules from behavior.spec.md appear in the Section 5 matrix
- [x] Section 6 gaps are accounted for with a target and owner
- [x] Section 7 (untraced) is empty
- [ ] All rows VERIFIED — no; see the GAP and PARTIAL rows

**[ ] TRACEABILITY COMPLETE** — not yet: AC-02 still needs an owner retest, and the agent-behaviour ACs have no eval.

---

## Sign-Off

| Role | Name / Agent | Date (ISO-8601) | Notes |
|------|--------------|-----------------|-------|
| Spec Agent | s10-plugin-specs | 2026-09-13T00:00:00Z | Spec-stage handoff |
| TDD Agent | | | |
| Programmer Agent | s24-tovuize-folder-drop | 2026-09-13 | Commits 6307f04f, 7896d028, a9395a7a |
| Code Inspection Agent | o14 (Opus review) | 2026-09-14 | Review fixes 10871375, 32316495, tool-search fix, Jini 559e233f; rows updated |
| Coordinator | | | |
