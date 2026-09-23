import type { ReactNode } from "react";

export interface ComingSoonPanelProps {
  /** Terse status line shown above the greyed content — e.g. "Coming soon." No dates promised. */
  label: string;
  /** Optional second line naming what's specifically not ready yet (owner's copy rule: terse, two
   *  lines maximum total including {@link label}). Omit for just the label. */
  note?: string;
  /** The real tab body, kept mounted and visible under the wash rather than deleted — the owner's
   *  explicit call: an operator should see what's coming, not an empty tab. */
  children: ReactNode;
}

/**
 * @file Shared "this tab exists but isn't live" wrapper — greys out and disables real content
 * without removing it, for a tab whose feature isn't wired yet (Providers.tsx's MCP Server and
 * Webhooks tabs, as of 2026-09-19; any future tab needing the identical treatment should reuse this
 * rather than growing its own copy, per the owner's own instruction).
 *
 * ## Reused, not invented
 *
 * This is the EXACT idiom `SettingsUi.tsx` already established for "visible but genuinely inert"
 * content — `.settings-ui-inert-note` + `.settings-ui-inert-control` + the native `inert` HTML
 * attribute, used there for Media providers, the Skills tab, and the Memory panel, and reused again
 * in `Authentication.tsx`/`Sites.tsx`. Deliberately NOT `components/Placeholder.tsx`'s
 * `ComingSoonNotice`: that component has no `children` slot and REPLACES the whole page with an
 * empty notice — built for a section with nothing built at all, not for "keep the real content
 * visible, just grey and disable it," which is what this needs.
 *
 * `inert` (not just `opacity`/`pointer-events`) is what makes this GENUINELY non-interactive: it
 * drops the wrapped subtree from tab order, click handling, and the accessibility tree natively.
 * Greying a copyable command or an "Add webhook" button without `inert` would be worse than not
 * greying it at all — it would look disabled while still working if clicked or tabbed to.
 * `.settings-ui-inert-control`'s own CSS is `opacity: 0.55` — no new tokens, and it already reads as
 * inactive without going illegible, the same bar `SettingsUi.tsx`'s own uses have already cleared in
 * both themes (`--jini-text-muted`/`--jini-bg-subtle`/`--jini-border`, all theme-aware tokens).
 */
export function ComingSoonPanel({ label, note, children }: ComingSoonPanelProps) {
  return (
    <div className="coming-soon-panel">
      <p className="settings-ui-inert-note" role="note">
        <strong>{label}</strong>
        {note ? <> {note}</> : null}
      </p>
      {/* `inert` (boolean HTML attribute, not `inert={true}`) — same JSX shape
          `SettingsUi.tsx`'s own three inert-wrapped tabs already use. */}
      <div className="settings-ui-inert-control" inert>
        {children}
      </div>
    </div>
  );
}
