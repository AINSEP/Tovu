---
name: how-tovu-works
description: Learn THIS site before planning or building with its existing content, forms, widgets and themes.
---

Before planning or building, call `site_guide({"operation":"overview"})`.
For each relevant topic id returned, call `site_guide({"operation":"explain","topic":"forms"})` (substitute the actual id).
If tools are proxied, use `execute_readonly_delegated_tool` with `toolId: "site_guide"` and the same input.
Use the live facts and permitted tool/doc pointers. Forbidden or unavailable facts are unknown; do not invent capabilities or read config files to fill the gap.
For a directory site, consult content, forms, widgets and themes: reuse structured entries, native submissions, widget instances/regions and theme markers before proposing custom code. Discover current schemas with search_tools/describe_tool before writing.
Before creating pages or themes, load the design guidance first with `agent_plugin_ui_ux_design({"skill":"ui-ux-design"})` and follow the references and companion skills it names.
For deeper workflows, explain the corresponding `how-tovu-works-*` topic ids returned by overview. Core topic ids remain the authoritative capability cards and live facts.
This plugin only contributes explanations. The core tool works with minimal cards when the plugin is disabled. Follow the owner's normal approval rules for any subsequent edits or publishing.

To build or review an agent plugin, load this plugin's second skill with
`agent_plugin_how_tovu_works({"skill":"build-agent-plugin"})`. Coding agents can read
`../build-agent-plugin/SKILL.md` directly. It covers contribution contracts, hosted MCP,
plugin-owned key cards, tests and bundled seeding.
