import { useEffect, useState } from "react";
import { ApiError, api, type AdminRedirect, type AdminRedirectImportResponse } from "../lib/api";

/**
 * @file Redirects admin screen (SPEC-009 ui.spec.md) — the `#/section/redirects` route.
 * Single-screen list + inline create form + per-row disable/enable + tombstone, mirroring
 * `FormsList.tsx`/`Seo.tsx`'s fetch/loading/error convention.
 *
 * SPEC-037 REQ-03/REQ-04: `HitCountCell` wires the previously-unused `api.getRedirectHits` as a
 * lazy per-row fetch (button-triggered, not fired for every row on mount — avoids an N+1 burst on
 * a large list), and `ImportRedirectsForm` wires the new `api.importRedirects` bulk-import
 * affordance, surfacing the route's own `207` per-item created/failed breakdown.
 */

function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message || fallback;
  return e instanceof Error ? e.message : fallback;
}

/** Lazy hit-count cell (REQ-03) — fetches on first click rather than on mount, so a list of many
 * rows never fires a synchronous burst of `/hits` requests. A rule with zero recorded hits still
 * renders `0` (not blank), matching `hits.ts`'s own "still 200s with hitCount: 0" contract. */
function HitCountCell(props: { redirectId: string }) {
  const [stats, setStats] = useState<{ hitCount: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.getRedirectHits(props.redirectId);
      setStats({ hitCount: r.data.hitCount });
    } catch (e) {
      setError(describeApiError(e, "failed"));
    } finally {
      setLoading(false);
    }
  }

  if (error) return <span className="save-error">{error}</span>;
  if (stats) return <span>{stats.hitCount}</span>;
  return (
    <button type="button" onClick={load} disabled={loading}>
      {loading ? "Loading…" : "Load hits"}
    </button>
  );
}

/** Bulk-import affordance (REQ-04) — paste a JSON array of rule objects, submit through
 * `api.importRedirects`, and surface the `207` per-item created/failed breakdown directly
 * (never collapsed into a single pass/fail toast — a partial-batch failure is the route's own
 * designed behavior, not an edge case). */
function ImportRedirectsForm(props: { onImported: () => void }) {
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AdminRedirectImportResponse | null>(null);
  const [importing, setImporting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    let rules: unknown;
    try {
      rules = JSON.parse(raw);
    } catch {
      setError("Not valid JSON.");
      return;
    }
    if (!Array.isArray(rules)) {
      setError("Must be a JSON array of rule objects.");
      return;
    }

    setImporting(true);
    try {
      const r = await api.importRedirects(rules);
      setResult(r);
      if (r.created.length > 0) props.onImported();
    } catch (e) {
      setError(describeApiError(e, "Import failed"));
    } finally {
      setImporting(false);
    }
  }

  return (
    <details className="notice redirects-import">
      <summary>Bulk import</summary>
      <form onSubmit={submit}>
        <label htmlFor="redirects-import-json">
          Paste a JSON array of <code>{"{matchType, fromPattern, toTarget, statusCode, override?, priority?}"}</code> rule
          objects (1-500 items)
        </label>
        <textarea
          id="redirects-import-json"
          rows={6}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder='[{"matchType":"exact","fromPattern":"/old","toTarget":"/new","statusCode":301}]'
        />
        <button type="submit" disabled={importing}>
          {importing ? "Importing…" : "Import"}
        </button>
      </form>
      {error ? (
        <div className="notice error" role="alert">
          {error}
        </div>
      ) : null}
      {result ? (
        <div className="redirects-import-result">
          <p>
            {result.created.length} created, {result.failed.length} failed.
          </p>
          {result.created.length > 0 ? (
            <ul>
              {result.created.map((r) => (
                <li key={r.id}>
                  <span className="save-ok">Created</span> {r.fromPattern} → {r.toTarget}
                </li>
              ))}
            </ul>
          ) : null}
          {result.failed.length > 0 ? (
            <ul>
              {result.failed.map((f) => (
                <li key={f.index}>
                  <span className="save-error">
                    Item {f.index} ({f.code})
                  </span>
                  : {f.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}

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
      await api.updateRedirect({ id: rule.id }, { status: rule.status === "active" ? "disabled" : "active" });
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

      <ImportRedirectsForm onImported={load} />

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
              <th>Hits</th>
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
                  <HitCountCell redirectId={rule.id} />
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
