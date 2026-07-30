import { useEffect, useState } from "react";
import { api, type AdminPost } from "../lib/api";
import { siteUrl } from "../lib/site-url";

export function Posts() {
  const [posts, setPosts] = useState<AdminPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api
      .listPosts()
      .then((r) => setPosts(r.posts.map((entry) => entry.post)))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load posts"));
  }, []);

  async function createPost() {
    setCreating(true);
    setError(null);
    try {
      const { post } = await api.createPost("Untitled");
      window.location.hash = `#/posts/${post.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to create post");
      setCreating(false);
    }
  }

  if (error) return <div className="notice error">{error}</div>;
  if (!posts) return <div className="notice">Loading posts…</div>;

  return (
    <div>
      <div className="editor-header">
        <h1>Posts</h1>
        <button onClick={createPost} disabled={creating}>
          {creating ? "Creating…" : "New Post"}
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
          {posts.map((post) => (
            <tr key={post.id}>
              <td>
                <a href={`#/posts/${post.id}`}>{post.title}</a>
              </td>
              <td>
                <a href={siteUrl(`/${post.slug}`)} target="_blank" rel="noreferrer">
                  /{post.slug}
                </a>
              </td>
              <td>
                <span className={`status status-${post.status}`}>{post.status}</span>
              </td>
              <td>{post.updatedAt.slice(0, 16).replace("T", " ")}</td>
              <td>{post.version}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
