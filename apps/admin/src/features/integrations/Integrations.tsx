import { DataTable, RowMenu, ConfirmDialog } from "@jini-ai/admin/react";

import { integrationRowMenuItems } from "./rules";
import { useWiredIntegrations } from "./hooks/use-integrations.hooks";
import { t, deleteWebhookBody, actionsForWebhookLabel } from "./integrations-i18n";

/**
 * @file The Integrations list screen — markup only.
 *
 * State and API calls live in `hooks/use-integrations.hooks.ts`; the row-menu logic lives in
 * `rules.ts`. What stays here is what actually renders: the create form, column definitions, and
 * the confirm copy.
 *
 * `rules.ts`'s row-menu item labels ("Pause"/"Resume"/"Delete") stay English — see
 * `integrations-i18n.tsx`'s file header for why that's a deliberate scope boundary, not an
 * oversight.
 */
export interface IntegrationsProps {
  /**
   * Dependency injection seam for tests — the same convention `@jini-ai/ui`'s `CustomSelect` uses
   * for `useCustomSelect`, and `features/posts/Posts.tsx`'s `usePostsHook`.
   *
   * Defaulted to the real hook, so production callers (`panels.tsx`) pass nothing and behave
   * exactly as before. A test supplies a stub and drives this component through any state without
   * module mocking or a fake `fetch`.
   */
  useIntegrationsHook?: typeof useWiredIntegrations;
}

/** The "Add webhook" form — only rendered while `formOpen`. Top-level rather than an inline
 *  ternary block in `Integrations`'s own body. */
function IntegrationCreateForm(props: {
  locale: string;
  onSubmit: (e: React.FormEvent) => void;
  formError: string | null;
  label: string;
  onLabelChange: (label: string) => void;
  targetUrl: string;
  onTargetUrlChange: (targetUrl: string) => void;
  topics: string;
  onTopicsChange: (topics: string) => void;
  saving: boolean;
}) {
  const { locale } = props;
  return (
    <form onSubmit={props.onSubmit} className="notice integrations-form">
      {props.formError ? <span className="save-error">{props.formError}</span> : null}
      <label>
        {t(locale, "Label")}
        <input value={props.label} onChange={(e) => props.onLabelChange(e.target.value)} required />
      </label>
      <label>
        {t(locale, "Target URL")}
        <input
          value={props.targetUrl}
          onChange={(e) => props.onTargetUrlChange(e.target.value)}
          placeholder="https://example.com/hooks"
          required
        />
      </label>
      <label>
        {t(locale, "Topics (comma-separated, e.g. post.published, post.*)")}
        <input value={props.topics} onChange={(e) => props.onTopicsChange(e.target.value)} required />
      </label>
      <button type="submit" disabled={props.saving}>
        {props.saving ? t(locale, "Saving…") : t(locale, "Create")}
      </button>
    </form>
  );
}

/** The delete-webhook confirm dialog. Stays mounted unconditionally (driven by `open`), matching
 *  the `ConfirmDialog` convention `Comments.tsx`'s `QueuePurgeDialog` also follows. */
function IntegrationDeleteDialog(props: {
  locale: string;
  pendingDelete: { label: string } | null;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { locale } = props;
  return (
    <ConfirmDialog
      open={props.pendingDelete !== null}
      title={t(locale, "Delete webhook?")}
      body={props.pendingDelete ? deleteWebhookBody(locale, props.pendingDelete.label) : null}
      confirmLabel={t(locale, "Delete")}
      destructive
      pending={props.deleting}
      onConfirm={props.onConfirm}
      onCancel={props.onCancel}
    />
  );
}

export function Integrations({ useIntegrationsHook = useWiredIntegrations }: IntegrationsProps = {}) {
  const {
    subscriptions,
    error,
    formOpen,
    setFormOpen,
    label,
    setLabel,
    targetUrl,
    setTargetUrl,
    topics,
    setTopics,
    saving,
    formError,
    pendingDelete,
    setPendingDelete,
    deleting,
    onCreate,
    onTogglePause,
    onDelete,
    t,
    locale,
  } = useIntegrationsHook();

  if (error) return <div className="notice error">{error}</div>;
  if (!subscriptions) return <div className="notice">{t("Loading integrations…")}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Operations")}</p>
          <h1 className="page-title">{t("Integrations")}</h1>
          <p className="page-description">
            {t("Send webhook notifications to external services when content on this site changes.")}
          </p>
        </div>
        <div className="page-actions">
          <button className={formOpen ? "btn-secondary" : undefined} onClick={() => setFormOpen((v) => !v)}>
            {formOpen ? t("Cancel") : t("Add webhook")}
          </button>
        </div>
      </div>

      {formOpen ? (
        <IntegrationCreateForm
          locale={locale}
          onSubmit={onCreate}
          formError={formError}
          label={label}
          onLabelChange={setLabel}
          targetUrl={targetUrl}
          onTargetUrlChange={setTargetUrl}
          topics={topics}
          onTopicsChange={setTopics}
          saving={saving}
        />
      ) : null}

      <DataTable
        rows={subscriptions}
        rowKey={(subscription) => subscription.id}
        empty={
          <div className="card">
            <div className="empty-state">
              <p>{t("No webhooks yet.")}</p>
              <p className="page-description">{t("Add one above to start sending event notifications.")}</p>
            </div>
          </div>
        }
        columns={[
          {
            key: "label",
            header: t("Label"),
            cell: (subscription) => <a href={`/admin/integrations/${subscription.id}`}>{subscription.label}</a>,
          },
          { key: "target-url", header: t("Target URL"), cell: (subscription) => subscription.targetUrl },
          {
            key: "status",
            header: t("Status"),
            cell: (subscription) => (
              <span className={`status status-sub-${subscription.status}`}>{subscription.status}</span>
            ),
          },
          {
            key: "last-delivery",
            header: t("Last delivery"),
            cell: (subscription) =>
              subscription.lastDelivery ? (
                <span className={`status status-delivery-${subscription.lastDelivery.status}`}>
                  {subscription.lastDelivery.status}
                </span>
              ) : (
                <span className="muted-cell">{t("never")}</span>
              ),
          },
          {
            key: "actions",
            headerLabel: t("Actions"),
            cell: (subscription) =>
              subscription.status === "disabled" ? (
                // `disabled` on both old inline buttons for a `status === "disabled"` row — a
                // built-in-row-style "nothing to do here" case, `RowMenu` has no equivalent
                // per-item `disabled`, so the whole trigger is withheld instead, matching
                // `Roles.tsx`'s built-in-row `—` idiom rather than an unusably empty dropdown.
                <span className="muted-cell">—</span>
              ) : (
                <RowMenu
                  triggerLabel={actionsForWebhookLabel(locale, subscription.label)}
                  items={integrationRowMenuItems(
                    subscription,
                    {
                      onTogglePause,
                      onDelete: setPendingDelete,
                    },
                    locale,
                  )}
                />
              ),
          },
        ]}
      />
      <IntegrationDeleteDialog
        locale={locale}
        pendingDelete={pendingDelete}
        deleting={deleting}
        onConfirm={onDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
