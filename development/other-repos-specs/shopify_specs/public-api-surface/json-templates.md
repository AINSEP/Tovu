<!-- Source: https://shopify.dev/docs/storefronts/themes/architecture/templates -->
# Shopify JSON Templates: Technical Overview

## Definition and Purpose

JSON templates are data files with the `.json` file extension that serve as the foundational structure for Shopify theme pages. They differ fundamentally from their Liquid counterparts in how content is organized and managed.

## Core Functionality

**Section-Based Architecture**: JSON templates operate primarily through section references. As the documentation states, "any HTML or Liquid code needs to be included in a section that's referenced by the template." This separation of concerns allows merchants to manipulate content without touching code.

**Merchant Customization**: The key advantage is flexibility. "Sections can be added, removed, or rearranged by merchants using the theme editor," enabling non-technical users to modify page layouts dynamically. This extends to "app sections," expanding customization possibilities beyond built-in components.

## JSON vs. Liquid Comparison

JSON templates are preferred when leveraging sections. They "provide more flexibility for merchants to add, remove, and reorder sections" compared to Liquid templates, which allow direct HTML and Liquid code insertion.

A crucial performance benefit exists: JSON templates "minimize the amount of data in settings_data.json" by storing layout information directly in template files rather than centralized configuration. This "improves the performance of the theme editor."

## Technical Constraints

Themes support a maximum of "1000 JSON templates" across all types combined. The `gift_card` and `robots.txt` templates cannot use JSON format and must remain Liquid-based.

## File Structure and Location

JSON templates reside in the `templates` directory: `└── theme/templates/404.json`, `article.json`, etc.
