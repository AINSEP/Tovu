# Explore screen: regroup, JS read-only, copy/rename (⋮ menu)

Agent: Sonnet 5 subagent ("ExploreFileOps"), dispatched by the Opus coordinator, 2026-08-11.
Branch: `general-work`. Scope: `src/server/routes/admin/themes/explore.ts`,
`src/features/theme/theme-files.ts`, `apps/admin/src/features/themes/**`, `apps/admin/src/lib/api.ts`.

## 1. Bug repro (done first, before any code)

Checked `http://localhost:5173/admin/themes/explore?theme=basic` against every candidate in the
brief: sidebar file list (41 files, zero duplicate paths verified server-side, zero duplicate
labels within or across the six group headings), file-under-two-groups (impossible — `fileGroup` is
a total function), preview-pane double-render, React StrictMode DOM duplication, stale-refetch
accumulation. **Found nothing duplicated.** The one visual "repeat" on the page is `pages/index.html`'s
logo marquee — a deliberate `aria-hidden="true"` second copy of the same six logos for the seamless
CSS scroll loop, not a defect. This matches the handoff's own account: the real file-list duplicate
bug (`preview/` generated output) was already fixed earlier the same day (commit `2ee4c33`).

Reported this back to the coordinator as milestone 1 and got no course-correction, so treated it as
closed and moved on to steps 2–4.

## 2. Regroup (`assets` narrowed, new `other` group)

- `assets` group kept its name (never renamed to `media`), now screened by extension: images,
  video, audio, fonts only (`ASSET_EXTENSIONS` in `explore.ts`).
- New `other` group for everything that falls out of page/partial/style/script/config/assets —
  `.md`, `.txt`, `.webmanifest`, stray files. On `basic`: `NOTICE.md` and `LICENSE.md` moved from
  `assets` into `other` (verified live via the server response).
- `config` (theme.json/tokens.json/tokens.light.json) untouched — still its own group, still
  editable.

## 3. JS + `other` become read-only

Split what used to be one `editable` flag into two: `readable` (can this be fetched/shown as text
at all) and `editable` (can this be saved). `.js`/`.mjs`/`.cjs` and `other`-group files are
`readable: true, editable: false`. Enforced in both places:

- **Server:** `isThemeFileWritable()` in `explore.ts`, checked in the PUT route before
  `writeThemeFile` runs — rejects with `403 { code: "READ_ONLY_FILE" }`. Negatively verified: disabled
  the check, watched the two corresponding tests fail (200 instead of 403), restored, watched them
  pass again.
- **Client:** the HTML tab is now a three-way branch — binary (no source, existing behavior),
  read-only-but-visible (a `readOnly` textarea + a visible reason: "Scripts are read-only in
  Explore." for scripts, a generic line for `other`), and normal editable. Save button is **hidden**
  (not disabled) for a read-only file, matching how Reset is already hidden for a non-resettable
  one. Negatively verified the same way (forced the condition to `true`, watched the Save-hidden
  test fail, restored).

I left **Reset** reachable for read-only files (didn't add the same write-block there). The brief
only named the PUT route; Reset restores catalog-original bytes rather than accepting operator
content, and I judged that's closer to an undo/safety-net than "editing from this screen." Flagging
this explicitly in case the owner disagrees — it's a one-line change to close if so
(`isThemeFileWritable` check added to `registerAdminThemeFileResetRoute`).

## 4. Copy + Rename (the ⋮ menu)

**Server** (`explore.ts` + two new `theme-files.ts` primitives, `copyThemeFile`/`renameThemeFile`):
- Both go through `resolveThemeFilePath` for containment on source AND destination — a rename
  target is validated exactly as strictly as a write target, per the brief.
- Both are byte-safe (`copyFileSync`/`renameSync`), not the UTF-8 `readFileSync`/`writeFileSync`
  round trip `readThemeFile`/`writeThemeFile` use — a binary asset copied through the text path
  would come back corrupted.
- Collision naming: `nextAvailableFileName()` in `explore.ts`, same `name`, `name-1`, `name-2`…
  shape as `nextAvailableThemeId` but NOT a direct call into it — that helper collides bare theme-id
  folder names with no extension concept; a file path (`about.html`) needs the suffix inserted
  *before* the extension (`about-1.html`, not `about.html-1`). Said so rather than forcing the reuse,
  per the brief's explicit allowance.
- `reloadTheme` called after both — verified via a negative-shaped assertion in every copy/rename
  test: not just "did the write reach disk" but "does the very next preview render / GET detail
  reflect it," matching the pattern `theme-file-save-route.integration.test.ts` already established
  for PUT.
- Hard-blocked renames: `pages/index.html` (named in the brief) **plus `theme.json` and
  `tokens.json`** (not named in the brief, but `theme.ts` shows the identical failure shape —
  `loadTheme` wraps each in a try/catch that pushes an error and flips `status` to `"invalid"` on
  ENOENT, exactly like the missing-index-page check). `tokens.light.json` is deliberately NOT
  blocked — `theme.ts` documents it as optional, so renaming it degrades rather than breaks, closer
  to the page-URL-change warning case. Flagging this extension explicitly since it goes beyond the
  literal ask.
- Rename `name` is a bare filename (no `/`/`\`), so rename can never move a file between folders —
  a deliberate narrowing that also shrinks the containment surface for operator-typed input.

**Client** (`use-theme-explore.hooks.ts` + `ThemeExplore.tsx`):
- Found `RowMenu` (`@jini-ai/admin/react`) already used across the admin app for exactly this
  ⋮-menu shape — reused it rather than building one. Its CSS (`.row-menu-*`) already existed
  globally in `styles.css`, but `.theme-explore-files button { width:100%; display:block }`
  outranked `.row-menu-trigger`'s own sizing by specificity — fixed by scoping that rule with
  `:not(.row-menu-trigger)`. Verified via `getBoundingClientRect()` in a live browser (22×22px, not
  full-width) before and after.
- No existing inline-rename pattern anywhere in `apps/admin/src` (confirmed via a dedicated
  discovery pass) — built double-click → input-swap → Enter-commits/Escape-cancels from scratch.
  **Design call:** blur cancels rather than commits. The one reference implementation found
  elsewhere in the Jini packages (unused in Tovu) commits-on-blur and needs an explicit
  double-fire guard for "Enter, then the unmounting input's own blur." Making blur cancel instead
  removes that whole hazard class rather than guarding it — Enter or the ⋮ menu's Rename item are
  the two ways to actually commit.
- Copy is unconditional (no confirm) per the owner's own framing ("it'll just copy it right in the
  sidebar"); offered on every group including read-only-to-edit ones, since duplicating bytes
  changes nothing about the source. Rename is also offered everywhere; a locked file shows the
  reason via the existing `error` banner instead of opening the editor (`RowMenu` has no built-in
  disabled-item/tooltip affordance to hang a reason off).
- Renaming a PAGE (not index) opens a second `ConfirmDialog` (`tone="warning"`, not `destructive` —
  it loses no data) naming both the current path and the new name, warning about the URL change,
  before calling the server.

## Verification

- Server: 16/16 (`theme-file-copy-rename-route.integration.test.ts` — 14 new — plus the pre-existing
  save-route regression test, unaffected). One negative verification recorded above.
- Client: 33/33 in `ThemeExplore.unit.test.tsx` (was 20; 13 new), 75/75 across
  `apps/admin/src/features/themes/`. One negative verification recorded above.
- `apps/admin` `tsc --noEmit`: 35 errors, unchanged baseline (pre-existing `Mock<Procedure>` vitest
  typing issue in unrelated test files). Server `tsc --noEmit`: clean.
- Live verification against the running `:5173`/`:3000` servers: regrouping (Assets 15→13,
  NOTICE.md/LICENSE.md moved to a new "Other" heading) and the script read-only viewer confirmed on
  the live `basic` theme (read-only, not touched). Copy, rename, the page-URL warning dialog, and
  the `pages/index.html` hard-block confirmed on a throwaway theme (`explore-test`, created via
  `npm run theme copy basic explore-test`, rescanned in, exercised, then deleted and rescanned back
  out — never used for anything destructive on `basic`/`novice`).

## Not done / left for the owner to weigh in on

- Reset stayed reachable for read-only-to-edit files (see §3) — smallest possible change to close if
  wrong.
- No warning added for renaming `tokens.light.json` (optional, degrades rather than breaks) or for
  renaming a script that something else `<script src>`s — the brief asked me to use judgment here;
  I chose not to extend the page-only URL-change warning to scripts, since nothing in the codebase
  currently tracks script cross-references to warn about accurately, and inventing an unreliable
  warning seemed worse than none.
- Did not touch `AssistantDock.tsx`, `panels.tsx`, or the plugins feature — all mid-edit by another
  agent, out of scope, left untouched throughout including during the repro pass.

## Commits

- `2786ba3` — server: regroup, read-only enforcement, copy/rename routes + 14 tests.
- `d0898b1` — client: ⋮ menu, inline rename, read-only viewer, CSS fix + 13 tests.
