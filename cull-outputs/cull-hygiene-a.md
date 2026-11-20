# Cull of r62t-hygiene-a (§H bug classes + §H2 verified lists)

Input `cull-inputs/designs/r62t-hygiene-a.md`. Base Tovu `776ce6d0f` (merge-6), Jini `d3e78b387` (merge-6). Read-only; anchors checked with `git show` and single-symbol `git grep`.

**Counts (5 READY sheets + 1 cloud row):** KEEP 0 · **CUT-TO 3** (H2-A11Y-RESOURCE, H-LIST-NEWS, H-LIST-VISITOR) · **DROP 2** (H2-A11Y-ASSET, H-ABORT-DEPLOY) · **NEEDS-DECISION 6** (5 from the design + 1 new) · CLOUD 1 (H2-PKG) · BLOCKED 0. Agree with every RETIRE, PARTIAL and OWNED-ELSEWHERE row (no sheets).

## Verdicts

| Sheet | Verdict | Base | Reason |
|---|---|---|---|
| H2-A11Y-RESOURCE (Jini) | **CUT-TO** | merge-6 | Bug confirmed (BUGS 1). Cut the new file `react/menu-keyboard.ts` and its new `focusMenuItemOnArrow`: Jini already has `menuFocusIndex` (`ui/src/browser/useMenuKeyboard.ts:12–21`, wraps, Up/Down/Home/End), exported at `browser/index.ts:11`. Features already import `browser/` (`asset-grid/.../DeleteConfirmDialog.tsx:3`). With ASSET dropped the helper would have one caller. Inline the handler in the one component. |
| H2-A11Y-ASSET (Jini) | **DROP** | — | Not a bug. `AssetTreeRowMenu.tsx:55–83` is a plain popover of `<button>`s: no `role="menu"`/`menuitem`, so nothing promises arrow keys and every action is reachable with Tab. Its only purpose in the design was to be the second caller that justified the new helper. |
| H-ABORT-DEPLOY (Jini) | **DROP** | — | Not a bug. The tool executor is the only path that calls `handler` (`daemon/src/tool-executor.ts:11–16`). `tool-executor-handler.ts:128–130` returns `cancelled` when the signal is aborted and then reaches `handler(...)` at `:155` with no `await` in between. An already-aborted call never reaches `publishDeploy`. The handler has no await before dispatch, so an extra `throwIfAborted()` duplicates the executor check. |
| H-LIST-NEWS (Tovu) | **CUT-TO** | merge-6 | Bug confirmed (BUGS 2). `listByCampaign` defaults to `DEFAULT_LIST_LIMIT` = 100 (`repo-sends.ts:100`, `repo-subscribers.ts:10`). The handler at `tool-registrations.ts:358` passes no limit. Edit as designed. Cut the tests to **one** new case. |
| H-LIST-VISITOR (Tovu) | **CUT-TO** | merge-6 | Bug confirmed (BUGS 3). The schema says "Omit query to list everything published" (`tools.ts:258–259`), but `:210` slices to `limit` (20). Edit as designed. Cut the new registry case: the registry forwards `result` unchanged (`capability-registry.ts:118`), and its existing assertion must change anyway. |
| H2-PKG | **CLOUD** | — | Lock job. Needs installs and audits. |
| H2-CATCH-AWAIT, H2-SEM-PASSWORD, H2-SEM-CORS, H2-SEM-MENU, H2-A11Y-CAPTIONS | NEEDS-DECISION | — | See below. |
| Admin send log (new, not in the design) | NEEDS-DECISION | — | BUGS 4. |
| All RETIRE rows, all PARTIAL rows, ownership register | agree | — | Spot-checked: H-BOOT-TOKEN (`serve-listen.ts:57–58`, only when `emitBootToken === true`), H-DOLLAR (credential `replace(...)` method, not `String.replace`), H-POST-DELETE (`resolvePostIdForDelete` catches lookup failures, `delete.ts:50–61`), H-LIST-KEYS (picker and `find`/`adopt` read the same capped, ordered rows, so lookup matches the picker. The bug is only the silent cap, BUGS 5). |

## Exact cut text

### H2-A11Y-RESOURCE · Jini · merge-6
"In `packages/ui/src/features/resource-dashboard/react/components/ResourceCardParts.tsx` add `import { menuFocusIndex } from '../../../../browser/useMenuKeyboard.js';`. In `ResourceCardMenuItems`, replace only `onKeyDown={(event) => event.stopPropagation()}` with:
```tsx
onKeyDown={(event) => {
  if (event.key !== 'Escape') event.stopPropagation();
  const entries = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=\"menuitem\"]')];
  const next = menuFocusIndex({ key: event.key, current: entries.findIndex((entry) => entry === event.target), count: entries.length });
  if (next === null) return;
  event.preventDefault();
  entries[next]?.focus();
}}
```
Update the component's doc line to: `/** The open kebab menu's items: arrow keys move between them, Escape reaches the board's dismiss listener, and other clicks and keydowns never bubble to the card. */`. No new file, helper, export or type. Leave native Enter/Space activation alone.
**Test (write it first):** in `features/resource-dashboard/__tests__/ResourceCard.test.tsx` add one `it('moves focus between menu items with the arrow keys')`. Use `baseProps({ menuOpen: true, item: { id: 'p1', title: 'X', menuActions: [two actions] } })` (menu actions live on the item, as in the existing test at `:91`). Focus the first item. ArrowDown focuses the second, and ArrowUp returns to the first. `onOpen` and `onToggleSelected` are never called. Mutation (combine): remove `entries[next]?.focus();`. **Chrome look owed** at combine: Tab into the menu, arrows, Enter, and Escape closing from a focused item."

### H-LIST-NEWS · Tovu · merge-6
"As designed for the edit: in `createNewsletterListSendLogHandler` (`apps/website/src/features/newsletter/tool-registrations.ts:351–360`), call `listByCampaign({ workspaceId: deps.workspaceId, campaignId, limit: DEFAULT_LIST_LIMIT + 1 })` and return `{ sends: rows.slice(0, DEFAULT_LIST_LIMIT).map(toSendLogToolView), truncated: rows.length > DEFAULT_LIST_LIMIT }`. Add `import { DEFAULT_LIST_LIMIT } from "./repo-subscribers.js";`. In `agent-tools.ts` (the `newsletter_list_send_log` description), append: ` Returns at most 100 rows; truncated: true means more rows exist.`
**Test (write it first):** in `__tests__/tool-registrations.model-facing-errors.test.ts`, update the existing one-row payload (`:318`) to add `truncated: false`. Add **one** test. Seed exactly 100 sends for one campaign with `deps.newsletterSendRepo.save`. Assert 100 rows and `truncated: false`. Save a 101st and assert 100 rows in id order and `truncated: true`. No other cases. Mutations (combine): `+ 1` removed; `>` → `>=`. Record the model-output shape change in COMMIT-PLAN.md. The admin route `routes/newsletter/list-send-log.ts` is NOT touched."

### H-LIST-VISITOR · Tovu · merge-6
"Edit as designed: in `apps/website/src/assistant/site/tools.ts`, change only `search_published_entries` to `Promise<{ entries: readonly PublicEntrySummary[]; truncated: boolean }>`. Return `{ entries: matched.slice(0, limit).map(toSummary), truncated: matched.length > limit }`. Change the schema description (`:258–259`) to `"Search this site's published posts and pages by title or slug. Returns summaries only, at most 20 by default; truncated: true means more matched. Omit query to list published entries."`. Leave `capability-registry.ts` unchanged.
**Test (write it first):** in `__tests__/tools.test.ts`, change the existing `maxResults` case (`:225–239`) so that it asserts `truncated: true` above the cap. Add one assertion at exactly the cap with `truncated: false`. Repoint the other direct reads (`:114,122,148,160–163`) to `.entries`. In `capability-registry.test.ts:106`, change only the existing cast's type to `{ result: { entries: readonly { slug: string }[] } }` and read `.result.entries`. No new registry case. Check `server/__tests__/visitor-assistant-safety.integration.test.ts:180–200`: it matches on the JSON text, so it needs no edit. Record the model-output shape change in COMMIT-PLAN.md. **Chrome look owed:** visitor chat with more than 20 public matches."

## BUGS (confirmed on merge-6)
1. Jini `packages/ui/src/features/resource-dashboard/react/components/ResourceCardParts.tsx:30–32`: a `role="menu"` with no arrow-key navigation. It also stops every keydown, so Escape from a focused item never reaches the board's `window` Escape listener (`hooks/useResourceBoard.ts:184–193`; React's root listener stops native propagation). Fix: H2-A11Y-RESOURCE.
2. Tovu `apps/website/src/features/newsletter/tool-registrations.ts:358`: the send-log tool silently returns the first 100 rows. Fix: H-LIST-NEWS.
3. Tovu `apps/website/src/assistant/site/tools.ts:210` with `:258–259`: visitor search silently caps at 20 while its description says it lists everything. Fix: H-LIST-VISITOR.
4. Tovu `apps/website/src/server/inbound/admin-http/routes/newsletter/list-send-log.ts:23`: the admin send-log route has the same silent 100-row cap. Not in the design; unsheeted (see NEEDS-DECISION).
5. Tovu `apps/website/src/server/runtime/composition/other-site-keys.ts:142–144`: saved keys past 50 per site are silently hidden (design H-LIST-KEYS, PARTIAL).

Not bugs: H-ABORT-DEPLOY (executor guard) and H2-A11Y-ASSET (not a menu).

## NEEDS-DECISION (one line each, with recommendation)
- **H2-CATCH-AWAIT:** keep the four current failure envelopes? **Yes**: `asyncRoute` already forwards a second rejection. No change.
- **H2-SEM-PASSWORD:** should interactive new-site creation require an owner password when the parked fix resumes? **Yes**, and never change existing passwords automatically.
- **H2-SEM-CORS:** localhost developer CORS only in dev mode? **Yes**, after listing the desktop callers. One small Opus design, not Codex.
- **H2-SEM-MENU:** require full admin for raw menu HTML writes, tools included? **Yes**, through the existing authorization path. One security sheet in the next round.
- **H2-A11Y-CAPTIONS:** add caption and transcript tracks to media? **Not now**: it is a new feature, not hygiene. Park it in the backlog.
- **Admin send-log cap (BUGS 4):** add `afterId` paging to `GET .../newsletter/campaigns/:id/sends` with the admin UI? **Yes, later**, as one paired route+UI sheet. Not part of this job (that would widen the admin contract).

## Jobs
- **`j-hya-jini-DRAFT.md`** (Jini, base merge-6 `d3e78b387`, 1 sheet): H2-A11Y-RESOURCE. ~2k executor tokens; best batched with other Jini sheets.
- **`j-tv-hya-DRAFT.md`** (Tovu, base merge-6 `776ce6d0f`, 2 sheets): H-LIST-NEWS → H-LIST-VISITOR. No Jini dependency.
- **Combine owes:** the three mutations, two Chrome looks, and the H2-PKG lock job (CLOUD).
- **Dropped:** H2-A11Y-ASSET, H-ABORT-DEPLOY, the `react/menu-keyboard.ts` helper, the new registry test, the separate at-cap newsletter test (folded into one).
