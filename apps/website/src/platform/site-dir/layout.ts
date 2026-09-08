/**
 * @file The site directory's own top-level layout, stated as a POSITIVE list of what a portable
 * copy of a site may carry. Read by `duplicate-site.ts`'s `copyPortableEntries`.
 *
 * ## The leak this shape exists to prevent
 *
 * `duplicateSite` originally excluded by NAME: it copied every top-level entry of the source site
 * directory EXCEPT `content.db` (plus its `-wal`/`-shm` sidecars), `config.json` and
 * `.site-meta.json`. An exclusion list is only ever correct for the artifacts someone remembered
 * to name, and this one was already wrong on the day it landed: the chat/session split
 * (`0fb84ae0`) moved conversation history out of `content.db` into a SIBLING `<siteDir>/chat.db`,
 * and `duplicateSite` (`bcf09c62`) landed sixteen minutes later still excluding only `content.db`.
 *
 * A site directory is also where every backup, snapshot, and derived output lands. Observed in
 * `sites/tovu-com/` at the time of writing: `chat.db` + `chat.db-wal`/`-shm` + `chat.db.bak`,
 * `content.db.bak`, `content.db.predelete.bak`, `content.db.bak-<timestamp>`, `content.seed.db`,
 * seven `restore-point-*.db` snapshots (written BESIDE `content.db` by design — Jini
 * `infra/src/db/sqlite/db-ops.ts`), plus `ops/`'s operational journals and `out/`'s publish and
 * export output. Every `.db`/`.bak` among those is a FULL copy of the source site's database, and
 * the ones predating the split still hold the `ai_chats` rows a duplicate is supposed to leave
 * behind. All of them were copied into every duplicate.
 *
 * ## Why an allowlist, and what was rejected
 *
 * A shared "these are the sidecar/derived artifacts" module — one exclusion list read by both this
 * domain and the composition root's path defaults — would keep those two in step, and was
 * considered. It was rejected because it is the same SHAPE: an artifact nobody has classified is
 * still copied, so the next `<something>.db` written next to `content.db` leaks exactly the way
 * `chat.db` did. Reversing the direction makes the failure mode safe instead — a top-level entry
 * this file has never heard of is NOT copied, and a human has to add it here to opt it in.
 *
 * The cost is real and accepted: a genuinely portable directory added later, and not added here,
 * is silently missing from duplicates until someone notices. A duplicate missing a directory is a
 * visible, recoverable bug; a duplicate carrying another client's chat history is a privacy
 * incident that cannot be taken back.
 *
 * `duplicate-content-db.ts`, one level down, deliberately points the OTHER way for the TABLES
 * inside `content.db`: it names the chat/session tables it deletes and keeps everything else. Both
 * are the same rule — keep the unclassified thing on the side where being wrong is recoverable —
 * applied to two different populations. Here the unclassified class is dominated by whole-database
 * backups and restore points, so copying one is a privacy incident; there it is dominated by
 * plugin business data (products, orders, subscribers), so purging one is silent client data loss.
 * See that module's own header for the measurement behind it. Its guarantee stops at `content.db`'s
 * own file boundary; this one covers the directory around it.
 *
 * Not (yet) the single source of truth for path DEFAULTS: `server/runtime/composition/deps.ts`
 * still spells `"chat.db"`, `"uploads"`, `"themes"` and friends inline at its own resolvers.
 * Pointing those here is a safe follow-up, deliberately not made in the change that closed the
 * leak. Nothing about the guarantee above depends on it — under an allowlist, `chat.db` needs no
 * name anywhere.
 *
 * Architectural role: `site-dir` domain logic (INV-06) — pure name predicates, no I/O, no
 * `express`/`cli` import.
 */

/**
 * The site's live content database. Never part of the generic directory copy: `duplicate-site.ts`
 * hands it to `duplicate-content-db.ts`, which produces a WAL-safe, table-purged copy rather than
 * a byte copy — so it is absent from the allowlist below by design, not by omission.
 */
export const CONTENT_DB_FILENAME = "content.db";

/**
 * Every top-level entry name a duplicate may carry verbatim, and nothing else. Each is a directory
 * the site-folder model actually defines:
 *
 * - `uploads` — the site's own media payload (`deps.ts`'s `uploadsDir()`, `initSite`'s `SUBDIRS`).
 *   Carried MINUS its `chat-attachments` staging directory — the one carve-out inside a portable
 *   entry; see {@link CHAT_ATTACHMENTS_ENTRY_NAME} for why.
 * - `themes` — the site's themes, seeded by `initSite` and thereafter edited in place
 *   (`deps.ts`'s `siteThemesDir()`); themes are COPIED into a site, never inherited from the
 *   product tree, so a duplicate without them has no theme at all.
 * - `plugins` — `deps.ts`'s `pluginsDir()`, `initSite`'s `SUBDIRS`.
 * - `overrides` — `initSite`'s `SUBDIRS`. Part of the created layout; no runtime resolver reads it
 *   yet, and it is listed here because `initSite` creates it, not because its consumer was found.
 * - `skills` — `features/skills/layout.ts`'s `resolveSkillLayout`.
 * - `agent-plugins` — `features/agent-plugins/layout.ts`'s `resolveAgentPluginLayout`.
 *
 * Deliberately absent, and each excluded because it is NOT on this list rather than by its own
 * rule: `chat.db` and its sidecars, `content.db*.bak`, `content.seed.db` (a build input for
 * `npm run seed:site`, not site runtime data — the runtime reads its seed from the product tree's
 * `content/seed-sites/<site>/`), `restore-point-*.db`, `ops/` (the source site's own operational
 * journals), `out/` (the source site's publish/export output, tied to ITS domain and identity),
 * `config.json` and `.site-meta.json` (regenerated by `duplicateSite` under the new identity).
 */
const PORTABLE_ENTRY_NAMES: ReadonlySet<string> = new Set([
  "uploads",
  "themes",
  "plugins",
  "overrides",
  "skills",
  "agent-plugins",
]);

/**
 * The ONE path inside a portable entry that a duplicate must still leave behind:
 * `uploads/chat-attachments`, where the agent daemon stages a conversation's uploaded bytes
 * (`server/inbound/assistant/chat-attachment-directory.ts`'s default —
 * `<dirname of content.db>/uploads/chat-attachments`).
 *
 * WHY AN EXCEPTION AT ALL, when this file's whole design is a top-level allowlist: `uploads` is
 * portable because it holds the site's MEDIA LIBRARY, which a duplicate genuinely needs. Chat
 * attachments merely share that root for historical reasons; they belong to the source site's own
 * conversations — and those conversations are already, deliberately, not copied (`chat.db` is off
 * {@link PORTABLE_ENTRY_NAMES}, for exactly the "a duplicate handed to a different client must not
 * carry it" reason). Withholding the history while shipping the files attached to it was an
 * asymmetry, not a decision.
 *
 * Name-scoped to the `uploads` root, deliberately: a media asset that happens to live in a folder
 * an operator named `chat-attachments` deeper in the tree is ordinary media and is still carried.
 *
 * Expressed as a name here rather than by calling `resolveChatAttachmentUploadDirectory()`: that
 * resolver lives in `server/` and reads the composition root, which `site-dir` domain logic must
 * not import (INV-06). The consequence is disclosed rather than assumed away — an operator who has
 * relocated staging with `TOVU_CHAT_ATTACHMENTS_DIR` to a DIFFERENT name inside `uploads/` is
 * outside this rule, exactly as they are outside every other default this file encodes.
 */
export const CHAT_ATTACHMENTS_ENTRY_NAME = "chat-attachments";

/** The portable entry {@link CHAT_ATTACHMENTS_ENTRY_NAME} sits under. Named so the one call site
 *  that has to special-case it cannot drift from the allowlist entry it refers to. */
export const UPLOADS_ENTRY_NAME = "uploads";

/**
 * True for a top-level site-directory entry a duplicate is allowed to carry verbatim.
 *
 * @param entryName - one `fs.Dirent.name` from the source site directory's own top-level listing.
 * @returns `true` only for a name on {@link PORTABLE_ENTRY_NAMES}; `false` for everything else,
 *   including every artifact this file has never heard of — see this file's own header for why
 *   that default is the point rather than a gap.
 * @complexity O(1) — one `Set` lookup.
 * @overallScore 100
 */
export function isPortableSiteEntry(entryName: string): boolean {
  return PORTABLE_ENTRY_NAMES.has(entryName);
}
