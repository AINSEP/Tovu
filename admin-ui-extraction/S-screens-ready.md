# S sheets, ready to run with T-SCREEN (5 screens, 6 runs). Each section is one run unless it says two.

Sizes at Tovu `f354cfbd` (source lines without tests and dictionaries; files and blobs in `inventory.tsv`).
"Ready" means: files, sizes, edges, owner, prerequisites and tests are specified. The port method list is derived in
T-SCREEN step 0 from the existing `*-port.hooks.ts`, not pre-written here.

| Sheet | Area | Source (files) | Dictionary | Test files | Files >500 | Hook debt | Owner target | Estimate | Needs |
|---|---|---|---|---|---|---|---|---|---|
| S-ROLES | f/roles | 2,036 (9) | 1,523 | 5 | Roles.tsx 869, use-roles 629 | 0 | `user-management/src/admin` (roles module exists) | 230k (2 runs if the split is large) | J4, R3 |
| S-TRASH | f/trash | 1,072 (8) | 1,242 | 5 | - | 0 | `cms/src/trash/admin` | 150k | J4 |
| S-MENUS | f/menus | 1,722 (14) | 1,272 | 16 | MenuEditor.tsx 526 | 4 | `cms/src/navigation/admin` | 200k | J4, A1 (slug import) |
| S-TAXONOMY | f/taxonomy | 3,485 (27) | 1,282 | 17 | Taxonomy.tsx 899 | 7 | `cms/src/taxonomy/admin` | 2 runs: 180k + 200k | J4 |
| S-COLLECTIONS | f/collections | 3,235 (24) | 1,304 | 15 | Collections.tsx 671 | 2 | `cms/src/entries/admin` + `cms/src/content-types/admin` | 2 runs: 200k + 200k | J4, S-TAXONOMY (term picker slot) |
File-disjoint in Tovu except `panels.tsx`, `modules.hooks.ts`, `jini-kits.ts` (coordinator) and in Jini except
`packages/cms/package.json` (S-TRASH, S-MENUS, S-TAXONOMY, S-COLLECTIONS each add entries: coordinator, or serial).
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
Edges: outgoing `pages:1` (page link picker → SLOT: a `PagePicker` component prop), `publish-content:1` (→ PORT:
`requestPublish` callback), website `toSlug` (A1 must have landed; then it is `@tovu/contracts/slug`, which Jini may
not import → PORT `slugify({ text })` supplied by the host). Split `MenuEditor.tsx` (526) first.
Mutation tests: M1 drag reorder sends the new order once, with ids in the dropped order; M2 the HTML preview equals
the old output for a three-level fixture byte for byte; M3 the slug shown equals the port's return value.

## S-TAXONOMY (2 runs: a = split `Taxonomy.tsx` 899 in Tovu + characterization; b = move)
Owner `cms/taxonomy`. Incoming edges matter: `TermPicker.tsx` (242) + `use-term-picker.hooks.ts` (334) are imported
by posts, pages, collections, database, recovery (5 areas). After the move those importers take the picker from
`@jini-ai/cms/taxonomy/admin/react`; in this run Tovu importers are repointed in commit B (they are Tovu files, so
a direct import of the owner package is allowed there).
Outgoing: `publish-content:1` (PORT `requestPublish`).
Mutation tests: X1 merge term: the request names source and target in the right order (swap → RED); X2 creating a
term with a duplicate slug shows the server's refusal in plain words; X3 the picker emits ids in selection order.

## S-COLLECTIONS (2 runs: a = content types (`Collections.tsx` 671 split + new-content-type and edit-fields dialogs);
## b = entries (`CollectionEntryEditor.tsx` 494, `CollectionEntries.tsx`, entry editor hooks))
Owners `cms/content-types` and `cms/entries`. Incoming: `c/WidgetConfigFields` imports collections 6 times (audit2
a04 owns that component: coordinate; a04 first or repoint its 6 imports in commit B and tell a04's runner).
Outgoing: `taxonomy:1` (term picker → SLOT), `publish-content:2` (PORT).
Mutation tests: C1 saving an entry sends only changed fields plus the revision it loaded (stale revision → the
conflict message, no overwrite; check against the lost-updates design before changing anything here); C2 a JSON
field with invalid JSON blocks save and names the field; C3 deleting a content type with entries is refused.
