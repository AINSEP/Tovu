# Shopify Merchant Editing Model

## Summary

Shopify's theme architecture is a layered composition system that lets non-developers build and customize pages without writing code, while letting developers control the available building blocks and their constraints.

The hierarchy is: **Layout > Template > Sections > Blocks**

## The Layers

### Layouts
The outermost wrapper. Contains repeated elements (header, footer, scripts). Only `theme.liquid` is required. Most themes have 1-2 layouts.

### Templates
Determine page-specific content. Come in two formats:
- **JSON templates** (preferred): reference sections by ID, store section config as data. Merchants can add/remove/reorder sections via the theme editor.
- **Liquid templates** (legacy): contain HTML/Liquid directly, less flexible.

JSON templates "minimize the amount of data in settings_data.json" by storing layout info directly in the template file. Max 1,000 JSON templates per theme. Max 25 sections per template.

### Sections
Reusable content modules. Each section is a Liquid file with:
- **Main content**: Liquid markup using `section` and `block` objects
- **Assets**: bundled JS/CSS via `{% javascript %}` / `{% stylesheet %}` tags
- **Schema**: `{% schema %}` tag defining name, settings, blocks, presets, limits

Sections can be rendered three ways:
- **Dynamically**: referenced from JSON templates (merchant can customize)
- **Statically**: via `{% section %}` tag (fixed, not customizable)
- **API**: via Section Rendering API

Max 50 blocks per section.

### Blocks
The smallest composable unit. Three types:
- **Theme blocks**: stored in `/blocks/` folder, reusable across multiple sections, support nesting
- **Section blocks**: defined inside a section's `{% schema %}`, constrained to that section only, no nesting
- **App blocks**: provided by installed apps, require `{ "type": "@app" }` in schema

Merchants can add, remove, reorder, and hide blocks. Static blocks can't be removed but can be hidden.

### Settings
Every section and block can define settings (text inputs, color pickers, image selectors, etc.) that merchants configure in the theme editor. Settings are defined in the `{% schema %}` tag and accessed as Liquid variables.

Global theme settings live in `config/settings_schema.json`.

### Liquid
The template language that powers all of this. Three components:
- **Objects** (`{{ product.title }}`): variables representing store data
- **Tags** (`{% if %}`, `{% for %}`): logic and control flow
- **Filters** (`{{ title | upcase }}`): output transformations

## Boundaries and Constraints

- Sections cannot nest other sections (only blocks can nest within sections).
- Theme blocks and section blocks cannot coexist in the same section.
- App blocks require explicit opt-in from the section schema.
- JSON templates cannot be used for `gift_card` or `robots.txt`.
- Section HTML updates in the editor without full page reloads, but JS doesn't re-run.
- Merchants can only add sections that have presets defined.

## Tovu Reconstruction Notes

### Why this exists
Shopify needs merchants (non-developers) to customize pages without breaking the store. The template > section > block hierarchy is a constrained composition system: merchants get flexibility within guardrails that developers define.

### What Tovu should preserve
- **Layered composition**: a clear hierarchy where each layer has defined responsibilities (layout wraps template, template references sections, sections contain blocks).
- **Data-driven page definition**: JSON templates are just data describing which sections appear in what order with what settings. The rendering is separate. This is the key insight — pages are data, not code.
- **Developer-defined constraints, merchant-defined content**: developers create sections/blocks with schemas that define what merchants can configure. This balances flexibility with consistency.
- **Settings schemas**: typed configuration (text, color, image, number, select, etc.) that drive the admin UI. This is similar to metafield definitions but for presentation config.
- **Presets**: sections declare presets that make them available in the theme editor. Without presets, a section exists but can't be added by merchants.

### What Tovu can simplify
- Tovu doesn't need Liquid — it has React/Vue. The composition model (templates referencing sections referencing blocks) is the valuable part, not the template language.
- Tovu doesn't need the legacy Liquid template path — start with JSON-template-only (data-driven composition).
- The theme directory structure (assets, config, layout, locales, sections, snippets, templates) is Shopify-specific. Tovu can define its own structure.

### Possible Tovu seams
- `src/features/presentation/` already exists — this is where Tovu's equivalent of sections/blocks should live.
- A **page template** could be a JSON document referencing section IDs with settings.
- A **section registry** could define available sections with their setting schemas.
- A **block registry** could define blocks that sections accept.
- The theme editor is an admin-shell concern — it reads the JSON template and renders a drag-and-drop UI for merchants.

### Suggested priority
Medium-high — Tovu's `presentation` feature is the seed, but it currently just handles theme switching. The sections/blocks composition model is the next evolution.
