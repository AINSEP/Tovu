import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { siteUrl } from "../lib/site-url";

/**
 * @file Admin landing screen. Two independent GETs feed the two data cards — previously bare
 * `.then()` with no `.catch()` (audit finding, `ADS-memory/reports/audits/
 * 20260801-admin-adversarial-ux-audit.md`, exec summary #5): a rejected promise left both cards
 * showing "…" forever with zero indication anything was wrong, on the first screen every operator
 * sees after login. Each fetch now has its own error slot rather than one shared `error` — the two
 * cards are independent data sources, so a failed post count should not also blank a theme id that
 * loaded fine (the same "a later/unrelated failure must not blank state that already rendered"
 * principle `Pages.tsx`/`Posts.tsx` apply via their `error && !data` guard, expressed here as
 * per-card scoping instead of a single page-level gate since there is no single page-level load to
 * gate — this screen never had one).
 */
export function Dashboard() {
  const [postCount, setPostCount] = useState<number | null>(null);
  const [publishedCount, setPublishedCount] = useState<number | null>(null);
  const [themeId, setThemeId] = useState<string | null>(null);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [themeError, setThemeError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listPosts()
      .then((r) => {
        setPostCount(r.posts.length);
        setPublishedCount(r.posts.filter((entry) => entry.post.status === "published").length);
      })
      .catch((e) => setPostsError(e instanceof Error ? e.message : "failed to load post counts"));
    api
      .getPresentation()
      .then((r) => setThemeId(r.settings.activeThemeId))
      .catch((e) => setThemeError(e instanceof Error ? e.message : "failed to load the active theme"));
  }, []);

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="dash-grid">
        <div className="dash-card">
          <h3>Content</h3>
          {postsError ? (
            <div className="notice error" role="alert">
              {postsError}
            </div>
          ) : (
            <>
              <p className="dash-number">{postCount ?? "…"}</p>
              <p>
                posts ({publishedCount ?? "…"} published) · <a href="/admin/posts">manage</a>
              </p>
            </>
          )}
        </div>
        <div className="dash-card">
          <h3>Theme</h3>
          {themeError ? (
            <div className="notice error" role="alert">
              {themeError}
            </div>
          ) : (
            <>
              <p className="dash-number">{themeId ?? "…"}</p>
              <p>
                active theme · <a href="/admin/themes">switch</a>
              </p>
            </>
          )}
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
