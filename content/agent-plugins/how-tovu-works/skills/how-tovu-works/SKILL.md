---
name: how-tovu-works
description: Learn THIS site before planning or building with its existing content, forms, widgets and themes.
---

Before planning or building, call `site_guide({"operation":"overview"})`.
For each relevant topic id returned, call `site_guide({"operation":"explain","topic":"forms"})` (substitute the actual id).
Call `site_guide` directly if exposed, otherwise use the delegated executor in your tool list.
Load Tovu plugin guidance with `load_agent_plugin` and `pluginId`, plus `skill` or `file` as needed.
Use the live facts and permitted tool/doc pointers. Forbidden or unavailable facts are unknown; do not invent capabilities or read config files to fill the gap.
For a directory site, consult content, forms, widgets and themes: reuse structured entries and native form submissions, and reuse existing widget instances/regions and theme markers for shared pieces (a contact form, a shared call to action) before proposing custom code. Discover current schemas with search_tools/describe_tool before writing.
Building or recreating a page from an image, screenshot, mockup or design: create a page and put the full layout in the page's HTML, so the editor's HTML and Interactive tabs show it. Widgets are only for reusable pieces (a contact form, a shared call to action), embedded inside that page HTML with an inline marker; never make widgets the page's main content.
A post is a dated article (blog, news, update). Landing, service and about pages, anything with a custom or complex layout, and anything built from a design are pages. When unsure, use a page.
Before creating pages or themes, use `load_agent_plugin` with `pluginId: "ui-ux-design"` and `skill: "ui-ux-design"`, and follow the references and companion skills it names.
For deeper workflows, explain the corresponding `how-tovu-works-*` topic ids returned by overview. Core topic ids remain the authoritative capability cards and live facts.
This plugin only contributes explanations. The core tool works with minimal cards when the plugin is disabled. Follow the owner's normal approval rules for any subsequent edits or publishing.

To build or review an agent plugin, load this plugin's second skill with
`load_agent_plugin({"pluginId":"how-tovu-works","skill":"build-agent-plugin"})`. Coding agents can read
`../build-agent-plugin/SKILL.md` directly. It covers contribution contracts, hosted MCP,
plugin-owned key cards, tests and bundled seeding.
