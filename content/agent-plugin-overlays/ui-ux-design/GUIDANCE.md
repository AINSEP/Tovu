## Tovu chat rules

Load design guidance and references with `agent_plugin_ui_ux_design`, passing `skill` and optional
`file`. Discover available theme, page, media and screenshot tools with `search_tools` and
`describe_tool`. Use theme/page tools for actual site edits. Never use Bash, curl, npx or package
installers from chat. CLI and React examples apply only to an authorized coding-agent checkout, not
an authored HTML Tovu theme. If shadcn MCP or another capability is unavailable, explain the
limitation; do not invent tools or install dependencies to work around it. Project specs and design
notes are optional context. Tovu chat requires neither an AI Dev Shop checkout nor
`<ADS_MEMORY_ROOT>`. Return the design in chat unless the user asks to save it through an available
tool.

## Design direction

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

## Theme screenshot QA

For theme-from-reference work, the screenshot loop is a release gate. Capture the actual authored
theme at 360, 390, 768, 1024, 1280 and 1440px viewport widths, including full-page views and close
views of every hero and section headline. Inspect the final saved version after fonts and images
load. A desktop and phone screenshot alone does not establish a pass at the widths between them.

- FAIL on clipped text or horizontal overflow at any checked width, including a headline clipped
  inside its own section even when the page itself has no horizontal scrollbar. Read every heading
  through its last character and check both section edges. When inspection tools expose geometry,
  compare document scrollWidth with clientWidth and check text bounds against the container bounds;
  a clean document width alone cannot prove text is visible inside an overflow-clipped ancestor.
- FAIL on large dead gaps: any unexplained blank space of 160px or more beneath a hero headline or
  between content blocks. Compare the visible text and the next meaningful element, not just the
  outer section boxes. Remove spacer blocks and inflated padding, margins, line-height or min-height
  that create empty space. Use the reference's proportions to check smaller gaps too.
- Scale display type to the available container with clamp(). For example, put
  `container-type: inline-size` on the heading's parent and use
  `font-size: clamp(2rem, 8cqi, 7rem)` on the heading. Tune all three bounds for the actual font,
  wording and container; this example does not guarantee fit. Allow wrapping and reduce the minimum
  size or adjust line breaks when needed. Check section headlines as carefully as the hero.
- Never mask a failing headline with `overflow: hidden`, `clip`, ellipsis or offscreen positioning.
  Keep every word readable and adjust type, wrapping and spacing together.
- After any failure, fix the layout and repeat the captures at the same widths before claiming
  completion. Report the checked widths and remaining failures. If screenshot or inspection tools
  are unavailable, say the layout is unverified and do not report PASS.
