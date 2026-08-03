import { useEffect, useState } from "react";
import { ApiError, api, describeApiError, type AdminComment, type CommentModerationAction, type CommentStatus, type CommentsSettings } from "../lib/api";
import { formatTimestamp } from "../lib/format-timestamp";
import { hasPermission } from "../lib/permissions";
import { DataTable, RowMenu, type RowMenuItem, ConfirmDialog } from "@jini-ai/admin/react";

/**
 * @file Comments admin screen (ADR-031, SPEC-033/035 backend; SPEC-036 this frontend).
 *
 * Closes the gap the SPEC-036 sweep found: the moderation-queue/moderate/settings backend
 * routes were built and audit-clean but nothing in `apps/admin/` called any of them, so the
 * Comments nav entry fell through to the static `Placeholder`.
 *
 * Two sections in one file (`QueueSection` + `SettingsSection`), combined by the exported
 * `Comments()` — mirrors `Database.tsx`'s established multi-section-single-file shape rather than
 * splitting into `CommentsSettings.tsx` (REQ-08 explicitly leaves that choice to the implementer).
 * `QueueSection`'s status-filter + keyset-cursor "Load more" pattern mirrors `Database.tsx`'s
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
  const has = (permission: string) => hasPermission(props.permissions, permission);
  const canModerate = has("comments.moderate");
  const canDelete = has("comments.delete");
  const canForceDelete = has("comments.delete.force");

  const [status, setStatus] = useState<CommentStatus>("pending");
  const [items, setItems] = useState<AdminComment[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [rowState, setRowState] = useState<Record<string, RowActionState>>({});
  // The comment a `RowMenu` "Purge" selection is asking to confirm — `null` when the dialog is
  // closed. `ConfirmDialog` stays mounted unconditionally below (see its own doc comment on why);
  // this is what drives its `open` prop. Row actions moved into `RowMenu` below (MSG-03 rollout);
  // Purge is the one that needed a real confirm step, so it's the one that gained this state — the
  // others (Approve/Spam/Trash/Restore) were never gated by anything and still aren't.
  const [pendingPurge, setPendingPurge] = useState<AdminComment | null>(null);

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
      await api.moderateComment({ commentId: comment.id, action, expectedVersion: comment.version });
      reloadFirstPage();
    } catch (e) {
      patchRowState(comment.id, { busy: false, error: describeModerationError(e) });
    }
  }

  /** Confirmation now gates via a `ConfirmDialog` modal, reached through `RowMenu`'s "Purge" item
   *  (`setPendingPurge` below), rather than `window.confirm` — same upgrade `Posts.tsx`/`Pages.tsx`
   *  already made for their own Delete. Copy is the exact previous sentence, unchanged: states the
   *  consequence ("permanently delete") and explicitly "this cannot be undone" because, unlike
   *  Trash (a status this same menu can restore from), a purge genuinely has no way back. Dialog
   *  always closes on settle (success or failure) — a failure surfaces via this row's own existing
   *  `rs.error` mechanism, same place every other moderation action's failure already shows up. */
  async function onPurge() {
    if (!pendingPurge) return;
    const comment = pendingPurge;
    if (stateFor(comment.id).busy) return;
    patchRowState(comment.id, { busy: true, error: null });
    try {
      await api.purgeComment({ commentId: comment.id });
      reloadFirstPage();
    } catch (e) {
      patchRowState(comment.id, { busy: false, error: describeApiError(e, "Failed to purge comment.") });
    } finally {
      setPendingPurge(null);
    }
  }

  /** At-rest row actions for `RowMenu` — every condition here is copied verbatim from the inline
   *  buttons this replaces, so a permission/status combination that used to hide a button still
   *  omits the matching menu item rather than rendering a guaranteed-failing click. */
  function rowMenuItems(comment: AdminComment): RowMenuItem[] {
    const items: RowMenuItem[] = [];
    if (comment.status !== "approved" && canModerate) {
      items.push({ key: "approve", label: "Approve", onSelect: () => void onModerate(comment, "approve") });
    }
    if (comment.status !== "spam" && canModerate) {
      items.push({ key: "spam", label: "Spam", onSelect: () => void onModerate(comment, "spam") });
    }
    if (comment.status !== "trash" && canDelete) {
      items.push({ key: "trash", label: "Trash", onSelect: () => void onModerate(comment, "trash") });
    }
    if ((comment.status === "spam" || comment.status === "trash") && canModerate) {
      items.push({ key: "restore", label: "Restore", onSelect: () => void onModerate(comment, "restore") });
    }
    // REQ-06: purge only ever surfaces from the trash filter view. Genuinely destructive (its own
    // confirm copy: "cannot be undone") — `destructive: true`, unlike the reversible actions above.
    if (status === "trash" && comment.status === "trash" && canForceDelete) {
      items.push({ key: "purge", label: "Purge", destructive: true, onSelect: () => setPendingPurge(comment) });
    }
    return items;
  }

  if (error && !items) return <div className="notice error">{error}</div>;

  return (
    <div>
      <div className="toolbar">
        <div className="field">
          <label className="field-label" htmlFor="comments-status-filter">
            Status
          </label>
          <select
            id="comments-status-filter"
            value={status}
            onChange={(e) => setStatus(e.target.value as CommentStatus)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <div className="notice error">{error}</div> : null}

      {!items ? (
        <div className="notice">Loading comments…</div>
      ) : items.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>No {status} comments.</p>
          </div>
        </div>
      ) : (
        <>
          <DataTable
            rows={items}
            rowKey={(comment) => comment.id}
            columns={[
              { key: "author", header: "Author", cell: (comment) => comment.authorName },
              { key: "comment", header: "Comment", cell: (comment) => truncate(comment.bodyText, 120) },
              {
                key: "status",
                header: "Status",
                cell: (comment) => <span className={`status status-${comment.status}`}>{comment.status}</span>,
              },
              { key: "depth", header: "Depth", cell: (comment) => comment.depth },
              { key: "created", header: "Created", cell: (comment) => formatTimestamp(comment.createdAt) },
              {
                key: "actions",
                header: "More",
                cell: (comment) => {
                  const rs = stateFor(comment.id);
                  const menuItems = rowMenuItems(comment);
                  return (
                    <>
                      {menuItems.length > 0 ? (
                        <RowMenu
                          triggerLabel={`Actions for the comment by "${comment.authorName}"`}
                          items={menuItems}
                        />
                      ) : (
                        <span className="muted-cell">—</span>
                      )}
                      {rs.error ? (
                        <div className="notice error" role="alert">
                          {rs.error}
                        </div>
                      ) : null}
                    </>
                  );
                },
              },
            ]}
          />
          {nextCursor ? (
            <button type="button" className="btn-secondary" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </>
      )}
      <ConfirmDialog
        open={pendingPurge !== null}
        title="Permanently delete this comment?"
        body={
          pendingPurge ? (
            <p>
              Permanently delete this comment by &quot;{pendingPurge.authorName}&quot;? This cannot be undone.
            </p>
          ) : null
        }
        confirmLabel="Permanently delete"
        destructive
        pending={pendingPurge !== null && stateFor(pendingPurge.id).busy}
        onConfirm={onPurge}
        onCancel={() => setPendingPurge(null)}
      />
    </div>
  );
}

/** REQ-08/09/10: builds a partial patch containing only the fields the operator actually changed
 * (the backend's `setCommentsSettings` is a partial-patch contract — REQ-08 asks the client to
 * mirror that instead of always sending the full object, as `Seo.tsx`'s form does). */
function buildSettingsPatch(required: { form: FormData; current: CommentsSettings }): Partial<CommentsSettings> {
  const { form, current } = required;
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

    const patch = buildSettingsPatch({ form, current: settings });

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
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          void save(new FormData(e.currentTarget));
        }}
      >
        <div className="field-group">
          <label className="form-checkbox-field">
            <input type="checkbox" name="enabled" defaultChecked={settings.enabled} />
            Comments enabled
          </label>
          <label className="form-checkbox-field">
            <input
              type="checkbox"
              name="requireModeration"
              defaultChecked={settings.requireModeration}
            />
            Require moderation (new comments start pending)
          </label>
        </div>

        <div className="field-group">
          <div className="field-row">
            <div className="field">
              <label className="field-label" htmlFor="comments-max-depth">
                Max thread depth
              </label>
              <input
                id="comments-max-depth"
                type="number"
                name="maxDepth"
                min={0}
                step={1}
                defaultValue={settings.maxDepth}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="comments-close-after-days">
                Close submissions after (days, blank = never)
              </label>
              <input
                id="comments-close-after-days"
                type="number"
                name="closeAfterDays"
                min={0}
                step={1}
                defaultValue={settings.closeAfterDays ?? ""}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="comments-spam-score">
                Spam auto-reject score (0–1)
              </label>
              <input
                id="comments-spam-score"
                type="number"
                name="spamAutoRejectScore"
                min={0}
                max={1}
                step={0.01}
                defaultValue={settings.spamAutoRejectScore}
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="comments-max-per-ip">
                Max submissions per IP per hour
              </label>
              <input
                id="comments-max-per-ip"
                type="number"
                name="maxPerIpPerHour"
                min={1}
                step={1}
                defaultValue={settings.maxPerIpPerHour}
              />
            </div>
          </div>
        </div>

        <div className="editor-actions form-actions">
          <button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
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
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">People</p>
          <h1 className="page-title">Comments</h1>
          <p className="page-description">Moderate incoming comments and configure workspace-wide comment behavior.</p>
        </div>
      </div>
      {hasPermission(permissions, "comments.read") ? (
        <QueueSection permissions={permissions} />
      ) : (
        <div className="notice">You do not have permission to view the moderation queue.</div>
      )}
      <SettingsSection canConfigure={hasPermission(permissions, "comments.configure")} />
    </div>
  );
}
