import { DataTable, RowMenu, ConfirmDialog } from "@jini-ai/admin/react";
import { agentHandle } from "@jini-ai/agentic";
import { buildAgentListHandles } from "../../lib/agent-list-handles";

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
 *  ternary block in `Integrations`'s own body.
 *
 *  Cancel lives here now (2026-09-13, owner: it "floats above the create form" as the header
 *  toggle's other label) — next to Create, at the bottom, the pairing every other admin form on
 *  this build uses (`Collections.tsx`'s `NewContentTypeDialog`, `FormEditor.tsx`'s field-attrs
 *  form). The header toggle above still opens the form and still closes it on click — `onCancel`
 *  calls the exact same setter, just from a second, better-placed control — but while the form is
 *  open the header button is a redundant "Cancel" with no form context floating over an empty
 *  intro line, so `Integrations` below stops rendering it for that state. */
function IntegrationCreateForm(props: {
  locale: string;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
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
    <form onSubmit={props.onSubmit} className="notice integrations-form form-measure">
      {props.formError ? <span className="save-error">{props.formError}</span> : null}
      <label>
        {t(locale, "Label")}
        <input
          value={props.label}
          onChange={(e) => props.onLabelChange(e.target.value)}
          required
          {...agentHandle("integrations-create-label", { role: "field", label: "New webhook's label" })}
        />
      </label>
      <label>
        {t(locale, "Target URL")}
        <input
          value={props.targetUrl}
          onChange={(e) => props.onTargetUrlChange(e.target.value)}
          placeholder="https://example.com/hooks"
          required
          {...agentHandle("integrations-create-target-url", { role: "field", label: "New webhook's target URL" })}
        />
      </label>
      <label>
        {t(locale, "Topics (comma-separated, e.g. post.published, post.*)")}
        <input
          value={props.topics}
          onChange={(e) => props.onTopicsChange(e.target.value)}
          required
          {...agentHandle("integrations-create-topics", { role: "field", label: "New webhook's comma-separated event topics" })}
        />
      </label>
      <span className="editor-actions">
        <button
          type="submit"
          disabled={props.saving}
          {...agentHandle("integrations-create-submit", { role: "button", label: "Create this webhook" })}
        >
          {props.saving ? t(locale, "Saving…") : t(locale, "Create")}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={props.onCancel}
          {...agentHandle("integrations-create-cancel", { role: "button", label: "Close this form without creating a webhook" })}
        >
          {t(locale, "Cancel")}
        </button>
      </span>
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
      agentHandle="integrations-delete-webhook"
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

  // Subscription ids are stable and unique, so they disambiguate one row's menu from another's —
  // same reasoning as every other list on this workstream.
  const rowMenuHandles = buildAgentListHandles(
    "integrations-row",
    subscriptions.map((subscription) => subscription.id),
  );

  return (
    <div className="integrations-tab-body">
      {/* No `page`/`page-header` of its own since 2026-09-10: this component is a TAB BODY under a
          single page shell — first `DeveloperApi.tsx`'s (that file is now retired), now
          `features/providers/Providers.tsx`'s, which draws the kicker, title and description for
          the whole Integrations page. A tab body that re-declared a page title directly beneath
          the page title it sits under would read as a rendering bug — the same reason
          `AccessTokensTab`/`SiteTokenTab` are headerless under `Security.tsx`'s one shell. The
          description this header used to carry ("Send webhook notifications to external services
          when content on this site changes.") is not lost — it moved to the tab's own intro line
          below, where it still explains the tab without competing with the page title.

          The "Add webhook" control moved with it, from `page-actions` into this row. Same button,
          same handle, same behaviour — only its position changed.

          Withheld while `formOpen` (2026-09-13): with Cancel now living next to Create at the
          form's own bottom (see `IntegrationCreateForm`'s doc comment), a second "Cancel" up here
          would be a duplicate control floating over an intro line that no longer has a form of its
          own to open. */}
      <div className="integrations-tab-intro">
        <p className="page-description">
          {t("Send webhook notifications to external services when content on this site changes.")}
        </p>
        {formOpen ? null : (
          <div className="page-actions">
            <button
              onClick={() => setFormOpen(true)}
              {...agentHandle("integrations-toggle-create-form", { role: "button", label: "Open the add-webhook form" })}
            >
              {t("Add webhook")}
            </button>
          </div>
        )}
      </div>

      {formOpen ? (
        <IntegrationCreateForm
          locale={locale}
          onSubmit={onCreate}
          onCancel={() => setFormOpen(false)}
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
          // `form-measure` (2026-09-13, owner: this text read off-center and clipped): the card had
          // no width of its own, so on a wide viewport it stretched edge to edge and centered its
          // two sentences around the middle of that whole span instead of around a column a reader
          // could actually see at once. Same cap the create form right above it already uses, so
          // the empty state now reads as that form's own column, just without any webhooks in it.
          <div className="card form-measure">
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
            cell: (subscription, index) => (
              <a
                href={`/admin/integrations/${subscription.id}`}
                {...agentHandle(`${rowMenuHandles[index]}-label`, { role: "link", label: `Open the "${subscription.label}" webhook's deliveries` })}
              >
                {subscription.label}
              </a>
            ),
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
            cell: (subscription, index) =>
              subscription.status === "disabled" ? (
                // `disabled` on both old inline buttons for a `status === "disabled"` row — a
                // built-in-row-style "nothing to do here" case, `RowMenu` has no equivalent
                // per-item `disabled`, so the whole trigger is withheld instead, matching
                // `Roles.tsx`'s built-in-row `—` idiom rather than an unusably empty dropdown.
                <span className="muted-cell">—</span>
              ) : (
                <RowMenu
                  triggerLabel={actionsForWebhookLabel(locale, subscription.label)}
                  agentHandle={`${rowMenuHandles[index]}-menu`}
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
