import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { redirectLegacyHashUrl } from "./lib/router";
import "./styles.css";

// Before the first render, so `App` never parses a URL that is about to change under it: an
// existing `/admin/#/section/settings` bookmark becomes `/admin/settings` in place.
redirectLegacyHashUrl();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
