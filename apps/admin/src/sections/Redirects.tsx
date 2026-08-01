import { useState } from "react";
import {
  ApiError,
  api,
  type AdminRedirect,
  type AdminRedirectImportResponse,
  type RedirectImportRule,
} from "../lib/api";
import { useFetchMutation, useFetchQuery, type QueryKey } from "../lib/fetch-query";

/**
 * @file Redirects admin screen (SPEC-009 ui.spec.md) — the `/admin/redirects` route.
 * Single-screen list + inline create form + per-row disable/enable + tombstone.
 *
 * SPEC-037 REQ-03/REQ-04: `HitCountCell` wires the previously-unused `api.getRedirectHits` as a
 * lazy per-row fetch (button-triggered, not fired for every row on mount — avoids an N+1 burst on
 * a large list), and `ImportRedirectsForm` wires the new `api.importRedirects` bulk-import
 * affordance, surfacing the route's own `207` per-item created/failed breakdown.
 *
 * ## Pilot for `lib/fetch-query`
 *
 * First screen migrated off the admin's `useState`-triple convention
 * (`data`/`loading`/`error` + a hand-written `load()`), which the other 37
 * fetching files still use. Picked as the pilot because it exercises the whole
 * interface in one small file: a list read, three writes that each used to
 * call `load()` by hand, a gesture-gated lazy read, and an import that
 * refreshes the list.
 *
 * Two things genuinely change beyond line count. Writes now name what they
 * invalidate instead of calling a loader the component happens to own — so a
 * second mounted view of the same key refreshes too, where `load()` only ever
 * refreshed this one. And a background refresh no longer throws the table
 * away: `status` stays `'success'` while `isFetching` is true, so the old
 * `if (!redirects) return <Loading/>` full-screen flash after every write is
 * gone.
 */

/** One cache identity per resource, defined once so a write's `invalidates`
 *  and a read's `key` cannot drift apart — the failure mode being an
 *  invalidation that silently matches nothing and a list that never refreshes. */
const KEYS = {
  list: ["redirects"] as QueryKey,
  hits: (redirectId: string): QueryKey => ["redirects", redirectId, "hits"],
};

function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message || fallback;
  return e instanceof Error ? e.message : fallback;
}

/** Lazy hit-count cell (REQ-03) — fetches on first click rather than on mount, so a list of many
 * rows never fires a synchronous burst of `/hits` requests. A rule with zero recorded hits still
 * renders `0` (not blank), matching `hits.ts`'s own "still 200s with hitCount: 0" contract. */
function HitCountCell(props: { redirectId: string }) {
  // `enabled` is what keeps this lazy: the query is declared for every row but
  // runs for none of them until its own button is pressed, preserving the
  // no-N+1-burst property without a manual imperative fetch.
  const [requested, setRequested] = useState(false);
  const hits = useFetchQuery({
    key: KEYS.hits(props.redirectId),
    fetch: () => api.getRedirectHits(props.redirectId),
    enabled: requested,
  });

  if (hits.error) return <span className="save-error">{describeApiError(hits.error, "failed")}</span>;
  // A rule with zero recorded hits still renders `0` (not blank), matching
  // `hits.ts`'s own "still 200s with hitCount: 0" contract — so this branches
  // on the request having completed, never on the count's truthiness.
  if (hits.data) return <span>{hits.data.data.hitCount}</span>;
  return (
    <button type="button" onClick={() => setRequested(true)} disabled={hits.isFetching}>
      {hits.isFetching ? "Loading…" : "Load hits"}
    </button>
  );
}

/** Bulk-import affordance (REQ-04) — paste a JSON array of rule objects, submit through
 * `api.importRedirects`, and surface the `207` per-item created/failed breakdown directly
 * (never collapsed into a single pass/fail toast — a partial-batch failure is the route's own
 * designed behavior, not an edge case). */
function ImportRedirectsForm() {
  const [raw, setRaw] = useState("");
  // Client-side validation only — the JSON never reached the server, so this
  // is not a request failure and does not belong in the mutation's `error`.
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<AdminRedirectImportResponse | null>(null);

  const importRules = useFetchMutation({
    // Typed as the route's own shape, but the value is operator-pasted JSON
    // that has only been checked for "is an array" — see the cast at the call
    // site. The server is the validator here and reports per-item failures in
    // its `207`; duplicating that schema client-side would be a second source
    // of truth for it.
    run: (rules: RedirectImportRule[]) => api.importRedirects(rules),
    // Replaces the `onImported` callback the parent used to thread down purely
    // so this form could refresh a list it does not own.
    invalidates: [KEYS.list],
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setParseError(null);
    setResult(null);
    importRules.reset();

    let rules: unknown;
    try {
      rules = JSON.parse(raw);
    } catch {
      setParseError("Not valid JSON.");
      return;
    }
    if (!Array.isArray(rules)) {
      setParseError("Must be a JSON array of rule objects.");
      return;
    }

    // A partial batch (the route's `207`) RESOLVES — it is a result to render,
    // not a failure — so only a transport/route error lands in `catch`, where
    // the mutation's own `error` already holds the message.
    try {
      // Unchecked by design (see `run` above). The previous version reached the
      // same place implicitly — `Array.isArray` narrows `unknown` to `any[]`,
      // which the parameter accepted silently; this states it instead.
      setResult(await importRules.mutate(rules as RedirectImportRule[]));
    } catch {
      /* surfaced via `importRules.error` below */
    }
  }

  const error = parseError ?? (importRules.error ? describeApiError(importRules.error, "Import failed") : null);
  const importing = importRules.status === "pending";

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
  const list = useFetchQuery({ key: KEYS.list, fetch: () => api.listRedirects() });

  // Each write names the cache it affects rather than calling a loader; the
  // list refetches because it is mounted under that key, not because this
  // component remembered to ask it to.
  const createRule = useFetchMutation({
    run: (form: FormData) =>
      api.createRedirect({
        matchType: String(form.get("matchType") ?? "exact"),
        fromPattern: String(form.get("fromPattern") ?? ""),
        toTarget: String(form.get("toTarget") ?? ""),
        statusCode: Number(form.get("statusCode") ?? 301),
      }),
    invalidates: [KEYS.list],
  });

  const toggleStatus = useFetchMutation({
    run: (rule: AdminRedirect) =>
      api.updateRedirect({ id: rule.id }, { status: rule.status === "active" ? "disabled" : "active" }),
    invalidates: [KEYS.list],
  });

  const removeRule = useFetchMutation({
    run: (rule: AdminRedirect) => api.tombstoneRedirect(rule.id),
    invalidates: [KEYS.list],
  });

  const writes = [createRule, toggleStatus, removeRule];
  const saving = writes.some((write) => write.status === "pending");
  const writeError = writes.find((write) => write.error)?.error ?? null;
  // A failed background list refresh keeps `list.error` set while the table
  // still shows its last good data. Rendered unconditionally, that error became
  // the banner the operator sees the instant they click Disable — reading as
  // "your Disable failed" when the write is merely in flight and the stale
  // message belongs to an earlier refresh. Suppressed while a write is running,
  // for the same reason the pre-migration handlers each opened with
  // `setError(null)`. It returns afterwards if the list is genuinely still
  // failing, which is honest rather than hidden.
  const error = writeError ?? (saving ? null : list.error);

  /**
   * Clears the OTHER writes' failures before starting one.
   *
   * The pre-migration code kept a single shared `error` and each handler opened
   * with `setError(null)`, so any new write wiped the previous one's message.
   * Three independent mutations do not inherit that: each keeps its own error
   * until reset, and `find` above returns creation order rather than recency —
   * so a failed Create would keep its banner on screen after a later, entirely
   * successful Disable, blaming an operation that worked. `mutate` already
   * clears the active mutation's own error, so only its siblings need this.
   */
  function clearOtherWriteErrors(active: { reset: () => void }) {
    for (const write of writes) if (write !== active) write.reset();
  }

  const redirects = list.data?.data;

  // Only a FIRST load blocks the screen. A refetch triggered by a write keeps
  // the table on screen (`status` stays `'success'`), where the old
  // `if (!redirects)` guard blanked the whole page after every single edit.
  if (list.status === "error" && !redirects) {
    return <div className="notice error">{describeApiError(list.error, "failed to load redirects")}</div>;
  }
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
      {error ? <div className="notice error">{describeApiError(error, "request failed")}</div> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          clearOtherWriteErrors(createRule);
          void createRule.mutate(new FormData(e.currentTarget));
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

      <ImportRedirectsForm />

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
                  <button
                    disabled={saving}
                    onClick={() => {
                      clearOtherWriteErrors(toggleStatus);
                      void toggleStatus.mutate(rule);
                    }}
                  >
                    {rule.status === "active" ? "Disable" : "Enable"}
                  </button>
                  <button
                    disabled={saving}
                    onClick={() => {
                      clearOtherWriteErrors(removeRule);
                      void removeRule.mutate(rule);
                    }}
                  >
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
