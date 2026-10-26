import React from "react";
import { KitProvider } from "@jini-ai/ui-kit/react";
import { tovuKit } from "./integrations/jini-admin/kit";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { useAdminSession } from "./App.hooks";
import { CommentQueueScopeProvider } from "@jini-ai/admin/comments/react";
import { createCommentsQueueScope } from "./integrations/jini-admin/comments-ports";
import { ServerRestartingBanner } from "./components/ServerRestartingBanner/ServerRestartingBanner";
import { FetchQueryProvider } from "./lib/fetch-query/provider";
import { redirectLegacyHashUrl } from "./lib/router";
import { adminTelemetry, installBrowserErrorListeners, reactRootErrorOptions } from "./lib/browser-telemetry";
import remixiconCss from "@jini-ai/ui/remixicon.css?inline";
import "./styles.css";
import "./styles/forms.css";
import "./styles/editor.css";
import "./styles/pages.css";
import "./styles/media.css";
import "./styles/library.css";
import "./integrations/jini-admin/jini-media.css";
import "./styles/source-control.css";
import "./styles/access-tokens.css";
import "./styles/site-key.css";
import "./styles/settings.css";
import "./styles/external-mcp-tool-picker.css";
import "./styles/seo.css";
import "./styles/sites-settings.css";
import "./styles/site-transfer.css";
import "./styles/site-publish.css";
import "./features/publish-content/publish-content.css";

// `@jini-ai/ui`'s `RemixIcon` component loads its default webfont/CSS itself, but it does so via
// `new URL('./remixicon.css', import.meta.url)` + a runtime `<link>` injection rather than a
// static `import` — Vite treats that as an opaque asset reference (like an image), copying the
// CSS verbatim without resolving the `url(./remixicon.woff2)` inside it, so the font itself never
// makes it into the build. A plain `?inline` import runs the file through Vite's real CSS
// pipeline instead: the nested font `url()` gets resolved, hashed, and emitted alongside the rest
// of the build's assets, and we get the fully-processed CSS text back as a string.
//
// We inject it ourselves as a `<style data-jini-remixicon>` tag — the exact override marker
// `RemixIcon`'s own `ensureRemixIconStylesheet()` checks for before loading its (broken-in-this-
// bundler) default — so the package's own runtime injection never fires. Must run before the
// first `RemixIcon` mounts, hence top-level here rather than inside a component.
const remixiconStyle = document.createElement("style");
remixiconStyle.setAttribute("data-jini-remixicon", "");
remixiconStyle.textContent = remixiconCss;
document.head.appendChild(remixiconStyle);

// The admin's own errors go to the server's telemetry route (no vendor code here): window-level
// errors and rejections, plus every error a React boundary caught or none did (root options below).
installBrowserErrorListeners({ target: window, telemetry: adminTelemetry });

// Before the first render, so `App` never parses a URL that is about to change under it: an
// existing `/admin/#/section/settings` bookmark becomes `/admin/settings` in place.
redirectLegacyHashUrl();

/** Keep one session owner above App so Jini receives the current queue identity before rendering.
 * Boot and login still use App's existing gates. O(1) composition; session I/O stays in its hook.
 */
function SessionApp() {
  const session = useAdminSession();
  const app = <App useSession={() => session} />;
  if (session.checking || !session.user) return app;
  return <CommentQueueScopeProvider scope={createCommentsQueueScope({ principalId: session.user.id })}>
    {app}
  </CommentQueueScopeProvider>;
}

ReactDOM.createRoot(document.getElementById("root")!, reactRootErrorOptions({ telemetry: adminTelemetry })).render(
  <React.StrictMode>
    {/* Server-state cache for every section that reads through `fetch-query`.
        Sections not yet migrated are unaffected — they still call `api.*`
        directly, and the two styles coexist without interfering. */}
    <KitProvider kit={tovuKit}>
    <FetchQueryProvider>
      {/* Outside `App` so it also shows on the login and boot screens while the API restarts. */}
      <ServerRestartingBanner />
      <SessionApp />
    </FetchQueryProvider>
    </KitProvider>
  </React.StrictMode>
);
