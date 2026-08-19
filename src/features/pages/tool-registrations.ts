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

import { registerToolContributor } from "#src/assistant/index";

import type { AuthorizeFn } from "../../core/commands/index.js";
import type { PostRepoPort } from "../post/index.js";
import { pagesAgentToolCatalog, type AgentToolDefinition as PagesAgentToolDefinition } from "./agent-tools.js";
import { PageKindMismatchError, PageNotFoundError, type PagesHtmlDocumentStoreFactory } from "./html-document-store.sqlite.js";

/**
 * @file Maps the Pages catalog onto `PagesHtmlDocumentStore`, as `ToolRegistration`s.
 *
 * Authorization shape: the store carries no `authorize()` call of its own, so these handlers
 * perform the same inline permission check the admin routes perform themselves — the pattern
 * `content_post_list`/`content_post_get` already follow for the same reason.
 *
 * **Permission note, stated plainly because it is a gap and not a decision.** Both tools check
 * `content.read`/`content.write`, the same permissions ordinary entry editing uses. SPEC-047 REQ-9
 * calls for a distinct `pages.edit_html` granted to `admin` but not `editor`, on the reasoning that
 * a malformed generated page is a broken-artifact risk closer to `theme.edit` than to a content
 * edit. That permission does not exist in the seed yet, so wiring these tools to it would make them
 * uncallable by anyone. Using the content permissions is the honest interim: it means an `editor`
 * can drive page generation today, which REQ-9 intends to stop.
 */

const pagesDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> PagesHtmlDocumentStore.read(): one indexed SELECT, no writes.
  ["pages_read_html", "none"],
  // -> ensureHtmlFormat() + write(): converts the row's format on first call, then a
  //    version-conditioned UPDATE of body_html. Durable either way.
  ["pages_write_html", "mutates-durable-state"],
]);

const CATALOG_BY_ID = indexCatalogById(pagesAgentToolCatalog);

/** Matches `data-agent-element="..."` so a read can report which regions are addressable. A regex
 *  rather than a parse: this is a description handed to the model, not an edit boundary, so a
 *  mis-read costs a slightly wrong hint and nothing else. The authoritative region extraction is
 *  `@jini-ai/vibecoding/html/node`'s parse5 adapter, which is what any offset-sensitive splice must
 *  go through. */
const REGION_HANDLE_PATTERN = /data-agent-element="([^"]+)"/g;

function regionHandlesIn(html: string): string[] {
  return [...html.matchAll(REGION_HANDLE_PATTERN)].map((match) => match[1] as string);
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
      const store = routeDeps.pagesHtmlStore({ workspaceId: routeDeps.workspaceId, postId: id });

      try {
        const html = await store.read();
        return { id, html, regions: regionHandlesIn(html) };
      } catch (err) {
        if (err instanceof PageNotFoundError) {
          // A page that exists but has never been given HTML is the common case on a brand-new
          // page, and it is not an error — telling the model "not found" here would send it looking
          // for a different id instead of writing the page it was asked to write. Distinguish the
          // two by asking the repo whether the row exists at all.
          const row = await routeDeps.postRepo.findById({ workspaceId: routeDeps.workspaceId, id });
          if (row && row.kind === "page") return { id, html: "", regions: [] };
        }
        throw err;
      }
    },

    pages_write_html: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      await requireToolPermission(routeDeps, {
        principalId: ctx.principal.id,
        permission: "content.write",
        entityType: "post",
      });

      const id = requireString(input, "id");
      const html = requireString(input, "html");
      const store = routeDeps.pagesHtmlStore({ workspaceId: routeDeps.workspaceId, postId: id });

      try {
        // Same three-call sequence the HTTP route uses, and for the same reasons: `ensureHtmlFormat`
        // births the row on first write and no-ops afterwards, and `read()` is what captures the
        // version the compare-and-set conditions on. Skipping the read would turn this into an
        // unconditional overwrite that discards a concurrent editor's work.
        await store.ensureHtmlFormat(html);
        await store.read();
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
        throw err;
      }

      const regions = regionHandlesIn(html);
      return {
        written: true,
        id,
        regions,
        // Reported back so the model can see whether its own tagging survived, and so a page with no
        // regions at all is visible as a problem rather than discovered later when a region edit
        // has nothing to address.
        ...(regions.length === 0
          ? { warning: "This page has no data-agent-element regions, so no part of it can be edited without a full rewrite." }
          : {}),
      };
    },
  };

  return buildDomainRegistrations({
    domain: "pages",
    catalogModule: "features/pages/agent-tools.ts",
    catalog: CATALOG_BY_ID as ReadonlyMap<string, PagesAgentToolDefinition>,
    handlers,
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
export function contributePagesTools(): void {
  registerToolContributor({ domain: "pages", build: buildPagesRegistrations, risk: pagesDerivedRisk });
}
