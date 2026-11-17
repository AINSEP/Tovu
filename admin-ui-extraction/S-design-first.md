# S sheets that need a design before a Sonnet run (7 screens + the entry editor). Outlines with measured facts and named blockers.

## T-DESIGN: the brief of every design run (one Opus-class run each, about 250k; assemble as `cat COMMON-ADMIN.md T-SCREEN.md S-design-first.md#T-DESIGN <screen section>`)
A design run edits **no source**. It writes one file, `admin-ui-extraction/designs/<sheet>.md`, on the plan branch.
Required contents, in this order (a section that cannot be filled is written `BLOCKED: <what is missing>`):
1. Base: both repo SHAs; the stale-base guard output for the area (COMMON-ADMIN section 0).
2. Census: T-SCREEN step 0, every outgoing edge classified PORT / KIT / SLOT / PURE / STAYS with `file:line`.
3. Inventory of every declaration, export, module-level state cell and consumer (incl. tests that read source text)
   of each file over 500 lines, and its partition by the real dependency graph (calls, state reads, init order),
   never by line ranges (lessons 1-4). Each new file: its inputs, outputs, owner of mutable state, and that every
   function in it is <= 50 lines and complexity <= 10 (lesson 8).
4. Behaviour table for a dedupe (roles/media/plugins style): one row per user action, Tovu `file:line` | Jini `file:line`.
5. Port list: method, argument object, the Tovu API call it binds to, the test that fails when an argument is
   dropped or swapped (lesson 12). For security-relevant paths: the operation trace table of S-SECURITY.
6. Migration graph: an ordered list of runs; each run lists its commits, each commit its prerequisites, the shared
   files it edits itself, and the command that proves it green alone (lessons 5, 29, 30). No run over 250k.
7. Test table per run: assertion | cited source line | mutation that turns it RED. No invented behaviour (lesson 31).
8. Open owner decisions, each with a recommendation.
STOP (a design run ends BLOCKED, with what it found): the area fails the stale-base guard by more than a third;
a named prerequisite decision is still open; the screen cannot be partitioned without changing behaviour.
Proof the design is executable: an adversarial judge pass before any Sonnet run is started from it.

These are NOT executable yet. Each needs one Opus-class design run (output: T-SCREEN step-0 census resolved into a
port list, a partition of every over-limit file by its dependency graph, the migration graph, a test table), then
the Sonnet runs listed. Sizes at Tovu `f354cfbd`; files and blobs in `inventory.tsv`.

| Sheet | Source (files) | Dictionary | Test lines | Files >500 (lines) | Hook debt | Cross-feature edges out | Owner target |
|---|---|---|---|---|---|---|---|
| S-POSTS | 6,680 (54) | 3,270 | 9,455 | `hooks/use-post-editor.hooks.ts` 1,400, `rules.ts` 562 | 8 | pages 3, themes 2, taxonomy 1, publish-content 1, content-analysis 1, website slug 1 | `cms/src/posts/admin` (lane T creates `cms/src/posts/`) |
| S-PAGES | 7,144 (29) | 1,886 | 9,926 | `PageEditor.tsx` 1,428, `hooks/use-page-editor.hooks.ts` 1,404, `rules.ts` 615 | 4 | posts 4, themes 3, taxonomy 1, publish-content 1, `@tovu/theme-layout` | D-3: `cms/src/pages/admin` (new) or `cms/src/entries/admin/pages` |
| S-THEMES | 6,060 (25) | 3,655 | 9,548 | `hooks/use-theme-explore.hooks.ts` 1,718, `ThemeExplore.tsx` 1,493, `Themes.tsx` 666 | 12 | publish-content 1, pages 1, `@tovu/theme-layout` | `cms/src/theme/admin` (lane T uses `cms/src/theme/`) |
| S-PLUGINS | 6,669 (62) | 5,133 | 7,778 | `rules.ts` 737, `AgentPlugins.tsx` 515 | 16 | integrations 1; in: skills 5, email 1 | two families: `plugins/src/admin` and `agent-plugins/src/admin` |
| S-SETTINGS | 5,910 (32) | 2,667 | 6,765 | `SettingsUi.tsx` 744, `external-mcp-admissions-rules.ts` 631, `ExternalMcpSettingsPanel.tsx` 591 | 30 | workspace 2, fs-files 1, voice-input 1, admin-themes 1, webmcp 1; in: dock 2, providers 2, ai-assistant 2 | per tab (D-4); the assembled page stays in Tovu |
| S-DEPLOY | 5,072 (28) | 2,561 | 6,644 | `StaticSiteTab.tsx` 1,420 | 9 | security 3, import-export 2; in: security 5, source-control 3 | `devops/src/deploy/admin` (no React there today) |
| S-MEDIA | 4,166 (22) | 1,888 | 5,043 | `Media.tsx` 1,578, `rules.ts` 759 | 11 | publish-content 1; in: MediaPickerDialog 5, WidgetConfigFields 4, MediaEditDialog 2, library 1, security 1 | `cms/src/media/admin` (after JM3) |
Total: 41,701 source lines, 21,060 dictionary lines, 16 files over 500.

## Blockers and facts per screen (what the design must answer)
**S-POSTS.** (1) Revision 3 correction: `refactor/size-05-posteditor` (PostEditor split into `posts/editor/`) **is**
in merge-a, as the squash `ffba5e382` "Squash refactor/size-05-posteditor (merge-a #6)": `features/posts/editor/` has
28 files and the same tree on merge-a and merge-final (it was already there at `f354cfbd`, so this sheet's sizes
include it). Design on merge-final; `use-post-editor.hooks.ts` is 1,426 lines there. (2) Owner 11-15: the TipTap toolbar goes to Jini, but no Jini
package declares `@tiptap/*` (lane K/T decision D-T4, still open): the editor core cannot move until it is
answered. (3) Posts and pages import each other (3 and 4 edges): the shared pieces (`DevicePreview` 5+3,
`TemplateSource` 2+2) need one owner or SLOT props; design posts and pages **together**. (4) `use-post-editor.hooks.ts`
(1,400) holds the autosave/draft/conflict state machine: check the lost-updates design and lesson 16 before
partitioning. (5) Server side T-PO-01..05 are separate; only T-PO-01 (pure leaves) is a real prerequisite (shared rules).
Likely runs after design: 4 (rules + list, editor state, editor UI, Tovu switch) ≈ 0.9M.

**S-PAGES.** `@tovu/theme-layout` is an alias into website source (`features/theme/theme-layout.ts`): its types
must come through a port or move with lane T's theme work. Canvas/preview and template picking are SLOTs from
themes. `PageEditor.tsx` 1,428 and its hook 1,404 are the two largest splits in the admin after themes.
Likely runs: 4 ≈ 0.9M.

**S-THEMES.** `use-theme-explore.hooks.ts` (1,718) + `ThemeExplore.tsx` (1,493) are the largest pair in the
admin; 12 hook-debt keys. Theme publishing composition stays in Tovu. Class names rendered **inside** theme previews
are a saved surface of installed themes (lane T D-T3): only the admin chrome around the preview is renamed to
`jini-`. Prerequisites: lane T `T-TH-03` (render contract) for shared types. Likely runs: 4 ≈ 1.0M.

**S-PLUGINS.** Two families in one folder today. First design output: a file-by-file family label for the 62
files (site plugins → `plugins`; agent plugins → `agent-plugins`; shared install UI `components/InstallTabCard`
(281, imported 8 times) → kit slot or `ui`). `features/skills` imports plugins 5 times: decide skills' owner in the
same design. JM5 moves Jini admin's small `agent-plugins` folder (907) first; diff Tovu's `AgentPlugins.tsx` against
it (possible dedupe). Dictionary is 5,133 lines, the largest. Likely runs: 5 ≈ 1.1M.

**S-SETTINGS.** 30 hook-debt keys (second largest). The page is an assembly of tabs with different owners; the
design output is a tab → owner table. Known: external MCP tabs (`external-mcp-admissions-rules.ts` 631,
`ExternalMcpSettingsPanel.tsx` 591, modal hooks) are one coherent block (class: tool admission/allow-list UI;
lesson 26: removing a deny switch can silently enable something). `lib/settings-effective-reads.ts` de-duplicates
about 100 locale reads: the shared read must stay one owner per admin instance, not a module singleton in Jini.
Likely runs: 4 ≈ 0.8M.

**S-DEPLOY.** `StaticSiteTab.tsx` 1,420. Mutual imports with security (3 out, 5 in) and source-control (3 in):
design after S-SECURITY run a (its operation trace covers the publish-credential rows both screens share). Site-specific publish flow stays in Tovu. `devops/src/deploy` has no admin/React
code: this creates the first one. Likely runs: 3 ≈ 0.7M.

**S-MEDIA.** A real dedupe decision: Jini has a media admin (2,751 lines, parked; after JM3 at `cms/src/media/admin`; `apps/admin/src/media-panel.ts`
says the swap is parked) and Tovu has its own (4,166). Design = behaviour diff (as S-ROLES step 1) + which side
wins per behaviour + parity proof before the swap; never mount both (double reads and subscriptions). The media
picker contract (`@jini-ai/admin/contracts/media-picker`) is used by 3 Tovu components. Likely runs: 3 ≈ 0.7M.

**S-ENTRY-EDITOR (new in round 2; was round 1's "S-COLLECTIONS b").** Scope: `features/collections/CollectionEntryEditor.tsx`
(494), `hooks/use-collection-entry-editor.hooks.ts`, `CollectionEntries.tsx` and their tests. Blockers: (1) the same
TipTap decision as S-POSTS (lane K/T D-T4): `@tiptap/react` and `@tiptap/starter-kit` are imported at
`CollectionEntryEditor.tsx:1`, `use-collection-entry-editor.hooks.ts:2-3`; `@tiptap` is also imported by 8 files in
`apps/admin/src/lib` and 11 under `features/posts` — design the editor's owner **once**, with S-POSTS. (2) Tovu's
widget-embed extension (`lib/widget-embed-extension`, used at `:9` of the hook and `CollectionEntryEditor.tsx:4,466`)
must reach the editor through an explicit `extensions` + toolbar-control seam; it cannot be imported by Jini.
(3) The write contract to pin, **as it is** (round-1 judge finding 10): an existing entry is saved with title,
`fieldsJson` and `bodyJson` **together** plus `expectedVersion` (`use-collection-entry-editor.hooks.ts:244-254`; the
comment there records the data-loss bug that omitting `bodyJson` caused); publish saves first and publishes with
the returned version (`:296-318`). "Send only changed fields" is a behaviour change and is not part of this plan.
(4) The existing fake accepts stale versions (`hooks/collection-entry-editor-dependencies.hooks.ts:75-79` returns
`expectedVersion + 1` without comparing): the design's first run makes the fake compare the stored version and
throw the same conflict error the API returns, with a test that a stale save is refused **before** any
characterization relies on it; check the lost-updates design for the error shape. Likely runs after design: 2 ≈ 0.4M.

## Screens the brief names that are already Jini screens (no S sheet)
forms, SEO, comments, redirects, widgets: Tovu holds only the binding (`features/<x>` 63-145 source lines) and
the dictionary (908-1,821 lines). Their work is JM1/JM2/JM4. members and users already delegate to
`@jini-ai/user-management/react` (218 and 418 source lines of binding); nothing to move.
