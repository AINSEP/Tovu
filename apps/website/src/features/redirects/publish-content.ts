import { malformedKey } from "#src/features/publish-content/precheck-reasons";
import { createRepoPublishHandler } from "#src/features/publish-content/repo-handler";
import type { PublishContentContributor } from "#src/features/publish-content/type-registry";

import type { RedirectRepoPort } from "@jini-ai/cms/redirects";
import { checkRedirectFieldsWouldWrite, createRedirect, updateRedirect } from "@jini-ai/cms/redirects";
import type { RedirectsWriteDeps } from "@jini-ai/cms/redirects";
import { RedirectConflictError, RedirectLoopError, RedirectTargetNotAllowedError, RedirectValidationError } from "@jini-ai/cms/redirects";
import type { RedirectMatchType, RedirectRecord, RedirectStatus, RedirectStatusCode } from "@jini-ai/cms/redirects";
import { REDIRECT_TABLES } from "./repo.sqlite.js";

/**
 * @file `redirect`'s publish-content contribution, built on `createRepoPublishHandler`
 * (`features/publish-content/repo-handler.ts`; M-RED of
 * `ADS-memory/.local-artifacts/plan-publish-all-types-2026-09-25.md`). A DATA export that imports only
 * `type-registry.ts`'s TYPES — see that file's header for the module cycle a value edge would reopen.
 *
 * ## The natural key
 *
 * Redirect ids are minted per-install (`idGen.newId()` inside `createRedirect`), so two instances
 * holding "the same" rule never share a row id the way `post`/`page`/`media` do. `PackedEntity.id` is
 * `${matchType}:${fromPattern}` instead (behavior.spec.md §5.1's exact-match dedup key), reversed by
 * splitting on the FIRST `:` only: `matchType` has no colon, `fromPattern` may.
 *
 * No `RedirectRepoPort` method finds a row (active OR disabled) by natural key — `lookupExact` and
 * friends filter to `status === "active"` — so {@link findByNaturalKey} lists by `matchType` (both
 * statuses) and matches `fromPattern` client-side: O(n) over tens of rows.
 *
 * ## What is not a factory default
 *
 * - Pack keeps `status === "active"` rows only (`include`, not `isTrashed`): a manually-disabled rule and
 *   a Trash-tombstoned one are both `status: "disabled"` and `RedirectsWriteDeps` cannot tell them
 *   apart, so neither travels — publishing can never resurrect a trashed rule.
 * - No `undo`: `createRedirect`/`updateRedirect` write their own `redirect_revisions` ledger in the same
 *   transaction, so the command gateway would add a redundant second audit trail. The row id is
 *   returned as the report's `changeSetId`.
 * - `permission` is redirects' own `"admin.redirects.manage"`, per `PublishContentHandler.permission`.
 */

/** A row as this transport sees it: the record plus the synthetic `title` label. */
type RedirectRow = RedirectRecord & { readonly title: string };

/** The short word an operator reads for a non-`"exact"` `matchType` in {@link withTitle}'s label. */
const MATCH_TYPE_PREFIX: Readonly<Record<RedirectMatchType, string>> = {
  exact: "",
  prefix: "starts with ",
  wildcard: "matches ",
  regex: "matches pattern ",
};

/** `PackedEntity.id` for a redirect — see this file's header.
 *  @complexity O(1). */
export function redirectNaturalKey(matchType: RedirectMatchType, fromPattern: string): string {
  return `${matchType}:${fromPattern}`;
}

/** Reverses {@link redirectNaturalKey}; `null` for a key with no `:` (a hand-crafted or corrupted id).
 *  @complexity O(n) in the key's length. */
function parseRedirectNaturalKey(key: string): { matchType: RedirectMatchType; fromPattern: string } | null {
  const sep = key.indexOf(":");
  if (sep < 0) return null;
  return { matchType: key.slice(0, sep) as RedirectMatchType, fromPattern: key.slice(sep + 1) };
}

/**
 * Adds what a human calls this redirect on screen. No `RedirectRecord` field is a
 * `slug`/`title`/`name`/`filename` (what `planner.ts`'s `entityDisplayLabel` reads), and a short prefix of
 * the natural key (`"exact:/o"`) is unreadable, so `title` is packed as provenance: shown, never hashed.
 * @complexity O(1).
 */
function withTitle(row: RedirectRecord): RedirectRow {
  return { ...row, title: `${MATCH_TYPE_PREFIX[row.matchType]}${row.fromPattern} → ${row.toTarget}` };
}

/** The row (active OR disabled) holding this natural key, or `null`.
 *  @complexity O(n) in this workspace's row count for `matchType`. */
async function findByNaturalKey(repo: RedirectRepoPort, workspaceId: string, id: string): Promise<RedirectRow | null> {
  const key = parseRedirectNaturalKey(id);
  if (!key) return null;
  const rows = await repo.list({ workspaceId, matchType: key.matchType });
  const row = rows.find((r) => r.fromPattern === key.fromPattern);
  return row ? withTitle(row) : null;
}

/** The fields `createRedirect`/`updateRedirect` take, read off packed state. */
function redirectFields(workspaceId: string, state: Record<string, unknown>) {
  return {
    workspaceId,
    matchType: state.matchType as RedirectMatchType,
    fromPattern: state.fromPattern as string,
    toTarget: state.toTarget as string,
    statusCode: state.statusCode as RedirectStatusCode,
    override: state.override as boolean,
    priority: state.priority as number,
  };
}

/** Called from a composition root (`server/runtime/composition/publish-content-manifest.ts`). */
export const contributeRedirectPublish = (): PublishContentContributor =>
  createRepoPublishHandler<RedirectRow, RedirectsWriteDeps>({
    entityType: "redirect",
    coversTables: [REDIRECT_TABLES.redirects],
    permission: "admin.redirects.manage",
    ports: (deps) => deps.ports.redirect,
    list: async (p, workspaceId) => (await p.repo.list({ workspaceId })).map(withTitle),
    find: (p, workspaceId, id) => findByNaturalKey(p.repo, workspaceId, id),
    idOf: (row) => redirectNaturalKey(row.matchType, row.fromPattern),
    include: (row) => row.status === "active",
    // `transferred` = what `CreateRedirectInput`/`UpdateRedirectInput` accept, plus `status` (always
    // "active" on a packed row). `provenance` fields cannot round-trip: `createdAt` comes from the
    // destination clock, `source` is always "import" on write, and the `auto_slug_change` capture fields
    // are written only by `capture.ts`. Hashing them would be a permanent false conflict.
    fields: {
      matchType: "transferred",
      fromPattern: "transferred",
      toTarget: "transferred",
      statusCode: "transferred",
      status: "transferred",
      override: "transferred",
      priority: "transferred",
      createdAt: "provenance",
      source: "provenance",
      sourceEntryId: "provenance",
      fromPathAtCapture: "provenance",
      toPathAtCapture: "provenance",
      title: "provenance",
      id: "local",
      workspaceId: "local",
      createdByPrincipal: "local",
      createdByPluginId: "local",
      updatedAt: "local",
      version: "local",
    },
    // The same ruleset `createRedirect`/`updateRedirect` run, so preview and apply cannot drift.
    validate: async ({ ports, workspaceId, entity, existing }) =>
      parseRedirectNaturalKey(entity.id)
        ? checkRedirectFieldsWouldWrite({ deps: ports, fields: redirectFields(workspaceId, entity.state) }, { excludeId: existing?.id })
        : malformedKey("redirect", entity.id, "matchType:fromPattern"),
    write: async ({ ports, workspaceId, id, state, existing, principalId }) => {
      if (!parseRedirectNaturalKey(id)) throw new Error(`publish-content: redirect.apply() received a malformed natural key '${id}'`);
      const fields = { ...redirectFields(workspaceId, state), actorId: principalId };
      const { record } = existing
        ? await updateRedirect({
            deps: ports,
            input: { ...fields, id: existing.id, status: (state.status as RedirectStatus | undefined) ?? "active" },
          })
        : await createRedirect({ deps: ports, input: fields, source: "import" });
      return { changeSetId: record.id };
    },
    errors: { blocked: [RedirectValidationError, RedirectTargetNotAllowedError, RedirectLoopError, RedirectConflictError] },
  });
