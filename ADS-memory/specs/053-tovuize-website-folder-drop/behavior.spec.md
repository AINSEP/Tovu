# Behavior Rules Spec: tovuize-website-folder-drop

<!-- SPEC PACKAGE FILE: framework/spec-providers/speckit/templates/spec-system/behavior.spec.md -->
<!-- Part of the spec-system package. See framework/spec-providers/speckit/templates/spec-system/ for all required files. -->

---

## Header Metadata

| Field | Value |
|-------|-------|
| spec_id | SPEC-053 |
| feature_name | FEAT-053-tovuize-website-folder-drop |
| version | 1.0.0 |
| content_hash | sha256:0000000000000000000000000000000000000000000000000000000000000 |
| last_edited | 2026-09-13T00:00:00Z |

**Purpose:** This feature has a genuine "most recent wins" replacement rule for the `custom` root (a single mutable value with exactly one writer at a time), and a routing/precedence decision between two conversion targets (theme vs. Page). Both trigger conditions from the template's "When to create this file" list apply; this file is required.

---

## 1. Precedence Rules

### 1.1 Conversion-Target Routing

**Situation:** Applies whenever the agent must decide whether a dropped folder becomes a theme or a Page.

**Sources in precedence order (highest to lowest):**
1. `Explicit user instruction` — the user says "theme" or "page"/"just this page" outright. Always wins.
2. `Folder shape inference` — a folder containing multiple HTML files with shared navigation/footer markup across them strongly suggests a theme; a single HTML file (or a folder with one clear entry file and no cross-page shared chrome) suggests a Page.
3. `Ask the user` — used whenever source 1 is absent and source 2 is ambiguous (EC-07); the agent must not silently default to either shape.

**Example:**
- Scenario: The user drops a folder with `index.html`, `about.html`, and a shared `nav.html` fragment, and says nothing about theme vs. page.
- Input: source 1 = absent; source 2 = multi-page-with-shared-nav (theme-shaped).
- Result: the agent proposes a theme, but per source 3's requirement for ambiguous cases, still confirms with the user before writing anything (feature.spec.md REQ-07/EC-07 treat this as a confirmation, not a silent decision, whenever shape alone is doing the deciding).

**Test requirement:** The TDD Agent must write a test for: explicit "theme" instruction, explicit "page" instruction, unambiguous multi-page shape with no explicit instruction (proposes theme, still confirms), unambiguous single-page shape with no explicit instruction (proposes Page, still confirms), and a genuinely ambiguous folder (asks outright, proposes nothing).

---

### 1.2 Custom-Root Write Precedence

**Situation:** Applies whenever more than one event could set the workspace's `custom` filesystem root.

**Sources in precedence order (highest to lowest — this is "last write wins," not a priority ranking):**
1. `Most recent successful drop or manual set` — whichever happened last, whether it came from the desktop drop wiring this feature adds or the existing manual admin `FsFolderIndicator` path.
2. There is no source 2 — a workspace has exactly one `custom` root value at any moment; nothing "falls back" to an older value.

**Example:**
- Scenario: An operator manually sets `custom` to `/Users/x/site-a` via the admin UI, then later, in the same workspace, drops `/Users/x/site-b` onto the desktop chat.
- Result: `custom` resolves to `/Users/x/site-b`. The manual path is not restored automatically; setting it again would require another manual action or another drop.

**Test requirement:** WHEN a drop succeeds after an existing `custom` root was set (by either mechanism), the system shall replace it; WHEN a drop fails validation, the system shall leave the existing `custom` root, if any, unchanged.

---

## 2. Ordering Rules

N/A — this feature does not define a display or processing order for multiple items. The `custom` root is a single value, not a collection, and conversions are handled one at a time within a conversation.

---

## 3. Default Values

| Field | Scope | Default Value | Why |
|-------|-------|---------------|-----|
| `custom` filesystem root, freshly seeded workspace | `apps/website/src/features/fs-files/custom-root-store.ts` | Unset (`null`) | Existing behavior, unmodified: a workspace that has never had a folder dropped or manually set has no `custom` root to read from — `fs_list_files(root:"custom")` fails with a clear "no folder has been set yet" message rather than resolving to some implicit default directory. |
| Conversion target when folder shape is ambiguous | Agent guidance behavior | Ask the user, propose nothing | An irreversible-feeling choice (theme vs. Page) made silently on the user's behalf is worse than one extra confirmation question (§1.1 source 3). |
| Bundled `tovuize-site` plugin's `enabled` flag | `activation.ts`, seeded by `seed-bundled.ts` | `false` | Unmodified, product-wide default for every bundled plugin — deliberately inactive until an operator (or, per this feature's REQ-06, an agent-prompted operator) turns it on. |

---

## 4. Limits and Bounds

| Constraint | Value | Enforcement | Notes |
|------------|-------|-------------|-------|
| Active `custom` roots per workspace | Exactly 1 | `custom-root-store.ts` (existing, unmodified) | Enforced by the store's own shape (one JSON file per site), not by anything this feature adds. |
| Maximum single file size readable via `fs_read_file` | 1,000,000 bytes (`MAX_FS_FILE_BYTES`) | Existing tool, unmodified | Applies identically whether the root is `repo`, `site`, or `custom`. |
| Listing exclusions | `node_modules`, `.git`, build output (`dist`) | Existing tool, unmodified (readability only, not a security boundary) | A dropped project's own `node_modules` does not blow up a listing. |
| Denylisted filename patterns / segments | Databases, `.env*`, private keys/certs, anything under a `secrets` folder | Existing tool, unmodified, applies to every root | This is the actual security boundary (per `fs-files.ts`'s own header), independent of the listing exclusions above. |

---

## 5. Deduplication Rules

N/A — this feature does not deduplicate inputs. A dropped folder is not a discrete "resource" that can collide with another; it is a single mutable pointer (§1.2).

---

## 6. Tie-Break Logic

N/A — this feature has no scenario where multiple items compete for the same role; §1.1's routing and §1.2's replacement rule are both single-writer/single-value rules, not competitions among peers.

---

## 7. Edge Case Handling

| Edge Case | Expected Behavior | Test Required? |
|-----------|-------------------|----------------|
| Drop succeeds, then a second drop's validation fails | The `custom` root remains at the first (successful) value; the second drop's failure does not clear it (§1.2's "leave unchanged on failed validation" rule). | Yes |
| Folder shape is ambiguous and the user gives no explicit instruction | The agent asks before writing anything; no theme or Page is created speculatively. | Yes |
| Folder contains exactly one HTML file plus a `nav.html` fragment that is never referenced by that file | Not multi-page-with-shared-nav in the sense §1.1 means (the fragment is unused) — this still counts as single-page-shaped; the agent's inference should not be fooled by an unreferenced fragment file. | Yes |
| Manual admin `FsFolderIndicator` set happens, then a drop happens seconds later in desktop chat | Per §1.2, the drop (being the later event) wins — the manual set is not "sticky" against a subsequent drop. | Yes |
| Bundled `tovuize-site` plugin is already active (an operator enabled it previously) when the matching intent appears | REQ-06 becomes moot for the "offer to enable it" half, but the agent should still use it — this is not an edge case requiring special handling beyond "the tool is already available." | No |
