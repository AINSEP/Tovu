# S sheets, ready to run with T-SCREEN (5 screens, 6 runs). Each section is one run unless it says two.
Round 2: collections' entry editor left this file (it needs the editor decision; see S-design-first, S-ENTRY-EDITOR).

Sizes at Tovu `f354cfbd` (source lines without tests and dictionaries; files and blobs in `inventory.tsv`).
"Ready" means: files, sizes, edges, owner, prerequisites and tests are specified. The port method list is derived in
T-SCREEN step 0 from the existing `*-port.hooks.ts`, not pre-written here.

| Sheet | Area | Source (files) | Dictionary | Test files | Files >500 | Hook debt | Owner target | Estimate | Needs |
|---|---|---|---|---|---|---|---|---|---|
| S-ROLES | f/roles | 2,036 (9) | 1,523 | 5 | Roles.tsx 869, use-roles 629 | 0 | `user-management/src/admin` (roles module exists) | 230k (2 runs if the split is large) | J4, R3 |
| S-TRASH | f/trash | 1,072 (8) | 1,242 | 5 | - | 0 | `cms/src/trash/admin` | 150k | J4 |
| S-MENUS | f/menus | 1,722 (14) | 1,272 | 16 | MenuEditor.tsx 526 | 4 | `cms/src/navigation/admin` | 200k | J4, A1 (slug import) |
| S-TAXONOMY | f/taxonomy | 3,485 (27) | 1,282 | 17 | Taxonomy.tsx 899 | 7 | `cms/src/taxonomy/admin` | 2 runs: 180k + 200k | J4 |
| S-COLLECTIONS a | f/collections (content types only) | about half of 3,235 (24) | 1,304 | 15 | Collections.tsx 671 | 2 | `cms/src/content-types/admin` | 1 run: 200k | J4 |
**Serial, in the order S-TRASH, S-MENUS, S-ROLES, S-TAXONOMY a, b, S-COLLECTIONS a**: every Tovu half edits
`panels.tsx`, `modules.hooks.ts`, `jini-kits.ts`, and four of them edit `packages/cms/package.json`; each run makes
those edits itself (COMMON-ADMIN section 3).
Server-side lanes K/T/S/U move tools and SQL of the same domains; they do not touch `apps/admin` (their INDEX lists
these admin screens as "measured, not sheeted"). No file overlap; the shared file is the owner's `package.json`.

## S-ROLES (a dedupe, not a plain move)
Jini already has a roles module: `user-management/src/admin/roles.module.ts` (15), `controllers/roles.controller.ts`
(362), `react/pages/RolesPage.tsx` (33), `tabs/RolesTab.tsx` (16), `tabs/PoliciesTab.tsx` (17), `PermissionPanel`,
`RoleRow`, `PolicyRow`. Tovu does not use it (`f/roles` imports `@jini-ai/admin`, `ui`, `core` only) and runs its own
`Roles.tsx` (869) + `use-roles.hooks.ts` (629) + `rules.ts` (116) + `roles-dependencies` (195) + `roles-port` (38).
The 11-10 survey said Jini lacks a roles screen; that is no longer true.
1. Behaviour diff first (lesson: a dedupe claim needs it). Table in the report, one row per user action in Tovu's
   screen (list roles, create, rename, delete, edit permissions, policies, assign, "still in use" refusal, error
   overrides in `rules.ts` `describeApiError`, unsaved-changes guard, permission-gated controls): Tovu behaviour
   (file:line) | Jini behaviour (file:line) | same / Tovu-only / Jini-only.
2. Each Tovu-only row is ported **into Jini's module** with a test first (RED in Jini). Each Jini-only row is
   listed for the owner (it will appear in Tovu after the switch).
3. Compare the two ports method by method (T-SCREEN binding checks): Tovu `roles-port.hooks.ts` vs Jini
   `user-management/src/admin/ports.ts`. A difference in argument shape is adapted in the Tovu binding, not in Jini.
4. Switch Tovu to the Jini module the way `features/members` and `features/users` already do (read both
   `index.ts` + `hooks/*-dependencies.hooks.ts` as the precedent; on merge-b their local `*-port.hooks.ts` files are
   already deleted). Dictionary: `roles-i18n.ts` keys must cover Jini's `messages.en`; add the parity test.
5. Delete Tovu's `Roles.tsx`, `Roles.hooks.tsx`, `hooks/use-roles.hooks.ts`, `rules.ts` and their tests whose
   cases now live in Jini (name each new location).
Mutation tests: R1 deleting a role that is still assigned shows the "still in use" sentence and sends no second
request; R2 a permission toggle sends exactly one write with the full new set; R3 a user without the manage
permission sees no write control.
STOP: more than 15 Tovu-only rows (then it is a port of ~2k lines: split into two runs and report the split).

## S-TRASH
Owner `cms/trash` exists (domain, ports, memory repo). Smallest screen; run it first to prove T-SCREEN.
Edges: outgoing to `lib` only (6); incoming: `root` (panels). No file over 500.
Class: this screen offers restore and purge. Purge is the one permanent delete in the admin; it must stay a
two-step confirmed action going through the same port method, and the confirm copy must not change.
Mutation tests: T1 purge without confirmation sends nothing; T2 restore of an item whose parent is gone shows the
plain-words error; T3 the list keeps cursor pagination (page 2 request carries the cursor from page 1).

## S-MENUS
Owner `cms/navigation` (has `menu-html.ts`, `menu-service.ts`, `link-rel.ts`). Before writing `html-rules.ts` (74)
and `page-link-rules.ts` (90) into Jini, diff them against `cms/src/navigation/menu-html.ts` and `link-rel.ts`:
if a rule already exists there, call it; report the diff either way.
Edges (re-read at `e801e9ae`; round 1 misread two of them):
- pages: **not a component edge.** The page list already arrives through the existing optional port method
  `MenusPort.listPages` (`hooks/menus-port.hooks.ts:25`); the host binding `hooks/menus-dependencies.hooks.ts:1-19`
  adapts `pagesApi.listPages()` + `pagePublicPath` into it. The port moves to the owner unchanged; the binding
  stays in Tovu as `integrations/jini-admin/menus-ports.ts`. **No `PagePicker` slot.** Keep the method optional and
  keep the present refusal when it is absent (`use-menu-editor.hooks.ts:216`: throws "menu editor page lookup is
  unavailable"; the query is disabled when the method is missing, `:219`).
- trash: `trashApi` is used only inside the binding (delete goes to the shared Trash route): stays in Tovu.
- `publish-content:1` → PORT `requestPublish` callback (confirm the edge with T-SCREEN step 0; if the census does
  not find it, delete this bullet from the report rather than inventing the port).
- website `toSlug` (`use-menu-editor.hooks.ts:16,320`; A1 Step C must have landed; then it is `@tovu/contracts/slug`,
  which Jini may not import) → PORT `slugify({ text })` supplied by the host, called only for a new menu whose
  slug the operator has not edited (`:320`).
Split `MenuEditor.tsx` (526) first.
There is **no drag-and-drop** (`MenuEditor.tsx:17-19` says so): items move with up/down controls that reorder
local state (`use-menu-editor.hooks.ts:338-339`), and the tree is saved whole (ADR-029 whole-tree replace).
Mutation tests: M1 press "move down" on the first of three siblings, then save: exactly one save request, whose
tree lists the siblings in the new order (fails when the move does not reach the payload, or when a move alone
sends a request); M2 the HTML preview equals the old output for a three-level fixture byte for byte; M3 the slug
shown for a new menu equals the port's return value, and typing in the slug field stops further calls;
M4 with a port that has no `listPages`, the page-link fields show today's unavailable state and no request is made.

## S-TAXONOMY (2 runs: a = split `Taxonomy.tsx` 899 in Tovu + characterization; b = move)
Owner `cms/taxonomy`. Incoming edges matter: `TermPicker.tsx` (242) + `use-term-picker.hooks.ts` (334) are imported
by posts, pages, collections, database, recovery (5 areas). After the move those importers take the picker from
`@jini-ai/cms/taxonomy/admin/react`; in this run Tovu importers are repointed in commit B (they are Tovu files, so
a direct import of the owner package is allowed there).
Outgoing: `publish-content:1` (PORT `requestPublish`).
Mutation tests: X1 merge term: the request names source and target in the right order (swap → RED); X2 creating a
term with a duplicate slug shows the server's refusal in plain words; X3 the picker emits ids in selection order.

## S-COLLECTIONS a (content types; 1 run). The entry editor is NOT in this run.
Owner `cms/content-types`. Scope: `Collections.tsx` (671, split first), the new-content-type and edit-fields
dialogs and their hooks. Out of scope, left in Tovu untouched: `CollectionEntryEditor.tsx` (494),
`hooks/use-collection-entry-editor.hooks.ts`, `CollectionEntries.tsx` and their tests.
Why (round-1 judge finding 9, verified): the entry editor imports `@tiptap/react` (`CollectionEntryEditor.tsx:1`),
`@tiptap/react` + `@tiptap/starter-kit` (`use-collection-entry-editor.hooks.ts:2-3`) and Tovu's widget-embed
extension (`lib/widget-embed-extension`, `:9` and `CollectionEntryEditor.tsx:4,466`). No Jini package may declare
`@tiptap/*` until lane K/T decision D-T4, and the extension needs an injection seam. It is the same decision the
post editor waits for: see S-ENTRY-EDITOR in `S-design-first.md`.
Step 0 addition: `rg -n "CollectionEntr|use-collection-entry" apps/admin/src/features/collections -g '!**/__tests__/**'`
lists every edge between the content-type half and the entry half. Each one becomes a SLOT prop (the Tovu page
passes the entry list/editor component in) or the run STOPs if the halves share state.
Incoming: `c/WidgetConfigFields` imports collections 6 times (audit2 a04 owns that component: a04 first, or repoint
its 6 imports in commit B and tell a04's runner). Outgoing: `publish-content` (PORT).
Mutation tests (each cites the line that produces it): C2 a JSON field with invalid JSON blocks save and names the
field; C3 deleting a content type that still has entries is refused with today's sentence and sends no second
request; C4 the edit-fields dialog sends the field list in the edited order.
