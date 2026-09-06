import { I18nProvider, SETTINGS_DIALOG_DICTIONARIES, SettingsDialogShell } from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import { findNavGroupLabel } from "./Placeholder";
import { toSettingsDialogTabs } from "./PlaceholderTabs.hooks";

/**
 * @file The `SettingsDialogShell` tab chrome mounted over N honest "coming soon" panels, for a
 * `soon: true` section whose eventual shape is already known to be tabbed (Payments, Deployment,
 * Authentication as of this pass) rather than a single screen.
 *
 * Same shell, same `presentation="inline"` page mode `features/settings/SettingsUi.tsx` uses —
 * card look, tab strip, and the shell's own kicker/title/subtitle header above it — NOT
 * `features/ai-assistant/AiAssistant.tsx`'s `--page-flow` variant. That distinction used to be
 * collapsed (both screens use the same shell, so an earlier pass here reused AiAssistant's
 * modifier by copy-paste) and it produced a visible bug: `--page-flow` hides the shell's own
 * `.jini-tabbed-dialog-head` and flattens its card (see that modifier's own comment in
 * styles.css) because AiAssistant supplies its OWN `.page-header` above the shell instead. This
 * component never did — its kicker/title/subtitle used to be baked into `Placeholder.tsx`'s
 * `ComingSoonNotice` and rendered as the active tab's *panel*, i.e. inside
 * `.jini-tabbed-dialog-content`, below the (still-visible, because `--inline` tab-row styling
 * isn't scoped to `--page-flow`) tab strip — the exact "header under the tabs, no card" the owner
 * flagged. Fixed by feeding the same three strings through the shell's own contract instead:
 * `labels.kicker` (section-level, e.g. "People") and each tab's `title`/`subtitle` (per-tab,
 * e.g. "Home" / "Home is coming soon.") — the same fields `SettingsUi.tsx`'s real tabs set, so
 * the shell renders them exactly where Settings renders theirs: above the tab strip, inside the
 * card. No body markup is needed per tab: `subtitle` alone already carries the "is coming soon"
 * copy `ComingSoonNotice` used to render a second time inside the panel.
 */

/** One tab in a `PlaceholderTabs` section: just the id and label a real tab will eventually
 *  carry. No icon, no per-tab route — this is scaffolding to look at and click through, not a
 *  shipped tab set. */
export interface PlaceholderTabSpec {
  readonly id: string;
  readonly label: string;
}

export function PlaceholderTabs(props: { sectionId: string; tabs: readonly PlaceholderTabSpec[] }) {
  const kicker = findNavGroupLabel(props.sectionId);
  const tabs = toSettingsDialogTabs(props.tabs);

  return (
    // `I18nProvider` is required, not decorative: `SettingsDialogShell` calls `useT()` for its own
    // chrome strings, and without a provider above it they fall back to raw keys — same reasoning
    // `AiAssistant.tsx` documents at its own mount of this shell.
    <I18nProvider
      initialLocale="en"
      dictionaries={SETTINGS_DIALOG_DICTIONARIES}
      fallbackLocale="en"
      syncDocumentAttributes={false}
    >
      {/* `data-theme="light"`: this screen has no appearance control of its own and the Tovu admin
          shell is light-only, so pinning to light (rather than leaving the shell to fall through to
          its dark default) is the only choice that does not make one page disagree with every other
          one — identical reasoning to `AiAssistant.tsx`'s own mount.
          Deliberately NOT `--page-flow`: this screen supplies no `.page-header` of its own (unlike
          AiAssistant), so it wants the shell's OWN kicker/title/subtitle header and card look, the
          same as `SettingsUi.tsx` — see the file header for the bug this used to produce. */}
      <div className="settings-ui-section" data-theme="light">
        <SettingsDialogShell
          tabs={tabs}
          presentation="inline"
          className="jini-tabbed-dialog--inline"
          fullscreenEnabled={false}
          labels={{ kicker }}
        />
      </div>
    </I18nProvider>
  );
}
