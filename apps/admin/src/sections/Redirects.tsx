import { useEffect, useState } from "react";
import { api, type AdminRedirect } from "../lib/api";

/**
 * @file Redirects admin screen (SPEC-009 ui.spec.md) — the `#/section/redirects` route.
 * Single-screen list + inline create form + per-row disable/enable + tombstone, mirroring
 * `FormsList.tsx`/`Seo.tsx`'s fetch/loading/error convention. Import (bulk CSV-style upload)
 * and per-rule hit stats are NOT built in this pass — the backend routes exist and are tested;
 * this is a proportional first UI slice covering the common manual-redirect workflow.
 */
export function Redirects() {
  const [redirects, setRedirects] = useState<AdminRedirect[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    api
      .listRedirects()
      .then((r) => setRedirects(r.data))
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load redirects"));
  }

  useEffect(load, []);

  async function createRule(form: FormData) {
    setSaving(true);
    setError(null);
    try {
      await api.createRedirect({
        matchType: String(form.get("matchType") ?? "exact"),
        fromPattern: String(form.get("fromPattern") ?? ""),
        toTarget: String(form.get("toTarget") ?? ""),
        statusCode: Number(form.get("statusCode") ?? 301),
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to create redirect");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(rule: AdminRedirect) {
    setSaving(true);
    setError(null);
    try {
      await api.updateRedirect(rule.id, { status: rule.status === "active" ? "disabled" : "active" });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to update redirect");
    } finally {
      setSaving(false);
    }
  }

  async function removeRule(rule: AdminRedirect) {
    setSaving(true);
    setError(null);
    try {
      await api.tombstoneRedirect(rule.id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to delete redirect");
    } finally {
      setSaving(false);
    }
  }

  if (error && !redirects) return <div className="notice error">{error}</div>;
  if (!redirects) return <div className="notice">Loading redirects…</div>;

  return (
    <div>
      <div className="editor-header">
        <h1>Redirects</h1>
      </div>
      <p>
        Manual URL redirect rules. Rules created automatically from a slug change (source
        <code> auto_slug_change</code>) also show up here.
      </p>
      {error ? <div className="notice error">{error}</div> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createRule(new FormData(e.currentTarget));
          e.currentTarget.reset();
        }}
      >
        <label>
          Match type
          <select name="matchType" defaultValue="exact">
            <option value="exact">exact</option>
            <option value="prefix">prefix</option>
            <option value="wildcard">wildcard</option>
          </select>
        </label>
        <label>
          From path
          <input name="fromPattern" placeholder="/old-path" required />
        </label>
        <label>
          To target
          <input name="toTarget" placeholder="/new-path or https://example.com/..." required />
        </label>
        <label>
          Status code
          <select name="statusCode" defaultValue="301">
            <option value="301">301 (permanent)</option>
            <option value="302">302 (temporary)</option>
            <option value="307">307 (temporary, method-preserving)</option>
            <option value="308">308 (permanent, method-preserving)</option>
          </select>
        </label>
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Add redirect"}
        </button>
      </form>

      {redirects.length === 0 ? (
        <div className="notice">No redirect rules yet.</div>
      ) : (
        <table className="list-table">
          <thead>
            <tr>
              <th>From</th>
              <th>To</th>
              <th>Type</th>
              <th>Code</th>
              <th>Source</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {redirects.map((rule) => (
              <tr key={rule.id}>
                <td>{rule.fromPattern}</td>
                <td>{rule.toTarget}</td>
                <td>{rule.matchType}</td>
                <td>{rule.statusCode}</td>
                <td>{rule.source}</td>
                <td>
                  <span className={`status status-${rule.status}`}>{rule.status}</span>
                </td>
                <td>
                  <button disabled={saving} onClick={() => toggleStatus(rule)}>
                    {rule.status === "active" ? "Disable" : "Enable"}
                  </button>
                  <button disabled={saving} onClick={() => removeRule(rule)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
