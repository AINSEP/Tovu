<!-- Source: https://shopify.dev/docs/storefronts/themes/architecture/blocks -->
# Shopify Theme Blocks: Technical Overview

## Block Types

Shopify supports three distinct block categories:

**Theme Blocks**: Stored as individual Liquid files in the `/blocks` folder, these are "reusable across multiple sections" within a theme. Developers can restrict sections to specific block types, enable nesting, and create static blocks that merchants cannot delete.

**Section Blocks**: Defined directly within a section's Liquid file and configured in the `{% schema %}` tag, these have significant constraints. They cannot be used outside their parent section, don't support nesting, and "can not currently be used in the same section as Theme blocks."

**App Blocks**: Provided by installed Shopify applications, these let merchants add specialized functionality like reviews or custom forms. They require explicit schema support via the `"@app"` type designation.

## Technical Implementation

Blocks are configured through JSON schema definitions. To enable app block support, developers add `{ "type": "@app" }` to a block's schema alongside other block type declarations.

## Merchant Customization

Within the theme editor, merchants can "add, remove, and reorder" blocks. Static blocks remain fixed in position but can be hidden. Blocks feature individual settings enabling per-instance customization.

## Nested Blocks & AI Generation

Theme blocks support multiple nesting levels, allowing complex hierarchies. Shopify Magic can generate theme blocks using AI, producing complete Liquid code with HTML, CSS/JavaScript, and schema definitions automatically.
