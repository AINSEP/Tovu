import { useEffect, useRef, useState } from "react";
import { api, type AdminMedia } from "../lib/api";

/**
 * @file Media admin screen (ADR-027 walking skeleton) — list + upload + trash/purge
 * ladder, wiring the `media` backend into the admin UI.
 *
 * Thumbnails render as filenames/titles, not actual images — this pass has no
 * byte-serving HTTP route (see `src/media/media-service.ts`'s file header:
 * origin-isolated serving is explicitly deferred), which the task scope
 * explicitly allows ("thumbnails-as-filenames-is-fine").
 */

/** Reads a browser `File` into a base64 string (no data: URL prefix). */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("failed to read file"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export function Media() {
  const [media, setMedia] = useState<AdminMedia[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [altDraft, setAltDraft] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function load() {
    api
      .listMedia()
      .then((r) => setMedia(r.media))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load media"));
  }

  useEffect(load, []);

  async function upload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const dataBase64 = await readFileAsBase64(file);
      await api.uploadMedia({
        filename: file.name,
        contentType: file.type,
        dataBase64,
        alt: altDraft.trim() || undefined,
      });
      setAltDraft("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function trashOrPurge(item: AdminMedia) {
    setError(null);
    if (item.status === "trashed" && !window.confirm(`Permanently delete "${item.title}"? This cannot be undone.`)) {
      return;
    }
    try {
      if (item.status === "trashed") {
        await api.deleteMedia(item.id);
      } else {
        await api.trashMedia(item.id);
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "delete failed");
    }
  }

  if (error && !media) return <div className="notice error">{error}</div>;
  if (!media) return <div className="notice">Loading media…</div>;

  return (
    <div>
      <div className="editor-header">
        <h1>Media</h1>
      </div>
      {error ? <div className="notice error">{error}</div> : null}
      <div className="editor-header">
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" />
        <input
          value={altDraft}
          onChange={(e) => setAltDraft(e.target.value)}
          placeholder="Alt text (optional)"
        />
        <button onClick={upload} disabled={uploading}>
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </div>
      <table className="list-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Alt</th>
            <th>Status</th>
            <th>sha256</th>
            <th>v</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {media.map((item) => (
            <tr key={item.id}>
              <td>{item.title}</td>
              <td>{item.alt || "—"}</td>
              <td>
                <span className={`status status-${item.status}`}>{item.status}</span>
              </td>
              <td title={item.sha256}>{item.sha256.slice(0, 12)}…</td>
              <td>{item.version}</td>
              <td>
                <button onClick={() => trashOrPurge(item)}>
                  {item.status === "trashed" ? "Delete permanently" : "Trash"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
