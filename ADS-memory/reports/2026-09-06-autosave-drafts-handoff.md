# autosave-drafts — handoff (2026-09-06)

Written by the **coordinator**, not the agent. It was rotated out at ~530k tokens before writing its
own handoff, so this is reconstructed from its reports and the committed tree. **Everything marked
UNVERIFIED is a claim nobody has checked — do not inherit it as fact.**

## What this feature is

Leona: *"even if they haven't saved it, temp save it whenever they make a draft. What if they reload
the page on accident or exit out of the page? I don't want them to lose their work."* And on the
mechanism: *"It should be a standing draft anytime something is updated."* She chose **database
persistence over browser-only storage** explicitly.

## Commits, in order

| SHA | What |
|---|---|
| `e94da8f8` | nullable `posts.autosave_json` column |
| `eba275f4` | persistence + HTTP surface (posts **and** pages) |
| `56a0fc09` | shared standing-draft autosave hook + api client functions |
| `9ac963e0` | autosave carries the title explicitly |
| `05782b71` | **pages wired**, plus the missing unsaved-work guard |
| `559655cb` | posts wired into `usePostEditor`; slug URL fix |
| `a4b99c90` | pages recovery banner in `PageEditor` |
| `34694309` | **WIP**, posts recovery banner — committed by the coordinator to rescue it from the stop, state unverified |

## The schema change is LIVE on the real database

`posts.autosave_json` (TEXT, nullable) is **already applied to `sites/tovu-com/content.db`** —
Leona's real 44 MB site database. Confirmed present via `pragma table_info(posts)`.

Pre-migration backup, taken and verified by the coordinator before it applied:
`.local-artifacts/db-backups/content.db.pre-autosave-20260906-133020.bak` — 44,068,864 bytes,
`pragma integrity_check` = ok, 133 `posts` rows matching live at the time.

## The design, as approved

- **Storage:** a new nullable column on `posts`, following the `seoExtJson` precedent. NULL for every existing row, no backfill.
- **Two substrates were ruled out, for good reasons — do not revisit them.** `entry_revisions` belongs to SPEC-018's generic-content-types feature; posts and pages are `posts` rows (`kind: "post"|"page"`) with their own repo (`features/post/repo.sqlite.ts`) and never touch `entries`. Writing there would pollute an unrelated feature's ledger. `posts.ext` is a documented Critical Internal Constraint (CIC U-004) — written only by the `content.entry.beforeSave` hook-merge inside `updatePost`/`createPost`, and read back verbatim by the revert gateway (BR-08 / CIC U-005); autosave writing there would violate a binding constraint and race the real save's read-modify-write.
- **Why the published-post problem is solved by construction, not by a branch:** autosave writes via a targeted `UPDATE posts SET autosave_json = ? WHERE id = ? AND workspace_id = ?` that never goes through `updatePost` — no `beforeSave` hook per tick, no version bump, no search reindex, no status-transition event. A published post's live content is physically untouched. **One code path serves draft and published identically**, so there is no sibling arm to leave broken.
- **Recovery UX:** on editor load, if `autosave_json` is present, show a dismissable banner — "Unsaved changes from N minutes ago — Restore / Discard". **Never auto-applied.** If `baseVersion` differs from the post's current `version`, still offer it but label it stale; discard is the safe default.
- **Cadence:** 3s idle debounce, 15s max-wait ceiling while typing continuously; flush on blur / `pagehide` / `visibilitychange` and before the in-app nav guard fires. No pruning needed — one mutable JSON cell per post, overwritten in place, cleared to NULL on real Save/Publish or explicit Discard.
- **`beforeunload`** kept as belt-and-braces, because the debounce window means the last seconds of typing may not have flushed.

## UNVERIFIED — check these before building on them

- **Has anyone actually typed into an editor, reloaded mid-edit, and seen the work come back?** That is the acceptance test and there is **no evidence it was ever run**, for pages or for posts. Do not treat the feature as done until you have done it yourself, in a browser.
- **The posts recovery banner (`34694309`) is unreviewed.** Whether it renders, and whether Restore and Discard behave, is unknown.
- Whether the recovery banner's stale-`baseVersion` labelling was implemented as designed, or only designed.

## The edge most likely to be wrong — look here first

**A real Save clears `autosave_json`. If a debounced autosave write is still in flight when it does,
the stale crumb lands *after* the save and resurrects old content on the next reload** — silently,
and only for the user who happened to save quickly after typing.

Whether that ordering is handled is unknown. Establish it, and test it with an assertion that would
actually fail under the race — ask "what would this still pass under?" This repo has a documented
history of green tests that tolerate exactly this kind of defect.

## A separate finding, out of scope, do not fix here

**`updatePost` has no optimistic-concurrency check at all for doc-format saves.** Two operators
editing the same post silently clobber each other **on the live document** — no version compare, no
warning, last write wins. Pre-existing, unrelated to autosave, and worth its own ticket.

Autosave itself is safe from this by construction: the crumb never becomes live content until a human
clicks the real Save, so the worst case of two tabs autosaving concurrently is last-write-wins on a
disposable crumb.

## Notes for whoever continues

- **Both editors.** Pages and posts. The design has no branch between them — good — but *prove* that by exercising each, not by asserting the code path is shared. Pages/posts is the pair that has bitten three separate agents today.
- `apps/admin/src/features/{pages,posts}/**` is **free** — every agent that was in it is stopped.
- Commit incrementally. Two agents were stopped today with substantial work uncommitted and the coordinator had to rescue both.
