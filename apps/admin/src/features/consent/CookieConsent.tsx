import { agentHandle } from "@jini-ai/agentic";
import { ConsentBannerFields, ConsentLookFields, ConsentPreviewFrame, ConsentRulesFields } from "@jini-ai/admin/consent/react";
import type { Translate } from "@jini-ai/ui/panel-kit";
import type { CSSProperties } from "react";
import { TabBar, type TabBarTab } from "@jini-ai/ui/tab-strip";
import { navigate } from "@/lib/router";
import { ConsentOverviewTab } from "./ConsentOverviewTab";
import { useConsentTranslate, type ConsentTranslation } from "./consent-i18n";
import { canResetConsentCss, CONSENT_PREVIEW_DESKTOP_WIDTH, consentStatusKey, resolveConsentTabId, type ConsentTabId } from "./rules";
import { defaultConsentRevisionsPort, type ConsentRevisionsPort } from "./settings.hooks";
import { useConsentPage, useConsentPreview, useConsentPreviewScale, useConsentReadiness, type ConsentPageController } from "./use-consent-page.hooks";
import "./consent-settings.css";

/**
 * @file Administration → Cookie Consent (`/admin/consent?tab=overview|banner|look|rules`). Edits
 * autosave as a draft revision; the live site changes only on Publish. The fields and the sandboxed
 * preview are Jini's (`@jini-ai/admin/consent/react`); this file binds them to the revisions API.
 */

export interface CookieConsentProps {
  /** The `?tab=` query value from `panels.tsx`; unknown or absent opens Overview. */
  tabId?: string | null;
  /** Injected in tests; the admin API otherwise. */
  port?: ConsentRevisionsPort;
  useTranslate?: () => ConsentTranslation;
  /** Test-only debounce overrides. */
  delays?: { autosaveMs?: number; previewMs?: number };
}

const TAB_LABELS: Readonly<Record<ConsentTabId, string>> = { overview: "Overview", banner: "Banner", look: "Look & Position", rules: "Rules" };

function tabsFor(t: Translate): TabBarTab[] {
  return (Object.keys(TAB_LABELS) as ConsentTabId[]).map((id) => ({
    id, label: t(TAB_LABELS[id]), handle: `consent-tab-${id}`, handleLabel: `Switch to the ${TAB_LABELS[id]} tab of Cookie Consent`,
  }));
}

function PublishBar({ page, t }: { page: ConsentPageController; t: Translate }) {
  return (
    <div className="page-actions consent-publish">
      <span className="consent-save-status" role="status">{t(consentStatusKey({ saveState: page.saveState, hasUnpublished: page.hasUnpublished, everPublished: page.everPublished }))}</span>
      <button
        type="button"
        className="btn-primary"
        disabled={!page.canPublish}
        onClick={() => { void page.publish(); }}
        {...agentHandle({ handle: "consent-publish" }, { role: "button", label: "Publish the cookie consent draft to the live site" })}
      >
        {page.publishing ? t("Publishing…") : t("Publish")}
      </button>
    </div>
  );
}

function Notices({ page, t }: { page: ConsentPageController; t: Translate }) {
  return (
    <>
      {page.saveState === "conflict" && (
        <div className="notice warning" role="alert">
          {t("Someone else changed this. Reload to see it.")}{" "}
          <button type="button" className="btn-secondary" onClick={page.reload}>{t("Reload")}</button>
        </div>
      )}
      {page.saveError && page.saveState === "error" && <p className="notice error" role="alert">{page.saveError}</p>}
      {page.publishError && <p className="notice error" role="alert">{page.publishError}</p>}
    </>
  );
}

/** Puts the site's default banner style back into Custom CSS. The server pre-fills an empty field
 * with that default, so this appears only after the owner has changed it. Like any edit it only
 * autosaves a draft; the live banner changes on Publish. */
function ResetStyle({ page, t, disabled }: { page: ConsentPageController; t: Translate; disabled: boolean }) {
  const defaultCss = page.editor?.defaults?.customCss;
  if (!defaultCss || !canResetConsentCss({ customCss: page.value?.customCss, defaultCss })) return null;
  return (
    <div className="consent-css-reset">
      <button
        type="button"
        className="btn-secondary"
        disabled={disabled}
        onClick={() => page.onChange({ patch: { customCss: defaultCss } })}
        {...agentHandle({ handle: "consent-reset-css" }, { role: "button", label: "Put the default cookie banner style back into Custom CSS" })}
      >
        {t("Reset to default")}
      </button>
    </div>
  );
}

function EditorTab({ tab, page, port, translation, delays }: { tab: Exclude<ConsentTabId, "overview">; page: ConsentPageController; port: ConsentRevisionsPort; translation: ConsentTranslation; delays: CookieConsentProps["delays"] }) {
  const preview = useConsentPreview({ port, config: tab === "rules" ? null : page.value, t: translation.t }, delays?.previewMs === undefined ? {} : { delayMs: delays.previewMs });
  const fit = useConsentPreviewScale();
  const value = page.value!;
  const fields = { value, onChange: page.onChange, problems: page.problems, dictionary: translation.dictionary, disabled: page.saveState === "conflict", limits: page.editor?.textLimits };
  if (tab === "rules") {
    return (
      <div className="consent-editor">
        <div className="card"><ConsentRulesFields {...fields} regionModes={page.editor?.regionModes} /></div>
        <section className="card consent-card" aria-label={translation.t("Fixed rules")}>
          <h2 className="card-title">{translation.t("Fixed rules")}</h2>
          <ul className="consent-fixed-rules">
            <li>{translation.t("Global Privacy Control always turns off analytics and marketing.")}</li>
            <li>{translation.t("Choices are kept for 180 days, then visitors are asked again.")}</li>
            <li>{translation.t("Static exports can't store choices. Keep the banner on a live server.")}</li>
          </ul>
        </section>
      </div>
    );
  }
  return (
    <div className="consent-editor consent-editor-with-preview">
      <div className="card">
        {tab === "banner" ? <ConsentBannerFields {...fields} /> : <ConsentLookFields {...fields} placements={page.editor?.placements} />}
        {tab === "look" && <ResetStyle page={page} t={translation.t} disabled={fields.disabled} />}
      </div>
      <div className="card consent-preview-pane" ref={fit.ref} style={{ "--consent-preview-scale": fit.scale, "--consent-preview-desktop-width": `${CONSENT_PREVIEW_DESKTOP_WIDTH}px` } as CSSProperties}>
        {preview.error && <p className="notice error" role="alert">{preview.error}</p>}
        <ConsentPreviewFrame html={preview.html} status={translation.t("Loading preview…")} dictionary={translation.dictionary} />
      </div>
    </div>
  );
}

export function CookieConsent({ tabId, port = defaultConsentRevisionsPort, useTranslate = useConsentTranslate, delays }: CookieConsentProps) {
  const translation = useTranslate();
  const { t } = translation;
  const page = useConsentPage({ port, t }, delays?.autosaveMs === undefined ? {} : { delayMs: delays.autosaveMs });
  const activeTab = resolveConsentTabId({ tabId });
  // Overview re-checks after each publication and whenever it is reopened on a newer draft.
  const readiness = useConsentReadiness({ port, refresh: `${page.publishedCount}:${activeTab === "overview" ? page.draftId : ""}`, t });
  return (
    <div className="page consent-page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">{t("Administration")}</p>
          <h1 className="page-title">{t("Cookie Consent")}</h1>
          <p className="page-description">{t("The banner visitors see, and what waits for their choice.")}</p>
        </div>
        {page.value && <PublishBar page={page} t={t} />}
      </div>
      <Notices page={page} t={t} />
      <TabBar ariaLabel={t("Cookie Consent")} tabs={tabsFor(t)} activeId={activeTab} onChange={(next) => navigate(`/consent?tab=${next}`, { replace: true })} containerHandle="consent-tab-bar" />
      {page.loadError && <p className="notice error" role="alert">{page.loadError}</p>}
      {!page.value && !page.loadError && <p className="card-lead">{t("Loading…")}</p>}
      {page.value && activeTab === "overview" && (
        <ConsentOverviewTab liveEnabled={page.liveEnabled} hasUnpublished={page.hasUnpublished} readiness={readiness.readiness} readinessError={readiness.error} t={t} />
      )}
      {page.value && activeTab !== "overview" && <EditorTab tab={activeTab} page={page} port={port} translation={translation} delays={delays} />}
    </div>
  );
}
