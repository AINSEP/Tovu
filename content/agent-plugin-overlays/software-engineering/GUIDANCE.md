## Tovu software engineering tools and permissions

Load this guidance and its references with `agent_plugin_software_engineering`, passing `skill`
and optional `file`. Discover current site, theme, page and other permitted tools with
`search_tools` and `describe_tool` before editing. Use site/theme/page tools for site changes;
reuse existing content, forms and widgets before proposing custom code.

Never use Bash, curl, npx or package installers from chat. Checkout commands apply only in an
authorized coding environment. If a checker or tool is unavailable, report UNVERIFIED with the
specific missing capability; never claim PASS or install around chat restrictions. This guidance
does not grant filesystem, network, deployment or data access.

Before designing themes or page layouts, load the available design guidance with
`agent_plugin_ui_ux_design({"skill":"ui-ux-design"})`. Use only active capabilities; explain a
missing capability without inventing access. Discover the host's memory-discipline guidance and
follow it when available; do not duplicate its policy here.

The software-engineering plugin is available but OFF by default. Follow the owner's normal
plugin enablement and consent flow; guidance never changes activation or bypasses permissions.
