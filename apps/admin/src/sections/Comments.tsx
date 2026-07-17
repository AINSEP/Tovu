import { useEffect, useState } from "react";
import { ApiError, api, type AdminComment, type CommentModerationAction, type CommentStatus, type CommentsSettings } from "../lib/api";

/**
 * @file Comments admin screen (ADR-031, SPEC-033/035 backend; SPEC-036 this frontend).
 *
 * Closes the gap the SPEC-036 sweep found: the moderation-queue/moderate/settings backend
 * routes were built and audit-clean but nothing in `apps/admin/` called any of them, so the
 * Comments nav entry fell through to the static `Placeholder`.
 *
 * Two sections in one file (`QueueSection` + `SettingsSection`), combined by the exported
 * `Comments()` — mirrors `Storage.tsx`'s established multi-section-single-file shape rather than
 * splitting into `CommentsSettings.tsx` (REQ-08 explicitly leaves that choice to the implementer).
 * `QueueSection`'s status-filter + keyset-cursor "Load more" pattern mirrors `Storage.tsx`'s
 * `TimelineSection` (the real cursor-pagination precedent in this admin app — `Redirects.tsx`
 * itself has no pagination today, see REQ-03's implementation note in the handoff).
 *
 * Permission-based affordance hiding (AC-10) mirrors `Settings.tsx`'s `api.me()` ->
 * `effectivePermissions` -> `has(permission)` derivation; this is UX only, the real authz
 * boundary stays server-side (Article VI, `Settings.tsx`'s own header note applies here too).
 */

const STATUS_OPTIONS: readonly CommentStatus[] = ["pending", "approved", "spam", "trash"];

interface RowActionState {
  busy: boolean;
  error: string | null;
}

function emptyRowState(): RowActionState {
  return { busy: false, error: null };
}

function describeApiError(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message || fallback;
  return e instanceof Error ? e.message : fallback;
}

/** REQ-07: a 409 (stale `expectedVersion`) gets its own message instead of the generic fallback,
 * using the route's own `{error, currentVersion}` body when present. */
function describeModerationError(e: unknown): string {
  if (e instanceof ApiError && e.status === 409) {
    const currentVersion = typeof e.body?.currentVersion === "number" ? e.body.currentVersion : undefined;
    return `This comment changed since you loaded it${
      currentVersion !== undefined ? ` (current version ${currentVersion})` : ""
    } — refresh and try again.`;
  }
  return describeApiError(e, "Failed to update comment.");
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function QueueSection(props: { permissions: string[] }) {
  const has = (permission: string) => props.permissions.includes(permission);
  const canModerate = has("comments.moderate");
  const canDelete = has("comments.delete");
  const canForceDelete = has("comments.delete.force");

  const [status, setStatus] = useState<CommentStatus>("pending");
  const [items, setItems] = useState<AdminComment[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [rowState, setRowState] = useState<Record<string, RowActionState>>({});

  function stateFor(id: string): RowActionState {
    return rowState[id] ?? emptyRowState();
  }

  function patchRowState(id: string, patch: Partial<RowActionState>) {
    setRowState((current) => ({ ...current, [id]: { ...emptyRowState(), ...current[id], ...patch } }));
  }

  function load(reset: boolean, forStatus: CommentStatus, cursor: string | null) {
    setError(null);
    api
      .listCommentsQueue({ status: forStatus, cursor: cursor ?? undefined })
      .then((r) => {
        setItems((current) => (reset || !current ? r.items : [...current, ...r.items]));
        setNextCursor(r.nextCursor);
      })
      .catch((e) => setError(describeApiError(e, "failed to load the moderation queue")))
      .finally(() => setLoadingMore(false));
  }

  useEffect(() => {
    setItems(null);
    load(true, status, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function loadMore() {
    setLoadingMore(true);
    load(false, status, nextCursor);
  }

  /** Reloads page 1 of the current filter — the simplest correct way to reflect a moderation
   * action's effect (REQ-05's "refetching the row's queue page on success"): every action always
   * moves the comment to a different status than whatever the current filter is showing it under,
   * so a fresh first page is always the right post-action view. */
  function reloadFirstPage() {
    load(true, status, null);
  }

  async function onModerate(comment: AdminComment, action: CommentModerationAction) {
    if (stateFor(comment.id).busy) return;
    patchRowState(comment.id, { busy: true, error: null });
    try {
      await api.moderateComment(comment.id, action, { expectedVersion: comment.version });
      reloadFirstPage();
    } catch (e) {
      patchRowState(comment.id, { busy: false, error: describeModerationError(e) });
    }
  }

  async function onPurge(comment: AdminComment) {
    if (stateFor(comment.id).busy) return;
    if (!window.confirm(`Permanently delete this comment by "${comment.authorName}"? This cannot be undone.`)) return;
    patchRowState(comment.id, { busy: true, error: null });
    try {
      await api.purgeComment(comment.id);
      reloadFirstPage();
    } catch (e) {
      patchRowState(comment.id, { busy: false, error: describeApiError(e, "Failed to purge comment.") });
    }
  }

  if (error && !items) return <div className="notice error">{error}</div>;

  return (
    <div>
      <label>
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value as CommentStatus)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      {error ? <div className="notice error">{error}</div> : null}

      {!items ? (
        <div className="notice">Loading comments…</div>
      ) : items.length === 0 ? (
        <div className="notice">No {status} comments.</div>
      ) : (
        <>
          <table className="list-table">
            <thead>
              <tr>
                <th>Author</th>
                <th>Comment</th>
                <th>Status</th>
                <th>Depth</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((comment) => {
                const rs = stateFor(comment.id);
                return (
                  <tr key={comment.id}>
                    <td>{comment.authorName}</td>
                    <td>{truncate(comment.bodyText, 120)}</td>
                    <td>
                      <span className={`status status-${comment.status}`}>{comment.status}</span>
                    </td>
                    <td>{comment.depth}</td>
                    <td>{comment.createdAt.slice(0, 16).replace("T", " ")}</td>
                    <td>
                      <span className="editor-actions">
                        {comment.status !== "approved" && canModerate ? (
                          <button type="button" disabled={rs.busy} onClick={() => void onModerate(comment, "approve")}>
                            Approve
                          </button>
                        ) : null}
                        {comment.status !== "spam" && canModerate ? (
                          <button type="button" disabled={rs.busy} onClick={() => void onModerate(comment, "spam")}>
                            Spam
                          </button>
                        ) : null}
                        {comment.status !== "trash" && canDelete ? (
                          <button type="button" disabled={rs.busy} onClick={() => void onModerate(comment, "trash")}>
                            Trash
                          </button>
                        ) : null}
                        {(comment.status === "spam" || comment.status === "trash") && canModerate ? (
                          <button type="button" disabled={rs.busy} onClick={() => void onModerate(comment, "restore")}>
                            Restore
                          </button>
                        ) : null}
                        {/* REQ-06: purge only ever surfaces from the trash filter view. */}
                        {status === "trash" && comment.status === "trash" && canForceDelete ? (
                          <button type="button" disabled={rs.busy} onClick={() => void onPurge(comment)}>
                            Purge
                          </button>
                        ) : null}
                      </span>
                      {rs.error ? (
                        <div className="notice error" role="alert">
                          {rs.error}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {nextCursor ? (
            <button type="button" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

/** REQ-08/09/10: builds a partial patch containing only the fields the operator actually changed
 * (the backend's `setCommentsSettings` is a partial-patch contract — REQ-08 asks the client to
 * mirror that instead of always sending the full object, as `Seo.tsx`'s form does). */
function buildSettingsPatch(form: FormData, current: CommentsSettings): Partial<CommentsSettings> {
  const patch: Partial<CommentsSettings> = {};

  const enabled = form.get("enabled") === "on";
  if (enabled !== current.enabled) patch.enabled = enabled;

  const requireModeration = form.get("requireModeration") === "on";
  if (requireModeration !== current.requireModeration) patch.requireModeration = requireModeration;

  const maxDepthRaw = String(form.get("maxDepth") ?? "");
  const maxDepth = Number(maxDepthRaw);
  if (maxDepthRaw !== "" && Number.isFinite(maxDepth) && maxDepth !== current.maxDepth) patch.maxDepth = maxDepth;

  // REQ-10: blank means "never closes" -> null on the wire; the UI never sends the backend's
  // own -1 sentinel, only null or a positive number.
  const closeAfterDaysRaw = String(form.get("closeAfterDays") ?? "").trim();
  const closeAfterDaysNum = Number(closeAfterDaysRaw);
  const closeAfterDays =
    closeAfterDaysRaw === "" ? null : Number.isFinite(closeAfterDaysNum) ? closeAfterDaysNum : undefined;
  if (closeAfterDays !== undefined && closeAfterDays !== current.closeAfterDays) {
    patch.closeAfterDays = closeAfterDays;
  }

  const spamAutoRejectScoreRaw = String(form.get("spamAutoRejectScore") ?? "");
  const spamAutoRejectScore = Number(spamAutoRejectScoreRaw);
  if (spamAutoRejectScoreRaw !== "" && Number.isFinite(spamAutoRejectScore) && spamAutoRejectScore !== current.spamAutoRejectScore) {
    patch.spamAutoRejectScore = spamAutoRejectScore;
  }

  const maxPerIpPerHourRaw = String(form.get("maxPerIpPerHour") ?? "");
  const maxPerIpPerHour = Number(maxPerIpPerHourRaw);
  if (maxPerIpPerHourRaw !== "" && Number.isFinite(maxPerIpPerHour) && maxPerIpPerHour !== current.maxPerIpPerHour) {
    patch.maxPerIpPerHour = maxPerIpPerHour;
  }

  return patch;
}

function SettingsSection(props: { canConfigure: boolean }) {
  const [settings, setSettings] = useState<CommentsSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // AC-10: the GET route itself is `comments.configure`-gated (get-settings.ts), so a
    // principal without that grant can't even read settings today — skip the doomed fetch and
    // hide the section entirely rather than surfacing a 403 error banner for a screen this
    // principal was never going to be able to use.
    if (!props.canConfigure) return;
    api
      .getCommentsSettings()
      .then((r) => setSettings(r.data))
      .catch((e) => setError(describeApiError(e, "failed to load Comments settings")));
  }, [props.canConfigure]);

  if (!props.canConfigure) return null;

  async function save(form: FormData) {
    if (!settings) return;
    setError(null);
    setNotice(null);

    const patch = buildSettingsPatch(form, settings);

    // REQ-09: client-side validate spamAutoRejectScore before the network call — mirrors the
    // backend's own `validateCommentsSettingsPatch` bound (`src/comments/settings.ts`).
    if (patch.spamAutoRejectScore !== undefined && (patch.spamAutoRejectScore < 0 || patch.spamAutoRejectScore > 1)) {
      setError("Spam auto-reject score must be between 0 and 1.");
      return;
    }

    setSaving(true);
    try {
      const r = await api.putCommentsSettings(patch);
      setSettings(r.data);
      setNotice("Saved.");
    } catch (e) {
      setError(describeApiError(e, "failed to save Comments settings"));
    } finally {
      setSaving(false);
    }
  }

  if (error && !settings) return <div className="notice error">{error}</div>;
  if (!settings) return <div className="notice">Loading Comments settings…</div>;

  return (
    <div>
      <h2>Settings</h2>
      {error ? <div className="notice error">{error}</div> : null}
      {notice ? <div className="notice">{notice}</div> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save(new FormData(e.currentTarget));
        }}
      >
        <label>
          <input type="checkbox" name="enabled" defaultChecked={settings.enabled} />
          Comments enabled
        </label>
        <label>
          <input
            type="checkbox"
            name="requireModeration"
            defaultChecked={settings.requireModeration}
          />
          Require moderation (new comments start pending)
        </label>
        <label>
          Max thread depth
          <input
            type="number"
            name="maxDepth"
            min={0}
            step={1}
            defaultValue={settings.maxDepth}
          />
        </label>
        <label>
          Close submissions after (days, blank = never)
          <input
            type="number"
            name="closeAfterDays"
            min={0}
            step={1}
            defaultValue={settings.closeAfterDays ?? ""}
          />
        </label>
        <label>
          Spam auto-reject score (0–1)
          <input
            type="number"
            name="spamAutoRejectScore"
            min={0}
            max={1}
            step={0.01}
            defaultValue={settings.spamAutoRejectScore}
          />
        </label>
        <label>
          Max submissions per IP per hour
          <input
            type="number"
            name="maxPerIpPerHour"
            min={1}
            step={1}
            defaultValue={settings.maxPerIpPerHour}
          />
        </label>
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>
    </div>
  );
}

export function Comments() {
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .me()
      .then((r) => setPermissions(r.effectivePermissions ?? []))
      .catch((e) => setError(describeApiError(e, "failed to load permissions")));
  }, []);

  if (error) return <div className="notice error">{error}</div>;
  if (!permissions) return <div className="notice">Loading Comments…</div>;

  return (
    <div>
      <h1>Comments</h1>
      <p>Moderate incoming comments and configure workspace-wide comment behavior.</p>
      {permissions.includes("comments.read") ? (
        <QueueSection permissions={permissions} />
      ) : (
        <div className="notice">You do not have permission to view the moderation queue.</div>
      )}
      <SettingsSection canConfigure={permissions.includes("comments.configure")} />
    </div>
  );
}
