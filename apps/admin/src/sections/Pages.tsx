import { useEffect, useState } from "react";
import { api, type AdminPost } from "../lib/api";
import { siteUrl } from "../lib/site-url";

/**
 * Pages admin screen — same shape as `Posts.tsx`, backed by the pages-filtered
 * endpoints (`GET/POST .../pages`). A page is a `post` row with `kind: "page"`
 * (see `features/post/post.ts`), so it's edited through the same `PostEditor`
 * reached via `#/posts/{id}`.
 */
export function Pages() {
  const [pages, setPages] = useState<AdminPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .listPages()
      .then((r) => setPages(r.posts.map((entry) => entry.post)))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load pages"));
  }, []);

  async function createPage() {
    setCreating(true);
    setError(null);
    try {
      const { post } = await api.createPage("Untitled");
      window.location.hash = `#/posts/${post.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to create page");
      setCreating(false);
    }
  }

  if (error) return <div className="notice error">{error}</div>;
  if (!pages) return <div className="notice">Loading pages…</div>;

  return (
    <div>
      <div className="editor-header">
        <h1>Pages</h1>
        <button onClick={createPage} disabled={creating}>
          {creating ? "Creating…" : "New Page"}
        </button>
      </div>
      <table className="list-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Slug</th>
            <th>Status</th>
            <th>Updated</th>
            <th>v</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((page) => (
            <tr key={page.id}>
              <td>
                <a href={`#/posts/${page.id}`}>{page.title}</a>
              </td>
              <td>
                <a href={siteUrl(`/${page.slug}`)} target="_blank" rel="noreferrer">
                  /{page.slug}
                </a>
              </td>
              <td>
                <span className={`status status-${page.status}`}>{page.status}</span>
              </td>
              <td>{page.updatedAt.slice(0, 16).replace("T", " ")}</td>
              <td>{page.version}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
