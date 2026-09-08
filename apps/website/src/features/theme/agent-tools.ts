import { MAX_THEME_FILE_BYTES } from "./theme-files.js";

/**
 * @file The Themes domain's agent-tool catalog, instantiating SPEC-016 REQ-22's naming/callability
 * convention (the same shape `redirects/agent-tools.ts`, `seo/agent-tools.ts`, and every other
 * domain catalog already use).
 *
 * Purpose:
 * A static, in-process catalog describing every agent-callable tool this domain exposes: list the
 * discovered themes, list one theme's files, read one file, write one file.
 *
 * Why this domain is deliberately BROADER than every other one here, and why that is sound rather
 * than an exception being carved out:
 *
 * Every other domain in this repo exposes narrow, schema-validated operations — `redirects_create`
 * takes a match type and a target, not a row of SQL. That narrowness IS the safety boundary there,
 * because the durable state behind those tools has no independent validator: nothing re-checks a
 * redirect rule after it is written, so the only place to enforce "a redirect is well-formed" is the
 * operation that creates one.
 *
 * Theme content is not like that, and never was. A theme is validated at LOAD time, every time,
 * against validators that have no idea who wrote the file:
 *   - a `.liquid` template must pass `liquid-allowlist.ts` (tag/filter allowlist, AST-walked),
 *   - a `.hbs` template must pass `handlebars-allowlist.ts` (helper/expression allowlist, no
 *     partials, no decorators, no raw output outside one sanctioned path),
 *   - a `.json` template is a closed block vocabulary the declarative renderer will not step
 *     outside of,
 *   - and whichever tier it is, rendering happens inside a `worker_threads` sandbox with a
 *     wall-clock timeout and V8 heap caps, falling back to a built-in body on any failure.
 * A human typing a template in an editor, an external coding agent editing the checkout, and this
 * in-app tool all produce a file on disk that goes through exactly that same gate. A narrow
 * `theme_set_template_header_tagline`-style tool would therefore buy no safety at all — it would
 * only buy inexpressiveness, while the actual guarantee stayed where it already is.
 *
 * So the boundary this catalog enforces is the one that IS load-bearing: WHICH FILES. Not which
 * edit. `theme_read_file`/`theme_write_file` resolve strictly inside one theme's own folder, under a
 * recognized theme root, with a real path-containment check (`theme-files.ts` — resolve first,
 * compare with `path.relative`, then re-verify against the `realpath` of the deepest existing
 * ancestor, so neither `../` traversal nor a symlink escape passes). That same reasoning is exactly
 * why this shape would NOT be sound for arbitrary filesystem access: there is no equivalent
 * load-time validator for "any file on the disk".
 *
 * Deliberate absences (the point of a catalog, not an oversight):
 * - `theme_delete_file` (HARD delete). Destructive and irreversible: this repo has no theme-file
 *   revision history to restore from, so a deleted `home.liquid` is gone, and the theme it belonged
 *   to silently drops to `status: "invalid"`. Same caution class as every other domain's excluded
 *   irreversible operation (`redirects_import`'s mass live-routing change, Recovery's
 *   `backup_execute_restore`, Database's `database_execute_migrate_forward`).
 *
 *   Owner decision, 2026-08-30, resolving the "should the human Explore screen gaining its own
 *   gated file-delete route reopen this" question raised the same day: **agents get soft-delete
 *   only; hard delete stays human-gated.** `theme_trash_file`/`theme_restore_trashed_file` (below)
 *   are the agent-reachable, fully-reversible alternative — moving a file into `.trash/` (never
 *   removing bytes) through the exact same `validateFileIdentityChange` gate rename uses, so a
 *   theme's own required files, a built theme's generated tree, and `script`/`other`-group files
 *   stay just as un-trashable as they are un-renamable. `theme_delete_file` itself stays OUT of this
 *   catalog, unconditionally: `assistant/__tests__/tool-registrations.themes.test.ts`'s "no
 *   whole-theme or file-delete operation is agent-callable..." test asserts this by name and is
 *   certified to stay that way — do not add it, and do not weaken that test to add it.
 * - `theme_rename_folder` / `theme_create` / `theme_delete`. A theme's folder name IS its id
 *   (`loadTheme` fails a theme whose `theme.json` id disagrees with its folder), and the active
 *   theme is referenced by that id from presentation settings. Renaming or removing a folder can
 *   therefore break the LIVE site's active-theme resolution — a blast radius categorically wider
 *   than editing a FILE inside one theme, and one no per-file containment check constrains. Left
 *   out this pass on the same basis. (`theme_rename_file`, below, only ever touches a file inside an
 *   already-discovered theme's own folder — a different, narrower operation from renaming the
 *   folder itself, and not what this bullet excludes.)
 * - Nothing here touches the ACTIVE theme selection. `theme.set` is a separate, already-exposed
 *   operation (`server/routes/admin/presentation/patch-active-theme.ts`); this domain edits theme
 *   content, it does not decide which theme the site serves.
 *
 * How it relates to the project:
 * The server-side tool filter (ADR-014) consumes this catalog to decide which tool names an agent
 * session may even see; `authorize()` (ADR-021 §2) enforces the actual permission checks at call
 * time — this module only declares the catalog shape, it performs no I/O and no enforcement itself.
 *
 * Architectural role:
 * `theme` feature domain. Imports only its own domain's constants, so the published JSON Schemas
 * cannot drift from the validators — same discipline `redirects/agent-tools.ts` uses.
 */

export type AgentToolSideEffect = "none" | "mutates-durable-state" | "mints-token";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  /**
   * JSON Schema for this tool's `input`, published via `ToolDescriptor.inputSchema`
   * (`assistant/tool-registration-kit.ts`'s `buildDomainRegistrations`, which refuses to wire any
   * tool lacking one). Optional to match the shared structural type; every entry in THIS catalog
   * carries one, because every entry in this catalog is wired.
   */
  inputSchema?: Readonly<Record<string, unknown>>;
}

/**
 * The permission gating reads in this domain. Reused rather than invented: `theme.set` is what
 * already gates the presentation/theme surface a human operator reaches
 * (`patch-active-theme.ts`, `admin/themes/list.ts`), so anyone who can already see and switch the
 * workspace's themes can read their files.
 */
export const THEME_READ_PERMISSION = "theme.set";

/**
 * The permission gating writes. A NEW permission rather than a reuse of `theme.set`, because the
 * existing catalog had no natural fit: `theme.set` is described as "Change the active
 * theme/presentation settings" — choosing among already-validated themes, an operation whose worst
 * outcome is the site looking wrong until it is switched back. Editing a theme's source files is a
 * different capability with a different worst case (a template that fails validation takes that
 * theme's pages to the fallback body until fixed), so it gets its own string and is granted to
 * `admin` but not `editor` in the built-in seed — while `theme.set` stays granted to both.
 */
export const THEME_WRITE_PERMISSION = "theme.edit";

const THEME_ID_PROPERTY = {
  type: "string",
  minLength: 1,
  description: "A theme's id, exactly as returned by content_read.theme (it is also the theme's folder name).",
} as const;

const RELATIVE_PATH_PROPERTY = {
  type: "string",
  minLength: 1,
  description:
    "A path relative to the theme's own folder, e.g. 'theme.json', 'tokens.json', 'styles.css', or 'templates/home.liquid'. Must stay inside that folder: an absolute path, or one escaping via '../', is refused. Use theme_list_files to discover what exists.",
} as const;

const LIST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    tier: {
      type: "string",
      enum: ["declarative", "templated", "handlebars", "static", "code"],
      description:
        "Filter to themes of exactly this capability tier. 'declarative' = JSON block trees, 'templated' = LiquidJS, 'handlebars' = Handlebars, 'static' = plain HTML/CSS/JS pages, 'code' = signed-plugin JS (reserved, no themes exist). Omit to list every tier.",
    },
    status: {
      type: "string",
      enum: ["valid", "invalid"],
      description: "Filter to themes in exactly this validation status. Omit to list both.",
    },
  },
} as const;

const THEME_ID_ONLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["themeId"],
  properties: { themeId: THEME_ID_PROPERTY },
} as const;

const LIST_FILES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["themeId"],
  properties: {
    themeId: THEME_ID_PROPERTY,
    includeTrash: {
      type: "boolean",
      description:
        "Include files currently in this theme's trash (paths starting with '.trash/'), soft-deleted via theme_trash_file. Defaults to false — trashed files are hidden from the ordinary listing. Set true to see what can be restored with theme_restore_trashed_file.",
    },
  },
} as const;

const READ_FILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["themeId", "path"],
  properties: { themeId: THEME_ID_PROPERTY, path: RELATIVE_PATH_PROPERTY },
} as const;

const WRITE_FILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["themeId", "path", "content"],
  properties: {
    themeId: THEME_ID_PROPERTY,
    path: RELATIVE_PATH_PROPERTY,
    content: {
      type: "string",
      maxLength: MAX_THEME_FILE_BYTES,
      description: `The file's complete new contents as UTF-8 text. This is an overwrite, not a patch — send the whole file. Up to ${MAX_THEME_FILE_BYTES} bytes. For a small change to a large file, theme_edit_file is usually cheaper and safer: it replaces one exact substring instead of requiring you to re-send the entire file.`,
    },
  },
} as const;

/**
 * `oldString`/`newString` share {@link WRITE_FILE_SCHEMA}'s own `content` ceiling: an edit's RESULT
 * still goes through `writeThemeFile`, which enforces {@link MAX_THEME_FILE_BYTES} on the file as a
 * whole regardless of how it was produced, so capping each half at the same bound is a schema-level
 * early rejection of an input that could never succeed, not a new limit.
 */
const EDIT_FILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["themeId", "path", "oldString", "newString"],
  properties: {
    themeId: THEME_ID_PROPERTY,
    path: RELATIVE_PATH_PROPERTY,
    oldString: {
      type: "string",
      minLength: 1,
      maxLength: MAX_THEME_FILE_BYTES,
      description:
        "The EXACT existing text to replace, byte-for-byte (including whitespace/indentation) — read the file first with theme_read_file to copy it precisely. Must appear in the file exactly once, unless replaceAll is true; zero matches or more than one match (with replaceAll left false) is refused rather than guessed at.",
    },
    newString: {
      type: "string",
      maxLength: MAX_THEME_FILE_BYTES,
      description: "The text to put in oldString's place. May be an empty string to delete oldString outright.",
    },
    replaceAll: {
      type: "boolean",
      description: "Replace every occurrence of oldString instead of requiring exactly one. Defaults to false.",
    },
  },
} as const;

const RENAME_FILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["themeId", "path", "name"],
  properties: {
    themeId: THEME_ID_PROPERTY,
    path: RELATIVE_PATH_PROPERTY,
    name: {
      type: "string",
      minLength: 1,
      description:
        "The new bare FILENAME (not a path) — no '/' or '\\', and it stays in the same folder as path. Renaming also cannot change the file's extension (e.g. 'x.css' to 'y.css' is fine, 'x.css' to 'x.html' is refused): the extension decides how a browser serves the file, so it must survive a rename unchanged.",
    },
  },
} as const;

/** Same `{themeId, path}` shape as {@link READ_FILE_SCHEMA} — kept as its own named constant
 *  rather than reused directly so `theme_trash_file`'s schema reads as its own contract in the
 *  catalog, not a borrowed one that would look coincidental. */
const TRASH_FILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["themeId", "path"],
  properties: { themeId: THEME_ID_PROPERTY, path: RELATIVE_PATH_PROPERTY },
} as const;

const RESTORE_TRASHED_FILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["themeId", "trashedPath"],
  properties: {
    themeId: THEME_ID_PROPERTY,
    trashedPath: {
      type: "string",
      minLength: 1,
      description:
        "The exact trashedPath a prior theme_trash_file call returned (or one seen via theme_list_files with includeTrash: true) — looks like '.trash/1730000000000/pages/about.html'.",
    },
    restoreTo: {
      type: "string",
      minLength: 1,
      description:
        "Where to put the file back. Omit to restore to its original path (recovered from trashedPath itself); pass this only to restore to a DIFFERENT path than where it was trashed from — e.g. if something else already occupies the original path.",
    },
  },
} as const;

/**
 * The Themes domain's fixed agent-tool catalog — see this file's header for the withheld operations
 * and why.
 *
 * @complexity O(1) — a fixed, statically-defined list.
 * @overallScore 100
 */
export function getThemesAgentToolCatalog(): AgentToolDefinition[] {
  return [
    {
      name: "theme_list",
      description:
        "Lists every discovered theme with its id, name, tier, validation status, and validation errors. Read-only. Start here: a theme's id is the handle every other tool in this domain takes, and the errors array is how you find out what is currently wrong with a theme.",
      sideEffects: "none",
      authorization: { permission: THEME_READ_PERMISSION },
      inputSchema: LIST_SCHEMA,
    },
    {
      name: "theme_list_files",
      description:
        "Lists every file inside one theme's folder, as paths relative to that folder (e.g. 'theme.json', 'templates/home.liquid'). Read-only. Use this to discover what a theme actually ships before reading or editing it, rather than guessing filenames. Trashed files (soft-deleted via theme_trash_file) are hidden unless includeTrash: true.",
      sideEffects: "none",
      authorization: { permission: THEME_READ_PERMISSION },
      inputSchema: LIST_FILES_SCHEMA,
    },
    {
      name: "theme_read_file",
      description:
        "Reads one file's raw text content from inside a theme's folder. Read-only. The path must stay inside that theme's own folder.",
      sideEffects: "none",
      authorization: { permission: THEME_READ_PERMISSION },
      inputSchema: READ_FILE_SCHEMA,
    },
    {
      name: "theme_write_file",
      description:
        "Writes (creates or overwrites) one file inside a theme's folder, then immediately re-validates the whole theme and returns its resulting status and errors. This is a full-file overwrite, not a patch — for changing one line or a short section of an EXISTING file, use theme_edit_file instead, which is cheaper and cannot accidentally drop the rest of the file. The path must stay inside that theme's own folder — absolute paths and '../' escapes are refused. ALWAYS read the returned status: 'invalid' means what you wrote did not pass validation (bad JSON, a disallowed Liquid/Handlebars construct, a syntax error, a missing required template) and the errors array says exactly what to fix. The re-validated theme also becomes what the live site serves, so an invalid write degrades that theme's pages to the built-in fallback body until it is corrected.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: THEME_WRITE_PERMISSION },
      inputSchema: WRITE_FILE_SCHEMA,
    },
    {
      name: "theme_edit_file",
      description:
        "Makes a targeted change to one EXISTING file inside a theme's folder by replacing one exact occurrence of oldString with newString — a patch, not an overwrite, so you never have to re-send content you are not changing. Read the file with theme_read_file first so oldString matches byte-for-byte. Refused (no write happens) if oldString does not appear in the file, or appears more than once and replaceAll was left false — pass more surrounding context in oldString to make it unique, or pass replaceAll: true to change every occurrence deliberately. Immediately re-validates the whole theme afterward and returns its resulting status and errors, exactly like theme_write_file — ALWAYS read the returned status the same way.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: THEME_WRITE_PERMISSION },
      inputSchema: EDIT_FILE_SCHEMA,
    },
    {
      name: "theme_rename_file",
      description:
        "Renames one file inside a theme's folder, keeping it in the same folder and the same extension. Refused (409-equivalent) for a theme's own required files (its index page, theme.json, tokens.json — renaming those breaks the theme the same way deleting them would), for a script (.js/.mjs/.cjs) or any other not-a-page/partial/style/config/asset file, and for anything inside a built theme's generated tree — the same rule this domain's HTTP Explore screen enforces for the identical reason: nothing tracks what still references a file by its old name.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: THEME_WRITE_PERMISSION },
      inputSchema: RENAME_FILE_SCHEMA,
    },
    {
      name: "theme_trash_file",
      description:
        "Soft-deletes one file inside a theme's folder: moves it into that theme's own trash (a '.trash/...' path), out of the way of pages/partials/file listings, WITHOUT deleting its bytes. Fully reversible with theme_restore_trashed_file, which is why this exists instead of a hard delete — there is no agent-callable hard delete in this domain at all; permanent removal is a human-only action in the Explore screen. Refused for the same reasons a rename would be refused: a theme's own required files (its index page, theme.json, tokens.json), a script (.js/.mjs/.cjs) or any other not-a-page/partial/style/config/asset file, and anything inside a built theme's generated tree.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: THEME_WRITE_PERMISSION },
      inputSchema: TRASH_FILE_SCHEMA,
    },
    {
      name: "theme_restore_trashed_file",
      description:
        "Restores one file previously soft-deleted with theme_trash_file, moving it out of '.trash/...' and back to a normal path — by default the exact path it was trashed from, or pass restoreTo for a different one. Refused if trashedPath does not look like something theme_trash_file produced, if the destination is already occupied by another file, or if the destination falls inside a built theme's generated tree.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: THEME_WRITE_PERMISSION },
      inputSchema: RESTORE_TRASHED_FILE_SCHEMA,
    },
  ];
}
