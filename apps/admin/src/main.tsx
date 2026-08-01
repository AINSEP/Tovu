import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { FetchQueryProvider } from "./lib/fetch-query";
import { redirectLegacyHashUrl } from "./lib/router";
import "./styles.css";
import "./styles/forms.css";
import "./styles/editor.css";
import "./styles/media.css";

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
