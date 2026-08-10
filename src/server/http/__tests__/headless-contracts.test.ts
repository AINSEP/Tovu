import assert from "node:assert/strict";
import test from "node:test";

import type {
  AdminPostEnvelope,
  AdminPresentation,
  ContentPost,
  ContentPostPayload,
} from "#src/headless/index";
import type { PostRecord } from "#src/features/post/index";
import type { PresentationSettingsRecord } from "#src/features/presentation/index";
import { toAdminPostResponse } from "../admin/posts";
import { toAdminPresentationResponse } from "../admin/presentation";
import { toContentPostResponse } from "../content/posts";

const seedPost: PostRecord = {
  id: "post-1",
  workspaceId: "workspace-1",
  kind: "post",
  title: "Hello World",
  slug: "hello-world",
  bodyJson: { type: "doc", content: [] },
  bodyFormat: "doc",
  bodyHtml: null,
  status: "published",
  updatedAt: "2026-04-06T00:00:00.000Z",
  version: 3,
};

const seedPresentation: PresentationSettingsRecord = {
  workspaceId: "workspace-1",
  activeThemeId: "atlas",
  updatedAt: "2026-04-06T00:00:00.000Z",
};

test("admin and content serializers stay aligned with shared headless contracts", () => {
  const adminPostPayload: AdminPostEnvelope = toAdminPostResponse(seedPost);
  const adminPresentationPayload: AdminPresentation = toAdminPresentationResponse({
    settings: seedPresentation,
    availableThemeIds: ["paper", "atlas", "glassmorphic"],
    availableThemes: [
      { id: "paper", tier: "declarative" },
      { id: "atlas", tier: "declarative" },
      { id: "glassmorphic", tier: "declarative" },
    ],
    activeThemePostTemplates: [],
    activeThemeStaticPageIds: [],
  });
  const contentPayload: ContentPostPayload = toContentPostResponse({
    post: seedPost,
    activeThemeId: seedPresentation.activeThemeId,
  });

  assert.deepEqual(adminPostPayload, {
    post: {
      id: "post-1",
      workspaceId: "workspace-1",
      kind: "post",
      title: "Hello World",
      slug: "hello-world",
      // SPEC-047/ADR-056 REQ-3 — AdminPost is now a discriminated union; a "doc"-format post's
      // response carries bodyFormat/bodyHtml alongside the pre-existing fields.
      bodyFormat: "doc",
      bodyJson: { type: "doc", content: [] },
      bodyHtml: null,
      status: "published",
      updatedAt: "2026-04-06T00:00:00.000Z",
      version: 3,
      // Post-template-picker / slug-collision-override features — `toAdminPostResponse` populates
      // both on every live response even when the record itself carries neither (see
      // `HeadlessPost.templateChoice`'s doc), so the serialized shape gains two keys the
      // `seedPost` above never sets. `null` here is "never chosen", NOT "opted out" — the two are
      // distinct stored values, see `resolvePostTemplate`.
      templateChoice: null,
      overridesThemePage: false,
    },
  });

  assert.deepEqual(adminPresentationPayload, {
    settings: {
      workspaceId: "workspace-1",
      activeThemeId: "atlas",
      updatedAt: "2026-04-06T00:00:00.000Z",
    },
    availableThemeIds: ["paper", "atlas", "glassmorphic"],
    availableThemes: [
      { id: "paper", tier: "declarative" },
      { id: "atlas", tier: "declarative" },
      { id: "glassmorphic", tier: "declarative" },
    ],
    activeThemePostTemplates: [],
    activeThemeStaticPageIds: [],
  });

  assert.deepEqual(contentPayload, {
    post: {
      id: "post-1",
      kind: "post",
      title: "Hello World",
      slug: "hello-world",
      bodyJson: { type: "doc", content: [] },
      updatedAt: "2026-04-06T00:00:00.000Z",
    } satisfies ContentPost,
    presentation: {
      activeThemeId: "atlas",
    },
  });
});
