import { ToolInputError } from "@jini-ai/core";
import {
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";

import type { ToolContributor } from "#src/assistant/index";

import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import { EXPECTED_VERSION_REJECTION, isTrashed, VERSION_CONFLICT_CODE, type PostRepoPort } from "../post/index.js";
import { forbiddenRule, withModelFacingErrors } from "../../contracts/core/model-facing-tool-errors.js";
import { pagesAgentToolCatalog, type AgentToolDefinition as PagesAgentToolDefinition } from "./agent-tools.js";
import {
  PageConcurrentEditError,
  PageKindMismatchError,
  PageNotFoundError,
  type PagesHtmlDocumentStoreFactory,
  type PagesHtmlDocumentStorePort,
} from "./html-document-store.sqlite.js";
import { PAGES_EDIT_HTML_PERMISSION } from "./permissions.js";
import { locateRegion, regionHandlesIn, replaceRegionInner, untaggedTopLevelSections, type RegionLookupProblem } from "./regions.js";

/**
 * @file Maps the Pages catalog onto `PagesHtmlDocumentStore`, as `ToolRegistration`s.
 *
 * Authorization shape: the store carries no `authorize()` call of its own, so these handlers
 * perform the same inline permission check the admin routes perform themselves — the pattern
 * `content_post_list`/`content_post_get` already follow for the same reason.
 *
 * **Permission note.** `pages_write_html` checks `pages.edit_html` (SPEC-047 REQ-9) as of
 * 2026-09-05, matching the HTTP route to the same store (`routes/pages/update-html.ts`). This file
 * previously recorded the permission as a gap — both tools checked `content.read`/`content.write`,
 * which the built-in `editor` role holds, so an `editor` could drive page generation and thereby
 * write unsanitized script into the public site. It also recorded the fix as impossible here,
 * because no seeded row spelled `pages.edit_html`. `features/pages/permissions.ts` now creates that
 * row from this repo, via the host-facing `registerPermissionMigration` seam; see its header.
 *
 * `pages_read_html` deliberately still checks `content.read`. REQ-9 is about who may AUTHOR raw
 * markup, and reading a page's own stored body is not the injection capability — narrowing the read
 * too would cost `editor` a capability REQ-9 never asked to take, for no security gain.
 */

const pagesDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> PagesHtmlDocumentStore.read(): one indexed SELECT, no writes.
  ["pages_read_html", "none"],
  // -> ensureHtmlFormat() + write(): converts the row's format on first call, then a
  //    version-conditioned UPDATE of body_html. Durable either way.
  ["pages_write_html", "mutates-durable-state"],
  // -> read() + write(): a version-conditioned UPDATE of body_html carrying a spliced document.
  //    Writes strictly less of the row than `pages_write_html` does, but writes the same column of
  //    the same row through the same store — "smaller edit" is not a lower risk class, and an entry
  //    missing here is not a safe default: `assertRiskMetadataIsWirable` refuses to register a tool
  //    with no classification at all, so the tool would simply not exist at runtime.
  ["pages_write_region", "mutates-durable-state"],
]);

const CATALOG_BY_ID = indexCatalogById(pagesAgentToolCatalog);

/**
 * The optimistic-concurrency basis off an untyped tool input.
 *
 * Same contract, same rejection TEXT, and the same reason for existing as `features/post`'s
 * `parseExpectedVersion` — a value this handler failed to recognize must not coerce to "no basis
 * sent" and be written through as an unguarded save. The rejection TYPE differs on purpose:
 * `features/post`'s throws `PostValidationError` because every one of its arms wraps handlers in
 * `withSchemaOnRejection`, which reclassifies it. Pages has no such wrapper, and `@jini-ai/daemon`'s
 * `ToolExecutor` tags anything that is not a `ToolInputError` as `errorKind: 'internal'`, which
 * `@jini-ai/http-kit`'s `delegatedToolExecuteRoute` then SEC-005-redacts to a bare INTERNAL_ERROR.
 * Reusing the class here would tell the model its site fell over when it actually sent `"3"` instead
 * of `3`. The message constant IS imported, so the two arms cannot drift on what they say.
 *
 * @complexity O(1).
 */
function parsePageExpectedVersion(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {
    throw new ToolInputError(EXPECTED_VERSION_REJECTION);
  }
  return raw;
}

/**
 * The version the store captured on its most recent read — the exact predicate its next `write()`
 * will use.
 *
 * Throws rather than returning `null` because every call site here has just completed a successful
 * `read()`/`ensureHtmlFormat()`: a `null` at this point is a store implementation that stopped
 * capturing, not a runtime condition, and silently treating it as "no basis" would disable the
 * version guard exactly when it is most needed.
 *
 * @complexity O(1).
 */
function requireCapturedVersion(store: PagesHtmlDocumentStorePort): number {
  const version = store.capturedVersion();
  if (version === null) {
    throw new Error("pages tool: the store captured no version after a successful read — the write guard has nothing to condition on");
  }
  return version;
}

/**
 * Compare the caller's stated basis against the version the pending write is conditioned on.
 *
 * `ToolInputError` carrying {@link VERSION_CONFLICT_CODE}, for the identical reason
 * `features/post`'s `toModelFacingUpdateError` reclassifies its own conflict: an unmarked rejection
 * reaches the model through `/api/delegated-tool-calls` as a message-stripped INTERNAL_ERROR, so the
 * one thing it most needs to know — that its edit did not land and re-reading fixes it — would never
 * arrive. The classification is honest rather than a trick: a stale basis IS a caller-input problem
 * that a different (freshly re-read) input resolves.
 *
 * @throws {ToolInputError} When a basis was sent and does not match.
 * @complexity O(1).
 */
function assertExpectedVersion(required: { id: string; expectedVersion: number | undefined; basis: number }): void {
  const { id, expectedVersion, basis } = required;
  if (expectedVersion === undefined || expectedVersion === basis) return;
  throw new ToolInputError(
    `${VERSION_CONFLICT_CODE}: page '${id}' is at version ${basis}, not the version ${expectedVersion} you based this edit on. ` +
      "Someone else saved it after you read it, so your edit was NOT applied and nothing was overwritten. " +
      "Re-read the page with pages_read_html, reapply your change on top of the body you get back, and resend " +
      "with that version. Do not resend this call unchanged."
  );
}

/**
 * Reclassify the store's compare-and-set rejection on its way to the model; pass everything else
 * through untouched.
 *
 * The window this catches is narrower than {@link assertExpectedVersion}'s and is not the same
 * check: a writer can land between this turn's `read()` and its `write()` even when the caller sent
 * no basis at all, and `PagesHtmlDocumentStore` refuses that write by design (CIC-1). Before this,
 * both page writers let that rejection propagate as a bare `Error`, which the delegated transport
 * redacts — so a genuine concurrent edit reached the model as an unexplained server error.
 *
 * @complexity O(1).
 */
function toModelFacingWriteError(err: unknown): unknown {
  if (!(err instanceof PageConcurrentEditError)) return err;
  return new ToolInputError(
    `${VERSION_CONFLICT_CODE}: ${err.message}. Nothing was written. Re-read the page with pages_read_html, ` +
      "reapply your change to the body you get back, and resend."
  );
}

/**
 * Refuse a full-page write whose top-level sections carry no `data-agent-element` handle.
 *
 * **Refused at the write seam, not repaired by a postprocessor.** A repair pass would make the
 * stored page differ from the markup the model just emitted — the model would be told it succeeded,
 * learn nothing, and emit untagged markup again on the next turn, while the operator's page silently
 * contains attributes nobody wrote. Refusing puts the correction on the turn the mistake was made,
 * in the only channel the model reads.
 *
 * The suggested handles are ADVICE, not an edit: they come from each section's own heading text
 * (`suggestRegionHandle`), so they are stable across turns and across insertions, and a suggestion
 * that would collide with a handle already in the document is withheld rather than offered.
 *
 * @throws {ToolInputError} Naming every offending element and, where one can be derived, the handle
 * it should carry.
 * @complexity O(n) in the markup's length.
 */
function assertTopLevelSectionsAreTagged(html: string): void {
  const offenders = untaggedTopLevelSections(html);
  if (offenders.length === 0) return;
  const listed = offenders
    .map((offender) =>
      offender.suggestedHandle === undefined
        ? `<${offender.tag}> (pick a short, content-derived handle for it)`
        : `<${offender.tag}> (suggested handle: "${offender.suggestedHandle}")`
    )
    .join("; ");
  throw new ToolInputError(
    `This page was NOT written. ${offenders.length} top-level element(s) carry no data-agent-element handle: ${listed}. ` +
      'Wrap each one as `<section data-agent-element="<handle>" data-agent-role="region"> ... </section>` and resend. ' +
      "Handles are how any later turn edits one part of this page instead of rewriting all of it, so an untagged " +
      "page is a page that can only ever be replaced wholesale. Name handles after what the section IS " +
      "(\"pricing\", \"faq\"), never after its position — a positional handle goes stale the moment a section moves. " +
      "Only <style> and other metadata elements may sit at the top level untagged."
  );
}

/**
 * Turn a failed handle lookup into the sentence that lets the model fix it on its next call.
 *
 * Every branch names what to do rather than only what went wrong: an absent handle lists the ones
 * that exist (deduplicated — the same handle appearing twice is the ambiguity case, and repeating it
 * in the "available" list would read as two options), and an ambiguous one says which tool resolves
 * it, since `pages_write_region` structurally cannot.
 *
 * @complexity O(r) in the document's region count.
 */
function describeRegionProblem(id: string, handle: string, problem: RegionLookupProblem): string {
  if (problem.kind === "ambiguous") {
    return (
      `Nothing was written: ${problem.count} elements in page '${id}' carry data-agent-element="${handle}", so that handle ` +
      "is not an address — a write to it could land in either one. Fix the duplicate with pages_write_html (give each " +
      "section its own handle), then edit the region you meant."
    );
  }
  if (problem.kind === "not-replaceable") {
    return (
      `Nothing was written: the <${problem.tag}> carrying data-agent-element="${handle}" in page '${id}' has no closing ` +
      "tag in the stored markup, so it delimits no content to replace. Repair the page with pages_write_html."
    );
  }
  const available = [...new Set(problem.available)];
  const list = available.length === 0 ? "it has none at all" : `it has: ${available.join(", ")}`;
  return (
    `Nothing was written: page '${id}' has no region with data-agent-element="${handle}" — ${list}. ` +
    "Call pages_read_html to see the current handles, and target one of those; if the section you want does not exist " +
    "yet, add it with pages_write_html."
  );
}

/**
 * Open a page for a full-body write and return the version the pending write will be conditioned on,
 * or `null` when this call is the page's FIRST html write.
 *
 * The read comes BEFORE the format conversion on purpose. `ensureHtmlFormat` on a `doc`-format row
 * is itself a version-bumping write, so a version captured after it can never equal the basis a
 * caller read beforehand — checking there would reject every legitimate first write and accept
 * nothing extra. Reading first separates the two cases cleanly: an existing html page yields the
 * live version (and the guard applies), and a page with no body yet yields `null` (and there was
 * never a basis to state).
 *
 * S2 (fix plan 2026-09-24, rows 13 + 18-pages) — a caller CAN state a basis for that first-write
 * case now, when it is converting an existing `doc`-format row rather than birthing a genuinely
 * empty page: `pages_read_html` (see its own `hasDocContent`/`note`) tells the model the row's real
 * `version` before it ever calls this, so a stale basis on the conversion turn is exactly as real a
 * conflict as a stale basis on any later write, and is checked here against the row `findById`
 * returns — the one extra SELECT the not-found branch now costs, paid only on the conversion path.
 * A row that does not exist at all (`findById` returns `null`) has no version to check, so the
 * guard is skipped and `ensureHtmlFormat`'s own `PageNotFoundError` reaches the caller unchanged.
 *
 * @throws {PageNotFoundError} If no such row exists at all.
 * @throws {PageKindMismatchError} If the id names a post.
 * @throws {ToolInputError} If a stated `expectedVersion` does not match an existing `doc` row's
 * real version (via {@link assertExpectedVersion}).
 * @complexity O(1) — one indexed read, plus (on the conversion path) one indexed lookup and one
 * indexed update.
 */
async function openForFullWrite(
  store: PagesHtmlDocumentStorePort,
  seedHtml: string,
  guard: { postRepo: PostRepoPort; workspaceId: string; id: string; expectedVersion: number | undefined }
): Promise<number | null> {
  try {
    await store.read();
    return requireCapturedVersion(store);
  } catch (err) {
    if (!(err instanceof PageNotFoundError)) throw err;
  }
  const row = await guard.postRepo.findById({ workspaceId: guard.workspaceId, id: guard.id });
  if (row) assertExpectedVersion({ id: guard.id, expectedVersion: guard.expectedVersion, basis: row.version });
  await store.ensureHtmlFormat(seedHtml);
  return null;
}

export interface PagesToolDeps {
  workspaceId: string;
  authorize: AuthorizeFn;
  pagesHtmlStore: PagesHtmlDocumentStoreFactory;
  postRepo: PostRepoPort;
}

export function buildPagesRegistrations(routeDeps: PagesToolDeps): ToolRegistration[] {
  const handlers: Record<string, ToolHandler> = {
    pages_read_html: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: "content.read",
        entityType: "post",
      });

      const id = requireString(input, "id");
      const store = routeDeps.pagesHtmlStore({ workspaceId: routeDeps.workspaceId, postId: id, actorId: ctx.principal.id });

      try {
        const html = await store.read();
        // `version` is the basis a writer states back as `expectedVersion` — see
        // `PagesHtmlDocumentStorePort.capturedVersion` for why it comes off the store rather than off
        // a second row read.
        return { id, html, regions: regionHandlesIn(html), version: requireCapturedVersion(store) };
      } catch (err) {
        if (err instanceof PageNotFoundError) {
          // A page that exists but has never been given HTML is the common case on a brand-new
          // page, and it is not an error — telling the model "not found" here would send it looking
          // for a different id instead of writing the page it was asked to write. Distinguish the
          // two by asking the repo whether the row exists at all.
          const row = await routeDeps.postRepo.findById({ workspaceId: routeDeps.workspaceId, id });
          // S2 (fix plan 2026-09-24, rows 13 + 18-pages) — a trashed row still 404s (matches every
          // other pages tool's Trash handling: `read()`/`ensureHtmlFormat()` both refuse a trashed
          // row rather than reporting its pre-trash state).
          if (row && row.kind === "page" && !isTrashed(row)) {
            // A `doc`-format Page with real authored content is NOT the same "nothing here yet"
            // case an empty, freshly-created Page is — see this function's `note` below for why the
            // model must be told before it calls `pages_write_html` and silently discards it.
            const hasDocContent = Array.isArray(row.bodyJson.content) && row.bodyJson.content.length > 0;
            return {
              id,
              html: "",
              regions: [],
              bodyFormat: row.bodyFormat,
              version: row.version,
              hasDocContent,
              ...(hasDocContent
                ? {
                    note:
                      "This page is a rich-text (doc) page with content. pages_write_html converts it to HTML and " +
                      "replaces that rich-text body; the previous body is kept in the page's revision history.",
                  }
                : {}),
            };
          }
        }
        throw err;
      }
    },

    pages_write_html: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: PAGES_EDIT_HTML_PERMISSION,
        entityType: "post",
      });

      const id = requireString(input, "id");
      const html = requireString(input, "html");
      const expectedVersion = parsePageExpectedVersion(input.expectedVersion);
      // Before anything is opened or converted, so a refused write leaves the row exactly as it was
      // — including a `doc`-format row that would otherwise have been converted one-way by
      // `ensureHtmlFormat` on the way to a rejection.
      assertTopLevelSectionsAreTagged(html);

      const store = routeDeps.pagesHtmlStore({ workspaceId: routeDeps.workspaceId, postId: id, actorId: ctx.principal.id });

      try {
        const basis = await openForFullWrite(store, html, { postRepo: routeDeps.postRepo, workspaceId: routeDeps.workspaceId, id, expectedVersion });
        if (basis !== null) assertExpectedVersion({ id, expectedVersion, basis });
        await store.write(html);
      } catch (err) {
        if (err instanceof PageKindMismatchError) {
          // Surfaced as a model-facing reason rather than a thrown error: this is a mistake the
          // model can fix on its next turn (it aimed a page tool at a post id), and the fix is to
          // pick a different id, which it can only do if it is told that is the problem.
          return {
            written: false,
            reason:
              `'${id}' is a post, not a page. Posts are edited as rich-text documents through ` +
              "content_post_update; only pages have a bespoke HTML body. Use content_post_list with " +
              "kind:'page' to find the right id, or content_post_create with kind:'page' to make one.",
          };
        }
        throw toModelFacingWriteError(err);
      }

      return { written: true, id, regions: regionHandlesIn(html), version: requireCapturedVersion(store) };
    },

    /**
     * The one-section edit. Read, splice, version-conditioned write — server-side, so the model
     * never has to hold or re-emit the rest of the document.
     */
    pages_write_region: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: PAGES_EDIT_HTML_PERMISSION,
        entityType: "post",
      });

      const id = requireString(input, "id");
      const handle = requireString(input, "handle");
      const fragment = requireString(input, "html");
      const expectedVersion = parsePageExpectedVersion(input.expectedVersion);
      const store = routeDeps.pagesHtmlStore({ workspaceId: routeDeps.workspaceId, postId: id, actorId: ctx.principal.id });

      let current: string;
      try {
        current = await store.read();
      } catch (err) {
        if (err instanceof PageNotFoundError) {
          // Deliberately NOT converted here, unlike `pages_write_html`. A region write addresses
          // something that already exists; there is no region to target in a body that was never
          // authored, and quietly birthing one would make this tool a second, undeclared page
          // creator. Same model-facing-reason shape the kind-mismatch branch above uses, and it
          // covers a post id too — `read()` masks the two by design.
          return {
            written: false,
            reason:
              `'${id}' has no bespoke HTML body to edit a region of. Either it is a post (posts are edited with ` +
              "content_post_update), or it is a page nobody has authored yet — author it in full with " +
              "pages_write_html first, then edit its regions.",
          };
        }
        throw err;
      }

      const basis = requireCapturedVersion(store);
      assertExpectedVersion({ id, expectedVersion, basis });

      const lookup = locateRegion(current, handle);
      if ("problem" in lookup) throw new ToolInputError(describeRegionProblem(id, handle, lookup.problem));

      const next = replaceRegionInner(current, lookup.region, fragment);
      try {
        await store.write(next);
      } catch (err) {
        throw toModelFacingWriteError(err);
      }

      return {
        written: true,
        id,
        handle,
        // The handles that SURVIVED this write, not the ones that went in. Replacing a region that
        // contained other regions removes them, and a model targeting a handle it saw two turns ago
        // is the failure that makes handle churn worse than no handles at all.
        regions: regionHandlesIn(next),
        version: requireCapturedVersion(store),
      };
    },
  };

  return buildDomainRegistrations({
    domain: "pages",
    catalogModule: "features/pages/agent-tools.ts",
    catalog: CATALOG_BY_ID as ReadonlyMap<string, PagesAgentToolDefinition>,
    // S2 (fix plan 2026-09-24, rows 13 + 18-pages) — Pages had no `withModelFacingErrors` wrap at
    // all (this file's own header dated that gap to before this fix: every rejection here was a
    // hand-built `ToolInputError` or nothing). A `PageNotFoundError` that reaches this point (a
    // genuinely missing row on the conversion path — see `openForFullWrite`'s own doc) is real
    // caller input the model can act on (try a different id), not an internal failure, so it earns
    // the same treatment `forbiddenRule` already gives every `ForbiddenError`. `toModelFacingWriteError`
    // stays a separate, inline reclassification at its own two call sites (unchanged) — it targets
    // `PageConcurrentEditError` specifically, with a narrower message than a generic allowlist rule
    // would produce.
    handlers: withModelFacingErrors(handlers, [forbiddenRule("PAGES"), { error: PageNotFoundError, code: "PAGES_NOT_FOUND" }]),
    derivedRisk: pagesDerivedRisk,
  });
}

export { pagesDerivedRisk };

/**
 * Contributes Pages' AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildPagesRegistrations`/
 * `pagesDerivedRisk` by name; this is the seam that replaced it (Stage 2 batch 2). Safe: the only
 * importer of `features/pages/tool-registrations` (relative or `#src/*` subpath) is
 * `assistant/tool-registrations.ts` itself, every other importer of `features/pages` at large is
 * `server/*` (never reachable from `assistant`), and this file's own cross-domain imports
 * (`../post`, `../../core/commands`) are both `import type` only — erased at compile time, so
 * neither creates a runtime edge back toward `assistant`.
 */
export function contributePagesTools(): ToolContributor {
  return { domain: "pages", build: buildPagesRegistrations, risk: pagesDerivedRisk };
}
