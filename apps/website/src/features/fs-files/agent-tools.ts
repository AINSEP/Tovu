import { MAX_FS_FILE_BYTES } from "./fs-files.js";
import { FS_ROOT_DESCRIPTORS, FS_ROOT_IDS } from "./layout.js";

/**
 * @file The `fs-files` domain's agent-tool catalog: two read-only tools, `fs_list_files` and
 * `fs_read_file`, instantiating SPEC-016 REQ-22's naming/callability convention (the same shape
 * `theme/agent-tools.ts`, `site-evidence/agent-tools.ts`, and every other domain catalog already
 * use).
 *
 * Purpose:
 * Today the assistant has NO filesystem access at all — every existing read-oriented tool
 * (`theme_read_file`, `content_read.*`, `custom_credential_make_request`) reads through a
 * domain-specific store, never a raw path. The concrete bug this closes: an Agent Plugin's own
 * bundled `references/*.template.*` files (shipped alongside its `SKILL.md`/manifest, meant to be
 * read and adapted by the agent installing it) are unreachable, because nothing exposes a plugin's
 * own directory to the model that is supposed to use it.
 *
 * ## Why this is a NAMED-ROOT allowlist, never a denylist
 *
 * `layout.ts`'s five roots are the WHOLE allowed surface, not a starting point trimmed by exclusion:
 * `<site>/agent-plugins`, `<site>/themes`, `<site>/skills`, `<site>/uploads`, and the product's own
 * bundled `content/agent-plugins`. Explicitly, deliberately NOT roots:
 * - **The site directory itself** (`<site>/`). It holds `chat.db` as a direct sibling of every
 *   allowed root — every conversation the assistant has ever had — plus `content.db`,
 *   `content.seed.db`, `config.json`, and `ops/`. Allowlisting a directory one level up from where
 *   its own transcript history lives is not a containment gap that can be patched with a pattern
 *   deny; it is a design that guarantees the assistant can eventually read its own chat log. The
 *   fix is structural: the site directory is never a root, full stop.
 * - **`node_modules`, the repo root, and everything else.** No general filesystem access was asked
 *   for or is granted — see this domain's own PR brief: "root allowlist is the primary gate, never
 *   a denylist of secrets."
 *
 * `fs-files.ts`'s `DENIED_FILENAME_PATTERNS` (`*.db`/`.env*`/`*.pem`/`*.key`/`*.p12`) still runs
 * INSIDE every allowed root, as defense in depth for a future root whose directory grows a matching
 * file nobody anticipated — never as the reason a root was considered safe to add in the first
 * place. Read `fs-files.ts`'s own header for the containment argument (symlink-escape resolution via
 * `realpath`, size cap, binary sniff) this catalog's safety claim actually rests on.
 *
 * ## Why read-only, and why no write/edit/delete/rename tool exists in this domain
 *
 * Unlike `theme_write_file` (whose safety argument is "every theme file is re-validated by
 * `loadTheme` on every write, regardless of who wrote it" — see `theme/agent-tools.ts`'s own
 * header), NOTHING downstream of a write through an arbitrary one of these five roots re-validates
 * anything: a `<site>/agent-plugins/<id>/mcp.json` edited in place is not re-checked against the
 * Agent Plugins manifest schema the way a theme template is re-checked against the Liquid/Handlebars
 * allowlists. Granting write access here would be granting unvalidated, unaudited mutation of
 * installed-plugin manifests, theme source (already covered, more safely, by `theme_write_file`),
 * and the site's uploaded media — with no load-bearing check to catch a mistake. This slice is
 * therefore READ-ONLY by design, not by omission: `fs_list_files`/`fs_read_file` are the entire
 * catalog, and a future write/edit/delete/rename tool in this domain is a new, separately-reviewed
 * decision, not a natural extension of this one.
 *
 * How it relates to the project:
 * The server-side tool filter (ADR-014) consumes this catalog to decide which tool names an agent
 * session may even see; `authorize()` (ADR-021 §2) enforces the actual permission checks at call
 * time — this module only declares the catalog shape, it performs no I/O and no enforcement itself.
 *
 * Architectural role:
 * `fs-files` feature domain. Imports only its own domain's constants (`fs-files.ts`'s byte ceiling,
 * `layout.ts`'s root ids), so the published JSON Schemas cannot drift from the validators — same
 * discipline `theme/agent-tools.ts`/`redirects/agent-tools.ts` already use.
 */

export type AgentToolSideEffect = "none" | "mutates-durable-state" | "deletes-durable-state" | "mints-token";

export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

/**
 * Reused, not invented: `content.read` already gates every other read-only, cross-domain tool with
 * no single natural "owning" resource — `site_collect_page_evidence`, `site_get_profile`,
 * `content_post_list`/`content_post_get`. A principal who may read this workspace's content and
 * configuration may read the fixed set of directories this domain exposes, for the identical reason
 * `site-inspection/agent-tools.ts`'s own header gives for reusing it there.
 */
export const FS_FILES_READ_PERMISSION = "content.read";

const ROOT_ENUM_DESCRIPTION = FS_ROOT_DESCRIPTORS.map((r) => `'${r.id}': ${r.description}`).join(" | ");

const ROOT_PROPERTY = {
  type: "string",
  enum: FS_ROOT_IDS,
  description: `Which allowed root to look inside. One of: ${ROOT_ENUM_DESCRIPTION}`,
} as const;

const RELATIVE_PATH_PROPERTY = {
  type: "string",
  minLength: 1,
  description:
    "A path relative to the chosen root, e.g. 'site-compliance/references/checklist.md'. Must stay inside that root: an absolute path, or one escaping via '../', is refused.",
} as const;

const LIST_FILES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["root"],
  properties: {
    root: ROOT_PROPERTY,
    path: {
      ...RELATIVE_PATH_PROPERTY,
      description: "Optional subdirectory within the root to list, e.g. 'site-compliance'. Omit to list from the root itself.",
    },
  },
} as const;

const READ_FILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["root", "path"],
  properties: { root: ROOT_PROPERTY, path: RELATIVE_PATH_PROPERTY },
} as const;

export const FS_LIST_FILES_TOOL_ID = "fs_list_files";
export const FS_READ_FILE_TOOL_ID = "fs_read_file";

/**
 * The `fs-files` domain's fixed agent-tool catalog.
 *
 * @complexity O(1) — a fixed, statically-defined list.
 */
export function getFsFilesAgentToolCatalog(): AgentToolDefinition[] {
  return [
    {
      name: FS_LIST_FILES_TOOL_ID,
      description:
        "Lists every regular file under one allowed directory root (or a subdirectory of it), as paths relative to what you asked to list. Read-only. Use this to discover what a plugin/theme/skill actually ships — e.g. a plugin's own bundled 'references/*.template.*' files — before reading one with fs_read_file, rather than guessing filenames. An empty result means the root (or subdirectory) does not exist yet, not an error. A small set of filename patterns (databases, .env files, private keys) is silently excluded from every listing even inside an allowed root.",
      sideEffects: "none",
      authorization: { permission: FS_FILES_READ_PERMISSION },
      inputSchema: LIST_FILES_SCHEMA,
    },
    {
      name: FS_READ_FILE_TOOL_ID,
      description: `Reads one file's raw text content from inside an allowed directory root. Read-only. Refused for: a path escaping the root (including through a symbolic link), a path matching a denied filename pattern (databases, .env files, private keys/certs), a file larger than ${MAX_FS_FILE_BYTES} bytes, or a file that sniffs as binary (this tool reads text only).`,
      sideEffects: "none",
      authorization: { permission: FS_FILES_READ_PERMISSION },
      inputSchema: READ_FILE_SCHEMA,
    },
  ];
}
