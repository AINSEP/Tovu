import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** theme registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  "theme_copy_file": {
    search: {
      keywords: "theme file copy duplicate clone branch variant new name",
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
  "theme_edit_file": {
    search: {
      keywords: "theme stylesheet css template edit change design code file one line small change patch replace single word snippet section font fonts typography color colors colour primary brand palette style styles look",
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
  "theme_list": {
    search: {
      keywords: "theme themes design appearance skin installed",
      queries: [
        "What themes do we have installed?",
        "Is our current theme valid, or does it have errors?",
        "Can you show me the theme id I need for other theme tools?",
        "What's the validation status of each theme?",
        "List every theme available on the site.",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "theme_list_files": {
    search: {
      keywords: "theme files templates stylesheets css list design",
      queries: [
        "What files does this theme actually have?",
        "Can you show me the folder structure of a theme?",
        "I want to see what templates exist before I edit one.",
        "What's inside the theme's templates folder?",
        "Can you list the files in a theme without guessing filenames?",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "theme_read_file": {
    search: {
      keywords: "theme stylesheet css template view read design code file",
      queries: [
        "Can you show me the contents of this theme file?",
        "I want to read the home template's Liquid code.",
        "Can you open theme.json for this theme?",
        "Show me the raw text of one file inside the theme.",
        "Can I read a file from outside the theme's own folder?",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "theme_rename_file": {
    search: {
      keywords: "theme file rename renaming move name change filename css template stylesheet",
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
  "theme_rescan": {
    search: {
      keywords: "rescan themes refresh themes new theme folder not showing reload themes",
      queries: [
        "Rescan themes after I added a folder.",
        "Refresh themes; my new theme folder is not showing.",
        "Reload themes from disk.",
        "Pick up my new theme folder without restarting.",
        "Scan for added, removed or invalid themes.",
      ],
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
  // Prefer the dedicated copy tool; read+write remains a valid composition with pinned vocabulary.
  "theme_reset_file": {
    search: {
      keywords: "theme file reset restore revert original undo pristine default discard changes modified changed header footer template",
      queries: [
        "Undo my changes to the header template.",
        "Restore a theme file to its original version.",
        "Discard my stylesheet edits and reset it.",
        "Bring back the original footer template in my theme.",
        "Can you revert this theme file from its stored pristine copy?",
      ],
    },
    approval: { class: 'restore-over-existing', confirmation: 'policy' },
  },
  "theme_restore_trashed_file": {
    search: {
      keywords: "theme file bring back undelete recover",
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
  // Switching the rendered theme is distinct from editing one theme's files (F7a).
  "theme_set_active": {
    search: {
      keywords: "theme switch activate change active theme live site look design",
      queries: [
        "Switch my site to the Nordic theme.",
        "Activate an installed theme on my live site.",
        "Change which theme my site uses.",
        "Set the active theme to my existing design.",
        "Turn off the theme on my site.",
      ],
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
  "theme_set_page_published": {
    search: {
      keywords: "static theme standalone about pricing visibility publishedPages allowlist",
      queries: [
        "Publish the about page supplied by this theme.",
        "Unpublish a standalone static theme page.",
        "Hide the pricing page in this theme.",
        "Show this theme page publicly again.",
      ],
    },
    approval: { class: 'publish', confirmation: 'policy' },
  },
  // Whole-theme delete (owner-approved 2026-10-08): the folder goes to the Trash; refused for the active theme.
  "theme_trash": {
    search: {
      keywords: "theme themes delete remove trash get rid of uninstall whole theme old unused theme folder",
      queries: [
        "Delete this theme.",
        "Remove the old theme I'm not using.",
        "Get rid of the luvira theme.",
      ],
    },
    approval: { class: 'trash', confirmation: 'policy' },
  },
  "theme_trash_file": {
    search: {
      keywords: "theme file delete remove trash soft delete",
    },
    approval: { class: 'trash', confirmation: 'policy' },
  },
  "theme_write_file": {
    search: {
      keywords: "theme stylesheet css template edit change design code file overwrite replace whole file copy duplicate clone font fonts typography color colors colour primary brand palette style styles look",
      queries: [
        "Can you update this theme template for me?",
        "How do I edit a theme file — does it check for errors after saving?",
        "I want to overwrite a template file completely, not patch it.",
        "What happens to the live site if I write invalid code to a theme file?",
        "Can you create a new file inside the theme folder?",
      ],
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },

  // --- theme ---------------------------------------------------------------------------------------
  // Read then write-to-a-new-path can copy a theme file safely: it has no row-scoped placement id
  // to orphan. Copy vocabulary remains pinned even alongside the dedicated copy tool.
  "preview_reload": {
    search: {
      keywords: "preview reload refresh hard cache theme css stylesheet template navigate page changes saved",
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
