import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { siteUrl } from "../lib/site-url";

export function Dashboard() {
  const [postCount, setPostCount] = useState<number | null>(null);
  const [publishedCount, setPublishedCount] = useState<number | null>(null);
  const [themeId, setThemeId] = useState<string | null>(null);

  useEffect(() => {
    api.listPosts().then((r) => {
      setPostCount(r.posts.length);
      setPublishedCount(r.posts.filter((entry) => entry.post.status === "published").length);
    });
    api.getPresentation().then((r) => setThemeId(r.settings.activeThemeId));
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="dash-grid">
        <div className="dash-card">
          <h3>Content</h3>
          <p className="dash-number">{postCount ?? "…"}</p>
          <p>
            posts ({publishedCount ?? "…"} published) · <a href="/admin/posts">manage</a>
          </p>
        </div>
        <div className="dash-card">
          <h3>Theme</h3>
          <p className="dash-number">{themeId ?? "…"}</p>
          <p>
            active theme · <a href="/admin/themes">switch</a>
          </p>
        </div>
        <div className="dash-card">
          <h3>Site</h3>
          <p>
            Your public site is live. <a href={siteUrl("/")} target="_blank" rel="noreferrer">Open site ↗</a>
          </p>
        </div>
      </div>
    </div>
  );
}
