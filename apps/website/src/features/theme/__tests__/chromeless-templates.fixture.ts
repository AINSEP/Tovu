// ef1ae2ea7: brand landing pages intentionally omit site chrome. The manifest's templateFor
// declares entity kinds only, so keep the chrome exemptions explicit and scoped to these themes.
export const CHROMELESS_TEMPLATES = new Set([
  "tovu-starter/pages-blank.html",
  "tovu-theme/pages-blank.html",
]);
