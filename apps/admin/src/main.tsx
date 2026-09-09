import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { FetchQueryProvider } from "./lib/fetch-query";
import { redirectLegacyHashUrl } from "./lib/router";
import remixiconCss from "@jini-ai/ui/remixicon.css?inline";
import "./styles.css";
import "./styles/forms.css";
import "./styles/editor.css";
import "./styles/pages.css";
import "./styles/media.css";
import "./styles/source-control.css";
import "./styles/access-tokens.css";
import "./styles/settings.css";
import "./styles/external-mcp-tool-picker.css";
import "./styles/seo.css";

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

// Before the first render, so `App` never parses a URL that is about to change under it: an
// existing `/admin/#/section/settings` bookmark becomes `/admin/settings` in place.
redirectLegacyHashUrl();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* Server-state cache for every section that reads through `fetch-query`.
        Sections not yet migrated are unaffected — they still call `api.*`
        directly, and the two styles coexist without interfering. */}
    <FetchQueryProvider>
      <App />
    </FetchQueryProvider>
  </React.StrictMode>
);
