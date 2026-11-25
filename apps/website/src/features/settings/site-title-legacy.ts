import { getEffective } from "@jini-ai/core/settings";

import { createSiteTitleFailureReporter, createSiteTitlePreservationSummaryReporter } from "@jini-ai/cms/settings/site/site-title-reporter";
import { createConsoleLogger } from "@jini-ai/core/primitives";

/**
 * @file SPEC-050 (`core.site.title`): this product's legacy site title, the one value the engine's
 * site-title rules (`@jini-ai/cms/settings/site/site-title`) take from the host. It is product copy,
 * so it stays here and is passed in through the existing args: `legacySiteTitle` on
 * `ensureSiteTitleSettingDefinition`'s and `preserveLegacySiteTitles`' input (the stored default and
 * the workspace pin) and on `ResolveSiteTitleDeps` (the render fallback).
 */

/** The title every site rendered before this setting existed (formerly `pages.ts`'s `SITE_TITLE`). */
export const LEGACY_SITE_TITLE = "Tovu Demo Site";

const reportSiteTitleFailure = createSiteTitleFailureReporter({ logger: createConsoleLogger({ prefix: "" }) });

/**
 * The host-bound part of `ResolveSiteTitleDeps` every render call site spreads in: the legacy title
 * (the render fallback), the settings ledger's reader, and the fixed-text failure reporter.
 */
export const siteTitleHostBindings = { legacySiteTitle: LEGACY_SITE_TITLE, getEffective, reportSiteTitleFailure };

/**
 * The host-bound reporters of `PreserveLegacySiteTitlesDeps` every preservation call site spreads in:
 * fixed-text failures and the per-run counts.
 */
export const siteTitlePreservationHostBindings = {
  reportSiteTitleFailure,
  reportPreservationSummary: createSiteTitlePreservationSummaryReporter({ logger: createConsoleLogger({ prefix: "" }) }),
};
