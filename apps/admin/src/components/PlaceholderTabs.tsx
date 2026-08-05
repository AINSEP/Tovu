import {
  I18nProvider,
  SETTINGS_DIALOG_DICTIONARIES,
  SettingsDialogShell,
  type SettingsDialogTab,
} from "@jini-ai/ui";
import "@jini-ai/ui/settings-dialog.css";
import { ComingSoonNotice, findNavGroupLabel } from "./Placeholder";

/**
 * @file The `SettingsDialogShell` tab chrome mounted over N honest "coming soon" panels, for a
 * `soon: true` section whose eventual shape is already known to be tabbed (Payments, Deployment,
 * Authentication as of this pass) rather than a single screen.
 *
 * Same shell, same `presentation="inline"` page mode `features/settings/SettingsUi.tsx` and
 * `features/ai-assistant/AiAssistant.tsx` already use, so this inherits that chrome rather than
 * growing a third, similar-but-different one. Each tab's panel is `Placeholder.tsx`'s own
 * `ComingSoonNotice` — this repo's one idiom for "announced, not built" — rather than new per-tab
 * copy: a tab id like `stripe` has no entry of its own in `nav.ts`, so `Placeholder`'s own
 * `sectionId` lookup cannot resolve it directly, but the body it renders must stay identical.
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
  const tabs: SettingsDialogTab[] = props.tabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    title: tab.label,
    panel: <ComingSoonNotice kicker={kicker} label={tab.label} />,
  }));

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
          `--page-flow` opts out of `.settings-ui-section`'s full-height layout; see that modifier's
          comment in styles.css for the nested-scroller trap it exists to avoid. */}
      <div className="settings-ui-section settings-ui-section--page-flow" data-theme="light">
        <SettingsDialogShell
          tabs={tabs}
          presentation="inline"
          className="jini-settings-dialog--inline"
          fullscreenEnabled={false}
        />
      </div>
    </I18nProvider>
  );
}
