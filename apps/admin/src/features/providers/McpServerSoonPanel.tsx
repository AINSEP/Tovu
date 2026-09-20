import { useT } from "@jini-ai/ui";

/**
 * @file Placeholder body for the Providers page's MCP Server tab (`Providers.tsx`'s `mcp-server`
 * case), until a real `McpIntegrationsPort` is wired to Tovu's daemon — tracked in
 * `development/todos.md` under "🔜 SOON — make the MCP Server real, starting with the desktop app".
 *
 * ## Why this exists instead of just rendering `IntegrationsTab` with no `port`
 *
 * `IntegrationsTab` (`@jini-ai/ui`) falls back to `createFakeMcpIntegrationsPort()` when no `port` is
 * supplied, which returns the literal placeholder `{command: "node", args: ["/path/to/cli.js",
 * "mcp"]}`. Rendered through `SnippetBlock`, that is a real-looking, copyable install command that
 * cannot work on any install — local, desktop, or production — because `/path/to/cli.js` is not a
 * path. Found 2026-09-19 while answering "should we hide MCP Server on production?"; this panel is
 * the honesty fix, not the real-port fix.
 *
 * ## What's kept vs. dropped
 *
 * The capabilities card (`t('What this server can do')` + its three bullets) is kept verbatim,
 * including its existing translations in `@jini-ai/ui`'s `SETTINGS_DIALOG_DICTIONARIES` — it
 * describes what an MCP client would get once this is wired, which stays true regardless of whether
 * the port is real yet. `IntegrationsTab`'s client picker, one-click install link, and copyable
 * snippet block are all dropped rather than "disabled": there is no real command to grey out, so
 * showing a disabled button/dropdown would still imply one exists. The two-line notice below
 * replaces them, reusing `.jini-empty-card` (the same dashed-border, muted-text card `IntegrationsTab`
 * itself uses for its own error/warning states) rather than inventing new chrome for two lines of
 * copy.
 *
 * Same reasoning as `Providers.tsx`'s own header on why `I18nProvider` there is load-bearing: this
 * component calls `useT()` from `@jini-ai/ui`, which reads that ancestor context, so it must stay
 * mounted under it — it already is, since this only ever renders inside that page's `mcp-server` tab.
 */
export function McpServerSoonPanel() {
  const t = useT();

  return (
    <section className="jini-settings-section jini-settings-integrations">
      <div className="jini-mcp-capabilities-card">
        <p className="jini-mcp-capabilities-label">{t("What this server can do")}</p>
        <ul className="jini-mcp-capabilities-list">
          <li>{t("Read your project files")}</li>
          <li>{t("Pull context into the conversation")}</li>
          <li>{t("Use default, safe tool permissions")}</li>
        </ul>
      </div>

      {/* No translated copy exists yet for these two lines anywhere in
          `SETTINGS_DIALOG_DICTIONARIES` — `useT()`'s documented fallback (`I18nProvider`'s own doc
          comment: "every lookup falls through to the key itself") renders the English text below in
          every locale until this panel is retired for a real port, which is the correct behavior for
          brand-new copy rather than a bug to fix here. */}
      <div className="jini-empty-card">
        <strong>{t("Not available yet.")}</strong>{" "}
        {t("There's nothing to install here yet — this tab isn't connected to anything.")}
      </div>
    </section>
  );
}
