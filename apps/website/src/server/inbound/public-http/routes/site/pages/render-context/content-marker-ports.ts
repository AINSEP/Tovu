import { buildWidgetHostPorts } from "#src/features/widgets/deps";
import { createPublicPostReader, findPublishedPostById, findPublishedPostBySlug } from "#src/features/post/post-read";
import type { ContentMarkerPorts } from "@jini-ai/cms/widgets/content-markers";
import { resolveHtmlPageEmbeds } from "@jini-ai/cms/widgets/html";
import { renderHtmlPageBody } from "../../../../http/site/render/page-body.js";
import type { ContentMarkerResolutionDeps } from "./deps.js";
import { htmlEmbedHostDeps } from "./site-title.js";

export function contentMarkerPorts({ deps }: { deps: ContentMarkerResolutionDeps }, _optional = {}): ContentMarkerPorts {
  return {
    readPublishedHtml: async ({ ref }) => {
      // Page HTML is spliced unmodified: only `pages.edit_html` holders write it and its inline scripts
      // are part of the page (`admin-http/routes/pages/update-html.ts`, Authorization). Sanitizing here
      // stripped tovu.dev's carousel scripts and icons (owner report, 2026-10-12).
      const entity =
        ref.by === "id"
          ? await findPublishedPostById({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId, id: ref.id } })
          : await findPublishedPostBySlug({ deps: { repo: deps.postRepo }, input: { workspaceId: deps.workspaceId, slug: ref.slug } });
      if (!entity || entity.bodyFormat !== "html") return undefined;
      return entity.bodyHtml ?? "";
    },
    renderEmbeds: async ({ html: nestedHtml }) => {
      const nestedResolved = await resolveHtmlPageEmbeds({
        deps: { host: buildWidgetHostPorts({ postRepo: deps.postRepo }, {}),
          entryRepo: deps.entryRepo,
          postRepo: createPublicPostReader({ repo: deps.postRepo }),
          mediaRepo: deps.mediaRepo,
          transformRepo: deps.transformDefinitionRepo,
          mediaContentTypeStore: deps.mediaContentTypeStore,
          taxonomyRepo: deps.taxonomyRepo,
          termRepo: deps.termRepo,
          ...htmlEmbedHostDeps(deps),
        },
        input: { workspaceId: deps.workspaceId, html: nestedHtml },
      });
      return renderHtmlPageBody({ html: nestedHtml, resolved: nestedResolved });
    },
  };
}
