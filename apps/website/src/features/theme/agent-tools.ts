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
 * - `theme_delete_file`. Destructive and irreversible: this repo has no theme-file revision history
 *   to restore from, so a deleted `home.liquid` is gone, and the theme it belonged to silently drops
 *   to `status: "invalid"`. Same caution class as every other domain's excluded irreversible
 *   operation (`redirects_import`'s mass live-routing change, Recovery's `backup_execute_restore`,
 *   Database's `database_execute_migrate_forward`). An agent that wants a file to stop doing
 *   something can write it empty or write it correct; it does not need to unlink it.
 * - `theme_rename_folder` / `theme_create` / `theme_delete`. A theme's folder name IS its id
 *   (`loadTheme` fails a theme whose `theme.json` id disagrees with its folder), and the active
 *   theme is referenced by that id from presentation settings. Renaming or removing a folder can
 *   therefore break the LIVE site's active-theme resolution — a blast radius categorically wider
 *   than editing a file inside one theme, and one no per-file containment check constrains. Left
 *   out this pass on the same basis.
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
  description: "A theme's id, exactly as returned by theme_list (it is also the theme's folder name).",
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
      description: `The file's complete new contents as UTF-8 text. This is an overwrite, not a patch — send the whole file. Up to ${MAX_THEME_FILE_BYTES} bytes.`,
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
        "Lists every file inside one theme's folder, as paths relative to that folder (e.g. 'theme.json', 'templates/home.liquid'). Read-only. Use this to discover what a theme actually ships before reading or editing it, rather than guessing filenames.",
      sideEffects: "none",
      authorization: { permission: THEME_READ_PERMISSION },
      inputSchema: THEME_ID_ONLY_SCHEMA,
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
        "Writes (creates or overwrites) one file inside a theme's folder, then immediately re-validates the whole theme and returns its resulting status and errors. This is a full-file overwrite, not a patch. The path must stay inside that theme's own folder — absolute paths and '../' escapes are refused. ALWAYS read the returned status: 'invalid' means what you wrote did not pass validation (bad JSON, a disallowed Liquid/Handlebars construct, a syntax error, a missing required template) and the errors array says exactly what to fix. The re-validated theme also becomes what the live site serves, so an invalid write degrades that theme's pages to the built-in fallback body until it is corrected.",
      sideEffects: "mutates-durable-state",
      authorization: { permission: THEME_WRITE_PERMISSION },
      inputSchema: WRITE_FILE_SCHEMA,
    },
  ];
}
