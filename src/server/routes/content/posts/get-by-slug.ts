import { getPublishedPostBySlug, PostNotFoundError } from "#src/features/post/index";
import { getPresentationSettings, PresentationSettingsNotFoundError } from "#src/features/presentation/index";
import { toContentPostResponse } from "#src/server/http/content/posts";
import type { RouteRegistrar } from "#src/server/routes/types";

export const registerContentPostGetRoute: RouteRegistrar = (app, deps) => {
  app.get("/api/content/v1/workspaces/:workspaceId/posts/:slug", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      const [{ post }, { settings }] = await Promise.all([
        getPublishedPostBySlug({
          deps: { repo: deps.postRepo },
          input: { workspaceId: deps.workspaceId, slug: String(req.params.slug ?? "") },
        }),
        getPresentationSettings({
          deps: { repo: deps.presentationRepo },
          input: { workspaceId: deps.workspaceId },
        }),
      ]);

      res.json(toContentPostResponse({ post, activeThemeId: settings.activeThemeId }));
    } catch (err) {
      if (err instanceof PostNotFoundError || err instanceof PresentationSettingsNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }

      res.status(500).json({ error: "internal error" });
    }
  });
};
