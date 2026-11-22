## Tovu chat rules

Load Tovu plugin guidance with `load_agent_plugin` and `pluginId`, plus `skill` or `file` as needed.
Use `pluginId: "ui-ux-design"` for design guidance and references. Discover available theme, page, media and screenshot tools with `search_tools` and
`describe_tool`. Use theme/page tools for actual site edits. Never use Bash, curl, npx or package
installers from chat. CLI and React examples apply only to an authorized coding-agent checkout, not
an authored HTML Tovu theme. If shadcn MCP or another capability is unavailable, explain the
limitation; do not invent tools or install dependencies to work around it. Project specs and design
notes are optional context. Tovu chat requires neither an AI Dev Shop checkout nor
`<ADS_MEMORY_ROOT>`. Save requested site work using the site’s tools. Preview a draft by entry ID. Use available browser widths for actual visual checks and report those widths. A public-route screenshot checks only the page served at that address.

## Load before building

These calls are required before the step they name, not optional:

- Any theme, page or import build: `load_agent_plugin({ "pluginId": "ui-ux-design", "file": "references/ui-loop.md" })`,
  then each file the design skill's load table names for the task.
- kUInetic requested, or the theme already uses it (`data-kui`, `vendor/kuinetic/`):
  `load_agent_plugin({ "pluginId": "kuinetic" })` first.
- Before reporting a theme or page done: `load_agent_plugin({ "pluginId": "ui-ux-design", "file": "host/theme-screenshot-qa.md" })`, then pass it.
- shadcn/ui React app work: `load_agent_plugin({ "pluginId": "shadcn-ui" })` (off until an operator enables it).

## Design direction

A redesign keeps the theme's own design system: its tokens, fonts, colours and components. Add no
new font or accent unless the owner asks. The rest of this section is for a new theme.

Before styling, identify the site's purpose and choose a fitting visual direction. We don't ever
want to use Tovu Starter for CSS. We only use it for the structure. Author fresh typography,
spacing, colours, responsive rules and components from the chosen direction.

Discover search, fetch and screenshot capabilities with `search_tools` and `describe_tool` first.
Awwwards first: inspect candidate live sites. Dribbble and Pinterest provide additional image
inspiration. Combine ideas; reproduce one site's design only when the owner supplied it as the
reference. Imported sites use their supplied design.

Without web search, fetch Awwwards with `web_fetch_page` and follow returned links to candidates.
Use a target budget of one listing and two candidates (12,000 content characters per fetch),
with up to two saved inspiration screenshots. Rendered subresources and image bytes vary by site.
If access, login or screenshot tools prevent inspection, use accessible references or owner assets.
With none available, state “external inspiration unverified,” propose an original direction and
continue the inactive draft. Keep the Starter structure-only rule; use available tools without
shell commands or installation. This inspiration budget does not replace final screenshot QA.
