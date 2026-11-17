import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { request } from "../../../lib/admin-http/request";
import type { AdminPost } from "../../posts/api/posts-api.types";
import type { AdminPagePluginEmbed } from "./pages-api.types";

/** The admin API calls of the pages feature. */
export const pagesApi = {
  listPages: () =>
    request<{ posts: Array<{ post: AdminPost }> }>({ path: `/workspaces/${WORKSPACE_ID}/pages` }),
  createPage: ({ title }: { title: string }, _optional: Record<string, never> = {}) =>
    request<{ post: AdminPost }>({ path: `/workspaces/${WORKSPACE_ID}/pages` }, { init: {
      method: "POST",
      body: JSON.stringify({ title }),
    } }),
  // Kind-guarded read: 404s if the id's row is not actually `kind: "page"`. `features/pages` uses
  // this rather than `getPost` so the Pages editor can never silently open a Post — Pages and Posts
  // are separate features with separate editors, and the id in the URL is the only thing standing
  // between them.
  getPage: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<{ post: AdminPost; pluginEmbeds?: readonly AdminPagePluginEmbed[] }>({ path: `/workspaces/${WORKSPACE_ID}/pages/${encodeURIComponent(id)}` }),
  // SPEC-047 — writes the bespoke-HTML body, and births the html row on first call. A DIFFERENT
  // endpoint from `updatePost` on purpose: the body and the title/slug/status go through two
  // separate server-side write paths.
  //
  // **This route takes no `expectedVersion`, and its server-side compare-and-set does NOT protect a
  // second editor** — corrected 2026-09-07; this comment used to claim the opposite ("only this one
  // offers compare-and-set, a 409 rather than a silent overwrite when someone else edited the page
  // since this editor loaded it"), and `apps/website/src/server/inbound/admin-http/routes/pages/update-html.ts`'s own header still says
  // something similar. What the route actually does is `read()` then `write()` inside ONE request
  // (`PagesHtmlDocumentStore`, CIC-1), so the version it conditions on is one it captured
  // microseconds earlier — it serializes two writes racing inside the server, and can never see the
  // version the CLIENT loaded. It also BUMPS `version` on every successful write.
  //
  // `updatePost` above is the only one of the two that accepts a client-supplied `expectedVersion`,
  // which is why `usePageEditor.save` writes metadata FIRST and only reaches this route once that
  // guard has passed. Reordering those two calls, or adding a body-only save path, silently removes
  // the protection — see `writePage` in `use-page-editor.hooks.ts`.
  updatePageHtml: ({ id, html }: { id: string; html: string }, _optional: Record<string, never> = {}) =>
    request<{ post: AdminPost }>({ path: `/workspaces/${WORKSPACE_ID}/pages/${encodeURIComponent(id)}/html` }, { init: {
      method: "PUT",
      body: JSON.stringify({ html }),
    } }),
  // Soft delete (apps/website/src/server/inbound/admin-http/routes/pages/delete.ts): same trash marker as deletePost, but
  // kind-guarded — 404s if the id's row is not actually kind:"page" (indistinguishable from
  // not-found, matching the rest of the pages/* routes' disclosed asymmetry).
  deletePage: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<{ post: AdminPost }>({ path: `/workspaces/${WORKSPACE_ID}/pages/${encodeURIComponent(id)}` }, { init: {
      method: "DELETE",
    } }),
};
