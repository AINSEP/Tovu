<!-- Source: https://shopify.dev/docs/storefronts/themes/architecture/sections -->
# Shopify Sections: Complete Overview

## Definition & Purpose
Sections are reusable Liquid modules enabling merchants to customize theme content without code editing. They function as "modular content blocks that merchants can add, remove, and reorder" within pages through JSON templates or section groups.

## File Structure & Location
Section files reside in the `sections` directory within theme folders. Each section is a distinct Liquid file containing three potential content types.

## Core Content Components

**Main Content**
Sections access the same Liquid global objects, tags, and filters as other theme files, plus two specialized objects:
- The `section` object provides "the section's properties and setting values"
- The `block` object contains "properties and setting values of a single section block"

**Assets**
Sections can bundle JavaScript and stylesheets using dedicated Liquid tags: `{% javascript %}` and `{% stylesheet %}`.

**Schema**
The required `{% schema %}` tag defines section attributes including name, tag, class, limit, settings, blocks, maximum block counts, presets, defaults, locales, and enabled/disabled conditions.

## Schema Configuration
Section schemas support up to 25 sections per JSON template or section group, with each supporting 50 blocks maximum. Merchants can limit template and section group access through schema configuration.

## Rendering Methods

**Dynamic Rendering**
References in JSON templates or section groups allow merchant customization and theme editor flexibility.

**Static Rendering**
Using the `{% section %}` Liquid tag includes sections in Liquid templates, though this approach prevents merchants from removing or reordering sections.

**API Rendering**
The Section Rendering API provides programmatic section inclusion.

## Theme Editor Integration
Section HTML updates dynamically without full-page reloads, though "associated JavaScript that runs when the page loads won't run again." Sections must support visibility during selection, and developers can detect theme editor actions through JavaScript events.

## Merchant Interaction
Merchants customize sections through theme editor interfaces, requiring sections to include presets for theme editor support. App blocks enable app developers to provide content without direct theme code modification.
