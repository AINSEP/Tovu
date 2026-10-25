import assert from "node:assert/strict";
import test from "node:test";

import { buildTrashRegistry } from "../registry.js";

/**
 * @file Inline contract for `TRASHABLE` (Stryker lane L14: `trash/registry.ts` 60.9 %, 25 survivors —
 * every one a declarative field that could be emptied with no test failing). The entries decide which
 * permission guards a kind, which marker hides it, and — for a permanent purge — which child rows go
 * first (a member purge must also remove its sessions, magic tokens, subscriptions and consents).
 * Compared to an INLINE literal so a change is a reviewed diff, not a regenerated snapshot.
 */

const EXPECTED = [
  {
    entityType: "email-template",
    label: "Email template",
    permission: "pages.edit_html",
    table: "posts",
    idColumn: "id",
    workspaceColumn: "workspace_id",
    scope: { column: "kind", equals: "email-template" },
    marker: { kind: "timestamp", column: "deleted_at" },
    versionColumn: "version",
    touchColumn: "updated_at",
    display: { title: "posts.title" },
    purgeFirst: [
      { table: "post_revisions", parentIdColumn: "post_id" },
      { table: "post_search_document", parentIdColumn: "post_id" },
    ],
  },
  {
    entityType: "member",
    label: "Member",
    permission: "member.manage",
    table: "members",
    idColumn: "id",
    workspaceColumn: "workspace_id",
    marker: { kind: "status", column: "status", trashed: "trash", restoreFallback: "disabled" },
    versionColumn: "version",
    touchColumn: "updated_at",
    display: { title: "members.email" },
    purgeFirst: [
      { table: "member_sessions", parentIdColumn: "member_id" },
      { table: "member_magic_tokens", parentIdColumn: "member_id" },
      { table: "member_subscriptions", parentIdColumn: "member_id" },
      { table: "member_consents", parentIdColumn: "member_id" },
    ],
  },
  {
    entityType: "form",
    label: "Form",
    permission: "admin.forms.manage",
    table: "form_definitions",
    idColumn: "id",
    workspaceColumn: "workspace_id",
    marker: { kind: "timestamp", column: "deleted_at" },
    versionColumn: "version",
    display: { title: "form_definitions.name", subtitle: "form_definitions.slug" },
    purgeFirst: [
      {
        table: "form_submissions",
        parentIdColumn: "form_definition_id",
        idColumn: "id",
        entityType: "form_submission",
      },
    ],
  },
  {
    entityType: "form_submission",
    label: "Form submission",
    permission: "admin.forms.submissions.delete",
    table: "form_submissions",
    idColumn: "id",
    workspaceColumn: "workspace_id",
    marker: { kind: "timestamp", column: "deleted_at" },
    versionColumn: "version",
    display: {
      title: "form_definitions.name",
      subtitle: "form_submissions.submitted_at",
      join: { table: "form_definitions", on: ["form_definitions.id","form_submissions.form_definition_id"] },
    },
  },
  {
    entityType: "widget",
    label: "Widget",
    permission: "widgets.delete",
    table: "entries",
    idColumn: "id",
    workspaceColumn: "workspace_id",
    scope: { column: "type", equals: "widget" },
    marker: { kind: "timestamp", column: "deleted_at" },
    versionColumn: "version",
    display: { title: "entries.title", subtitle: "entries.slug" },
    purgeFirst: [
      { table: "entry_refs", parentIdColumn: "source_entry_id" },
      { table: "entry_revisions", parentIdColumn: "entry_id" },
    ],
  },
  {
    entityType: "menu",
    label: "Menu",
    permission: "admin.menus.delete",
    table: "menus",
    idColumn: "id",
    workspaceColumn: "workspace_id",
    marker: { kind: "status", column: "status", trashed: "trash", restoreFallback: "published" },
    versionColumn: "version",
    touchColumn: "updated_at",
    display: { title: "menus.title", subtitle: "menus.slug" },
    purgeFirst: [
      { table: "nav_location_bindings", parentIdColumn: "menu_id" },
    ],
  },
  {
    entityType: "term",
    label: "Term",
    permission: "admin.taxonomy.manage",
    table: "terms",
    idColumn: "id",
    workspaceColumn: "workspace_id",
    marker: { kind: "status", column: "status", trashed: "trash", restoreFallback: "active" },
    versionColumn: "version",
    touchColumn: "updated_at",
    display: {
      title: "terms.name",
      subtitle: "taxonomies.name",
      join: { table: "taxonomies", on: ["taxonomies.id","terms.taxonomy_id"] },
    },
    purgeFirst: [
      { table: "entry_terms", parentIdColumn: "term_id" },
    ],
    blocker: { table: "terms", parentIdColumn: "parent_id", code: "TERM_HAS_CHILDREN" },
    hiddenWithParent: {
      parentTable: "taxonomies",
      parentIdColumn: "taxonomy_id",
      parentPkColumn: "id",
      parentMarker: { kind: "status", column: "status", trashed: "trash", restoreFallback: "active" },
    },
  },
  {
    entityType: "taxonomy",
    label: "Taxonomy",
    permission: "admin.taxonomy.manage",
    table: "taxonomies",
    idColumn: "id",
    workspaceColumn: "workspace_id",
    marker: { kind: "status", column: "status", trashed: "trash", restoreFallback: "active" },
    versionColumn: "version",
    touchColumn: "updated_at",
    display: { title: "taxonomies.name" },
    purgeFirst: [
      {
        table: "entry_terms",
        via: {
          matchColumn: "term_id",
          throughTable: "terms",
          throughIdColumn: "id",
          throughParentIdColumn: "taxonomy_id",
        },
      },
      { table: "terms", parentIdColumn: "taxonomy_id", idColumn: "id", entityType: "term" },
    ],
  },
];

test("buildTrashRegistry: every entry matches the inline contract, in registration order", () => {
  assert.deepEqual(JSON.parse(JSON.stringify([...buildTrashRegistry().values()])), EXPECTED);
});

test("buildTrashRegistry: each Map key equals its entry's entityType, and every call builds a fresh, equal Map", () => {
  const a = buildTrashRegistry();
  for (const [key, entry] of a) assert.equal(key, entry.entityType);
  const b = buildTrashRegistry();
  assert.notEqual(a, b);
  assert.deepEqual([...a.keys()], [...b.keys()]);
});

test("member purge removes every per-member secret-bearing child table before the member row", () => {
  const member = buildTrashRegistry().get("member")!;
  assert.deepEqual(member.purgeFirst?.map((c) => c.table), ["member_sessions", "member_magic_tokens", "member_subscriptions", "member_consents"]);
  assert.ok(member.purgeFirst?.every((c) => "parentIdColumn" in c && c.parentIdColumn === "member_id"));
});
