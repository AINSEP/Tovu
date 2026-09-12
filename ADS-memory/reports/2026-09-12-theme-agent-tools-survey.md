# Theme Agent Tools — Capability Gap Survey (READ-ONLY)

Date: 2026-09-12. Branch: `restructure/apps-website-phased`. Scope: `apps/website/src/features/theme/**`
and `apps/website/src/server/inbound/admin-http/routes/themes/explore.ts`. No source files were
modified — this report is the only file this survey wrote.

## Verdict

**Thin-wrapper job, and mostly already done.** The owner's ask — "tool calls for editing, copying,
and doing stuff to theme files: read, edit, copy, reset, list" — is **already built and already wired**
for list/read/write/edit/rename/soft-delete. The premises handed to me described a much narrower agent
surface (essentially "no agent theme tools exist beyond a note that active-theme selection is
withheld"); that is stale. `apps/website/src/features/theme/agent-tools.ts` already declares an
8-tool catalog, `tool-registrations.ts` wires all 8 with handlers (no `unwiredToolIds` escape hatch —
its own header says "the catalog is wired in full"), and it is registered into the live tool catalog at
boot (`contributeThemesTools()` → `tool-catalog-manifest.ts:283` → `installFirstPartyToolContributors()`
→ called at `server/inbound/assistant/agent-daemon-server.ts:370` and
`server/runtime/composition/modules/assistant-byok.ts:298`).

The one genuinely missing piece — matching the owner's own words, "reset one to its original" — is a
**`theme_reset_file` agent tool**. It doesn't exist. Building it is cheap: the two functions it needs
(`readOriginalForReset`'s read-from-catalog logic and `writeThemeFile`) already exist and are already
used by the human HTTP route. A **`theme_copy_file`** tool is also missing and equally cheap
(`copyThemeFile` + `nextAvailableFileName` already exist, already used by the human route). Everything
else the owner listed is not a gap at all.

## Gap Table

| Operation | Human (Explore) | Agent | Backing service function | Status |
|---|---|---|---|---|
| List themes | yes | yes (`theme_list`) | `routeDeps.themes` (in-memory) | already exposed |
| List one theme's files | yes | yes (`theme_list_files`) | `listThemeFiles` (`theme-files.ts`) | already exposed |
| Read one file | yes (GET `/file`) | yes (`theme_read_file`) | `readThemeFile` | already exposed |
| Overwrite one file | yes (PUT `/file`) | yes (`theme_write_file`) | `writeThemeFile` | already exposed |
| Targeted patch (one string→another) | **no** (PUT is full-body only) | yes (`theme_edit_file`) | `readThemeFile`+`writeThemeFile` | **agent exceeds human here** |
| Copy/duplicate a file | yes (POST `/file/copy`) | **no** | `copyThemeFile`+`nextAvailableFileName` (`theme-files.ts`, `explore.ts:398`) | **thin wrapper — build this** |
| Rename a file | yes (POST `/file/rename`) | yes (`theme_rename_file`) | `renameThemeFile`+`validateFileIdentityChange` | already exposed |
| Soft-delete (trash) a file | **no such concept for a human** | yes (`theme_trash_file`/`theme_restore_trashed_file`, MCP-UI confirm-gated) | `renameThemeFile` into/out of `.trash/` | **agent exceeds human here** |
| Hard-delete a file | yes (POST `/file/delete`) | **no**, deliberately | `deleteThemeFile` | owner decision 2026-08-30: agents get soft-delete only — not a gap, a boundary |
| Reset one file to its pristine original | yes (POST `/file/reset`, per-file branch) | **no** | `readOriginalForReset`+`writeThemeFile` (`explore.ts:646-665,735`) | **thin wrapper — build this, the one real gap** |
| Reset a compiled theme's whole generated tree | yes (POST `/file/reset`, generated-tree branch) | **no** | `restoreBuiltThemeGeneratedTree` | low priority — unreachable today, see premise 5 |
| Change the active/live theme | yes (admin Presentation screen) | **no**, deliberately | `patch-active-theme.ts` | explicitly out of scope per `agent-tools.ts`'s own header — a different capability, not this domain |

## A. Agent-side inventory

Source: `apps/website/src/features/theme/agent-tools.ts` (catalog) +
`apps/website/src/features/theme/tool-registrations.ts` (handlers, `buildThemesRegistrations`).

| Tool id | What it does | Side effect | Reachable? |
|---|---|---|---|
| `theme_list` | Lists discovered themes (id/name/tier/status/errors) | none | Yes — handler at `tool-registrations.ts:415` |
| `theme_list_files` | Lists one theme's files (trash hidden by default) | none | Yes — `:432` |
| `theme_read_file` | Reads one file's raw text | none | Yes — `:453` |
| `theme_write_file` | Full-file overwrite, then re-validates + hot-swaps the live theme via `reloadThemeInPlace` | mutates-durable-state | Yes — `:471` |
| `theme_edit_file` | Exact-substring patch (oldString→newString), same re-validate/hot-swap | mutates-durable-state | Yes — `:510` |
| `theme_rename_file` | Renames within the same folder, extension preserved, gated by `validateFileIdentityChange` | mutates-durable-state | Yes — `:551` |
| `theme_trash_file` | Soft-delete into `.trash/<epoch>/<path>`, MCP-UI confirmation-gated | mutates-durable-state | Yes — `:615` |
| `theme_restore_trashed_file` | Moves a file back out of `.trash/` | mutates-durable-state | Yes — `:707` |

Reachability was traced end to end, not assumed from the catalog existing:
`contributeThemesTools()` (`tool-registrations.ts:800`) is called by
`registerToolContributor(contributeThemesTools())` at
`apps/website/src/server/runtime/composition/tool-catalog-manifest.ts:283`, inside
`installFirstPartyToolContributors()`. That function is in turn actually called at process boot —
`server/inbound/assistant/agent-daemon-server.ts:370` (module load) and
`server/runtime/composition/modules/assistant-byok.ts:298` — so this is a correct primitive **with a
wired call site**, the opposite of this repo's usual defect pattern.

Deliberately absent (per `agent-tools.ts`'s own header, lines 43–70), and confirmed still true:
- `theme_delete_file` (hard delete) — owner decision 2026-08-30, quoted: *"agents get soft-delete
  only; hard delete stays human-gated."* A named regression test
  (`assistant/__tests__/tool-registrations.themes.test.ts`) asserts no delete tool is agent-callable.
- `theme_rename_folder`/`theme_create`/`theme_delete` (whole theme) — a theme's folder name IS its id;
  renaming/removing it can break the live active-theme resolution, a wider blast radius than any
  per-file operation.
- Nothing touches active-theme selection — `theme.set` is `patch-active-theme.ts`, a different domain.

There is also **no `theme_reset_file` or `theme_copy_file`** anywhere in this catalog — confirmed by
reading the full file; these are the two real absences, not merely unwired ones.

## B. Human-side inventory

Source: `apps/website/src/server/inbound/admin-http/routes/themes/explore.ts` (1195 lines). Every
route below resolves `:themeId` via `findThemeOrRespond` (`explore.ts:110-122`, using
`req.params.themeId` at lines 114-116).

| Route | Line | Service function it calls |
|---|---|---|
| `GET /themes/:themeId` (detail) | 436 | `listThemeFiles` + `readThemeLineageFile` + `describeThemeFile` (per-file view) |
| `GET /themes/:themeId/file` | 498 | `readThemeFile` |
| `PUT /themes/:themeId/file` | 568 | `writeThemeFile`, then `reloadTheme` |
| `POST /themes/:themeId/file/reset` | 694 | per-file: `readOriginalForReset`+`writeThemeFile`; generated-tree: `restoreBuiltThemeGeneratedTree` (via `handleGeneratedTreeReset`) |
| `POST /themes/:themeId/file/copy` | 760 | `copyThemeFile` + `nextAvailableFileName` |
| `POST /themes/:themeId/file/rename` | 942 | `renameThemeFile` + `validateFileIdentityChange` |
| `POST /themes/:themeId/file/delete` | 1017 | `deleteThemeFile` + `validateFileIdentityChange` |
| `POST /themes/:themeId/page/publish` | 1143 | `applyPagePublishToggle` (page-specific, not a general file op) |

This is the reuse surface: every one of these service functions (`readThemeFile`, `writeThemeFile`,
`copyThemeFile`, `renameThemeFile`, `deleteThemeFile`, `readOriginalForReset`'s logic,
`restoreBuiltThemeGeneratedTree`) already exists in `features/theme/theme-files.ts` or `explore.ts`
and is already exercised by tests — a thin agent-tool wrapper needs no new business logic for copy or
reset, only a handler + schema + permission check, exactly the shape `theme_rename_file` already uses.

## C. Premise audit

1. **HOLDS.** `POST /api/admin/v1/workspaces/:workspaceId/themes/:themeId/file/reset` exists exactly
   as named (`explore.ts:694`). Byte-identical restore confirmed: `readOriginalForReset` (`:646-665`)
   reads the catalog copy verbatim via `readThemeFile`, and the reset handler writes that string back
   unmodified via `writeThemeFile` (`:735`) — no transform in between.

2. **HOLDS.** `downloadMarketplaceTheme` (`marketplace.ts:254-302`) makes exactly two independent
   `cpSync` calls from the one fixture: `cpSync(fixture.dir, catalogDir, ...)` and
   `cpSync(fixture.dir, installedDir, ...)` (`:280-281`). `explore.ts`'s `readOriginalForReset` reads
   the catalog copy back, confirmed above.

3. **PARTIALLY STALE — mislabeled, not wrong.** Per-file edit/rename/delete are real and reachable,
   but they are **HTTP routes in `explore.ts`** (PUT `:568`, rename POST `:942`, delete POST `:1017`),
   not "routes... at `theme-files.ts:494,624,658,764`" as the premise stated. Those four
   `theme-files.ts` line numbers are internal filesystem calls inside the service functions those
   routes call (`writeFileSync` inside `writeThemeFile` at `:494`, `renameSync` inside
   `renameThemeFile` at `:624`, `rmSync` inside `deleteThemeFile` at `:658`, `rmSync` inside
   `restoreBuiltThemeGeneratedTree` at `:764`) — `theme-files.ts` is the feature/service layer, not a
   routes file, and has no routing framework import at all. The `:themeId`-resolution claim is exactly
   right: `explore.ts:114-116` is `findThemeOrRespond`'s `String(req.params.themeId ?? "")` lookup.

4. **HOLDS, verbatim.** `explore.ts:375`: `resettable: options.hasOriginal && existsSync(join(options.catalogDir, relativePath))`.
   Presence-of-catalog-copy, not a content comparison — a file overwritten with byte-identical content
   is still reported `resettable: true`, and there is no code path anywhere in `theme-files.ts` or
   `explore.ts` that reads and diffs bytes for this field.

5. **HOLDS — verified independently of the code comment**, per this survey's own instruction to treat
   comment-sourced claims as suspect. Searched every `theme.json` under the repo
   (`find ... -name theme.json`, excluding `node_modules`) for a `"source"` value inside a `"build"`
   object: **zero matches**. No theme on disk today has `build.source: "compiled"`, so
   `handleGeneratedTreeReset`/`restoreBuiltThemeGeneratedTree` (`explore.ts:621-637`) are real,
   correctly-wired code with **no live theme that can currently reach them** — dead in practice, not
   dead in the source.

6. **HOLDS on substance, FALSE on the specific mechanism named.** No cross-file reference tracking
   exists anywhere in this codebase — confirmed at two sites: `file-identity-lock.ts:93`'s
   `IDENTITY_LOCKED_GROUPS = new Set(["script", "other"])` (quote, `:86-91`: *"nothing in this
   codebase tracks cross-file references... No such tracking exists for arbitrary cross-file
   references"*), and the identical comment repeated at `explore.ts:930-936`. Critically,
   **`"partial"` is NOT in `IDENTITY_LOCKED_GROUPS`** — only `script`/`other` are locked — so a
   partial file CAN be renamed today with no server-side block (delete isn't agent-exposed at all,
   but rename and trash both reach partials unguarded).
   However, the premise's own framing — "another template `{{include}}`s it" — does not match how
   this codebase actually resolves partials: `liquid-allowlist.ts:10` explicitly **bans**
   `{% include %}`/`{% render %}`/`{% layout %}`/`{% block %}` outright for the Liquid tier, and
   `agent-tools.ts`'s own header says Handlebars templates are validated with "no partials, no
   decorators." The one place a partial reference actually lives is the **`static`** tier's JSON slot
   markers (`theme.json`'s `slots`, resolved by `static-render.ts`'s `resolveSlotMarker`) — and its
   documented failure mode, quoted verbatim (`static-render.ts:513`): *"A marker whose resolved
   partial does not exist collapses to empty, matching the pre-2026-08-10 behavior."* That is quieter
   than "breaks rendering" — the page renders fine, `theme.status` stays whatever it already was, and
   a deleted/renamed partial simply vanishes from the page with **no error and no warning anywhere**,
   to a human or an agent.

7. **HOLDS narrowly, but reads as misleading in isolation.** `agent-tools.ts`'s header does say no
   tool in this catalog changes the active theme (`theme.set` is a separate operation,
   `patch-active-theme.ts`) — true and unchanged. But taken as the sole data point, as this premise
   set implied, it drastically understates reality: this same file is the header for an **8-tool,
   fully-wired catalog** covering list/read/write/edit/rename/trash/restore. The premise is accurate
   about the one thing it claims and silent about everything else in the same file.

## D. Site-scoping (how a theme tool cannot escape its site)

There is no file named `site-assistant-tools.ts` anywhere under `apps/website` — that premise names a
file that does not exist in this app (only `apps/desktop` has a same-named file, out of scope here,
and the closest same-named module in `apps/website` is
`server/runtime/composition/modules/site-assistant.ts`, which is the **public, anonymous-visitor**
chat route (ADR-054) — an unrelated allowlist-registry tool surface, not the admin/agent theme-tool
boundary).

The real mechanism is **structural single-tenancy**, not a per-request check:

- Each server process resolves its theme root **once, at boot**:
  `resolveThemesDirOverride` (`server/runtime/composition/deps.ts:562-564`):
  `overrides?.themesDir ?? siteThemesDir()`.
- It is paired with an explicit `siteBinding` (`resolveSiteBindingOverride`, `deps.ts:572-574`:
  `overrides?.siteBinding ?? describeSiteBinding()`, typed `SiteBinding` from
  `#src/platform/site-dir/index`).
- Both land on `RouteDeps`/`ThemeToolDeps` as `themesDir`/`themes` (`deps.ts:1322-1324`;
  `ThemeToolDeps` shape at `tool-registrations.ts:88-98`) — the exact same object every theme tool
  handler reads.

So a theme tool cannot reach a second site's files for two independent reasons: (1) the process it is
running in was never given another site's `themesDir` at all — there is nothing to escape TO, by
construction of one process per site; and (2) even within its own one site, every read/write still
goes through `theme-files.ts`'s per-file containment check (resolve, `path.relative`, then re-verify
against the `realpath` of the deepest existing ancestor — per `agent-tools.ts`'s own header, lines
36-41) so `../` traversal or a symlink escape is refused inside that one site's folder too. This
matches this project's standing note that the daemon resolves its site from its own boot context
rather than from any per-call parameter.

## E. Two open questions (evidence only, not decided)

**1. Cost of real modified-vs-pristine detection.** Today's `resettable` field
(`explore.ts:375`) is a zero-byte-read `existsSync` stat. A real check needs to compare the live
file's bytes against its catalog twin — both paths (`theme.dir/path` and `catalogDir/path`) are
already computed at exactly the point `resettable` is set, so the natural hook is
`describeThemeFile` (`explore.ts`), and — if this were ever extended to an agent tool — the sibling
function would live in `theme-files.ts` next to `readThemeFile`/`resolveThemeFileWriteScope`. Cost:
this turns the theme-detail GET from O(file count) `stat` calls into O(total bytes) reads+compares on
every request, for every file, since the LIVE side can change from any writer (human, agent, or a
hand-edit before boot) and must be re-read each time regardless of caching. The catalog/pristine side
never changes after install, so it is the one side a stored hash could help with — `theme-lineage.ts`
already writes a per-theme sidecar file (`ThemeLineage`) at copy/install time and would be the
existing place to add a per-file hash map, sparing a re-hash of the catalog side only.

**2. What delete actually risks.** Confirmed: nothing tracks `{{include}}`/partial references for
either tier that could actually carry one. The Liquid/Handlebars tiers can't have this problem at all
(both disallow the include/partial mechanism outright, per premise 6's audit above). The `static`
tier's JSON-slot-marker partials are the one real case, and their failure mode is a **silent content
gap** — `resolveSlotMarker` collapses a dangling reference to `""` with no error, no theme-status
change, and no signal to whoever just deleted/renamed the file. That is a quieter, more dangerous
failure than "breaks rendering with a visible error": a human or agent could delete a referenced
`nav.html` partial and see every page still render `status: valid`, just missing its nav, with nothing
in the tool response or the Explore screen pointing at why.

---

Context usage at time of writing: approximately 55-60% of this session's budget.
