import { useEffect, useState } from "react";
import { api, type AdminPost } from "../lib/api";

export function Posts() {
  const [posts, setPosts] = useState<AdminPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listPosts()
      .then((r) => setPosts(r.posts.map((entry) => entry.post)))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load posts"));
  }, []);

  if (error) return <div className="notice error">{error}</div>;
  if (!posts) return <div className="notice">Loading posts…</div>;

  return (
    <div>
      <h1>Posts</h1>
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
                <a href={`/${post.slug}`} target="_blank" rel="noreferrer">
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
