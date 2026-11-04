# Tovu Desktop 0.1.27

## New

- Export: when a site export may contain credentials, the row says so, lists the files, and waits for an "I understand" tick before Download or Copy link. Nothing is ever left out of the export.
- Import: the same credential notice shows before the password step and in Past imports.
- Static export opens on a styled front page with a card for every theme and every page, in light and dark mode. It replaces the bare "Open website" link.
- Plugins come from the shared `@jini-ai/agent-plugins` and `@jini-ai/provider-plugins` packages (Jini 0.6.19).

## Fixed

- Exporting, sharing and importing a site works again. A missing table list broke every share and import path.
- The assistant can write theme files when your sites folder is reached through a link (macOS) or a junction (Windows).
- A too-large import names the real size limit in plain words.
- Charts load in the packaged app again (provider integrity pins match Jini 0.6.19).
