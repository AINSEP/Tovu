<!-- Source: https://shopify.dev/docs/storefronts/themes/architecture -->
# Shopify Theme Architecture Overview

## Core Structure

Shopify themes follow a standardized directory organization with eight primary folders: assets, blocks, config, layout, locales, sections, snippets, and templates. As noted in the documentation, "Only a `layout` directory containing a `theme.liquid` file is required for the theme to be uploaded to Shopify."

## Hierarchical Component Organization

Themes use a layered architecture where each level serves a specific purpose:

1. **Layouts** provide the foundational wrapper for pages, housing repeated elements like headers and footers
2. **Templates** determine page-specific content and come in multiple types (product, home, article, etc.)
3. **Section Groups** enable merchants to manage modular content areas within layouts
4. **Sections** function as customizable, reusable content modules merchants can add to JSON templates
5. **Blocks** allow further customization within sections through add/remove/reorder functionality
6. **Snippets** provide reusable Liquid code fragments throughout the theme

## Customization & Configuration

The theme architecture supports merchant customization through three file categories: markup files (using Liquid to generate HTML), supporting assets (images, stylesheets, scripts), and config files that "use JSON to store configuration data that can be customized by merchants using the theme editor."

Theme settings appear in the Theme settings area, while section and block settings integrate directly with those respective components. The system supports JSON files with comments and trailing commas in editable files like `config/settings_schema.json`.

## Asset Management

CSS and JavaScript files reside in the assets directory and can access limited Liquid functionality through `.liquid` extensions, enabling dynamic styling and scripting using the settings object and Liquid filters.
