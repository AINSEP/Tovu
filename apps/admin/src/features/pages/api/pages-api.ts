import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { request } from "../../../lib/admin-http/request";
import type { AdminPost } from "@jini-ai/admin/posts/api/posts-api.types";
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
  // Carry the successful metadata save's version; another save between the requests must conflict.
  updatePageHtml: ({ id, html, expectedVersion }: { id: string; html: string; expectedVersion: number }, _optional: Record<string, never> = {}) =>
    request<{ post: AdminPost }>({ path: `/workspaces/${WORKSPACE_ID}/pages/${encodeURIComponent(id)}/html` }, { init: {
      method: "PUT",
      body: JSON.stringify({ html, expectedVersion }),
    } }),
  // Soft delete (apps/website/src/server/inbound/admin-http/routes/pages/delete.ts): same trash marker as deletePost, but
  // kind-guarded — 404s if the id's row is not actually kind:"page" (indistinguishable from
  // not-found, matching the rest of the pages/* routes' disclosed asymmetry).
  deletePage: ({ id }: { id: string }, _optional: Record<string, never> = {}) =>
    request<{ post: AdminPost }>({ path: `/workspaces/${WORKSPACE_ID}/pages/${encodeURIComponent(id)}` }, { init: {
      method: "DELETE",
    } }),
};
